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
import { DEBUG, wrapOperator, logPipelineExecution } from './debug.js';
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
    this._store = this.createStore();
    this.compiler = new ExpressionCompilerImpl();
    this.performance = new PerformanceEngineImpl();
    this.operatorFactory = new IVMOperatorFactoryImpl(this.compiler);
  }

  get store(): CrossfilterStore {
    return this._store;
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
      plan.canIncrement = false;
      plan.canDecrement = false;
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

        case '$topK':
          operator = this.operatorFactory.createTopKOperator(stage.stageData);
          break;

        default:
          throw new Error(`Unsupported stage type: ${stage.type}`);
      }

      // Wrap operator with debug tracing if DEBUG is enabled
      const wrappedOperator = DEBUG ? wrapOperator(stage.type, operator) : operator;
      operators.push(wrappedOperator);
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
    if (!executionPlan.canIncrement && !executionPlan.canDecrement) {
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
    logPipelineExecution('execute', 'Starting execution', { pipelineLength: pipeline.length });

    const plan = this.compilePipeline(pipeline);

    // For full execution, take snapshot of final pipeline state
    const pipelineKey = JSON.stringify(pipeline); // Use original pipeline for key
    const operators = this.compiledOperators.get(pipelineKey);

    if (!operators) {
      // If pipeline isn't found, try compiling again
      logPipelineExecution('execute', 'Operators not found, recompiling');
      this.compilePipeline(pipeline);
      const newOperators = this.compiledOperators.get(pipelineKey);
      if (!newOperators) {
        throw new Error(`Pipeline compilation failed for: ${pipelineKey}`);
      }
      return this.snapshotPipeline(newOperators, plan);
    }

    logPipelineExecution('execute', 'Executing snapshot with operators', { operatorCount: operators.length });
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

    // Create a single persistent context that will be shared across all stages
    // This ensures that projected documents from upstream stages are available to downstream stages
    const persistentContext: IVMContext = {
      pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline,
      stageIndex: 0, // Will be updated for each stage
      compiledStage: plan.stages[0], // Will be updated for each stage
      executionPlan: plan,
      tempState: new Map(), // Persistent across all stages - this is key for cross-stage data sharing
    };

    // Apply delta through each stage
    for (let i = 0; i < operators.length; i++) {
      const operator = operators[i];
      const stage = plan.stages[i];

      // Update context for current stage (but keep persistent tempState)
      persistentContext.stageIndex = i;
      persistentContext.compiledStage = stage;

      const nextDeltas: Delta[] = [];

      for (const currentDelta of currentDeltas) {
        let stageDeltas: Delta[];

        if (currentDelta.sign === 1) {
          stageDeltas = operator.onAdd(currentDelta, this.store, persistentContext);
        } else {
          stageDeltas = operator.onRemove(currentDelta, this.store, persistentContext);
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
    // Create a single persistent context for snapshot operations
    // This ensures that projected documents from upstream stages are available to downstream stages
    const persistentContext: IVMContext = {
      pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline,
      stageIndex: 0, // Will be updated for each stage
      compiledStage: plan.stages[0], // Will be updated for each stage
      executionPlan: plan,
      tempState: new Map(), // Persistent across all stages for cross-stage data sharing
    };

    // Process snapshot through pipeline stages to build up projected documents
    // We need to simulate the pipeline execution to ensure projected documents are cached
    for (const rowId of this.store.liveSet) {
      const _delta: Delta = { rowId, sign: 1 };
      let currentDeltas = [_delta];

      // Process through each stage to ensure projected documents are cached
      for (let i = 0; i < operators.length; i++) {
        const operator = operators[i];
        
        // Update context for current stage
        persistentContext.stageIndex = i;
        persistentContext.compiledStage = plan.stages[i];

        const nextDeltas: Delta[] = [];
        for (const currentDelta of currentDeltas) {
          if (currentDelta.sign === 1) {
            const stageDeltas = operator.onAdd(currentDelta, this.store, persistentContext);
            nextDeltas.push(...stageDeltas);
          }
        }
        currentDeltas = nextDeltas;

        // If no deltas pass through this stage, break for this document
        if (currentDeltas.length === 0) {
          break;
        }
      }
    }

    // Now take snapshot from the final operator
    if (operators.length === 0) {
      return [];
    }

    const finalOperator = operators[operators.length - 1];
    const finalStage = plan.stages[plan.stages.length - 1];
    
    // Update context for final stage
    persistentContext.stageIndex = operators.length - 1;
    persistentContext.compiledStage = finalStage;

    return finalOperator.snapshot(this.store, persistentContext);
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

  private applySorting(
    documents: Collection<Document>,
    sortExpr: any
  ): Collection<Document> {
    if (!documents || documents.length === 0) return documents;

    // Create sort comparator from MongoDB sort expression
    const sortFields = Object.entries(sortExpr);

    return [...documents].sort((a, b) => {
      for (const [field, direction] of sortFields) {
        const aVal = this.getFieldValue(a, field);
        const bVal = this.getFieldValue(b, field);

        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;

        if (comparison !== 0) {
          return direction === 1 ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  private applyMatching(
    documents: Collection<Document>,
    matchExpr: any
  ): Collection<Document> {
    if (!documents || documents.length === 0) return documents;

    // Use the crossfilter compiler to build match function
    const compiler = new ExpressionCompilerImpl();
    const matchFunction = compiler.compileMatchExpr(matchExpr);

    return documents.filter((doc, index) => matchFunction(doc, index as RowId));
  }

  private getFieldValue(doc: Document, field: string): any {
    if (field.includes('.')) {
      const parts = field.split('.');
      let value: any = doc;
      for (const part of parts) {
        if (value === null || value === undefined) return undefined;
        value = value[part];
      }
      return value;
    }
    return doc[field];
  }
}

/**
 * Convenience function to create a new CrossfilterIVMEngine
 */
export function createCrossfilterEngine(): CrossfilterIVMEngine {
  return new CrossfilterIVMEngineImpl();
}
