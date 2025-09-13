/**
 * Main CrossfilterIVMEngine implementation
 */

import type {
  RowId,
  Delta,
  CrossfilterStore,
  CrossfilterIVMEngine,
  ExecutionPlan,
  IVMOperator,
  IVMContext,
} from './crossfilter-ivm.js';
import type { Document, Collection } from './expressions.js';
import type { Pipeline } from '../index.js';

import { LiveSetImpl, DimensionImpl } from './crossfilter-impl.js';
import {
  ExpressionCompilerImpl,
  PerformanceEngineImpl,
} from './crossfilter-compiler.js';
import { IVMOperatorFactoryImpl } from './crossfilter-operators.js';

/**
 * Main crossfilter-inspired IVM engine
 */
export class CrossfilterIVMEngineImpl implements CrossfilterIVMEngine {
  readonly _store: CrossfilterStore;
  readonly compiler: ExpressionCompilerImpl;
  readonly performance: PerformanceEngineImpl;
  readonly operatorFactory: IVMOperatorFactoryImpl;

  private executionPlans = new Map<string, ExecutionPlan>();
  private compiledOperators = new Map<string, IVMOperator[]>();

  constructor() {
    this.store = this.createStore();
    this.compiler = new ExpressionCompilerImpl();
    this.performance = new PerformanceEngineImpl();
    this.operatorFactory = new IVMOperatorFactoryImpl(this.compiler);
  }

  compilePipeline(pipeline: Pipeline): ExecutionPlan {
    const pipelineKey = JSON.stringify(pipeline);

    if (this.executionPlans.has(pipelineKey)) {
      return this.executionPlans.get(pipelineKey)!;
    }

    // Create execution plan
    const plan = this.performance.optimizePipeline(pipeline);

    // Check if pipeline contains unsupported operations
    let hasUnsupportedOperations = false;
    for (const stage of plan.stages) {
      if (stage.type === '$lookup') {
        hasUnsupportedOperations = true;
        break;
      }
    }

    // If unsupported operations exist, mark plan as non-incremental
    if (hasUnsupportedOperations) {
      plan.canFullyIncrement = false;
      plan.canFullyDecrement = false;
    }

    // Compile operators
    const operators: IVMOperator[] = [];

    for (const stage of plan.stages) {
      let operator: IVMOperator;

      switch (stage.type) {
        case '$match':
          operator = this.operatorFactory.createMatchOperator(stage.stageData);
          break;

        case '$group':
          operator = this.operatorFactory.createGroupOperator(stage.stageData);
          break;

        case '$sort':
          operator = this.operatorFactory.createSortOperator(stage.stageData);
          break;

        case '$project':
          operator = this.operatorFactory.createProjectOperator(
            stage.stageData
          );
          break;

        case '$limit':
          operator = this.operatorFactory.createLimitOperator(stage.stageData);
          break;

        case '$skip':
          operator = this.operatorFactory.createSkipOperator(stage.stageData);
          break;

        case '$addFields':
        case '$set':
          operator = this.operatorFactory.createProjectOperator(
            stage.stageData
          );
          break;

        case '$lookup':
          operator = this.operatorFactory.createLookupOperator(stage.stageData);
          break;

        case '$unwind':
          operator = this.operatorFactory.createUnwindOperator(
            stage.stageData,
            undefined
          );
          break;

        default:
          throw new Error(`Unsupported stage type: ${stage.type}`);
      }

      operators.push(operator);
    }

    this.executionPlans.set(pipelineKey, plan);
    this.compiledOperators.set(pipelineKey, operators); // Use same key

    // Ensure required dimensions exist
    this.ensureDimensions(plan.primaryDimensions);

    // CRITICAL: Process existing documents through new operators (only if fully supported)
    // This initializes operator state (like groups) for documents already in the store
    if (!hasUnsupportedOperations) {
      this.initializeOperatorsWithExistingData(operators, plan);
    }

    return plan;
  }

  addDocument(doc: Document): RowId {
    const rowId = this.store.rowIdCounter.current++;

    // Store document
    this.store.documents[rowId] = doc;

    // Mark as live
    this.store.liveSet.set(rowId);

    // Update statistics
    this.store.stats.totalDocs++;
    this.store.stats.liveDocs++;

    // Update dimensions
    for (const dimension of this.store.dimensions.values()) {
      dimension.addDocument(doc, rowId);
    }

    return rowId;
  }

  addDocuments(docs: Document[]): RowId[] {
    const rowIds: RowId[] = [];

    for (const doc of docs) {
      rowIds.push(this.addDocument(doc));
    }

    return rowIds;
  }

