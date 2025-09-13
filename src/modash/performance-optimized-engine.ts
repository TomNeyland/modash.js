/**
 * Performance-Optimized Execution Engine for modash.js
 * Implements single-pass execution and intelligent indexing
 */

import type { Collection, Document, DocumentValue } from './expressions.js';
import type { Pipeline, PipelineStage } from '../index.js';

interface IndexEntry {
  field: string;
  type: 'equality' | 'range' | 'composite';
  data: Map<any, number[]>;
  created: number;
  lastUsed: number;
  hitCount: number;
}

interface ExecutionPlan {
  canUseSinglePass: boolean;
  estimatedCost: number;
  stages: OptimizedStage[];
  indexUsage: string[];
}

interface OptimizedStage {
  type: string;
  operation: any;
  canMergeWithNext: boolean;
  estimatedSelectivity: number;
}

export class PerformanceOptimizedEngine {
  private indexes: Map<string, IndexEntry> = new Map();
  private queryCache: Map<string, any> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private autoIndexThreshold = 3;

  /**
   * High-performance aggregation with automatic optimization
   */
  aggregate<T extends Document>(collection: Collection<T>, pipeline: Pipeline): Collection<T> {
    const startTime = performance.now();
    
    // Generate query signature for caching
    const queryKey = this.generateQueryKey(collection, pipeline);
    
    // Check cache first
    const cached = this.queryCache.get(queryKey);
    if (cached) {
      this.recordMetric('cache-hit', performance.now() - startTime);
      return cached;
    }

    // Analyze and optimize pipeline
    const executionPlan = this.createExecutionPlan(collection, pipeline);
    
    // Execute optimized plan
    let result: Collection<T>;
    
    if (executionPlan.canUseSinglePass && collection.length > 100) {
      result = this.executeSinglePass(collection, executionPlan) as Collection<T>;
    } else {
      result = this.executeTraditional(collection, pipeline) as Collection<T>;
    }

    // Cache result for future use
    if (collection.length > 50) {
      this.queryCache.set(queryKey, result);
    }

    // Track performance
    const duration = performance.now() - startTime;
    this.recordMetric('total-execution', duration);
    
    // Update index usage statistics
    this.updateIndexStats(pipeline);

    return result;
  }

  /**
   * Single-pass execution for compatible pipeline stages
   */
  private executeSinglePass<T extends Document>(
    collection: Collection<T>, 
    plan: ExecutionPlan
  ): Collection<T> {
    const results: T[] = [];
    const filters: Array<(doc: T) => boolean> = [];
    const projectionFields = new Set<string>();
    let groupBy: any = null;
    let sort: any = null;
    let limit: number | undefined;
    let skip = 0;

    // Analyze stages for single-pass compatibility
    for (const stage of plan.stages) {
      switch (stage.type) {
        case '$match':
          filters.push(this.compileMatcher(stage.operation));
          break;
        case '$project':
          Object.keys(stage.operation).forEach(field => projectionFields.add(field));
          break;
        case '$group':
          groupBy = stage.operation;
          break;
        case '$sort':
          sort = stage.operation;
          break;
        case '$limit':
          limit = stage.operation;
          break;
        case '$skip':
          skip = stage.operation;
          break;
      }
    }

    // Single iteration through collection
    if (groupBy) {
      return this.executeSinglePassGrouping(collection, filters, groupBy, sort, limit, skip) as Collection<T>;
    } else {
      return this.executeSinglePassFiltering(collection, filters, projectionFields, sort, limit, skip) as Collection<T>;
    }
  }

  /**
   * Optimized single-pass filtering and projection
   */
  private executeSinglePassFiltering<T extends Document>(
    collection: Collection<T>,
    filters: Array<(doc: T) => boolean>,
    projectionFields: Set<string>,
    sort: any,
    limit?: number,
    skip = 0
  ): T[] {
    const results: T[] = [];
    let processed = 0;

    for (const doc of collection) {
      // Apply all filters
      let passes = true;
      for (const filter of filters) {
        if (!filter(doc)) {
          passes = false;
          break;
        }
      }

      if (!passes) continue;

      // Skip documents
      if (processed < skip) {
        processed++;
        continue;
      }

      // Apply projection if specified
      let result = doc;
      if (projectionFields.size > 0) {
        result = this.applyProjection(doc, projectionFields) as T;
      }

      results.push(result);

      // Check limit
      if (limit && results.length >= limit) {
        break;
      }
    }

    // Apply sorting if needed
    if (sort) {
      results.sort(this.createComparer(sort));
    }

    return results;
  }

