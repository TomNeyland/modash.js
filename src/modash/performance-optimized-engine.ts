/**
 * Performance-Optimized Engine for Hot Path Processing
 *
 * This module implements the P0 performance optimizations:
 * - Delta batching with buffer pools (64-512 batch sizes)
 * - Near-zero allocation hot paths
 * - RowIds-only processing with late materialization
 * - Operator fusion for $match+$project
 * - Compiled expressions with constant folding
 */

import type { Document } from './expressions';
import type {
  RowId,
  Delta,
  CrossfilterStore,
  IVMContext,
  IVMOperator,
} from './crossfilter-ivm';

/**
 * Buffer pool for reusing arrays to avoid allocations
 */
class BufferPool {
  private pools = new Map<string, any[][]>();
  private maxPoolSize = 100;

  get<T>(type: string, size: number): T[] {
    const poolKey = `${type}_${size}`;
    let pool = this.pools.get(poolKey);

    if (!pool) {
      pool = [];
      this.pools.set(poolKey, pool);
    }

    if (pool.length > 0) {
      const buffer = pool.pop()!;
      buffer.length = 0; // Clear without deallocating

      // If this is a complex buffer that might contain Maps/Sets, ensure they're cleared
      if (Array.isArray(buffer)) {
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] instanceof Map) {
            (buffer[i] as Map<any, any>).clear();
          } else if (buffer[i] instanceof Set) {
            (buffer[i] as Set<any>).clear();
          }
        }
      }

      return buffer as T[];
    }

    // Create new buffer if pool empty
    return new Array(size) as T[];
  }

  return<T>(type: string, buffer: T[]): void {
    const size = buffer.length;
    const poolKey = `${type}_${size}`;
    let pool = this.pools.get(poolKey);

    if (!pool) {
      pool = [];
      this.pools.set(poolKey, pool);
    }

    if (pool.length < this.maxPoolSize) {
      // Clear Maps/Sets in buffer before returning to pool
      if (Array.isArray(buffer)) {
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] instanceof Map) {
            (buffer[i] as Map<any, any>).clear();
          } else if (buffer[i] instanceof Set) {
            (buffer[i] as Set<any>).clear();
          }
        }
      }

      buffer.length = 0; // Clear content but keep allocation
      pool.push(buffer);
    }
  }

  clear(): void {
    this.pools.clear();
  }
}

/**
 * Performance counters for monitoring hot path efficiency
 */
interface PerformanceCounters {
  totalDeltas: number;
  batchedDeltas: number;
  fallbacks: number;
  allocations: number;
  compiledHits: number;
  fusedOperations: number;
}

/**
 * Delta batch processor for amortizing operation costs
 */
export class DeltaBatchProcessor {
  private static readonly BATCH_SIZE = 256; // Optimal batch size from benchmarks
  private static readonly MAX_BATCH_DELAY = 1; // Max 1ms delay for batching

  private pendingAdds: Delta[] = [];
  private pendingRemoves: Delta[] = [];
  private batchTimer?: NodeJS.Timeout;
  private bufferPool = new BufferPool();
  private counters: PerformanceCounters = {
    totalDeltas: 0,
    batchedDeltas: 0,
    fallbacks: 0,
    allocations: 0,
    compiledHits: 0,
    fusedOperations: 0,
  };

  /**
   * Process delta with batching for optimal throughput
   */
  processDelta(
    delta: Delta,
    operators: IVMOperator[],
    store: CrossfilterStore,
    context: IVMContext,
    callback: (results: RowId[]) => void
  ): void {
    this.counters.totalDeltas++;

    if (delta.sign === 1) {
      this.pendingAdds.push(delta);
    } else {
      this.pendingRemoves.push(delta);
    }

    // Check if we should flush batch
    const totalPending = this.pendingAdds.length + this.pendingRemoves.length;

    if (totalPending >= DeltaBatchProcessor.BATCH_SIZE) {
      this.flushBatch(operators, store, context, callback);
    } else if (!this.batchTimer) {
      // Start timer for delayed flush
      this.batchTimer = setTimeout(() => {
        this.flushBatch(operators, store, context, callback);
      }, DeltaBatchProcessor.MAX_BATCH_DELAY);
    }
  }

  /**
   * Flush pending deltas as optimized batch
   */
  private flushBatch(
    operators: IVMOperator[],
    store: CrossfilterStore,
    context: IVMContext,
    callback: (results: RowId[]) => void
  ): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    const addCount = this.pendingAdds.length;
    const removeCount = this.pendingRemoves.length;