  removeDocument(rowId: RowId): boolean {
    if (!this.store.liveSet.isSet(rowId)) {
      return false; // Document not live
    }

    // Mark as not live
    this.store.liveSet.unset(rowId);

    // Update statistics
    this.store.stats.liveDocs--;

    // Update dimensions
    for (const dimension of this.store.dimensions.values()) {
      dimension.removeDocument(rowId);
    }

    // Note: We keep the document in storage for potential rollback
    // In a full implementation, we might have a garbage collection mechanism

    return true;
  }

  removeDocuments(rowIds: RowId[]): number {
    let removedCount = 0;

    for (const rowId of rowIds) {
      if (this.removeDocument(rowId)) {
        removedCount++;
      }
    }

    return removedCount;
  }

  applyDelta(
    _delta: Delta,
    executionPlan: ExecutionPlan
  ): Collection<Document> {
    return this.applyDeltas([_delta], executionPlan);
  }

  applyDeltas(
    deltas: Delta[],
    executionPlan: ExecutionPlan
  ): Collection<Document> {
    if (deltas.length === 0) {
      return this.execute(
        executionPlan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline
      );
    }

    // If we can't do full incremental processing, fall back to full execution
    if (!executionPlan.canFullyIncrement && !executionPlan.canFullyDecrement) {
      return this.execute(
        executionPlan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline
      );
    }

    // Find operators for this execution plan
    const pipeline = executionPlan.stages.map(s => ({
      [s.type]: s.stageData,
    })) as Pipeline;
    const pipelineKey = JSON.stringify(pipeline);
    const operators = this.compiledOperators.get(pipelineKey);

    if (!operators) {
      throw new Error(`Pipeline operators not found for: ${pipelineKey}`);
    }

    // Process deltas through the pipeline
    for (const delta of deltas) {
      this.processDeltaThroughPipeline(delta, operators, executionPlan);
    }

    // Return final result by taking snapshot
    return this.snapshotPipeline(operators, executionPlan);
  }

  execute(pipeline: Pipeline): Collection<Document> {
    const plan = this.compilePipeline(pipeline);

    // For full execution, take snapshot of final pipeline state
    const pipelineKey = JSON.stringify(pipeline); // Use original pipeline for key
    const operators = this.compiledOperators.get(pipelineKey);

    if (!operators) {
      // If pipeline isn't found, try compiling again
      this.compilePipeline(pipeline);
      const newOperators = this.compiledOperators.get(pipelineKey);
      if (!newOperators) {
        throw new Error(`Pipeline compilation failed for: ${pipelineKey}`);
      }
      return this.snapshotPipeline(newOperators, plan);
    }

    return this.snapshotPipeline(operators, plan);
  }

  optimize(): void {
    // Run optimization passes
    if (this.performance.shouldCompactColumns()) {
      this.performance.compactColumns(this.store);
    }

    // Other optimization tasks could go here
    // - Dimension pruning for unused fields
    // - Group state cleanup for empty groups
    // - Statistics updates
  }

  getStatistics(): any {
    return {
      store: {
        totalDocuments: this.store.stats.totalDocs,
        liveDocuments: this.store.stats.liveDocs,
        dimensions: this.store.stats.dimensionsCreated,
        activeGroups: this.store.stats.groupsActive,
      },
      memory: {
        documentsSize: this.estimateDocumentsSize(),
        dimensionsSize: this.estimateDimensionsSize(),
        groupsSize: this.estimateGroupsSize(),
      },
      performance: this.performance.getStatistics(),
      compiledPlans: this.executionPlans.size,
    };
  }

  clear(): void {
    // Clear all data
    this.store.documents.length = 0;
    this.store.liveSet.clear();
    this.store.dimensions.clear();
    this.store.groups.clear();

    // Reset counters
    this.store.rowIdCounter.current = 0;
    this.store.stats.totalDocs = 0;
    this.store.stats.liveDocs = 0;
    this.store.stats.dimensionsCreated = 0;
    this.store.stats.groupsActive = 0;

    // Clear compiled plans
    this.executionPlans.clear();
    this.compiledOperators.clear();
  }

  private createStore(): CrossfilterStore {
    return {
      documents: [],
      liveSet: new LiveSetImpl(),
      columns: new Map(),
      rowIdCounter: { current: 0 },
      dimensions: new Map(),
      groups: new Map(),
      stats: {
        totalDocs: 0,
        liveDocs: 0,
        dimensionsCreated: 0,
        groupsActive: 0,
      },
    };
  }

