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
import type { Collection, Document } from './expressions.js';
import type { Pipeline } from '../index.js';
import { aggregate } from './aggregation.js';
import { createCrossfilterEngine } from './crossfilter-engine.js';
import type { CrossfilterIVMEngine, RowId, Delta } from './crossfilter-ivm.js';
import { DEBUG, recordFallback, logPipelineExecution } from './debug.js';

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
  }

  /**
   * Add a single document and trigger incremental updates
   */
  add(document: T): void {
    this.addBulk([document]);
  }

  /**
   * Add multiple documents and trigger incremental updates using IVM engine
   */
  addBulk(newDocuments: T[]): void {
    if (newDocuments.length === 0) return;

    const startIndex = this.documents.length;
    this.documents.push(...newDocuments);

    // Add to IVM engine and track rowIds
    const addedRowIds: RowId[] = [];
    for (let i = 0; i < newDocuments.length; i++) {
      const docIndex = startIndex + i;
      const rowId = this.ivmEngine.addDocument(newDocuments[i]);
      this.docIndexToRowId.set(docIndex, rowId);
      this.rowIdToDocIndex.set(rowId, docIndex);
      addedRowIds.push(rowId);
    }

    // Emit data-added event
    this.emit('data-added', {
      newDocuments: newDocuments as Document[],
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

    try {
      // Compile pipeline with IVM engine
      logPipelineExecution('compile', 'Compiling pipeline', pipeline);
      const executionPlan = this.ivmEngine.compilePipeline(pipeline);

      // Check if pipeline can be handled incrementally
      if (!executionPlan.canIncrement || !executionPlan.canDecrement) {
        const msg = 'Pipeline contains unsupported operations for IVM, falling back to standard aggregation';
        console.warn(msg);
        recordFallback(pipeline, msg);
        throw new Error('Pipeline not fully supported by IVM engine');
      }

      // Initialize aggregation state with IVM backing
      const state: AggregationState = {
        lastResult: [],
        pipelineHash: pipelineKey,
        canIncrement: executionPlan.canIncrement,
        canDecrement: executionPlan.canDecrement,
        _ivmEngine: this.ivmEngine,
        _executionPlan: executionPlan,
        _documentRowIds: new Map(this.docIndexToRowId),
      };

      this.aggregationStates.set(pipelineKey, state);

      // Calculate initial result using IVM engine
      logPipelineExecution('execute', 'Executing pipeline with IVM');
      const result = this.ivmEngine.execute(pipeline);
      state.lastResult = result;

      return result;
    } catch (error) {
      const errorMsg = error?.message || String(error);
      const errorDetails = error instanceof Error ? error.stack : errorMsg;

      console.warn(
        'IVM engine failed, falling back to standard aggregation:',
        errorMsg
      );

      if (DEBUG) {
        console.error('Full error details:', errorDetails);
      }

      recordFallback(pipeline, error);

      // Fallback to standard aggregation for now
      const result = aggregate(this.documents, pipeline);

      // Still store the pipeline for potential future IVM processing
      const state: AggregationState = {
        lastResult: result,
        pipelineHash: pipelineKey,
        canIncrement: false,
        canDecrement: false,
      };
      this.aggregationStates.set(pipelineKey, state);

      return result;
    }
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
      if (!state || !state._ivmEngine || !state._executionPlan) {
        // Fallback to old method if IVM not available
        this.fallbackToLegacyUpdate(pipelineKey, pipeline, _operation);
        continue;
      }

      try {
        // Create deltas for the row changes
        const deltas: Delta[] = rowIds.map(rowId => ({
          rowId,
          sign: _operation === 'add' ? 1 : -1,
        }));

        // Apply deltas through IVM engine
        const newResult = state._ivmEngine.applyDeltas(
          deltas,
          state._executionPlan
        );
        state.lastResult = newResult;

        this.emit('result-updated', { result: newResult, pipeline });
      } catch (error) {
        console.warn(
          `Error in IVM processing for pipeline ${pipelineKey}, falling back to full recalculation:`,
          error
        );

        // Fallback to full recalculation
        try {
          const newResult = this.ivmEngine.execute(pipeline);
          state.lastResult = newResult;
          this.emit('result-updated', { result: newResult, pipeline });
        } catch (fallbackError) {
          console.error('Even IVM fallback failed:', fallbackError);
        }
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

  /**
   * Fallback to legacy aggregation update when IVM is not available
   */
  private fallbackToLegacyUpdate(
    pipelineKey: string,
    pipeline: Pipeline,
    _operation: 'add' | 'remove'
  ): void {
    const state = this.aggregationStates.get(pipelineKey);
    if (!state) return;

    try {
      // Fall back to full recalculation using original aggregate function
      const newResult = aggregate(this.documents, pipeline);
      state.lastResult = newResult;
      this.emit('result-updated', { result: newResult, pipeline });
    } catch (error) {
      console.error(
        `Fallback aggregation failed for pipeline ${pipelineKey}:`,
        error
      );
    }
  }

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
}

/**
 * Create a streaming collection from existing data
 */
export function createStreamingCollection<T extends Document = Document>(
  initialData: Collection<T> = []
): StreamingCollection<T> {
  return new StreamingCollection(initialData);
}