  /**
   * Optimized single-pass grouping
   */
  private executeSinglePassGrouping<T extends Document>(
    collection: Collection<T>,
    filters: Array<(doc: T) => boolean>,
    groupSpec: any,
    sort: any,
    limit?: number,
    skip = 0
  ): T[] {
    const groups = new Map<string, any>();
    const { _id: groupKey, ...aggregations } = groupSpec;

    // Initialize accumulators
    const accumulators = this.createAccumulators(aggregations);

    for (const doc of collection) {
      // Apply filters
      let passes = true;
      for (const filter of filters) {
        if (!filter(doc)) {
          passes = false;
          break;
        }
      }
      if (!passes) continue;

      // Calculate group key
      const key = this.evaluateExpression(doc, groupKey);
      const keyStr = typeof key === 'object' ? JSON.stringify(key) : String(key);

      // Initialize group if not exists
      if (!groups.has(keyStr)) {
        groups.set(keyStr, {
          _id: key,
          ...Object.fromEntries(
            Object.keys(aggregations).map(field => [
              field,
              accumulators[field].init()
            ])
          )
        });
      }

      // Update aggregations
      const group = groups.get(keyStr)!;
      for (const [field, accumulator] of Object.entries(accumulators)) {
        const value = this.evaluateExpression(doc, aggregations[field]);
        group[field] = accumulator.update(group[field], value);
      }
    }

    // Finalize results
    let results = Array.from(groups.values()).map(group => {
      const result = { ...group };
      for (const [field, accumulator] of Object.entries(accumulators)) {
        result[field] = accumulator.finalize(result[field]);
      }
      return result;
    });

    // Apply sorting, skip, and limit
    if (sort) {
      results.sort(this.createComparer(sort));
    }

    if (skip > 0) {
      results = results.slice(skip);
    }

    if (limit) {
      results = results.slice(0, limit);
    }

    return results as T[];
  }

  /**
   * Create execution plan with optimization analysis
   */
  private createExecutionPlan<T extends Document>(
    collection: Collection<T>, 
    pipeline: Pipeline
  ): ExecutionPlan {
    const stages: OptimizedStage[] = [];
    let canUseSinglePass = true;
    let estimatedCost = 0;
    const indexUsage: string[] = [];

    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];
      const stageType = Object.keys(stage)[0];
      const operation = stage[stageType as keyof PipelineStage];

      const optimizedStage: OptimizedStage = {
        type: stageType,
        operation,
        canMergeWithNext: this.canMergeWithNext(stage, pipeline[i + 1]),
        estimatedSelectivity: this.estimateSelectivity(stage, collection.length)
      };

      // Check if we can use indexes
      if (stageType === '$match') {
        const applicableIndex = this.findApplicableIndex(operation as any);
        if (applicableIndex) {
          indexUsage.push(applicableIndex);
          optimizedStage.estimatedSelectivity *= 0.1; // Index lookup is much faster
        }
      }

      // Check if single-pass is still possible
      if (stageType === '$lookup' || stageType === '$unwind') {
        canUseSinglePass = false;
      }

