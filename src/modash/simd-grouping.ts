/**
 * SIMD-Optimized Grouping Engine for High-Performance Aggregation
 * 
 * Uses typed arrays and vectorized operations for cache-efficient numerical
 * aggregations with batch processing for optimal performance.
 */

import type { Document, DocumentValue } from './expressions';
import type { GroupStage, Expression } from '../index';
import { $expression } from './expressions';

interface BatchConfig {
  size: number;
  maxGroups: number;
}

interface GroupKey {
  value: DocumentValue;
  index: number;
}

interface AccumulatorState {
  sum: Float64Array;
  count: Uint32Array;
  min: Float64Array;
  max: Float64Array;
  first: Array<DocumentValue>;
  last: Array<DocumentValue>;
  push: Array<DocumentValue[]>;
  addToSet: Array<Set<DocumentValue>>;
}

/**
 * SIMD-optimized grouping engine using typed arrays for performance
 */
export class SIMDGroupingEngine {
  private batchConfig: BatchConfig = {
    size: 256, // Optimal batch size for cache locality
    maxGroups: 10000 // Maximum groups to handle efficiently
  };

  private groupIndex = new Map<string, number>();
  private groupKeys: GroupKey[] = [];
  private accumulators: AccumulatorState;

  constructor(maxGroups = 10000) {
    this.batchConfig.maxGroups = maxGroups;
    this.initializeAccumulators();
  }

  /**
   * Execute SIMD-optimized group operation
   */
  execute<T extends Document = Document>(
    collection: T[],
    groupSpec: GroupStage['$group']
  ): Document[] {
    if (!collection.length) return [];

    // Reset state
    this.reset();

    // Process documents in batches for optimal cache performance
    const batchSize = this.batchConfig.size;
    for (let i = 0; i < collection.length; i += batchSize) {
      const batch = collection.slice(i, i + batchSize);
      this.processBatch(batch, groupSpec);
    }

    return this.generateResults(groupSpec);
  }

  /**
   * Process a batch of documents
   */
  private processBatch<T extends Document>(
    batch: T[],
    groupSpec: GroupStage['$group']
  ): void {
    const groupByExpression = groupSpec._id;
    
    // Pre-allocate batch arrays for vectorized operations
    const batchGroupKeys = new Array<string>(batch.length);
    const batchGroupIndices = new Int32Array(batch.length);
    
    // Step 1: Compute group keys for the entire batch
    for (let i = 0; i < batch.length; i++) {
      const doc = batch[i];
      const groupKey = this.evaluateGroupKey(doc, groupByExpression);
      const keyString = this.serializeGroupKey(groupKey);
      
      batchGroupKeys[i] = keyString;
      
      let groupIndex = this.groupIndex.get(keyString);
      if (groupIndex === undefined) {
        if (this.groupKeys.length >= this.batchConfig.maxGroups) {
          // Fallback to regular processing if too many groups
          throw new Error('Too many groups for SIMD optimization');
        }
        
        groupIndex = this.groupKeys.length;
        this.groupIndex.set(keyString, groupIndex);
        this.groupKeys.push({ value: groupKey, index: groupIndex });
      }
      
      batchGroupIndices[i] = groupIndex;
    }

    // Step 2: Process accumulators for the batch using vectorized operations
    this.processAccumulators(batch, batchGroupIndices, groupSpec);
  }