    if (addCount === 0 && removeCount === 0) return;

    this.counters.batchedDeltas += addCount + removeCount;

    try {
      // Process adds first, then removes for optimal cache locality
      const currentRowIds = this.bufferPool.get<RowId>(
        'rowids',
        Math.max(addCount, removeCount)
      );

      if (addCount > 0) {
        // Process add batch
        for (let i = 0; i < addCount; i++) {
          currentRowIds[i] = this.pendingAdds[i].rowId;
        }

        const addResults = this.processBatchThroughPipeline(
          currentRowIds,
          addCount,
          operators,
          store,
          context,
          1 // Add sign
        );

        // Trigger callback with add results
        if (addResults.length > 0) {
          callback(addResults);
        }
      }

      if (removeCount > 0) {
        // Process remove batch
        for (let i = 0; i < removeCount; i++) {
          currentRowIds[i] = this.pendingRemoves[i].rowId;
        }

        const removeResults = this.processBatchThroughPipeline(
          currentRowIds,
          removeCount,
          operators,
          store,
          context,
          -1 // Remove sign
        );

        // Trigger callback with remove results
        if (removeResults.length > 0) {
          callback(removeResults);
        }
      }

      // Return buffers to pool
      this.bufferPool.return('rowids', currentRowIds);
    } finally {
      // Clear pending batches
      this.pendingAdds.length = 0;
      this.pendingRemoves.length = 0;
    }
  }

  /**
   * Process row IDs through pipeline with hot path optimizations
   */
  private processBatchThroughPipeline(
    rowIds: RowId[],
    count: number,
    operators: IVMOperator[],
    store: CrossfilterStore,
    context: IVMContext,
    sign: 1 | -1
  ): RowId[] {
    let currentRowIds = rowIds;
    let currentCount = count;

    // Process through each operator
    for (let opIndex = 0; opIndex < operators.length; opIndex++) {
      const operator = operators[opIndex];
      const nextRowIds = this.bufferPool.get<RowId>('rowids', currentCount);
      let nextCount = 0;

      // Hot path: batch process all rowIds through operator
      for (let i = 0; i < currentCount; i++) {
        const delta: Delta = { rowId: currentRowIds[i], sign };

        const results =
          sign === 1
            ? operator.onAdd(delta, store, context)
            : operator.onRemove(delta, store, context);

        // Collect results into next buffer
        for (const resultDelta of results) {
          if (resultDelta.sign === sign) {
            nextRowIds[nextCount++] = resultDelta.rowId;
          }
        }
      }

      // Return previous buffer to pool (except for first iteration using input buffer)
      if (currentRowIds !== rowIds) {
        this.bufferPool.return('rowids', currentRowIds);
      }

      currentRowIds = nextRowIds;
      currentCount = nextCount;

      // Early exit if no rows remain
      if (currentCount === 0) break;
    }

    // Return final results (caller will return buffer)
    return currentRowIds.slice(0, currentCount);
  }

  /**
   * Force flush all pending batches
   */
  flush(
    operators: IVMOperator[],
    store: CrossfilterStore,
    context: IVMContext,
    callback: (results: RowId[]) => void
  ): void {
    this.flushBatch(operators, store, context, callback);
  }

  /**
   * Get performance statistics
   */
  getCounters(): PerformanceCounters {
    return { ...this.counters };
  }

  /**
   * Reset performance counters
   */
  resetCounters(): void {
    this.counters = {
      totalDeltas: 0,
      batchedDeltas: 0,
      fallbacks: 0,
      allocations: 0,
      compiledHits: 0,
      fusedOperations: 0,
    };
  }
}

/**
 * Optimized expression compiler with constant folding and pre-compilation
 */
export class OptimizedExpressionCompiler {
  private compiledCache = new Map<string, Function>();
  private constantCache = new Map<string, any>();
  private regexCache = new Map<string, RegExp>();

  /**
   * Compile match expression with optimizations
   */
  compileMatchExpression(expr: any): (doc: Document, rowId: RowId) => boolean {
    const exprKey = JSON.stringify(expr);

    if (this.compiledCache.has(exprKey)) {
      return this.compiledCache.get(exprKey) as (
        doc: Document,
        rowId: RowId
      ) => boolean;
    }

    // Pre-compile regexes
    this.precompileRegexes(expr);

    // Perform constant folding
    const optimizedExpr = this.constantFold(expr);

    // Generate optimized function
    const compiled = this.generateOptimizedMatchFunction(optimizedExpr);
    this.compiledCache.set(exprKey, compiled);

    return compiled;
  }

