/**
 * Streaming/Incremental Update Support for Modash
 *
 * Provides live views of aggregation results that update dynamically
 * as new data is added through .add() or .addBulk() operations.
 */

import { EventEmitter } from 'events';
import type { Collection, Document, DocumentValue } from './expressions.js';
import type { Pipeline, PipelineStage } from '../index.js';
import { aggregate } from './aggregation.js';
import { $match, $group, $sort, $project, $limit, $skip } from './aggregation.js';

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
 * Cached state for incremental aggregation operations
 */
export interface AggregationState {
  // For $group operations - cache counts and running totals
  groupCounts: Map<string, number>;
  groupSums: Map<string, Map<string, number>>;
  groupMins: Map<string, Map<string, DocumentValue>>;
  groupMaxs: Map<string, Map<string, DocumentValue>>;

  // For $sort operations - maintain sorted indices
  sortedIndices: number[];
  sortSpec: Record<string, 1 | -1> | null;

  // For $match operations - cache filtered results
  filteredDocuments: Set<number>; // document indices

  // General pipeline state
  lastResult: Collection<Document>;
  pipelineHash: string;
}

/**
 * StreamingCollection provides incremental update capabilities
 * for modash aggregation pipelines.
 */
export class StreamingCollection<
  T extends Document = Document,
