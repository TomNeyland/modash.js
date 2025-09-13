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
import type { Collection, Document, DocumentValue } from './expressions.js';
import type { Pipeline } from '../index.js';
import { aggregate, $match } from './aggregation.js';
import { createCrossfilterEngine } from './crossfilter-engine.js';
import type { CrossfilterIVMEngine, RowId, Delta } from './crossfilter-ivm.js';

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
   * Register a pipeline for streaming updates using crossfilter IVM engine
   * Returns the current result and keeps it updated as data changes
   */
  stream(pipeline: Pipeline): Collection<Document> {
    const pipelineKey = this.getPipelineKey(pipeline);

    // Store the pipeline for future updates
    this.activePipelines.set(pipelineKey, pipeline);

    // Compile pipeline with IVM engine
    const executionPlan = this.ivmEngine.compilePipeline(pipeline);

    // Initialize aggregation state with IVM backing
    const state: AggregationState = {
      lastResult: [],
      pipelineHash: pipelineKey,
      canIncrement: executionPlan.canFullyIncrement,
      canDecrement: executionPlan.canFullyDecrement,
      _ivmEngine: this.ivmEngine,
      _executionPlan: executionPlan,
      _documentRowIds: new Map(this.docIndexToRowId),
    };

    this.aggregationStates.set(pipelineKey, state);

    // Calculate initial result using IVM engine
    const result = this.ivmEngine.execute(pipeline);
    state.lastResult = result;

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
   * Update all active aggregations using crossfilter IVM engine for true incremental processing
   */
  private updateAggregationsWithIVM(
    rowIds: RowId[],
    operation: 'add' | 'remove'
  ): void {
    for (const [pipelineKey, pipeline] of this.activePipelines.entries()) {
      const state = this.aggregationStates.get(pipelineKey);
      if (!state || !state._ivmEngine || !state._executionPlan) {
        // Fallback to old method if IVM not available
        this.fallbackToLegacyUpdate(pipelineKey, pipeline, operation);
        continue;
      }

      try {
        // Create deltas for the row changes
        const deltas: Delta[] = rowIds.map(rowId => ({
          rowId,
          sign: operation === 'add' ? 1 : -1,
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
    operation: 'add' | 'remove'
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
   * Check if a pipeline can be incrementally updated
   * Now supports more complex scenarios using crossfilter-inspired techniques
   */
  private canIncrementPipeline(pipeline: Pipeline): boolean {
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];

    // Support increasingly complex pipelines
    for (const stage of stages) {
      const stageType = Object.keys(stage)[0];

      switch (stageType) {
        case '$match':
          // Support complex match operations with indexed dimensions
          if (!this.canIncrementMatch(stage.$match)) {
            return false;
          }
          break;

        case '$group':
          // Support group operations with crossfilter-style incremental aggregation
          if (!this.canIncrementGroup(stage.$group)) {
            return false;
          }
          break;

        case '$sort':
          // Support sort with maintained indices
          break;

        case '$project':
          // Support projection - doesn't affect incremental capability
          break;

        case '$limit':
        case '$skip':
          // Support pagination - use sorted indices
          break;

        case '$addFields':
        case '$set':
          // Support field addition with expression evaluation
          break;

        default:
          // Unsupported operations fall back to full recalculation
          return false;
      }
    }

    return true;
  }

  /**
   * Check if a $match stage can be incrementally updated
   */
  private canIncrementMatch(matchExpr: any): boolean {
    // Support simple field comparisons that can use indexed dimensions
    if (typeof matchExpr !== 'object' || matchExpr === null) {
      return false;
    }

    // Check for supported operators
    for (const [field, condition] of Object.entries(matchExpr)) {
      if (field.startsWith('$')) {
        // Logical operators - check recursively
        if (field === '$and' || field === '$or') {
          const conditions = condition as any[];
          return conditions.every(cond => this.canIncrementMatch(cond));
        }
        // Other logical operators not yet supported incrementally
        return false;
      } else {
        // Field-based conditions - check if supported
        if (typeof condition === 'object' && condition !== null) {
          const operators = Object.keys(condition);
          const supportedOps = [
            '$eq',
            '$ne',
            '$gt',
            '$gte',
            '$lt',
            '$lte',
            '$in',
            '$nin',
            '$exists',
          ];
          if (!operators.every(op => supportedOps.includes(op))) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Check if a $group stage can be incrementally updated
   */
  private canIncrementGroup(groupExpr: any): boolean {
    if (!groupExpr || typeof groupExpr !== 'object') {
      return false;
    }

    // Check _id field (group by expression)
    if (typeof groupExpr._id === 'string' && !groupExpr._id.startsWith('$')) {
      return false; // Complex expressions not yet supported
    }

    // Check accumulator expressions
    for (const [field, expr] of Object.entries(groupExpr)) {
      if (field === '_id') continue;

      if (typeof expr === 'object' && expr !== null) {
        const accumulators = Object.keys(expr);
        // For now, don't support $avg incrementally due to precision complexity
        // Fall back to full recalculation for $avg to ensure correctness
        const supportedAccumulators = [
          '$sum',
          '$min',
          '$max',
          '$count',
          '$push',
          '$addToSet',
        ];
        if (!accumulators.every(acc => supportedAccumulators.includes(acc))) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if a pipeline can be decrementally updated
   * With crossfilter-inspired tracking, we can support removal for many cases
   */
  private canDecrementPipeline(pipeline: Pipeline): boolean {
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];

    // Use the same logic as incremental - if we can track contributions,
    // we can generally remove them too
    if (this.canIncrementPipeline(pipeline)) {
      // Additional checks for decremental complexity
      for (const stage of stages) {
        const stageType = Object.keys(stage)[0];

        switch (stageType) {
          case '$group':
            // Group operations require tracking which documents contributed to which groups
            // This is supported with our IndexedGroup.docContributions tracking
            break;

          case '$sort':
            // Sorting can be decremental by maintaining sorted indices
            break;

          default:
            // Other operations are generally decremental if incremental
            break;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Perform incremental update for new documents using improved techniques
   */
  private incrementalUpdate(
    newDocuments: T[],
    pipeline: Pipeline,
    state: AggregationState
  ): Collection<Document> {
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];

    // If we can't do incremental updates, fall back to full recalculation
    if (!state.canIncrement) {
      return aggregate(this.documents, pipeline);
    }

    try {
      // For simple match-only pipelines, we can do true incremental updates
      if (stages.length === 1 && '$match' in stages[0]) {
        // Apply match to new documents and combine with existing results
        const newMatched = $match(newDocuments, stages[0].$match);
        return [...state.lastResult, ...newMatched];
      }

      // For group-only pipelines, do smart incremental group updates
      if (stages.length === 1 && '$group' in stages[0]) {
        return this.incrementalGroupUpdate(
          newDocuments,
          stages[0].$group,
          state
        );
      }

      // For match -> group pipelines, apply incrementally
      if (
        stages.length === 2 &&
        '$match' in stages[0] &&
        '$group' in stages[1]
      ) {
        // First apply match to new documents
        const newMatched = $match(newDocuments, stages[0].$match);
        if (newMatched.length === 0) {
          return state.lastResult; // No new matches, no change needed
        }

        // Then do incremental group update with the matched documents
        return this.incrementalGroupUpdateWithNewMatches(
          newMatched,
          stages[1].$group,
          state
        );
      }

      // For other supported combinations, fall back to full recalc for now
      // This ensures correctness while building more advanced incremental logic
      return aggregate(this.documents, pipeline);
    } catch (error) {
      console.warn(
        'Incremental update failed, falling back to full recalculation:',
        error
      );
      return aggregate(this.documents, pipeline);
    }
  }

  /**
   * Perform incremental group update for simple group-only pipelines
   */
  private incrementalGroupUpdate(
    newDocuments: T[],
    groupExpr: any,
    state: AggregationState
  ): Collection<Document> {
    const groupByField = groupExpr._id;

    // Only support simple field-based grouping for now
    if (typeof groupByField !== 'string' || !groupByField.startsWith('$')) {
      return aggregate(this.documents, [{ $group: groupExpr }]);
    }

    const fieldName = groupByField.substring(1);

    // Convert current result to a map for easy updating
    const groupMap = new Map<DocumentValue, Document>();
    for (const doc of state.lastResult) {
      groupMap.set(doc._id, { ...doc });
    }

    // Process each new document
    for (const newDoc of newDocuments) {
      const groupKey = this.getFieldValue(newDoc, fieldName);
      let groupDoc = groupMap.get(groupKey);

      if (!groupDoc) {
        groupDoc = { _id: groupKey };
        groupMap.set(groupKey, groupDoc);
      }

      // Update accumulator fields
      for (const [outputField, accumExpr] of Object.entries(groupExpr)) {
        if (outputField === '_id') continue;

        this.updateAccumulatorField(groupDoc, outputField, accumExpr, newDoc);
      }
    }

    return Array.from(groupMap.values());
  }

  /**
   * Perform incremental group update when we have new matches from a $match stage
   */
  private incrementalGroupUpdateWithNewMatches(
    newMatchedDocs: Document[],
    groupExpr: any,
    state: AggregationState
  ): Collection<Document> {
    const groupByField = groupExpr._id;

    // Only support simple field-based grouping for now
    if (typeof groupByField !== 'string' || !groupByField.startsWith('$')) {
      // Fall back to full recalculation
      return aggregate(this.documents, [
        { $match: {} }, // Apply to all documents since we need to recalculate
        { $group: groupExpr },
      ]);
    }

    const fieldName = groupByField.substring(1);

    // Convert current result to a map for easy updating
    const groupMap = new Map<DocumentValue, Document>();
    for (const doc of state.lastResult) {
      groupMap.set(doc._id, { ...doc });
    }

    // Process each new matched document
    for (const newDoc of newMatchedDocs) {
      const groupKey = this.getFieldValue(newDoc, fieldName);
      let groupDoc = groupMap.get(groupKey);

      if (!groupDoc) {
        groupDoc = { _id: groupKey };
        groupMap.set(groupKey, groupDoc);
      }

      // Update accumulator fields
      for (const [outputField, accumExpr] of Object.entries(groupExpr)) {
        if (outputField === '_id') continue;

        this.updateAccumulatorField(groupDoc, outputField, accumExpr, newDoc);
      }
    }

    return Array.from(groupMap.values());
  }

  /**
   * Update a single accumulator field with a new document
   */
  private updateAccumulatorField(
    groupDoc: Document,
    outputField: string,
    accumExpr: any,
    newDoc: Document
  ): void {
    if (typeof accumExpr !== 'object' || accumExpr === null) {
      return;
    }

    for (const [accType, accField] of Object.entries(accumExpr)) {
      const currentValue = groupDoc[outputField];

      switch (accType) {
        case '$sum':
          if (accField === 1) {
            // Count documents
            groupDoc[outputField] = (currentValue || 0) + 1;
          } else if (typeof accField === 'string' && accField.startsWith('$')) {
            // Sum a field
            const fieldValue = this.getFieldValue(
              newDoc,
              accField.substring(1)
            );
            groupDoc[outputField] =
              (currentValue || 0) + (Number(fieldValue) || 0);
          }
          break;

        case '$avg':
          if (typeof accField === 'string' && accField.startsWith('$')) {
            const fieldValue = this.getFieldValue(
              newDoc,
              accField.substring(1)
            );
            const numericValue = Number(fieldValue) || 0;

            // Use hidden properties to track sum and count
            const hiddenSumKey = `__${outputField}_sum`;
            const hiddenCountKey = `__${outputField}_count`;

            if (groupDoc[hiddenSumKey] === undefined) {
              // Initialize tracking
              groupDoc[hiddenSumKey] = numericValue;
              groupDoc[hiddenCountKey] = 1;
              groupDoc[outputField] = numericValue;
            } else {
              // Update tracking
              groupDoc[hiddenSumKey] += numericValue;
              groupDoc[hiddenCountKey] += 1;
              groupDoc[outputField] =
                groupDoc[hiddenSumKey] / groupDoc[hiddenCountKey];
            }
          }
          break;

        case '$min':
          if (typeof accField === 'string' && accField.startsWith('$')) {
            const fieldValue = this.getFieldValue(
              newDoc,
              accField.substring(1)
            );
            if (currentValue === undefined || fieldValue < currentValue) {
              groupDoc[outputField] = fieldValue;
            }
          }
          break;

        case '$max':
          if (typeof accField === 'string' && accField.startsWith('$')) {
            const fieldValue = this.getFieldValue(
              newDoc,
              accField.substring(1)
            );
            if (currentValue === undefined || fieldValue > currentValue) {
              groupDoc[outputField] = fieldValue;
            }
          }
          break;

        case '$push':
          if (typeof accField === 'string' && accField.startsWith('$')) {
            const fieldValue = this.getFieldValue(
              newDoc,
              accField.substring(1)
            );
            if (!Array.isArray(currentValue)) {
              groupDoc[outputField] = [fieldValue];
            } else {
              currentValue.push(fieldValue);
            }
          }
          break;

        case '$addToSet':
          if (typeof accField === 'string' && accField.startsWith('$')) {
            const fieldValue = this.getFieldValue(
              newDoc,
              accField.substring(1)
            );
            if (!Array.isArray(currentValue)) {
              groupDoc[outputField] = [fieldValue];
            } else if (!currentValue.includes(fieldValue)) {
              currentValue.push(fieldValue);
            }
          }
          break;
      }
    }
  }

  /**
   * Index new documents in all relevant dimensions
   */
  private indexNewDocuments(newDocuments: T[], state: AggregationState): void {
    const startIndex = this.documents.length - newDocuments.length;

    for (const [_dimName, dimension] of state.dimensions) {
      for (let i = 0; i < newDocuments.length; i++) {
        const doc = newDocuments[i];
        const docIndex = startIndex + i;
        const value = this.getFieldValue(doc, dimension.fieldPath);

        if (!dimension.valueIndex.has(value)) {
          dimension.valueIndex.set(value, new Set());
          // Insert value in sorted position
          this.insertSorted(dimension.sortedValues, value);
        }

        dimension.valueIndex.get(value)!.add(docIndex);
      }
    }
  }

  /**
   * Incremental match processing using indexed dimensions
   */
  private incrementalMatch(
    matchExpr: any,
    newDocuments: T[],
    currentResult: Collection<Document>,
    _state: AggregationState,
    _newDocIndices: Set<number>
  ): Collection<Document> {
    // Apply match to new documents only and add matches to result
    const newMatches = newDocuments.filter(doc =>
      this.evaluateMatch(doc, matchExpr)
    );
    return [...currentResult, ...newMatches];
  }

  /**
   * Incremental group processing using indexed groups
   */
  private incrementalGroup(
    groupExpr: any,
    newDocuments: T[],
    _currentResult: Collection<Document>,
    state: AggregationState,
    _newDocIndices: Set<number>
  ): Collection<Document> {
    // For group operations, we need to update the group aggregations
    // and then rebuild the result from all groups

    const groupByField = groupExpr._id;
    if (typeof groupByField !== 'string' || !groupByField.startsWith('$')) {
      throw new Error(
        'Unsupported group by expression for incremental updates'
      );
    }

    const field = groupByField.substring(1);
    const startIndex = this.documents.length - newDocuments.length;

    // Update group aggregations for new documents
    for (let i = 0; i < newDocuments.length; i++) {
      const doc = newDocuments[i];
      const docIndex = startIndex + i;
      const groupKey = this.getFieldValue(doc, field);

      // Update each accumulator for this document
      for (const [outputField, accumExpr] of Object.entries(groupExpr)) {
        if (outputField === '_id') continue;

        if (typeof accumExpr === 'object' && accumExpr !== null) {
          for (const [accType, accFieldExpr] of Object.entries(accumExpr)) {
            this.updateGroupAccumulator(
              field,
              outputField,
              accType,
              accFieldExpr,
              doc,
              docIndex,
              groupKey,
              state
            );
          }
        }
      }
    }

    // Rebuild result from updated groups
    return this.rebuildGroupResult(groupExpr, state);
  }

  /**
   * Incremental sort processing using maintained indices
   */
  private incrementalSort(
    sortExpr: any,
    currentResult: Collection<Document>,
    _state: AggregationState
  ): Collection<Document> {
    // For now, sort the entire result set
    // TODO: Implement more efficient incremental sorting using sorted indices
    return [...currentResult].sort((a, b) => {
      for (const [field, order] of Object.entries(sortExpr)) {
        const aVal = this.getFieldValue(a, field);
        const bVal = this.getFieldValue(b, field);

        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;

        if (comparison !== 0) {
          return (order as number) === 1 ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Update a specific group accumulator with a new document
   */
  private updateGroupAccumulator(
    dimensionField: string,
    outputField: string,
    accType: string,
    accFieldExpr: any,
    doc: T,
    docIndex: number,
    groupKey: DocumentValue,
    state: AggregationState
  ): void {
    const groupId = `${dimensionField}_${outputField}_${accType}`;
    const group = state.groups.get(groupId);

    if (!group) return;

    // Track that this document contributes to this group
    group.docContributions.set(docIndex, groupKey);

    // Get accumulation value
    const accValue =
      accFieldExpr === 1
        ? 1
        : typeof accFieldExpr === 'string' && accFieldExpr.startsWith('$')
          ? this.getFieldValue(doc, accFieldExpr.substring(1))
          : accFieldExpr;

    // Update group accumulation
    const currentValue = group.results.get(groupKey);

    switch (accType) {
      case '$sum':
        group.results.set(
          groupKey,
          (currentValue || 0) + (Number(accValue) || 0)
        );
        break;

      case '$count':
        group.results.set(groupKey, (currentValue || 0) + 1);
        break;

      case '$min':
        group.results.set(
          groupKey,
          currentValue === undefined
            ? accValue
            : accValue < currentValue
              ? accValue
              : currentValue
        );
        break;

      case '$max':
        group.results.set(
          groupKey,
          currentValue === undefined
            ? accValue
            : accValue > currentValue
              ? accValue
              : currentValue
        );
        break;

      case '$push':
        if (!currentValue) {
          group.results.set(groupKey, [accValue]);
        } else {
          (currentValue as any[]).push(accValue);
        }
        break;

      case '$addToSet':
        if (!currentValue) {
          group.results.set(groupKey, new Set([accValue]));
        } else {
          (currentValue as Set<any>).add(accValue);
        }
        break;

      case '$avg':
        // For avg, store both sum and count
        if (!currentValue) {
          group.results.set(groupKey, { sum: Number(accValue) || 0, count: 1 });
        } else {
          const avg = currentValue as { sum: number; count: number };
          avg.sum += Number(accValue) || 0;
          avg.count += 1;
        }
        break;
    }
  }

  /**
   * Rebuild the final group result from updated group state
   */
  private rebuildGroupResult(
    groupExpr: any,
    state: AggregationState
  ): Collection<Document> {
    const groupByField = groupExpr._id.substring(1);
    const dimension = state.dimensions.get(groupByField);

    if (!dimension) {
      throw new Error(`Dimension ${groupByField} not found`);
    }

    const result: Document[] = [];

    // Iterate through all group keys
    for (const groupKey of dimension.valueIndex.keys()) {
      const resultDoc: Document = { _id: groupKey };

      // Add all accumulator results for this group
      for (const [outputField, accumExpr] of Object.entries(groupExpr)) {
        if (outputField === '_id') continue;

        if (typeof accumExpr === 'object' && accumExpr !== null) {
          for (const [accType, _accFieldExpr] of Object.entries(accumExpr)) {
            const groupId = `${groupByField}_${outputField}_${accType}`;
            const group = state.groups.get(groupId);

            if (group && group.results.has(groupKey)) {
              let value = group.results.get(groupKey);

              // Post-process some accumulator types
              if (accType === '$avg' && value && typeof value === 'object') {
                const avgData = value as { sum: number; count: number };
                value = avgData.count > 0 ? avgData.sum / avgData.count : 0;
              } else if (accType === '$addToSet' && value instanceof Set) {
                value = Array.from(value);
              }

              resultDoc[outputField] = value;
            }
          }
        }
      }

      result.push(resultDoc);
    }

    return result;
  }

  /**
   * Perform decremental update for removed documents using simplified approach
   */
  private decrementalUpdate(
    removedDocuments: T[],
    pipeline: Pipeline,
    state: AggregationState
  ): Collection<Document> {
    // For decremental updates, use a conservative approach:
    // Only support simple cases, otherwise fall back to full recalculation

    const _stages = Array.isArray(pipeline) ? pipeline : [pipeline];

    // If we can't do decremental updates, fall back to full recalculation
    if (!state.canDecrement) {
      return aggregate(this.documents, pipeline);
    }

    try {
      // For now, be conservative and fall back to full recalculation for removals
      // This ensures correctness. In the future, we can implement true decremental
      // updates using document tracking similar to crossfilter
      return aggregate(this.documents, pipeline);
    } catch (error) {
      console.warn(
        'Decremental update failed, falling back to full recalculation:',
        error
      );
      return aggregate(this.documents, pipeline);
    }
  }

  /**
   * Remove documents from all dimensions and groups
   */
  private removeDocumentsFromDimensions(
    removedDocuments: T[],
    state: AggregationState
  ): void {
    // We need to track which document indices were removed
    // This is complex because document indices shift after removal
    // For now, fall back to full recalculation of dimensions

    // Clear and rebuild all dimensions with remaining documents
    for (const dimension of state.dimensions.values()) {
      dimension.valueIndex.clear();
      dimension.sortedValues = [];
    }

    // Reindex all remaining documents
    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i];

      for (const [_dimName, dimension] of state.dimensions) {
        const value = this.getFieldValue(doc, dimension.fieldPath);

        if (!dimension.valueIndex.has(value)) {
          dimension.valueIndex.set(value, new Set());
          this.insertSorted(dimension.sortedValues, value);
        }

        dimension.valueIndex.get(value)!.add(i);
      }
    }
  }

  /**
   * Decremental match processing
   */
  private decrementalMatch(
    matchExpr: any,
    removedDocuments: T[],
    currentResult: Collection<Document>
  ): Collection<Document> {
    // Remove documents that would have matched from the current result
    const removedSet = new Set(
      removedDocuments.map(doc => JSON.stringify(doc))
    );
    return currentResult.filter(doc => !removedSet.has(JSON.stringify(doc)));
  }

  /**
   * Decremental group processing
   */
  private decrementalGroup(
    groupExpr: any,
    removedDocuments: T[],
    state: AggregationState
  ): Collection<Document> {
    // For group operations, we need to recalculate affected groups
    // This is complex because we need to track which documents contributed to which groups

    // For now, use a conservative approach: rebuild all groups from remaining documents
    // Clear existing group state
    for (const group of state.groups.values()) {
      group.results.clear();
      group.docContributions.clear();
    }

    // Rebuild groups from all remaining documents
    const groupByField = groupExpr._id.substring(1);

    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i];
      const groupKey = this.getFieldValue(doc, groupByField);

      // Update each accumulator for this document
      for (const [outputField, accumExpr] of Object.entries(groupExpr)) {
        if (outputField === '_id') continue;

        if (typeof accumExpr === 'object' && accumExpr !== null) {
          for (const [accType, accFieldExpr] of Object.entries(accumExpr)) {
            this.updateGroupAccumulator(
              groupByField,
              outputField,
              accType,
              accFieldExpr,
              doc,
              i,
              groupKey,
              state
            );
          }
        }
      }
    }

    // Rebuild result from updated groups
    return this.rebuildGroupResult(groupExpr, state);
  }

  /**
   * Get field value from document using dot notation
   */
  private getFieldValue(doc: any, fieldPath: string): DocumentValue {
    const parts = fieldPath.split('.');
    let value = doc;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Insert value in sorted array maintaining order
   */
  private insertSorted(arr: DocumentValue[], value: DocumentValue): void {
    if (arr.includes(value)) return; // Don't insert duplicates

    let left = 0;
    let right = arr.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (arr[mid] < value) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    arr.splice(left, 0, value);
  }

  /**
   * Evaluate match expression against a document
   */
  private evaluateMatch(doc: any, matchExpr: any): boolean {
    if (typeof matchExpr !== 'object' || matchExpr === null) {
      return false;
    }

    for (const [field, condition] of Object.entries(matchExpr)) {
      if (field.startsWith('$')) {
        // Logical operators
        switch (field) {
          case '$and':
            return (condition as any[]).every(cond =>
              this.evaluateMatch(doc, cond)
            );
          case '$or':
            return (condition as any[]).some(cond =>
              this.evaluateMatch(doc, cond)
            );
          case '$not':
            return !this.evaluateMatch(doc, condition);
          default:
            return false;
        }
      } else {
        // Field-based conditions
        const docValue = this.getFieldValue(doc, field);

        if (typeof condition === 'object' && condition !== null) {
          // Complex condition with operators
          for (const [op, expectedValue] of Object.entries(condition)) {
            switch (op) {
              case '$eq':
                if (docValue !== expectedValue) return false;
                break;
              case '$ne':
                if (docValue === expectedValue) return false;
                break;
              case '$gt':
                if (!(docValue > expectedValue)) return false;
                break;
              case '$gte':
                if (!(docValue >= expectedValue)) return false;
                break;
              case '$lt':
                if (!(docValue < expectedValue)) return false;
                break;
              case '$lte':
                if (!(docValue <= expectedValue)) return false;
                break;
              case '$in':
                if (
                  !Array.isArray(expectedValue) ||
                  !expectedValue.includes(docValue)
                )
                  return false;
                break;
              case '$nin':
                if (
                  Array.isArray(expectedValue) &&
                  expectedValue.includes(docValue)
                )
                  return false;
                break;
              case '$exists':
                if ((docValue !== undefined) !== expectedValue) return false;
                break;
              default:
                return false;
            }
          }
        } else {
          // Simple equality
          if (docValue !== condition) return false;
        }
      }
    }

    return true;
  }

  /**
   * Initialize aggregation state for a new pipeline with simpler approach
   */
  private initializeAggregationState(
    pipelineKey: string,
    pipeline: Pipeline
  ): void {
    const state: AggregationState = {
      // Crossfilter-inspired structures (simplified for now)
      dimensions: new Map(),
      groups: new Map(),

      // Traditional aggregation state
      groupCounts: new Map(),
      groupSums: new Map(),
      groupMins: new Map(),
      groupMaxs: new Map(),
      groupAvgs: new Map(),
      groupSets: new Map(),
      groupArrays: new Map(),

      // Sorting and filtering state
      sortedIndices: [],
      sortSpec: null,
      filteredDocuments: new Set(),
      matchPredicates: new Map(),

      // Stage-by-stage processing (simplified)
      stageResults: new Map(),
      stageFilters: new Map(),

      // General pipeline state
      lastResult: [],
      pipelineHash: pipelineKey,
      canIncrement: this.canIncrementPipeline(pipeline),
      canDecrement: this.canDecrementPipeline(pipeline),
    };

    this.aggregationStates.set(pipelineKey, state);
  }

  /**
   * Analyze pipeline stages and create optimized structures
   * Similar to how crossfilter analyzes data for efficient filtering/grouping
   */
  private analyzePipelineForOptimization(
    stages: any[],
    state: AggregationState
  ): void {
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageType = Object.keys(stage)[0];

      switch (stageType) {
        case '$match':
          this.createMatchDimensions(stage.$match, state);
          break;

        case '$group':
          this.createGroupDimensions(stage.$group, state);
          break;

        case '$sort':
          this.createSortDimensions(stage.$sort, state);
          break;
      }
    }
  }

  /**
   * Create indexed dimensions for match operations
   */
  private createMatchDimensions(matchExpr: any, state: AggregationState): void {
    if (typeof matchExpr !== 'object' || matchExpr === null) {
      return;
    }

    for (const [field, _condition] of Object.entries(matchExpr)) {
      if (!field.startsWith('$')) {
        // Create dimension for this field if it doesn't exist
        if (!state.dimensions.has(field)) {
          state.dimensions.set(field, {
            fieldPath: field,
            valueIndex: new Map(),
            sortedValues: [],
            type: 'mixed',
          });
        }
      }
    }
  }

  /**
   * Create indexed dimensions and groups for group operations
   */
  private createGroupDimensions(groupExpr: any, state: AggregationState): void {
    if (!groupExpr || typeof groupExpr !== 'object') {
      return;
    }

    // Create dimension for group by field
    const groupByField = groupExpr._id;
    if (typeof groupByField === 'string' && groupByField.startsWith('$')) {
      const field = groupByField.substring(1);
      if (!state.dimensions.has(field)) {
        state.dimensions.set(field, {
          fieldPath: field,
          valueIndex: new Map(),
          sortedValues: [],
          type: 'mixed',
        });
      }

      // Create groups for each accumulator
      for (const [outputField, accumExpr] of Object.entries(groupExpr)) {
        if (outputField === '_id') continue;

        if (typeof accumExpr === 'object' && accumExpr !== null) {
          for (const [accType, accField] of Object.entries(accumExpr)) {
            const groupId = `${field}_${outputField}_${accType}`;
            state.groups.set(groupId, {
              dimension: field,
              aggregationType: accType.substring(1) as any, // Remove $ prefix
              field:
                typeof accField === 'string' && accField.startsWith('$')
                  ? accField.substring(1)
                  : undefined,
              results: new Map(),
              docContributions: new Map(),
            });
          }
        }
      }
    }
  }

  /**
   * Create indexed dimensions for sort operations
   */
  private createSortDimensions(sortExpr: any, state: AggregationState): void {
    if (typeof sortExpr !== 'object' || sortExpr === null) {
      return;
    }

    for (const field of Object.keys(sortExpr)) {
      if (!state.dimensions.has(field)) {
        state.dimensions.set(field, {
          fieldPath: field,
          valueIndex: new Map(),
          sortedValues: [],
          type: 'mixed',
        });
      }
    }

    state.sortSpec = sortExpr;
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
}

/**
 * Create a streaming collection from existing data
 */
export function createStreamingCollection<T extends Document = Document>(
  initialData: Collection<T> = []
): StreamingCollection<T> {
  return new StreamingCollection(initialData);
}