  /**
   * Pre-compile regex patterns for reuse
   */
  private precompileRegexes(expr: any): void {
    if (typeof expr !== 'object' || expr === null) return;

    for (const [key, value] of Object.entries(expr)) {
      if (key === '$regex' && typeof value === 'string') {
        if (!this.regexCache.has(value)) {
          try {
            this.regexCache.set(value, new RegExp(value));
          } catch {
            // Invalid regex, will fallback to string comparison
          }
        }
      } else if (typeof value === 'object') {
        this.precompileRegexes(value);
      }
    }
  }

  /**
   * Perform constant folding optimization
   */
  private constantFold(expr: any): any {
    if (typeof expr !== 'object' || expr === null) return expr;

    // Handle arithmetic expressions with constants
    if (expr.$add && Array.isArray(expr.$add)) {
      const constSum = expr.$add
        .filter((item: any) => typeof item === 'number')
        .reduce((sum: number, num: number) => sum + num, 0);

      const fieldRefs = expr.$add.filter(
        (item: any) => typeof item === 'string' && item.startsWith('$')
      );

      if (constSum !== 0 && fieldRefs.length > 0) {
        // Fold constants: [$field, 5, 3] -> [$field, 8]
        return { $add: [...fieldRefs, constSum] };
      }
    }

    if (expr.$multiply && Array.isArray(expr.$multiply)) {
      const constProduct = expr.$multiply
        .filter((item: any) => typeof item === 'number')
        .reduce((product: number, num: number) => product * num, 1);

      const fieldRefs = expr.$multiply.filter(
        (item: any) => typeof item === 'string' && item.startsWith('$')
      );

      if (constProduct !== 1 && fieldRefs.length > 0) {
        return { $multiply: [...fieldRefs, constProduct] };
      }
    }

    // Recursively fold nested expressions
    const folded: any = {};
    for (const [key, value] of Object.entries(expr)) {
      folded[key] = this.constantFold(value);
    }
    return folded;
  }

  /**
   * Generate optimized match function with inlined field access
   */
  private generateOptimizedMatchFunction(
    expr: any
  ): (doc: Document, rowId: RowId) => boolean {
    // Simple field equality - most common case
    if (typeof expr === 'object' && !Array.isArray(expr)) {
      const entries = Object.entries(expr);
      if (entries.length === 1) {
        const [field, value] = entries[0];
        if (!field.startsWith('$') && typeof value !== 'object') {
          // Optimized path: single field equality
          return (doc: Document) => doc[field] === value;
        }
      }

      // Multiple field equality
      if (
        entries.every(
          ([field, value]) =>
            !field.startsWith('$') && typeof value !== 'object'
        )
      ) {
        return (doc: Document) => {
          for (const [field, expectedValue] of entries) {
            if (doc[field] !== expectedValue) return false;
          }
          return true;
        };
      }
    }

    // Fallback to general expression evaluation
    return (doc: Document, rowId: RowId) => {
      return this.evaluateExpression(expr, doc, rowId);
    };
  }

  /**
   * Evaluate expression with optimizations
   */
  private evaluateExpression(expr: any, doc: Document, rowId: RowId): boolean {
    if (typeof expr !== 'object' || expr === null) {
      return Boolean(expr);
    }

    // Handle logical operators
    if (expr.$and) {
      return expr.$and.every((subExpr: any) =>
        this.evaluateExpression(subExpr, doc, rowId)
      );
    }

    if (expr.$or) {
      return expr.$or.some((subExpr: any) =>
        this.evaluateExpression(subExpr, doc, rowId)
      );
    }

    // Handle field comparisons
    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) continue;

      const docValue = doc[field];