  /**
   * Process accumulator operations using vectorized computation
   */
  private processAccumulators<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    groupSpec: GroupStage['$group']
  ): void {
    const accumulatorSpecs = Object.entries(groupSpec).filter(([key]) => key !== '_id');
    
    for (const [fieldName, accSpec] of accumulatorSpecs) {
      if (typeof accSpec !== 'object' || !accSpec) continue;

      const accumulatorType = Object.keys(accSpec as object)[0];
      const expression = (accSpec as any)[accumulatorType];

      switch (accumulatorType) {
        case '$sum':
          this.processSumVectorized(batch, groupIndices, expression);
          break;
        case '$avg':
          this.processAvgVectorized(batch, groupIndices, expression);
          break;
        case '$min':
          this.processMinVectorized(batch, groupIndices, expression);
          break;
        case '$max':
          this.processMaxVectorized(batch, groupIndices, expression);
          break;
        case '$count':
          this.processCountVectorized(groupIndices);
          break;
        case '$first':
          this.processFirstVectorized(batch, groupIndices, expression);
          break;
        case '$last':
          this.processLastVectorized(batch, groupIndices, expression);
          break;
        case '$push':
          this.processPushVectorized(batch, groupIndices, expression);
          break;
        case '$addToSet':
          this.processAddToSetVectorized(batch, groupIndices, expression);
          break;
      }
    }
  }

  /**
   * Vectorized $sum processing
   */
  private processSumVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    // Pre-compute all values for the batch
    const values = new Float64Array(batch.length);
    for (let i = 0; i < batch.length; i++) {
      const value = $expression(batch[i], expression);
      values[i] = this.toNumber(value);
    }

    // Vectorized accumulation
    for (let i = 0; i < values.length; i++) {
      const groupIndex = groupIndices[i];
      this.accumulators.sum[groupIndex] += values[i];
    }
  }

  /**
   * Vectorized $avg processing (uses sum + count)
   */
  private processAvgVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    const values = new Float64Array(batch.length);
    for (let i = 0; i < batch.length; i++) {
      const value = $expression(batch[i], expression);
      values[i] = this.toNumber(value);
    }

    for (let i = 0; i < values.length; i++) {
      const groupIndex = groupIndices[i];
      this.accumulators.sum[groupIndex] += values[i];
      this.accumulators.count[groupIndex]++;
    }
  }

  /**
   * Vectorized $min processing
   */
  private processMinVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    const values = new Float64Array(batch.length);
    for (let i = 0; i < batch.length; i++) {
      const value = $expression(batch[i], expression);
      values[i] = this.toNumber(value);
    }

    for (let i = 0; i < values.length; i++) {
      const groupIndex = groupIndices[i];
      const currentMin = this.accumulators.min[groupIndex];
      if (isNaN(currentMin) || values[i] < currentMin) {
        this.accumulators.min[groupIndex] = values[i];
      }
    }
  }

  /**
   * Vectorized $max processing
   */
  private processMaxVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    const values = new Float64Array(batch.length);
    for (let i = 0; i < batch.length; i++) {
      const value = $expression(batch[i], expression);
      values[i] = this.toNumber(value);
    }

    for (let i = 0; i < values.length; i++) {
      const groupIndex = groupIndices[i];
      const currentMax = this.accumulators.max[groupIndex];
      if (isNaN(currentMax) || values[i] > currentMax) {
        this.accumulators.max[groupIndex] = values[i];
      }
    }
  }

  /**
   * Vectorized $count processing
   */
  private processCountVectorized(groupIndices: Int32Array): void {
    for (let i = 0; i < groupIndices.length; i++) {
      const groupIndex = groupIndices[i];
      this.accumulators.count[groupIndex]++;
    }
  }

  /**
   * Vectorized $first processing
   */
  private processFirstVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    for (let i = 0; i < batch.length; i++) {
      const groupIndex = groupIndices[i];
      if (this.accumulators.first[groupIndex] === undefined) {
        const value = $expression(batch[i], expression);
        this.accumulators.first[groupIndex] = value;
      }
    }
  }

  /**
   * Vectorized $last processing
   */
  private processLastVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    for (let i = 0; i < batch.length; i++) {
      const groupIndex = groupIndices[i];
      const value = $expression(batch[i], expression);
      this.accumulators.last[groupIndex] = value;
    }
  }

  /**
   * Vectorized $push processing
   */
  private processPushVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    for (let i = 0; i < batch.length; i++) {
      const groupIndex = groupIndices[i];
      const value = $expression(batch[i], expression);
      
      if (!this.accumulators.push[groupIndex]) {
        this.accumulators.push[groupIndex] = [];
      }
      this.accumulators.push[groupIndex].push(value);
    }
  }

  /**
   * Vectorized $addToSet processing
   */
  private processAddToSetVectorized<T extends Document>(
    batch: T[],
    groupIndices: Int32Array,
    expression: Expression
  ): void {
    for (let i = 0; i < batch.length; i++) {
      const groupIndex = groupIndices[i];
      const value = $expression(batch[i], expression);
      
      if (!this.accumulators.addToSet[groupIndex]) {
        this.accumulators.addToSet[groupIndex] = new Set();
      }
      this.accumulators.addToSet[groupIndex].add(value);
    }
  }

  /**
   * Generate final results from accumulated data
   */
  private generateResults(groupSpec: GroupStage['$group']): Document[] {
    const results: Document[] = [];
    const accumulatorSpecs = Object.entries(groupSpec).filter(([key]) => key !== '_id');

    for (let i = 0; i < this.groupKeys.length; i++) {
      const result: Document = {
        _id: this.groupKeys[i].value
      };

      for (const [fieldName, accSpec] of accumulatorSpecs) {
        if (typeof accSpec !== 'object' || !accSpec) continue;

        const accumulatorType = Object.keys(accSpec as object)[0];

        switch (accumulatorType) {
          case '$sum':
            result[fieldName] = this.accumulators.sum[i] || 0;
            break;
          case '$avg':
            const count = this.accumulators.count[i];
            result[fieldName] = count > 0 ? this.accumulators.sum[i] / count : null;
            break;
          case '$min':
            result[fieldName] = isNaN(this.accumulators.min[i]) ? null : this.accumulators.min[i];
            break;
          case '$max':
            result[fieldName] = isNaN(this.accumulators.max[i]) ? null : this.accumulators.max[i];
            break;
          case '$count':
            result[fieldName] = this.accumulators.count[i] || 0;
            break;
          case '$first':
            result[fieldName] = this.accumulators.first[i] || null;
            break;
          case '$last':
            result[fieldName] = this.accumulators.last[i] || null;
            break;
          case '$push':
            result[fieldName] = this.accumulators.push[i] || [];
            break;
          case '$addToSet':
            result[fieldName] = this.accumulators.addToSet[i] 
              ? Array.from(this.accumulators.addToSet[i])
              : [];
            break;
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Initialize typed array accumulators
   */
  private initializeAccumulators(): void {
    const maxGroups = this.batchConfig.maxGroups;
    
    this.accumulators = {
      sum: new Float64Array(maxGroups),
      count: new Uint32Array(maxGroups),
      min: new Float64Array(maxGroups).fill(NaN),
      max: new Float64Array(maxGroups).fill(NaN),
      first: new Array<DocumentValue>(maxGroups),
      last: new Array<DocumentValue>(maxGroups),
      push: new Array<DocumentValue[]>(maxGroups),
      addToSet: new Array<Set<DocumentValue>>(maxGroups)
    };
  }

  /**
   * Reset state for new operation
   */
  private reset(): void {
    this.groupIndex.clear();
    this.groupKeys.length = 0;
    
    // Clear typed arrays efficiently
    this.accumulators.sum.fill(0);
    this.accumulators.count.fill(0);
    this.accumulators.min.fill(NaN);
    this.accumulators.max.fill(NaN);
    this.accumulators.first.fill(undefined);
    this.accumulators.last.fill(undefined);
    this.accumulators.push.fill(undefined);
    this.accumulators.addToSet.fill(undefined);
  }

  /**
   * Evaluate group key for a document
   */
  private evaluateGroupKey(doc: Document, expression: Expression): DocumentValue {
    return $expression(doc, expression);
  }

  /**
   * Serialize group key for indexing
   */
  private serializeGroupKey(key: DocumentValue): string {
    if (key === null || key === undefined) return 'null';
    if (typeof key === 'object' && !Array.isArray(key) && !(key instanceof Date)) {
      return JSON.stringify(key);
    }
    return String(key);
  }

  /**
   * Convert value to number for numerical operations
   */
  private toNumber(value: DocumentValue): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.getTime();
    return 0;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      maxGroups: this.batchConfig.maxGroups,
      batchSize: this.batchConfig.size,
      currentGroups: this.groupKeys.length,
      memoryUsage: {
        sum: this.accumulators.sum.byteLength,
        count: this.accumulators.count.byteLength,
        min: this.accumulators.min.byteLength,
        max: this.accumulators.max.byteLength,
        total: this.accumulators.sum.byteLength +
               this.accumulators.count.byteLength +
               this.accumulators.min.byteLength +
               this.accumulators.max.byteLength
      }
    };
  }
}

/**
 * Check if grouping operation is suitable for SIMD optimization
 */
export function isSIMDOptimizable(
  collection: Document[],
  groupSpec: GroupStage['$group']
): boolean {
  // Skip if collection too small
  if (collection.length < 100) return false;

  // Check if all accumulators are SIMD-friendly
  const accumulatorSpecs = Object.entries(groupSpec).filter(([key]) => key !== '_id');
  
  for (const [, accSpec] of accumulatorSpecs) {
    if (typeof accSpec !== 'object' || !accSpec) continue;
    
    const accumulatorType = Object.keys(accSpec as object)[0];
    
    // Only allow certain accumulator types for SIMD
    const supportedAccumulators = [
      '$sum', '$avg', '$min', '$max', '$count', 
      '$first', '$last', '$push', '$addToSet'
    ];
    
    if (!supportedAccumulators.includes(accumulatorType)) {
      return false;
    }
  }

  return true;
}

// Singleton instance for global use
export const simdGroupingEngine = new SIMDGroupingEngine();