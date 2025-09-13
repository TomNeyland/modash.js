/**
 * Streaming/Incremental Update Support for Modash
 *
 * Provides live views of aggregation results that update dynamically
 * as new data is added through .add() or .addBulk() operations.
 */

import { EventEmitter } from 'events';
import type { Collection, Document, DocumentValue } from './expressions.js';
import type { Pipeline } from '../index.js';
import { aggregate } from './aggregation.js';

/**
 * Events emitted by StreamingCollection
 */
export interface StreamingEvents {
  'data-added': { newDocuments: Document[]; totalCount: number };
  'result-updated': { result: Collection<Document>; pipeline: Pipeline };
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
  private documents: Collection<T> = [];
  private aggregationStates = new Map<string, AggregationState>();
  private activePipelines = new Map<string, Pipeline>();

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
   * Update all active aggregations incrementally
   */
  private updateAggregations(_newDocuments: T[]): void {
    for (const [pipelineKey, pipeline] of this.activePipelines.entries()) {
      const state = this.aggregationStates.get(pipelineKey);
      if (!state) continue;

      try {
        // For now, use full recalculation as fallback
        // TODO: Implement true incremental updates per pipeline stage
        const newResult = aggregate(this.documents, pipeline);
        state.lastResult = newResult;

        this.emit('result-updated', { result: newResult, pipeline });
      } catch (error) {
        console.warn(
          `Error updating streaming aggregation for pipeline ${pipelineKey}:`,
          error
        );
        // Continue with other pipelines even if one fails
      }
    }
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
   * Clear all streaming state
   */
  clear(): void {
    this.documents = [];
    this.aggregationStates.clear();
    this.activePipelines.clear();
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

/**
 * Enhanced aggregate function that can work with streaming collections
 */
export function aggregateStreaming<T extends Document = Document>(
  collection: Collection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): Collection<Document> {
  if (collection instanceof StreamingCollection) {
    return collection.stream(pipeline);
  }
  return aggregate(collection, pipeline);
}