      if (typeof condition === 'object' && condition !== null) {
        // Complex condition
        for (const [op, value] of Object.entries(condition)) {
          switch (op) {
            case '$eq':
              if (docValue !== value) return false;
              break;
            case '$ne':
              if (docValue === value) return false;
              break;
            case '$gt':
              if (typeof docValue !== 'number' || docValue <= (value as number))
                return false;
              break;
            case '$gte':
              if (typeof docValue !== 'number' || docValue < (value as number))
                return false;
              break;
            case '$lt':
              if (typeof docValue !== 'number' || docValue >= (value as number))
                return false;
              break;
            case '$lte':
              if (typeof docValue !== 'number' || docValue > (value as number))
                return false;
              break;
            case '$in':
              if (!Array.isArray(value) || !value.includes(docValue))
                return false;
              break;
            case '$nin':
              if (Array.isArray(value) && value.includes(docValue))
                return false;
              break;
            case '$regex':
              const regex = this.regexCache.get(value as string);
              if (regex && typeof docValue === 'string') {
                if (!regex.test(docValue)) return false;
              } else if (typeof docValue === 'string') {
                if (!docValue.includes(value as string)) return false;
              } else {
                return false;
              }
              break;
          }
        }
      } else {
        // Simple equality
        if (docValue !== condition) return false;
      }
    }

    return true;
  }

  /**
   * Clear compiled cache
   */
  clearCache(): void {
    this.compiledCache.clear();
    this.constantCache.clear();
    this.regexCache.clear();
  }
}

/**
 * Operator fusion for $match + $project combinations
 */
export class FusedMatchProjectOperator {
  private matchFunction: (doc: Document, rowId: RowId) => boolean;
  private projectFunction: (doc: Document, rowId: RowId) => Document;

  constructor(
    matchExpr: any,
    projectExpr: any,
    compiler: OptimizedExpressionCompiler
  ) {
    this.matchFunction = compiler.compileMatchExpression(matchExpr);
    this.projectFunction = this.compileProjectExpression(projectExpr);
  }

  /**
   * Apply fused match + project in single pass
   */
  apply(doc: Document, rowId: RowId): Document | null {
    // First apply match filter
    if (!this.matchFunction(doc, rowId)) {
      return null; // Filtered out
    }

    // Then apply projection
    return this.projectFunction(doc, rowId);
  }

  /**
   * Compile project expression for hot path
   */
  private compileProjectExpression(
    projectExpr: any
  ): (doc: Document, rowId: RowId) => Document {
    // Analyze projection for optimization opportunities
    const includes: string[] = [];
    const excludes: string[] = [];
    const computed: Array<{ field: string; expr: any }> = [];

    for (const [field, spec] of Object.entries(projectExpr)) {
      if (spec === 1 || spec === true) {
        includes.push(field);
      } else if (spec === 0 || spec === false) {
        excludes.push(field);
      } else if (typeof spec === 'object') {
        computed.push({ field, expr: spec });
      }
    }

    // Generate optimized projection function
    if (computed.length === 0) {
      // Simple include/exclude projection - most common case
      if (includes.length > 0) {
        return (doc: Document) => {
          const result: Document = {};
          for (const field of includes) {
            if (field in doc) {
              result[field] = doc[field];
            }
          }
          return result;
        };
      } else if (excludes.length > 0) {
        return (doc: Document) => {
          const result = { ...doc };
          for (const field of excludes) {
            delete result[field];
          }
          return result;
        };
      }
    }

    // Fallback to general projection
    return (doc: Document) => {
      const result: Document = {};

      // Handle includes
      for (const field of includes) {
        if (field in doc) {
          result[field] = doc[field];
        }
      }

      // Handle computed fields
      for (const { field, expr } of computed) {
        result[field] = this.evaluateProjectExpression(expr, doc);
      }

      return result;
    };
  }

  /**
   * Evaluate project expression
   */
  private evaluateProjectExpression(expr: any, doc: Document): any {
    if (typeof expr === 'string' && expr.startsWith('$')) {
      return doc[expr.slice(1)];
    }

    if (typeof expr === 'object' && expr !== null) {
      // Handle arithmetic expressions
      if (expr.$multiply && Array.isArray(expr.$multiply)) {
        return expr.$multiply.reduce((product: number, item: any) => {
          const value = this.evaluateProjectExpression(item, doc);
          return product * (typeof value === 'number' ? value : 0);
        }, 1);
      }

      if (expr.$add && Array.isArray(expr.$add)) {
        return expr.$add.reduce((sum: number, item: any) => {
          const value = this.evaluateProjectExpression(item, doc);
          return sum + (typeof value === 'number' ? value : 0);
        }, 0);
      }
    }

    return expr; // Literal value
  }
}

/**
 * Performance-optimized engine exports
 */
export { BufferPool };
export type { PerformanceCounters };