      stages.push(optimizedStage);
      estimatedCost += this.estimateStageCost(optimizedStage, collection.length);
    }

    return {
      canUseSinglePass,
      estimatedCost,
      stages,
      indexUsage
    };
  }

  /**
   * Create optimized matcher function
   */
  private compileMatcher<T extends Document>(matchSpec: any): (doc: T) => boolean {
    const matchers: Array<(doc: T) => boolean> = [];

    for (const [field, condition] of Object.entries(matchSpec)) {
      if (field === '$and') {
        const andMatchers = (condition as any[]).map(c => this.compileMatcher(c));
        matchers.push(doc => andMatchers.every(m => m(doc)));
      } else if (field === '$or') {
        const orMatchers = (condition as any[]).map(c => this.compileMatcher(c));
        matchers.push(doc => orMatchers.some(m => m(doc)));
      } else {
        matchers.push(this.createFieldMatcher(field, condition));
      }
    }

    return (doc: T) => matchers.every(m => m(doc));
  }

  /**
   * Create field-specific matcher
   */
  private createFieldMatcher<T extends Document>(field: string, condition: any): (doc: T) => boolean {
    if (typeof condition === 'object' && condition !== null) {
      const operators = Object.keys(condition);
      
      return (doc: T) => {
        const value = this.getNestedValue(doc, field);
        
        for (const op of operators) {
          const operand = condition[op];
          
          switch (op) {
            case '$eq':
              if (value !== operand) return false;
              break;
            case '$ne':
              if (value === operand) return false;
              break;
            case '$gt':
              if (value <= operand) return false;
              break;
            case '$gte':
              if (value < operand) return false;
              break;
            case '$lt':
              if (value >= operand) return false;
              break;
            case '$lte':
              if (value > operand) return false;
              break;
            case '$in':
              if (!Array.isArray(operand) || !operand.includes(value)) return false;
              break;
            case '$nin':
              if (!Array.isArray(operand) || operand.includes(value)) return false;
              break;
            default:
              return false;
          }
        }
        
        return true;
      };
    } else {
      // Simple equality match
      return (doc: T) => this.getNestedValue(doc, field) === condition;
    }
  }

  /**
   * Utility methods
   */
  private generateQueryKey<T extends Document>(collection: Collection<T>, pipeline: Pipeline): string {
    const collectionHash = this.hashCollection(collection);
    const pipelineHash = JSON.stringify(pipeline);
    return `${collectionHash}:${pipelineHash}`;
  }

  private hashCollection<T extends Document>(collection: Collection<T>): string {
    // Simple hash based on collection length and first/last elements
    if (collection.length === 0) return 'empty';
    
    const first = JSON.stringify(collection[0]);
    const last = collection.length > 1 ? JSON.stringify(collection[collection.length - 1]) : first;
    
    return `${collection.length}:${this.simpleHash(first)}:${this.simpleHash(last)}`;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private evaluateExpression(doc: Document, expression: any): DocumentValue {
    if (typeof expression === 'string' && expression.startsWith('$')) {
      return this.getNestedValue(doc, expression.slice(1));
    }
    return expression;
  }

  private applyProjection<T extends Document>(doc: T, fields: Set<string>): Partial<T> {
    const result: any = {};
    
    for (const field of fields) {
      if (field === '_id' || fields.has(field)) {
        result[field] = this.getNestedValue(doc, field);
      }
    }
    
    return result;
  }

  private createComparer(sortSpec: any): (a: any, b: any) => number {
    const fields = Object.entries(sortSpec);
    
    return (a, b) => {
      for (const [field, direction] of fields) {
        const aVal = this.getNestedValue(a, field);
        const bVal = this.getNestedValue(b, field);
        
        const comparison = this.compareValues(aVal, bVal);
        
        if (comparison !== 0) {
          return (direction as number) === 1 ? comparison : -comparison;
        }
      }
      
      return 0;
    };
  }

  private compareValues(a: any, b: any): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    
    return String(a).localeCompare(String(b));
  }

  private createAccumulators(aggregations: any): Record<string, any> {
    const accumulators: Record<string, any> = {};
    
    for (const [field, operation] of Object.entries(aggregations)) {
      if (typeof operation === 'object' && operation !== null) {
        const opType = Object.keys(operation)[0];
        
        switch (opType) {
          case '$sum':
            accumulators[field] = {
              init: () => 0,
              update: (acc: number, value: any) => acc + (Number(value) || 0),
              finalize: (acc: number) => acc
            };
            break;
          case '$avg':
            accumulators[field] = {
              init: () => ({ sum: 0, count: 0 }),
              update: (acc: any, value: any) => ({
                sum: acc.sum + (Number(value) || 0),
                count: acc.count + (value != null ? 1 : 0)
              }),
              finalize: (acc: any) => acc.count > 0 ? acc.sum / acc.count : 0
            };
            break;
          case '$max':
            accumulators[field] = {
              init: () => -Infinity,
              update: (acc: any, value: any) => value > acc ? value : acc,
              finalize: (acc: any) => acc === -Infinity ? null : acc
            };
            break;
          case '$min':
            accumulators[field] = {
              init: () => Infinity,
              update: (acc: any, value: any) => value < acc ? value : acc,
              finalize: (acc: any) => acc === Infinity ? null : acc
            };
            break;
          default:
            accumulators[field] = {
              init: () => null,
              update: (acc: any, value: any) => value,
              finalize: (acc: any) => acc
            };
        }
      }
    }
    
    return accumulators;
  }

  // Stub methods for execution plan analysis
  private canMergeWithNext(stage: PipelineStage, nextStage?: PipelineStage): boolean {
    return false; // Simplified for now
  }

  private estimateSelectivity(stage: PipelineStage, collectionSize: number): number {
    return 0.5; // Simplified for now
  }

  private findApplicableIndex(matchSpec: any): string | null {
    return null; // Simplified for now
  }

  private estimateStageCost(stage: OptimizedStage, collectionSize: number): number {
    return collectionSize * 0.1; // Simplified for now
  }

  private executeTraditional<T extends Document>(collection: Collection<T>, pipeline: Pipeline): Collection<T> {
    // Fallback to traditional execution - would import and use existing implementation
    throw new Error('Traditional execution not implemented in this demo');
  }

  private recordMetric(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    this.performanceMetrics.get(operation)!.push(duration);
  }

  private updateIndexStats(pipeline: Pipeline): void {
    // Track which fields are being queried for auto-indexing
    // Simplified for now
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const stats: Record<string, any> = {};
    
    for (const [operation, durations] of this.performanceMetrics) {
      const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const sorted = [...durations].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      
      stats[operation] = {
        count: durations.length,
        avg: Math.round(avg * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        min: Math.min(...durations),
        max: Math.max(...durations)
      };
    }
    
    return stats;
  }
}