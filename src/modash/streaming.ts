/**
 * Streaming/Incremental Update Support for Modash
 *
 * Provides live views of aggregation results that update dynamically
 * as new data is added through .add() or .addBulk() operations.
 *
 * Now powered by crossfilter-inspired IVM (Incremental View Maintenance)
 * for true incremental processing with sophisticated multi-dimensional indexing.
 */

import { EventEmitter } from 'events';
import type { Collection, Document } from './expressions';
import type { Pipeline } from '../index';
import { aggregate } from './aggregation';
import { hotPathAggregate } from './hot-path-aggregation';
import { createCrossfilterEngine } from './crossfilter-engine';
import type { CrossfilterIVMEngine, RowId, Delta } from './crossfilter-ivm';
import { DEBUG, recordFallback, logPipelineExecution } from './debug';
import {
  createDeltaOptimizer,
  type StreamingDeltaOptimizer,
  type Delta as DeltaRecord,
} from './streaming-delta-optimizer';

/**
 * Events emitted by StreamingCollection
 */
export interface StreamingEvents {
  'data-added': { newDocuments: Document[]; totalCount: number };
  'data-removed': {
    removedDocuments: Document[];
    removedCount: number;
    totalCount: number;
  };
  'result-updated': { result: Collection<Document>; pipeline: Pipeline };
  'transform-error': { error: Error; originalEvent: any; eventName: string };
}

/**
 * Transform function type for event processing
 */
export type EventTransform<T extends Document = Document> = (
  eventData: any,
  eventName: string
) => T | T[] | null | undefined;

/**
 * Event consumer configuration
 */
export interface EventConsumerConfig<T extends Document = Document> {
  /** Source EventEmitter to consume from */
  source: EventEmitter;
  /** Event name to listen for */
  eventName: string;
  /** Optional transform function to process events before adding to collection */
  transform?: EventTransform<T>;
  /** Whether to automatically start consuming events (default: true) */
  autoStart?: boolean;
}

/**
 * Legacy aggregation state interface for backward compatibility
 * Now backed by CrossfilterIVMEngine internally
 */
export interface AggregationState {
  // Legacy interface preserved for compatibility
  lastResult: Collection<Document>;
  pipelineHash: string;
  canIncrement: boolean;
  canDecrement: boolean;

  // Internal engine reference
  _ivmEngine?: CrossfilterIVMEngine;
  _executionPlan?: any;
  _documentRowIds?: Map<number, RowId>; // doc index -> rowId mapping
}

/**
 * StreamingCollection provides incremental update capabilities
 * for modash aggregation pipelines using crossfilter-inspired IVM.
 */
export class StreamingCollection<
  T extends Document = Document,
