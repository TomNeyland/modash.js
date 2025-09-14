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
  DEBUG,
  wrapOperator,
  wrapOperatorSnapshot,
  logPipelineExecution,
} from './debug.js';
import {
  ExpressionCompilerImpl,
  PerformanceEngineImpl,
} from './crossfilter-compiler.js';
import { OptimizedIVMOperatorFactory } from './crossfilter-operators.js';

/**
 * Main crossfilter-inspired IVM engine
 */
export class CrossfilterIVMEngineImpl implements CrossfilterIVMEngine {
  readonly _store: CrossfilterStore;
  readonly compiler: ExpressionCompilerImpl;
  readonly performance: PerformanceEngineImpl;
  readonly operatorFactory: OptimizedIVMOperatorFactory;

  private executionPlans = new Map<string, ExecutionPlan>();
  private compiledOperators = new Map<string, IVMOperator[]>();

  constructor() {
    this._store = this.createStore();
    this.compiler = new ExpressionCompilerImpl();
    this.performance = new PerformanceEngineImpl();
    this.operatorFactory = new OptimizedIVMOperatorFactory(this.compiler);
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

    // Compile operators with fusion optimization
    const operators: IVMOperator[] = [];

    // Process stages with fusion detection
    for (let i = 0; i < plan.stages.length; i++) {
      const stage = plan.stages[i];
      const nextStage = i < plan.stages.length - 1 ? plan.stages[i + 1] : null;

      // Check for operator fusion opportunities
      if (nextStage && this.operatorFactory.canFuseStages(stage, nextStage)) {
        if (DEBUG) {
          console.log(`🔗 Fusing stages: ${stage.type} + ${nextStage.type}`);
        }

        // Create fused operator
        if (stage.type === '$match' && nextStage.type === '$project') {
          const operator = this.operatorFactory.createFusedMatchProjectOperator(
            stage.stageData,
            nextStage.stageData
          );
          operators.push(operator);
          i++; // Skip next stage as it's been fused
          continue;
        }
      }

      // Check for $sort + $limit fusion (Top-K optimization)
      if (stage.type === '$sort' && nextStage?.type === '$limit') {
        if (DEBUG) {
          console.log(`🔗 Fusing $sort + $limit for Top-K optimization`);
        }

        const operator = this.operatorFactory.createSortOperator(
          stage.stageData,
          nextStage.stageData // Pass limit to sort operator
        );
        operators.push(operator);
        i++; // Skip limit stage as it's been fused
        continue;
      }

      // Create individual operator
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
          operator = this.operatorFactory.createAddFieldsOperator(
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
      let wrappedOperator = DEBUG
        ? wrapOperator(stage.type, operator)
        : operator;
      wrappedOperator = DEBUG
        ? wrapOperatorSnapshot(wrappedOperator, DEBUG)
        : wrappedOperator;
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
    logPipelineExecution('execute', 'Starting execution', {
      pipelineLength: pipeline.length,
    });

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

    logPipelineExecution('execute', 'Executing snapshot with operators', {
      operatorCount: operators.length,
    });
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

      // Set up upstream document access for this stage
      persistentContext.getEffectiveUpstreamDocument = (rowId: RowId) => {
        // Get document from immediate upstream stage (i-1)
        if (i > 0) {
          const upstreamOperator = operators[i - 1];
          if (upstreamOperator.getEffectiveDocument) {
            // Create context for the upstream operator
            const upstreamContext: IVMContext = {
              pipeline: plan.stages.map(s => ({
                [s.type]: s.stageData,
              })) as Pipeline,
              stageIndex: i - 1,
              compiledStage: plan.stages[i - 1],
              executionPlan: plan,
              tempState: persistentContext.tempState, // Share the same tempState
            };
            return upstreamOperator.getEffectiveDocument(
              rowId,
              this.store,
              upstreamContext
            );
          }
        }
        // Fallback to raw store document
        return this.store.documents[rowId] || null;
      };

      const nextDeltas: Delta[] = [];

      for (const currentDelta of currentDeltas) {
        let stageDeltas: Delta[];

        if (currentDelta.sign === 1) {
          stageDeltas = operator.onAdd(
            currentDelta,
            this.store,
            persistentContext
          );
        } else {
          stageDeltas = operator.onRemove(
            currentDelta,
            this.store,
            persistentContext
          );
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
    if (operators.length === 0) {
      return [];
    }

    // Start with all live documents
    let activeIds: RowId[] = Array.from(this.store.liveSet);
    const persistentTempState = new Map(); // Shared across stages for caching

    // Process through each operator stage
    for (let i = 0; i < operators.length; i++) {
      const operator = operators[i];

      // Create context with upstream active IDs
      const context: IVMContext = {
        pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline,
        stageIndex: i,
        compiledStage: plan.stages[i],
        executionPlan: plan,
        upstreamActiveIds: activeIds,
        tempState: persistentTempState,
        getEffectiveUpstreamDocument: (rowId: RowId) => {
          // Create a recursive function to chain through all upstream stages
          const getEffectiveDocumentFromStage = (
            stageIndex: number,
            rowId: RowId
          ): Document | null => {
            if (stageIndex < 0) {
              return this.store.documents[rowId];
            }

            const operator = operators[stageIndex];
            if (operator.getEffectiveDocument) {
              const stageContext: IVMContext = {
                pipeline: plan.stages.map(s => ({
                  [s.type]: s.stageData,
                })) as Pipeline,
                stageIndex,
                compiledStage: plan.stages[stageIndex],
                executionPlan: plan,
                upstreamActiveIds: activeIds,
                tempState: persistentTempState,
                getEffectiveUpstreamDocument: (upstreamRowId: RowId) => {
                  return getEffectiveDocumentFromStage(
                    stageIndex - 1,
                    upstreamRowId
                  );
                },
              };
              return operator.getEffectiveDocument(
                rowId,
                this.store,
                stageContext
              );
            }

            return getEffectiveDocumentFromStage(stageIndex - 1, rowId);
          };

          return getEffectiveDocumentFromStage(i - 1, rowId);
        },
      };

      // Get active IDs after this stage
      if (process.env.DEBUG_IVM) {
        console.log(
          `[Engine] Calling snapshot on ${operator.type}#${(operator as any).__id}`
        );
      }
      activeIds = operator.snapshot(this.store, context);

      // INVARIANT: snapshot must return RowId[]
      if (process.env.DEBUG_IVM) {
        if (!Array.isArray(activeIds)) {
          throw new Error(
            `[INVARIANT VIOLATION] ${operator.type}.snapshot() must return RowId[], got ${typeof activeIds}`
          );
        }
        if (activeIds.length > 0) {
          const firstId = activeIds[0];
          if (typeof firstId !== 'number' && typeof firstId !== 'string') {
            throw new Error(
              `[INVARIANT VIOLATION] ${operator.type}.snapshot() returned invalid RowId type: ${typeof firstId}. Expected number or string.`
            );
          }
        }
      }
    }

    // Materialize final documents from the LAST stage's view
    const lastOperator = operators[operators.length - 1];
    if (process.env.DEBUG_IVM) {
      console.log(
        `[Engine] Materializing from lastOperator ${lastOperator.type}#${(lastOperator as any).__id}`
      );

      // INVARIANT: Transforming operators must have getEffectiveDocument
      const transformingOps = [
        '$project',
        '$addFields',
        '$set',
        '$group',
        '$unwind',
        '$lookup',
      ];
      if (
        transformingOps.includes(lastOperator.type) &&
        !lastOperator.getEffectiveDocument
      ) {
        throw new Error(
          `[INVARIANT VIOLATION] ${lastOperator.type} must implement getEffectiveDocument`
        );
      }
    }
    const result: Document[] = [];

    // Only materialize if we have active IDs
    if (activeIds.length > 0) {
      // Create context for the final operator
      const finalContext: IVMContext = {
        pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })) as Pipeline,
        stageIndex: operators.length - 1,
        compiledStage: plan.stages[operators.length - 1],
        executionPlan: plan,
        upstreamActiveIds: activeIds,
        tempState: persistentTempState,
        getEffectiveUpstreamDocument: (rowId: RowId) => {
          // Create a recursive function to chain through all upstream stages
          const getEffectiveDocumentFromStage = (
            stageIndex: number,
            rowId: RowId
          ): Document | null => {
            if (stageIndex < 0) {
              return this.store.documents[rowId];
            }

            const operator = operators[stageIndex];
            if (operator.getEffectiveDocument) {
              const stageContext: IVMContext = {
                pipeline: plan.stages.map(s => ({
                  [s.type]: s.stageData,
                })) as Pipeline,
                stageIndex,
                compiledStage: plan.stages[stageIndex],
                executionPlan: plan,
                upstreamActiveIds: activeIds,
                tempState: persistentTempState,
                getEffectiveUpstreamDocument: (upstreamRowId: RowId) => {
                  return getEffectiveDocumentFromStage(
                    stageIndex - 1,
                    upstreamRowId
                  );
                },
              };
              return operator.getEffectiveDocument(
                rowId,
                this.store,
                stageContext
              );
            }

            return getEffectiveDocumentFromStage(stageIndex - 1, rowId);
          };

          const lastIndex = operators.length - 1;
          return getEffectiveDocumentFromStage(lastIndex - 1, rowId);
        },
      };

      // Materialize each document from the last operator's transformed view
      for (const rowId of activeIds) {
        let doc: Document | null = null;

        if (process.env.DEBUG_IVM) {
          console.log(
            `[Materializing] rowId ${rowId}, lastOperator.type: ${lastOperator.type}, has getEffectiveDocument: ${!!lastOperator.getEffectiveDocument}`
          );
        }

        if (lastOperator.getEffectiveDocument) {
          if (process.env.DEBUG_IVM) {
            console.log(
              `[Materializing] About to call ${lastOperator.type}.getEffectiveDocument for rowId ${rowId}`
            );
            console.log(
              `[Materializing] lastOperator type check:`,
              typeof lastOperator.getEffectiveDocument
            );
            console.log(
              `[Materializing] lastOperator keys:`,
              Object.keys(lastOperator)
            );
            console.log(
              `[Materializing] lastOperator constructor:`,
              lastOperator.constructor.name
            );
            console.log(
              `[Materializing] lastOperator proto:`,
              Object.getPrototypeOf(lastOperator).constructor.name
            );
          }

          doc = lastOperator.getEffectiveDocument(
            rowId,
            this.store,
            finalContext
          );

          if (process.env.DEBUG_IVM) {
            console.log(
              `[Materializing] Got doc from ${lastOperator.type}.getEffectiveDocument:`,
              doc
            );
          }

          // DEBUG: In development, warn if a transforming operator returns null
          if (!doc && process.env.DEBUG_IVM) {
            console.warn(
              `[DEBUG] Operator ${lastOperator.type} returned null for rowId ${rowId}`
            );
          }
        }

        // Only fall back to store if operator doesn't transform
        if (!doc && !lastOperator.getEffectiveDocument) {
          doc = this.store.documents[rowId];
          if (process.env.DEBUG_IVM) {
            console.log(
              `[Materializing] Falling back to store document for rowId ${rowId}`
            );
          }
        }

        if (doc) {
          result.push(doc);
        }
      }
    }

    return result;
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