  private ensureDimensions(dimensionKeys: string[]): void {
    for (const key of dimensionKeys) {
      if (!this.store.dimensions.has(key)) {
        const dimension = new DimensionImpl(key);
        this.store.dimensions.set(key, dimension);
        this.store.stats.dimensionsCreated++;

        // Index existing documents in this dimension
        for (const rowId of this.store.liveSet) {
          const doc = this.store.documents[rowId];
          if (doc) {
            dimension.addDocument(doc, rowId);
          }
        }
      }
    }
  }

  private processDeltaThroughPipeline(
    _delta: Delta,
    operators: IVMOperator[],
    plan: ExecutionPlan
  ): void {
    let currentDeltas = [_delta];

    // Apply delta through each stage
    for (let i = 0; i < operators.length; i++) {
      const operator = operators[i];
      const stage = plan.stages[i];

      const _context: IVMContext = {
        pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline,
        stageIndex: i,
        compiledStage: stage,
        executionPlan: plan,
        tempState: new Map(),
      };

      const nextDeltas: Delta[] = [];

      for (const currentDelta of currentDeltas) {
        let stageDeltas: Delta[];

        if (currentDelta.sign === 1) {
          stageDeltas = operator.onAdd(currentDelta, this.store, _context);
        } else {
          stageDeltas = operator.onRemove(currentDelta, this.store, _context);
        }

        nextDeltas.push(...stageDeltas);
      }

      currentDeltas = nextDeltas;

      // If no deltas pass through this stage, stop processing
      if (currentDeltas.length === 0) {
        break;
      }
    }
  }

  /**
   * Initialize operators with existing documents in the store
   * This is critical for building operator state (like groups) when pipelines are compiled
   * after documents have already been added to the store
   */
  private initializeOperatorsWithExistingData(
    operators: IVMOperator[],
    plan: ExecutionPlan
  ): void {
    // Process all existing documents through the new operators
    for (const rowId of this.store.liveSet) {
      const _delta: Delta = { rowId, sign: 1 };
      this.processDeltaThroughPipeline(_delta, operators, plan);
    }
  }

  private snapshotPipeline(
    operators: IVMOperator[],
    plan: ExecutionPlan
  ): Collection<Document> {
    let currentResult: Collection<Document> = [];

    // Get live documents
    for (const rowId of this.store.liveSet) {
      const doc = this.store.documents[rowId];
      if (doc) {
        currentResult.push(doc);
      }
    }

    // Apply each operator's snapshot
    for (let i = 0; i < operators.length; i++) {
      const operator = operators[i];
      const stage = plan.stages[i];

      const _context: IVMContext = {
        pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline,
        stageIndex: i,
        compiledStage: stage,
        executionPlan: plan,
        tempState: new Map(),
      };

      // For most operators, we use their snapshot method
      // For some operators like $group, the snapshot comes from the store state
      if (operator.type === '$group') {
        currentResult = operator.snapshot(this.store, _context);
      } else if (operator.type === '$match') {
        currentResult = operator.snapshot(this.store, _context);
      } else if (operator.type === '$project') {
        // Apply projection to current result
        currentResult = this.applyProjection(currentResult, stage.stageData);
      } else if (operator.type === '$sort') {
        currentResult = operator.snapshot(this.store, _context);
      } else if (operator.type === '$limit') {
        currentResult = currentResult.slice(0, stage.stageData);
      } else if (operator.type === '$skip') {
        currentResult = currentResult.slice(stage.stageData);
      }
    }

    return currentResult;
  }

  private applyProjection(
    documents: Collection<Document>,
    projectExpr: any
  ): Collection<Document> {
    const projectedFn = this.compiler.compileProjectExpr(projectExpr);

    return documents.map((doc, index) => projectedFn(doc, index));
  }

  private estimateDocumentsSize(): number {
    // Rough estimate: 100 bytes per document on average
    return this.store.documents.length * 100;
  }

  private estimateDimensionsSize(): number {
    let size = 0;

    for (const dimension of this.store.dimensions.values()) {
      // Estimate dimension size: valueIndex + sortedValues + rowToValue
      size += dimension.cardinality * 50; // Rough estimate
      size += dimension.rowToValue.size * 20;
    }

    return size;
  }

  private estimateGroupsSize(): number {
    let size = 0;

    for (const groupsMap of this.store.groups.values()) {
      size += groupsMap.size * 200; // Rough estimate per group state
    }

    return size;
  }
}

/**
 * Convenience function to create a new CrossfilterIVMEngine
 */
export function createCrossfilterEngine(): CrossfilterIVMEngine {
  return new CrossfilterIVMEngineImpl();
}