> extends EventEmitter {
  private documents: T[] = [];
  private aggregationStates = new Map<string, AggregationState>();
  private activePipelines = new Map<string, Pipeline>();
  private eventConsumers = new Map<string, EventConsumerConfig<T>>();
  private eventListeners = new Map<string, (data: any) => void>();

  constructor(initialData: Collection<T> = []) {
    super();
    this.documents = [...initialData];
  }

  /**
   * Add a single document and trigger incremental updates
   */
  add(document: T): void {
    this.addBulk([document]);
  }

  /**
   * Add multiple documents and trigger incremental updates
   */
  addBulk(newDocuments: T[]): void {
    if (newDocuments.length === 0) return;

    this.documents.push(...newDocuments);

    // Emit data-added event
    this.emit('data-added', {
      newDocuments: newDocuments as Document[],
      totalCount: this.documents.length,
    });

    // Update all active aggregation results
    this.updateAggregations(newDocuments);
  }

  /**
   * Remove documents by predicate function and trigger incremental updates
   */
  remove(predicate: (doc: T, index: number) => boolean): T[] {
    const removedDocuments: T[] = [];
    const indicesToRemove: number[] = [];

    // Find documents to remove
    this.documents.forEach((doc, index) => {
      if (predicate(doc, index)) {
        removedDocuments.push(doc);
        indicesToRemove.push(index);
      }
    });

    // Remove documents (in reverse order to maintain correct indices)
    indicesToRemove.reverse().forEach(index => {
      this.documents.splice(index, 1);
    });

    if (removedDocuments.length > 0) {
      // Emit data-removed event
      this.emit('data-removed', {
        removedDocuments: removedDocuments as Document[],
        removedCount: removedDocuments.length,
        totalCount: this.documents.length,
      });

      // Update all active aggregation results
      this.updateAggregationsAfterRemoval(removedDocuments);
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
    const removed = this.documents.splice(0, count);

    if (removed.length > 0) {
      // Emit data-removed event
      this.emit('data-removed', {
        removedDocuments: removed as Document[],
        removedCount: removed.length,
        totalCount: this.documents.length,
      });

      // Update all active aggregation results
      this.updateAggregationsAfterRemoval(removed);
    }

    return removed;
  }

  /**
   * Remove a specific number of documents from the end
   */
  removeLast(count: number = 1): T[] {
    const startIndex = Math.max(0, this.documents.length - count);
    const removed = this.documents.splice(startIndex, count);

    if (removed.length > 0) {
      // Emit data-removed event
      this.emit('data-removed', {
        removedDocuments: removed as Document[],
        removedCount: removed.length,
        totalCount: this.documents.length,
      });

      // Update all active aggregation results
      this.updateAggregationsAfterRemoval(removed);
    }

    return removed;
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
   * Register a pipeline for streaming updates
   * Returns the current result and keeps it updated as data changes
   */
  stream(pipeline: Pipeline): Collection<Document> {
    const pipelineKey = this.getPipelineKey(pipeline);

    // Store the pipeline for future updates
    this.activePipelines.set(pipelineKey, pipeline);

    // Initialize aggregation state if needed
    if (!this.aggregationStates.has(pipelineKey)) {
      this.initializeAggregationState(pipelineKey, pipeline);
    }

    // Calculate initial result
    const result = aggregate(this.documents, pipeline);
    this.aggregationStates.get(pipelineKey)!.lastResult = result;

    return result;
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
   * Update all active aggregations incrementally with proper stage-by-stage processing
   */
  private updateAggregations(newDocuments: T[]): void {
    for (const [pipelineKey, pipeline] of this.activePipelines.entries()) {
      const state = this.aggregationStates.get(pipelineKey);
      if (!state) continue;

      try {
        // Try incremental update first, fallback to full recalculation if needed
        const canIncrement = this.canIncrementPipeline(pipeline);
        
        if (canIncrement) {
          const newResult = this.incrementalUpdate(newDocuments, pipeline, state);
          state.lastResult = newResult;
        } else {
          // Some operations don't support incremental updates yet - use full recalculation
          const newResult = aggregate(this.documents, pipeline);
          state.lastResult = newResult;
        }

        this.emit('result-updated', { result: state.lastResult, pipeline });
      } catch (error) {
        console.warn(
          `Error updating streaming aggregation for pipeline ${pipelineKey}:`,
          error
        );
        // Fallback to full recalculation on error
        try {
          const newResult = aggregate(this.documents, pipeline);
          state.lastResult = newResult;
          this.emit('result-updated', { result: newResult, pipeline });
        } catch (fallbackError) {
          console.error('Even fallback aggregation failed:', fallbackError);
        }
      }
    }
  }

  /**
   * Update all active aggregations after removal of documents with proper decremental processing
   */
  private updateAggregationsAfterRemoval(removedDocuments: T[]): void {
    for (const [pipelineKey, pipeline] of this.activePipelines.entries()) {
      const state = this.aggregationStates.get(pipelineKey);
      if (!state) continue;

      try {
        // Try decremental update first, fallback to full recalculation if needed
        const canDecrement = this.canDecrementPipeline(pipeline);
        
        if (canDecrement) {
          const newResult = this.decrementalUpdate(removedDocuments, pipeline, state);
          state.lastResult = newResult;
        } else {
          // Some operations don't support decremental updates yet - use full recalculation
          const newResult = aggregate(this.documents, pipeline);
          state.lastResult = newResult;
        }

        this.emit('result-updated', { result: state.lastResult, pipeline });
      } catch (error) {
        console.warn(
          `Error updating streaming aggregation after removal for pipeline ${pipelineKey}:`,
          error
        );
        // Fallback to full recalculation on error
        try {
          const newResult = aggregate(this.documents, pipeline);
          state.lastResult = newResult;
          this.emit('result-updated', { result: newResult, pipeline });
        } catch (fallbackError) {
          console.error('Even fallback aggregation failed:', fallbackError);
        }
      }
    }
  }

  /**
   * Check if a pipeline can be incrementally updated
   */
  private canIncrementPipeline(pipeline: Pipeline): boolean {
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];
    
    // For now, only support simple single-stage $match operations
    // We'll expand this as we improve the incremental logic
    return stages.length === 1 && '$match' in stages[0];
  }

  /**
   * Check if a pipeline can be decrementally updated
   */
  private canDecrementPipeline(pipeline: Pipeline): boolean {
    // For decrements, be even more conservative - just use full recalc for now
    // Decremental updates are more complex because we need to track which 
    // documents contributed to which results
    return false;
  }

  /**
   * Perform incremental update for new documents
   */
  private incrementalUpdate(newDocuments: T[], pipeline: Pipeline, state: AggregationState): Collection<Document> {
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];
    
    // For simple match-only pipelines, we can do true incremental updates
    if (stages.length === 1 && '$match' in stages[0]) {
      // Apply match to new documents and combine with existing results
      const newMatched = $match(newDocuments, stages[0].$match);
      return [...state.lastResult, ...newMatched];
    }
    
    // For complex pipelines, fall back to full recalculation for now
    // This is safer and ensures correctness while we improve incremental logic
    return aggregate(this.documents, pipeline);
  }

  /**
   * Perform decremental update for removed documents
   */
  private decrementalUpdate(removedDocuments: T[], pipeline: Pipeline, state: AggregationState): Collection<Document> {
    // For now, always use full recalculation for removals
    // This is safer and ensures correctness
    return aggregate(this.documents, pipeline);
  }

  /**
   * Initialize aggregation state for a new pipeline
   */
  private initializeAggregationState(
    pipelineKey: string,
    _pipeline: Pipeline
  ): void {
    const state: AggregationState = {
      groupCounts: new Map(),
      groupSums: new Map(),
      groupMins: new Map(),
      groupMaxs: new Map(),
      sortedIndices: [],
      sortSpec: null,
      filteredDocuments: new Set(),
      lastResult: [],
      pipelineHash: pipelineKey,
    };

    this.aggregationStates.set(pipelineKey, state);
  }

  /**
   * Generate a unique key for a pipeline (for caching)
   */
  private getPipelineKey(pipeline: Pipeline): string {
    return JSON.stringify(pipeline);
  }

  /**
   * Clear all streaming state and disconnect event sources
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
  }

  /**
   * Clean up all resources (call this when destroying the collection)
   */
  destroy(): void {
    this.clear();
    this.removeAllListeners();
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