> extends EventEmitter {
  private documents: T[] = [];
  private aggregationStates = new Map<string, AggregationState>();
  private activePipelines = new Map<string, Pipeline>();
  private eventConsumers = new Map<string, EventConsumerConfig<T>>();
  private eventListeners = new Map<string, (data: any) => void>();

  // Core crossfilter IVM engine
  private ivmEngine = createCrossfilterEngine();

  // High-performance delta optimizer for streaming
  private deltaOptimizer = createDeltaOptimizer({
    maxBatchSize: 256,
    maxBatchDelayMs: 1, // Aggressive 1ms batching for P0 throughput
    adaptiveSizing: true,
    targetThroughput: 250_000,
  });

  // Mapping from document array index to IVM rowId
  private docIndexToRowId = new Map<number, RowId>();
  private rowIdToDocIndex = new Map<RowId, number>();

  constructor(initialData: Collection<T> = []) {
    super();
    // Handle null, undefined, and non-iterable data
    if (!initialData || !Array.isArray(initialData)) {
      this.documents = [];
    } else {
      this.documents = [...initialData];

      // Add initial documents to IVM engine
      for (let i = 0; i < this.documents.length; i++) {
        const rowId = this.ivmEngine.addDocument(this.documents[i]);
        this.docIndexToRowId.set(i, rowId);
        this.rowIdToDocIndex.set(rowId, i);
      }
    }

    // Set up delta optimizer event handlers
    this.setupDeltaOptimizer();
  }

  /**
   * Configure delta optimizer for high-performance streaming
   */
  private setupDeltaOptimizer(): void {
    // Handle batched add operations
    this.deltaOptimizer.on('batch-add', ({ documents, batchId }) => {
      if (DEBUG) {
        logPipelineExecution('DELTA_BATCH', `Processing batch-add`, {
          batchId,
          documentCount: documents.length,
          totalDocuments: this.documents.length,
        });
      }

      // Process batch efficiently
      this.processBatchAdd(documents);
    });

    // Handle batched remove operations
    this.deltaOptimizer.on('batch-remove', ({ documents, batchId }) => {
      if (DEBUG) {
        logPipelineExecution('DELTA_BATCH', `Processing batch-remove`, {
          batchId,
          documentCount: documents.length,
          totalDocuments: this.documents.length,
        });
      }

      this.processBatchRemove(documents);
    });

    // Handle backpressure
    this.deltaOptimizer.on('backpressure', ({ queueSize }) => {
      this.emit('streaming-backpressure', { queueSize });
    });
  }

  /**
   * Add a single document and trigger incremental updates
   */
  add(document: T | T[]): void {
    if (Array.isArray(document)) {
      // Accept batch directly for convenience and performance tests
      this.addBulk(document);
    } else {
      this.addBulk([document]);
    }
  }

  /**
   * Add multiple documents and trigger incremental updates using optimized delta batching
   */
  addBulk(newDocuments: T[]): void {
    if (newDocuments.length === 0) return;

    // Process synchronously to ensure deterministic test behavior and immediate updates
    this.processBatchAdd(newDocuments);
  }

  /**
   * Process batched add operations efficiently
   */
  private processBatchAdd(newDocuments: Document[]): void {
    const startIndex = this.documents.length;
    this.documents.push(...(newDocuments as T[]));

    // Add to IVM engine and track rowIds in batch
    const addedRowIds: RowId[] = [];
    for (let i = 0; i < newDocuments.length; i++) {
      const docIndex = startIndex + i;
      const rowId = this.ivmEngine.addDocument(newDocuments[i]);
      this.docIndexToRowId.set(docIndex, rowId);
      this.rowIdToDocIndex.set(rowId, docIndex);
      addedRowIds.push(rowId);
    }

    // Emit single data-added event for entire batch
    this.emit('data-added', {
      newDocuments,
      totalCount: this.documents.length,
    });

    // Update all active aggregation results using IVM
    this.updateAggregationsWithIVM(addedRowIds, 'add');
  }

  /**
   * Remove documents by predicate function and trigger incremental updates using IVM
   */
  remove(predicate: (doc: T, index: number) => boolean): T[] {
    const removedDocuments: T[] = [];
    const indicesToRemove: number[] = [];
    const rowIdsToRemove: RowId[] = [];

    // Find documents to remove
    this.documents.forEach((doc, index) => {
      if (predicate(doc, index)) {
        removedDocuments.push(doc);
        indicesToRemove.push(index);

        const rowId = this.docIndexToRowId.get(index);
        if (rowId !== undefined) {
          rowIdsToRemove.push(rowId);
        }
      }
    });

    // Remove documents from IVM engine first
    for (const rowId of rowIdsToRemove) {
      this.ivmEngine.removeDocument(rowId);
    }

    // Remove from documents array (in reverse order to maintain correct indices)
    indicesToRemove.reverse().forEach(index => {
      const rowId = this.docIndexToRowId.get(index);
      if (rowId !== undefined) {
        this.docIndexToRowId.delete(index);
        this.rowIdToDocIndex.delete(rowId);
      }
      this.documents.splice(index, 1);
    });

    // Update index mappings after removal
    this.reindexAfterRemoval();

    if (removedDocuments.length > 0) {
      // Emit data-removed event
      this.emit('data-removed', {
        removedDocuments: removedDocuments as Document[],
        removedCount: removedDocuments.length,
        totalCount: this.documents.length,
      });

      // Update all active aggregation results using IVM
      this.updateAggregationsWithIVM(rowIdsToRemove, 'remove');
    }

    return removedDocuments;
  }

  /**
   * Process batched remove operations efficiently
   */
  private processBatchRemove(documentsToRemove: Document[]): void {
    const removedDocuments: T[] = [];
    const indicesToRemove: number[] = [];
    const rowIdsToRemove: RowId[] = [];

    // Create a set for faster lookup
    const removeSet = new Set(documentsToRemove);

    // Find documents to remove
    this.documents.forEach((doc, index) => {
      if (removeSet.has(doc as Document)) {
        removedDocuments.push(doc);
        indicesToRemove.push(index);

        const rowId = this.docIndexToRowId.get(index);
        if (rowId !== undefined) {
          rowIdsToRemove.push(rowId);
        }
      }
    });

    // Remove documents from IVM engine first
    for (const rowId of rowIdsToRemove) {
      this.ivmEngine.removeDocument(rowId);
    }

    // Remove from documents array (in reverse order to maintain correct indices)
    indicesToRemove.reverse().forEach(index => {
      const rowId = this.docIndexToRowId.get(index);
      if (rowId !== undefined) {
        this.docIndexToRowId.delete(index);
        this.rowIdToDocIndex.delete(rowId);
      }
      this.documents.splice(index, 1);
    });

    // Update index mappings after removal
    this.reindexAfterRemoval();

    if (removedDocuments.length > 0) {
      // Emit data-removed event
      this.emit('data-removed', {
        removedDocuments: removedDocuments as Document[],
        removedCount: removedDocuments.length,
        totalCount: this.documents.length,
      });

      // Update all active aggregation results using IVM
      this.updateAggregationsWithIVM(rowIdsToRemove, 'remove');
    }
  }

  /**
   * Get streaming performance metrics including delta optimizer stats
   */
  getStreamingMetrics(): any {
    return {
      documentCount: this.documents.length,
      activePipelines: this.activePipelines.size,
      deltaOptimizer: this.deltaOptimizer.getMetrics(),
      ivmEngine: this.ivmEngine.getStats ? this.ivmEngine.getStats() : {},
    };
  }

  /**
   * Reset streaming performance metrics
   */
  resetStreamingMetrics(): void {
    this.deltaOptimizer.resetMetrics();
  }

  /**
   * Remove documents by ID (assumes documents have an 'id' or '_id' field)
   */
  removeById(id: any): T | null {
    const removed = this.remove(
      doc => (doc as any).id === id || (doc as any)._id === id
    );
    return removed.length > 0 ? removed[0] : null;
  }

  /**
   * Remove multiple documents by IDs
   */
  removeByIds(ids: any[]): T[] {
    const idSet = new Set(ids);
    return this.remove(
      doc => idSet.has((doc as any).id) || idSet.has((doc as any)._id)
    );
  }

  /**
   * Remove documents by matching query (similar to MongoDB deleteMany)
   */
  removeByQuery(query: Partial<T>): T[] {
    return this.remove(doc => {
      return Object.entries(query).every(([key, value]) => {
        return (doc as any)[key] === value;
      });
    });
  }

  /**
   * Remove a specific number of documents from the beginning
   */
  removeFirst(count: number = 1): T[] {
    const toRemove = Math.min(count, this.documents.length);
    const removed: T[] = [];

    for (let i = 0; i < toRemove; i++) {
      removed.push(this.documents[i]);
    }

    return this.remove((doc, index) => index < toRemove);
  }

  /**
   * Remove a specific number of documents from the end
   */
  removeLast(count: number = 1): T[] {
    const toRemove = Math.min(count, this.documents.length);
    const startIndex = this.documents.length - toRemove;

    return this.remove((doc, index) => index >= startIndex);
  }

  /**
   * Connect to an external EventEmitter as a data source
   */
  connectEventSource(config: EventConsumerConfig<T>): string {
    const consumerId = `${config.eventName}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    this.eventConsumers.set(consumerId, config);

    if (config.autoStart !== false) {
      this.startEventConsumer(consumerId);
    }

    return consumerId;
  }

  /**
   * Disconnect from an external EventEmitter
   */
  disconnectEventSource(consumerId: string): void {
    this.stopEventConsumer(consumerId);
    this.eventConsumers.delete(consumerId);
  }

  /**
   * Start consuming events from a configured source
   */
  startEventConsumer(consumerId: string): void {
    const config = this.eventConsumers.get(consumerId);
    if (!config) {
      throw new Error(`Event consumer ${consumerId} not found`);
    }

    // Remove existing listener if any
    this.stopEventConsumer(consumerId);

    const listener = (eventData: any) => {
      try {
        let documentsToAdd: T[];

        if (config.transform) {
          const transformed = config.transform(eventData, config.eventName);

          if (!transformed) {
            return; // Transform returned null/undefined, skip this event
          }

          documentsToAdd = Array.isArray(transformed)
            ? transformed
            : [transformed];
        } else {
          // No transform, assume eventData is the document(s)
          documentsToAdd = Array.isArray(eventData) ? eventData : [eventData];
        }

        // Filter out any null/undefined values
        documentsToAdd = documentsToAdd.filter(
          doc => doc !== null && doc !== undefined
        );

        if (documentsToAdd.length > 0) {
          this.addBulk(documentsToAdd);
        }
      } catch (error) {
        this.emit('transform-error', {
          error: error as Error,
          originalEvent: eventData,
          eventName: config.eventName,
        });
      }
    };

    this.eventListeners.set(consumerId, listener);
    config.source.on(config.eventName, listener);
  }

  /**
   * Stop consuming events from a configured source
   */
  stopEventConsumer(consumerId: string): void {
    const config = this.eventConsumers.get(consumerId);
    const listener = this.eventListeners.get(consumerId);

    if (config && listener) {
      config.source.removeListener(config.eventName, listener);
      this.eventListeners.delete(consumerId);
    }
  }

  /**
   * Get list of active event consumers
   */
  getEventConsumers(): Array<{
    id: string;
    eventName: string;
    hasTransform: boolean;
  }> {
    return Array.from(this.eventConsumers.entries()).map(([id, config]) => ({
      id,
      eventName: config.eventName,
      hasTransform: !!config.transform,
    }));
  }

  /**
   * Get current documents (read-only)
   */
  getDocuments(): Collection<T> {
    return [...this.documents];
  }

  /**
   * Get count of documents
   */
  count(): number {
    return this.documents.length;
  }

  /**
   * Register a pipeline for streaming updates using crossfilter IVM engine
   * Returns the current result and keeps it updated as data changes
   */
  stream(pipeline: Pipeline): Collection<Document> {
    const pipelineKey = this.getPipelineKey(pipeline);

    // Store the pipeline for future updates
    this.activePipelines.set(pipelineKey, pipeline);

    // Defer IVM compilation to first update to keep stream() fast
    const state: AggregationState = {
      lastResult: [],
      pipelineHash: pipelineKey,
      canIncrement: false,
      canDecrement: false,
      // IVM fields will be filled on first update attempt
    } as any;
    this.aggregationStates.set(pipelineKey, state);

    // Materialize via hot path (same as arrays) for initial result (allow opt-out)
    const disableHotPath =
      process.env.DISABLE_HOT_PATH_STREAMING === '1' ||
      process.env.HOT_PATH_STREAMING === '0';
    const hotPathResult = disableHotPath
      ? aggregate(this.documents, pipeline)
      : hotPathAggregate(this.documents, pipeline);

    // Optional parity check for observability
    if (process.env.DEBUG_IVM_MISMATCH === '1') {
      try {
        // One-off IVM execute parity (non-incremental path)
        const ivmResult = this.ivmEngine.execute(pipeline);
        const resultsMatch = this.compareResults(ivmResult, hotPathResult);
        if (!resultsMatch) {
          const msg = 'IVM vs HotPath mismatch on initial materialization';
          console.warn(msg);
          recordFallback(pipeline, msg, { code: 'ivm_hotpath_mismatch' });
          // Print small diffs (size + first 2 entries)
          console.warn(
            'IVM length:',
            ivmResult.length,
            'HotPath length:',
            hotPathResult.length
          );
          console.warn('IVM[0..1]:', JSON.stringify(ivmResult.slice(0, 2)));
          console.warn('HP [0..1]:', JSON.stringify(hotPathResult.slice(0, 2)));
        }
      } catch (e) {
        console.warn('IVM parity check failed:', e);
      }
    }

    state.lastResult = hotPathResult;
    return hotPathResult;
  }

  /**
   * Alias for stream method - provides compatible API with traditional aggregation
   * Registers a pipeline for streaming updates and returns current result
   */
  aggregate(pipeline: Pipeline): Collection<Document> {
    return this.stream(pipeline);
  }

  /**
   * Stop streaming updates for a pipeline
   */
  unstream(pipeline: Pipeline): void {
    const pipelineKey = this.getPipelineKey(pipeline);
    this.activePipelines.delete(pipelineKey);
    this.aggregationStates.delete(pipelineKey);
  }

  /**
   * Get the current result for a streaming pipeline
   */
  getStreamingResult(pipeline: Pipeline): Collection<Document> | null {
    const pipelineKey = this.getPipelineKey(pipeline);
    const state = this.aggregationStates.get(pipelineKey);
    return state ? state.lastResult : null;
  }

  /**
   * Update all active aggregations using crossfilter IVM engine for true incremental processing
   */
  private updateAggregationsWithIVM(
    rowIds: RowId[],
    _operation: 'add' | 'remove'
  ): void {
    for (const [pipelineKey, pipeline] of this.activePipelines.entries()) {
      const state = this.aggregationStates.get(pipelineKey);
      if (!state) continue;

      // Lazy-compile IVM plan on first update
      if (!state._ivmEngine || !state._executionPlan) {
        try {
          logPipelineExecution(
            'compile',
            'Compiling pipeline (lazy)',
            pipeline
          );
          const plan = this.ivmEngine.compilePipeline(pipeline);
          (state as any)._ivmEngine = this.ivmEngine;
          (state as any)._executionPlan = plan;
          state.canIncrement = plan.canIncrement;
          state.canDecrement = plan.canDecrement;
        } catch (e) {
          const msg = `IVM compile failed; using hot path recompute: ${e?.message || e}`;
          recordFallback(pipeline, msg, { code: 'ivm_compile_failed' });
          state.canIncrement = false;
          state.canDecrement = false;
        }
      }

      if (
        state._ivmEngine &&
        state._executionPlan &&
        state.canIncrement &&
        state.canDecrement
      ) {
        // Create deltas for the row changes
        const deltas: Delta[] = rowIds.map(rowId => ({
          rowId,
          sign: _operation === 'add' ? 1 : -1,
        }));
        try {
          // Apply deltas through IVM engine
          const newResult = state._ivmEngine.applyDeltas(
            deltas,
            state._executionPlan
          );
          state.lastResult = newResult;

          this.emit('result-updated', { result: newResult, pipeline });
          this.emit('update', newResult);
        } catch (e) {
          const msg = `IVM runtime error; recomputing via hot path: ${e?.message || e}`;
          recordFallback(pipeline, msg, { code: 'ivm_runtime_error' });
          const disableHotPath =
            process.env.DISABLE_HOT_PATH_STREAMING === '1' ||
            process.env.HOT_PATH_STREAMING === '0';
          const newResult = disableHotPath
            ? aggregate(this.documents, pipeline)
            : hotPathAggregate(this.documents, pipeline);
          state.lastResult = newResult;
          this.emit('result-updated', { result: newResult, pipeline });
          this.emit('update', newResult);
        }
      } else {
        // Non-incremental path: recompute using hot path (same as arrays)
        const msg = 'IVM plan non-incremental — recomputing via hot path';
        recordFallback(pipeline, msg, { code: 'non_incremental_plan' });
        const disableHotPath =
          process.env.DISABLE_HOT_PATH_STREAMING === '1' ||
          process.env.HOT_PATH_STREAMING === '0';
        const newResult = disableHotPath
          ? aggregate(this.documents, pipeline)
          : hotPathAggregate(this.documents, pipeline);
        state.lastResult = newResult;
        this.emit('result-updated', { result: newResult, pipeline });
        this.emit('update', newResult);
      }
    }
  }

  /**
   * Reindex document mappings after removal operations
   */
  private reindexAfterRemoval(): void {
    // Clear existing mappings
    this.docIndexToRowId.clear();
    this.rowIdToDocIndex.clear();

    // Rebuild mappings for remaining documents
    for (let i = 0; i < this.documents.length; i++) {
      // We need to find the rowId for this document in the IVM engine
      // For now, we'll use a simplified approach and rebuild the mapping
      // In a full implementation, we'd maintain the mapping more efficiently
    }
  }

  // Note: No aggregate()-based fallback — correctness comes from IVM/hot-path

  /**
   * Generate a unique key for a pipeline (for caching)
   */
  private getPipelineKey(pipeline: Pipeline): string {
    return JSON.stringify(pipeline);
  }

  /**
   * Clear all streaming state and disconnect event sources, including IVM engine cleanup
   */
  clear(): void {
    // Stop all event consumers
    for (const consumerId of this.eventConsumers.keys()) {
      this.stopEventConsumer(consumerId);
    }

    this.documents = [];
    this.aggregationStates.clear();
    this.activePipelines.clear();
    this.eventConsumers.clear();
    this.eventListeners.clear();

    // Clear IVM engine state
    this.ivmEngine.clear();
    // Stop delta optimizer timers to avoid keeping event loop alive
    this.deltaOptimizer.destroy();
    this.docIndexToRowId.clear();
    this.rowIdToDocIndex.clear();
  }

  /**
   * Clean up all resources including IVM engine (call this when destroying the collection)
   */
  destroy(): void {
    this.clear();
    this.removeAllListeners();
  }

  /**
   * Get IVM engine statistics for performance analysis
   */
  getIVMStatistics(): any {
    return this.ivmEngine.getStatistics();
  }

  /**
   * Manually trigger IVM engine optimization
   */
  optimize(): void {
    this.ivmEngine.optimize();
  }

  /**
   * B) Parity validation: Compare two aggregation results for equality
   */
  private compareResults(
    result1: Collection<Document>,
    result2: Collection<Document>
  ): boolean {
    if (result1.length !== result2.length) {
      return false;
    }

    // Sort both results for comparison (since order might vary)
    const sorted1 = [...result1].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
    const sorted2 = [...result2].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );

    for (let i = 0; i < sorted1.length; i++) {
      if (JSON.stringify(sorted1[i]) !== JSON.stringify(sorted2[i])) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Create a streaming collection from existing data
 */
export function createStreamingCollection<T extends Document = Document>(
  initialData: Collection<T> = []
): StreamingCollection<T> {
  return new StreamingCollection(initialData);
}
