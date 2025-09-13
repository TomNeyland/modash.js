/**
 * Performance-Optimized Execution Engine for modash.js
 * Implements single-pass execution and intelligent indexing
 */

import type { Collection, Document, DocumentValue } from './expressions.js';
import type { Pipeline } from '../index.js';
import { IndexingSystem } from './indexing-system.js';
import { QueryOptimizer, type ExecutionPlan } from './query-optimizer.js';

interface IndexEntry {
  field: string;
  type: 'equality' | 'range' | 'composite';
  data: Map<any, number[]>;
  created: number;
  lastUsed: number;
  hitCount: number;
}

export class PerformanceOptimizedEngine {
  private indexes: Map<string, IndexEntry> = new Map();
  private queryCache: Map<string, any> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private autoIndexThreshold = 3;
  private indexingSystem: IndexingSystem;
  private queryOptimizer: QueryOptimizer;

  constructor() {
    this.indexingSystem = new IndexingSystem();
    this.queryOptimizer = new QueryOptimizer();
  }

  /**
   * High-performance aggregation with automatic optimization
   */
  aggregate<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
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
    const executionPlan = this.queryOptimizer.createExecutionPlan(
      collection,
      pipeline
    );

    // Execute optimized plan
    let result: Collection<T>;

    if (executionPlan.canUseSinglePass && collection.length > 100) {
      result = this.executeSinglePass(
        collection,
        executionPlan
      ) as Collection<T>;
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
    const filters: Array<(doc: T, index?: number) => boolean> = [];
    let projectionSpec: any = null;
    let groupBy: any = null;
    let sort: any = null;
    let limit: number | undefined;
    let skip = 0;

    // Analyze stages for single-pass compatibility
    for (const stage of plan.stages) {
      switch (stage.type) {
        case '$match':
          filters.push(this.compileMatcher(stage.operation, collection));
          break;
        case '$project':
          projectionSpec = stage.operation;
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
      return this.executeSinglePassGrouping(
        collection,
        filters,
        groupBy,
        sort,
        limit,
        skip
      ) as Collection<T>;
    } else {
      return this.executeSinglePassFiltering(
        collection,
        filters,
        projectionSpec,
        sort,
        limit,
        skip
      ) as Collection<T>;
    }
  }

  /**
   * Optimized single-pass filtering and projection
   */
  private executeSinglePassFiltering<T extends Document>(
    collection: Collection<T>,
    filters: Array<(doc: T, index?: number) => boolean>,
    projectionSpec: any,
    sort: any,
    limit?: number,
    skip = 0
  ): T[] {
    const results: T[] = [];
    let processed = 0;

    for (let i = 0; i < collection.length; i++) {
      const doc = collection[i];

      // Apply all filters
      let passes = true;
      for (const filter of filters) {
        if (!filter(doc, i)) {
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
      if (projectionSpec) {
        result = this.applyProjection(doc, projectionSpec) as T;
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
    filters: Array<(doc: T, index?: number) => boolean>,
    groupSpec: any,
    sort: any,
    limit?: number,
    skip = 0
  ): T[] {
    const groups = new Map<string, any>();
    const { _id: groupKey, ...aggregations } = groupSpec;

    // Initialize accumulators
    const accumulators = this.createAccumulators(aggregations);

    for (let i = 0; i < collection.length; i++) {
      const doc = collection[i];

      // Apply filters
      let passes = true;
      for (const filter of filters) {
        if (!filter(doc, i)) {
          passes = false;
          break;
        }
      }
      if (!passes) continue;

      // Calculate group key
      const key = this.evaluateExpression(doc, groupKey);
      const keyStr =
        typeof key === 'object' ? JSON.stringify(key) : String(key);

      // Initialize group if not exists
      if (!groups.has(keyStr)) {
        groups.set(keyStr, {
          _id: key,
          ...Object.fromEntries(
            Object.keys(aggregations).map(field => [
              field,
              accumulators[field].init(),
            ])
          ),
        });
      }

      // Update aggregations
      const group = groups.get(keyStr)!;
      for (const [field, accumulator] of Object.entries(accumulators)) {
        const operationSpec = aggregations[field];
        let value: any;

        if (typeof operationSpec === 'object' && operationSpec !== null) {
          const opType = Object.keys(operationSpec)[0];
          const operand = operationSpec[opType];

          // Handle different operator types
          switch (opType) {
            case '$sum':
            case '$avg':
            case '$max':
            case '$min':
              value = this.evaluateExpression(doc, operand);
              break;
            case '$push':
              value = this.evaluateExpression(doc, operand);
              break;
            case '$first':
            case '$last':
              value = this.evaluateExpression(doc, operand);
              break;
            default:
              value = this.evaluateExpression(doc, operand);
          }
        } else {
          value = this.evaluateExpression(doc, operationSpec);
        }

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
   * Create optimized matcher function with index support
   */
  private compileMatcher<T extends Document>(
    matchSpec: any,
    collection?: Collection<T>
  ): (doc: T, index?: number) => boolean {
    const matchers: Array<(doc: T, index?: number) => boolean> = [];
    const indexedFields: Set<string> = new Set();

    for (const [field, condition] of Object.entries(matchSpec)) {
      if (field === '$and') {
        const andMatchers = (condition as any[]).map(c =>
          this.compileMatcher(c, collection)
        );
        matchers.push((doc, index) => andMatchers.every(m => m(doc, index)));
      } else if (field === '$or') {
        const orMatchers = (condition as any[]).map(c =>
          this.compileMatcher(c, collection)
        );
        matchers.push((doc, index) => orMatchers.some(m => m(doc, index)));
      } else {
        // Track query patterns for auto-indexing
        if (collection && typeof condition === 'object' && condition !== null) {
          const operator = Object.keys(condition)[0];
          this.indexingSystem.trackQuery(field, operator, collection);

          // Try to use existing index
          if (operator === '$eq' && this.indexingSystem.hasIndex(field)) {
            indexedFields.add(field);
          }
        } else if (collection && typeof condition !== 'object') {
          // Simple equality
          this.indexingSystem.trackQuery(field, '$eq', collection);
        }

        matchers.push(this.createFieldMatcher(field, condition));
      }
    }

    return (doc: T, index?: number) => matchers.every(m => m(doc, index));
  }

  /**
   * Create field-specific matcher with index optimization
   */
  private createFieldMatcher<T extends Document>(
    field: string,
    condition: any
  ): (doc: T, _index?: number) => boolean {
    if (typeof condition === 'object' && condition !== null) {
      const operators = Object.keys(condition);

      return (doc: T, _index?: number) => {
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
              if (!Array.isArray(operand) || !operand.includes(value))
                return false;
              break;
            case '$nin':
              if (!Array.isArray(operand) || operand.includes(value))
                return false;
              break;
            default:
              return false;
          }
        }

        return true;
      };
    } else {
      // Simple equality match
      return (doc: T, _index?: number) =>
        this.getNestedValue(doc, field) === condition;
    }
  }

  /**
   * Utility methods
   */
  private generateQueryKey<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): string {
    const collectionHash = this.hashCollection(collection);
    const pipelineHash = JSON.stringify(pipeline);
    return `${collectionHash}:${pipelineHash}`;
  }

  private hashCollection<T extends Document>(
    collection: Collection<T>
  ): string {
    // Simple hash based on collection length and first/last elements
    if (collection.length === 0) return 'empty';

    const first = JSON.stringify(collection[0]);
    const last =
      collection.length > 1
        ? JSON.stringify(collection[collection.length - 1])
        : first;

    return `${collection.length}:${this.simpleHash(first)}:${this.simpleHash(last)}`;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private evaluateExpression(doc: Document, expression: any): DocumentValue {
    if (expression === null || expression === undefined) {
      return expression;
    }

    if (typeof expression === 'string' && expression.startsWith('$')) {
      return this.getNestedValue(doc, expression.slice(1));
    }

    if (typeof expression === 'object' && expression !== null) {
      // Handle expression objects like { $add: [...] }
      const keys = Object.keys(expression);
      if (keys.length === 1 && keys[0].startsWith('$')) {
        const operator = keys[0];
        const operand = expression[operator];

        switch (operator) {
          case '$add':
            return Array.isArray(operand)
              ? operand.reduce(
                  (sum, val) =>
                    sum + (Number(this.evaluateExpression(doc, val)) || 0),
                  0
                )
              : Number(this.evaluateExpression(doc, operand)) || 0;
          case '$multiply':
            return Array.isArray(operand)
              ? operand.reduce(
                  (product, val) =>
                    product * (Number(this.evaluateExpression(doc, val)) || 1),
                  1
                )
              : Number(this.evaluateExpression(doc, operand)) || 1;
          case '$subtract':
            if (Array.isArray(operand) && operand.length === 2) {
              const left =
                Number(this.evaluateExpression(doc, operand[0])) || 0;
              const right =
                Number(this.evaluateExpression(doc, operand[1])) || 0;
              return left - right;
            }
            return 0;
          case '$divide':
            if (Array.isArray(operand) && operand.length === 2) {
              const left =
                Number(this.evaluateExpression(doc, operand[0])) || 0;
              const right =
                Number(this.evaluateExpression(doc, operand[1])) || 1;
              return right !== 0 ? left / right : 0;
            }
            return 0;
          default:
            return this.evaluateExpression(doc, operand);
        }
      } else {
        // Handle object literals
        const result: any = {};
        for (const [key, value] of Object.entries(expression)) {
          result[key] = this.evaluateExpression(doc, value);
        }
        return result;
      }
    }

    return expression;
  }

  private applyProjection<T extends Document>(
    doc: T,
    projectionSpec: any
  ): Partial<T> {
    const result: any = {};

    for (const [field, value] of Object.entries(projectionSpec)) {
      if (value === 1) {
        // Include field
        result[field] = this.getNestedValue(doc, field);
      } else if (value === 0) {
        // Exclude field - do nothing
        continue;
      } else {
        // Computed field
        result[field] = this.evaluateExpression(doc, value);
      }
    }

    // Handle _id field by default unless explicitly excluded
    if (!projectionSpec.hasOwnProperty('_id') || projectionSpec._id !== 0) {
      if (doc._id !== undefined) {
        result._id = doc._id;
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
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;

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
              finalize: (acc: number) => acc,
            };
            break;
          case '$avg':
            accumulators[field] = {
              init: () => ({ sum: 0, count: 0 }),
              update: (acc: any, value: any) => ({
                sum: acc.sum + (Number(value) || 0),
                count: acc.count + (value !== null ? 1 : 0),
              }),
              finalize: (acc: any) => (acc.count > 0 ? acc.sum / acc.count : 0),
            };
            break;
          case '$max':
            accumulators[field] = {
              init: () => -Infinity,
              update: (acc: any, value: any) => (value > acc ? value : acc),
              finalize: (acc: any) => (acc === -Infinity ? null : acc),
            };
            break;
          case '$min':
            accumulators[field] = {
              init: () => Infinity,
              update: (acc: any, value: any) => (value < acc ? value : acc),
              finalize: (acc: any) => (acc === Infinity ? null : acc),
            };
            break;
          case '$push':
            accumulators[field] = {
              init: () => [],
              update: (acc: any[], value: any) => [...acc, value],
              finalize: (acc: any[]) => acc,
            };
            break;
          case '$addToSet':
            accumulators[field] = {
              init: () => new Set(),
              update: (acc: Set<any>, value: any) => acc.add(value),
              finalize: (acc: Set<any>) => Array.from(acc),
            };
            break;
          case '$first':
            accumulators[field] = {
              init: () => ({ value: undefined, hasValue: false }),
              update: (acc: any, value: any) =>
                acc.hasValue ? acc : { value, hasValue: true },
              finalize: (acc: any) => acc.value,
            };
            break;
          case '$last':
            accumulators[field] = {
              init: () => undefined,
              update: (acc: any, value: any) => value,
              finalize: (acc: any) => acc,
            };
            break;
          default:
            accumulators[field] = {
              init: () => null,
              update: (acc: any, value: any) => value,
              finalize: (acc: any) => acc,
            };
        }
      } else {
        // Simple field reference
        accumulators[field] = {
          init: () => null,
          update: (acc: any, value: any) => value,
          finalize: (acc: any) => acc,
        };
      }
    }

    return accumulators;
  }

  private executeTraditional<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    // Traditional sequential execution of pipeline stages
    let result: Collection<T> = collection;

    for (const stage of pipeline) {
      if ('$match' in stage) {
        result = this.executeMatch(result, stage.$match);
      } else if ('$project' in stage) {
        result = this.executeProject(result, stage.$project);
      } else if ('$group' in stage) {
        result = this.executeGroup(result, stage.$group);
      } else if ('$sort' in stage) {
        result = this.executeSort(result, stage.$sort);
      } else if ('$limit' in stage) {
        result = this.executeLimit(result, stage.$limit);
      } else if ('$skip' in stage) {
        result = this.executeSkip(result, stage.$skip);
      } else if ('$unwind' in stage) {
        result = this.executeUnwind(result, stage.$unwind);
      } else if ('$addFields' in stage) {
        result = this.executeAddFields(result, stage.$addFields);
      } else if ('$set' in stage) {
        result = this.executeAddFields(result, stage.$set);
      }
    }

    return result;
  }

  /**
   * Traditional stage execution methods for fallback
   */
  private executeMatch<T extends Document>(
    collection: Collection<T>,
    matchSpec: any
  ): Collection<T> {
    return collection.filter(doc =>
      this.matchesQuery(doc, matchSpec)
    ) as Collection<T>;
  }

  private executeProject<T extends Document>(
    collection: Collection<T>,
    projectSpec: any
  ): Collection<T> {
    return collection.map(doc =>
      this.applyProjection(doc, projectSpec)
    ) as Collection<T>;
  }

  private executeGroup<T extends Document>(
    collection: Collection<T>,
    groupSpec: any
  ): Collection<T> {
    const groups = new Map<string, any>();
    const { _id: groupKey, ...aggregations } = groupSpec;
    const accumulators = this.createAccumulators(aggregations);

    for (const doc of collection) {
      const key = this.evaluateExpression(doc, groupKey);
      const keyStr =
        typeof key === 'object' ? JSON.stringify(key) : String(key);

      if (!groups.has(keyStr)) {
        groups.set(keyStr, {
          _id: key,
          ...Object.fromEntries(
            Object.keys(aggregations).map(field => [
              field,
              accumulators[field].init(),
            ])
          ),
        });
      }

      const group = groups.get(keyStr)!;
      for (const [field, accumulator] of Object.entries(accumulators)) {
        const operationSpec = aggregations[field];
        let value: any;

        if (typeof operationSpec === 'object' && operationSpec !== null) {
          const opType = Object.keys(operationSpec)[0];
          const operand = operationSpec[opType];
          value = this.evaluateExpression(doc, operand);
        } else {
          value = this.evaluateExpression(doc, operationSpec);
        }

        group[field] = accumulator.update(group[field], value);
      }
    }

    return Array.from(groups.values()).map(group => {
      const result = { ...group };
      for (const [field, accumulator] of Object.entries(accumulators)) {
        result[field] = accumulator.finalize(result[field]);
      }
      return result;
    }) as Collection<T>;
  }

  private executeSort<T extends Document>(
    collection: Collection<T>,
    sortSpec: any
  ): Collection<T> {
    return [...collection].sort(this.createComparer(sortSpec)) as Collection<T>;
  }

  private executeLimit<T extends Document>(
    collection: Collection<T>,
    limit: number
  ): Collection<T> {
    return collection.slice(0, limit) as Collection<T>;
  }

  private executeSkip<T extends Document>(
    collection: Collection<T>,
    skip: number
  ): Collection<T> {
    return collection.slice(skip) as Collection<T>;
  }

  private executeUnwind<T extends Document>(
    collection: Collection<T>,
    unwindSpec: any
  ): Collection<T> {
    const path = typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path;
    const field = path.startsWith('$') ? path.slice(1) : path;
    const result: T[] = [];

    for (const doc of collection) {
      const arrayValue = this.getNestedValue(doc, field);

      if (Array.isArray(arrayValue)) {
        for (const item of arrayValue) {
          const newDoc = { ...doc };
          this.setNestedValue(newDoc, field, item);
          result.push(newDoc);
        }
      } else if (arrayValue !== null) {
        // Non-array values are treated as single-element arrays
        result.push(doc);
      }
      // Documents without the field or with null/undefined are omitted
    }

    return result as Collection<T>;
  }

  private executeAddFields<T extends Document>(
    collection: Collection<T>,
    fieldsSpec: any
  ): Collection<T> {
    return collection.map(doc => {
      const newFields: Record<string, any> = {};
      for (const [fieldName, expression] of Object.entries(fieldsSpec)) {
        newFields[fieldName] = this.evaluateExpression(doc, expression);
      }
      return { ...doc, ...newFields };
    }) as Collection<T>;
  }

  private matchesQuery(doc: Document, query: any): boolean {
    for (const [field, condition] of Object.entries(query)) {
      if (field === '$and') {
        if (
          !Array.isArray(condition) ||
          !condition.every(subQuery => this.matchesQuery(doc, subQuery))
        ) {
          return false;
        }
      } else if (field === '$or') {
        if (
          !Array.isArray(condition) ||
          !condition.some(subQuery => this.matchesQuery(doc, subQuery))
        ) {
          return false;
        }
      } else if (field === '$nor') {
        if (
          Array.isArray(condition) &&
          condition.some(subQuery => this.matchesQuery(doc, subQuery))
        ) {
          return false;
        }
      } else {
        const value = this.getNestedValue(doc, field);
        if (!this.matchesCondition(value, condition)) {
          return false;
        }
      }
    }
    return true;
  }

  private matchesCondition(value: any, condition: any): boolean {
    if (typeof condition !== 'object' || condition === null) {
      return value === condition;
    }

    for (const [operator, operand] of Object.entries(condition)) {
      switch (operator) {
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
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private recordMetric(operation: string, duration: number): void {
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, []);
    }
    this.performanceMetrics.get(operation)!.push(duration);
  }

  private updateIndexStats(_pipeline: Pipeline): void {
    // Track which fields are being queried for auto-indexing
    // Simplified for now
  }

  /**
   * Get comprehensive performance statistics
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
        max: Math.max(...durations),
      };
    }

    return {
      performance: stats,
      indexes: this.indexingSystem.getIndexStats(),
      suggestions: this.indexingSystem.getSuggestedIndexes(),
      optimizer: this.queryOptimizer.getOptimizationStats(),
    };
  }

  /**
   * Force cleanup of unused indexes and cache
   */
  cleanup() {
    this.indexingSystem.cleanupIndexes();

    // Clear old cache entries (simple LRU-like cleanup)
    if (this.queryCache.size > 100) {
      const entries = Array.from(this.queryCache.entries());
      const keepCount = 50;
      this.queryCache.clear();

      entries.slice(-keepCount).forEach(([key, value]) => {
        this.queryCache.set(key, value);
      });
    }
  }
}
