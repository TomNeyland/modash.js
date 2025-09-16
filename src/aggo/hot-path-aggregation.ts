/**
 * Hot Path Aggregation - P0 Performance Implementation
 *
 * Routes simple, high-performance pipelines to zero-allocation engine
 * Falls back to regular aggregation for complex operations
 *
 * Phase 9: Now includes columnar IVM engine for vectorized processing
 */

import { ZeroAllocEngine } from './zero-alloc-engine';
import { ColumnarIvmEngine } from './columnar-ivm-engine';
import { aggregate as originalAggregate } from './aggregation';
import type { Collection, Document } from './expressions';
import type { Pipeline } from '../index';
import { DEBUG, logPipelineExecution } from './debug';

/**
 * Singleton engines for different optimization paths
 */
const zeroAllocEngine = new ZeroAllocEngine();
const columnarEngine = new ColumnarIvmEngine({
  batchSize: 1024,
  enableMicroPath: true,
});

/**
 * Performance counters
 */
interface HotPathCounters {
  hotPathHits: number;
  columnarHits: number;
  fallbacks: number;
  totalOperations: number;
  hotPathThroughput: number;
  columnarThroughput: number;
  fallbackThroughput: number;
  optimizerRejections: number;
}

const counters: HotPathCounters = {
  hotPathHits: 0,
  columnarHits: 0,
  fallbacks: 0,
  totalOperations: 0,
  hotPathThroughput: 0,
  columnarThroughput: 0,
  fallbackThroughput: 0,
  optimizerRejections: 0,
};

/**
 * Optimizer rejection tracking
 */
interface OptimizerRejection {
  pipeline: Pipeline;
  reason: string;
  stageIndex?: number;
  stageType?: string;
}

const optimizerRejections: OptimizerRejection[] = [];

/**
 * Record an optimizer rejection with detailed reason
 */
function recordOptimizerRejection(
  pipeline: Pipeline,
  reason: string,
  stageIndex?: number,
  stageType?: string
): void {
  counters.optimizerRejections++;

  const rejection: OptimizerRejection = {
    pipeline: JSON.parse(JSON.stringify(pipeline)), // Deep clone to avoid mutations
    reason,
  };
  if (stageIndex !== undefined) {
    rejection.stageIndex = stageIndex;
  }
  if (stageType !== undefined) {
    rejection.stageType = stageType;
  }

  optimizerRejections.push(rejection);

  if (DEBUG) {
    logPipelineExecution(
      'OPTIMIZER',
      `❌ Hot path rejected: ${reason}${stageType ? ` (stage: ${stageType})` : ''}`,
      {
        pipelineLength: pipeline.length,
        stageIndex,
        stageType,
        pipeline,
      }
    );
  }
}

/**
 * Get optimizer rejection details for analysis
 */
export function getOptimizerRejections(): OptimizerRejection[] {
  return [...optimizerRejections];
}

/**
 * Reset optimizer rejection tracking
 */
export function resetOptimizerRejections(): void {
  counters.optimizerRejections = 0;
  optimizerRejections.length = 0;
}

/**
 * Determine if pipeline can use hot path (zero-alloc engine)
 */
function canUseHotPath(pipeline: Pipeline): boolean {
  // D) Pipeline Input Validation - Double-check pipeline is an array
  if (!Array.isArray(pipeline)) {
    recordOptimizerRejection(
      pipeline as any,
      `Pipeline is not an array: ${typeof pipeline}`
    );
    return false;
  }

  // Phase 3 hot path criteria:
  // 1. Extended pipeline length support for complex combinations (≤ 6 stages)
  // 2. Enhanced $group + $project + $sort pipeline support
  // 3. $unwind + $group optimization patterns
  // 4. Vectorized accumulator operations ($addToSet, $push)
  // 5. Operator fusion detection for multi-stage optimization

  if (pipeline.length === 0) {
    recordOptimizerRejection(pipeline, 'Empty pipeline');
    return false;
  }

  if (pipeline.length > 6) {
    recordOptimizerRejection(
      pipeline,
      `Pipeline too long (${pipeline.length} stages, max 6)`
    );
    return false;
  }

  // Check for complex pipeline patterns that are now supported
  const hasGroup = pipeline.some(stage => '$group' in stage);
  const hasUnwind = pipeline.some(stage => '$unwind' in stage);

  // Count the number of $group stages
  const groupCount = pipeline.filter(stage => '$group' in stage).length;

  // Phase 7: Disable multiple $group operations in hot path
  // The zero-alloc engine doesn't properly handle consecutive $group operations
  if (groupCount > 1) {
    recordOptimizerRejection(
      pipeline,
      'Multiple $group operations not supported in hot path - fallback to standard aggregation'
    );
    return false;
  }

  // Phase 5: Temporarily disable $unwind + $group optimization due to bugs
  // This forces these patterns through traditional aggregation path
  if (hasUnwind && hasGroup) {
    recordOptimizerRejection(
      pipeline,
      'Temporary: $unwind + $group patterns disabled in hot path for Phase 5 fixes'
    );
    return false;
  }

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    const stageType = Object.keys(stage)[0];

    switch (stageType) {
      case '$match':
        if (!isSimpleMatch(stage.$match)) {
          recordOptimizerRejection(
            pipeline,
            'Complex $match not supported in hot path',
            i,
            stageType
          );
          return false;
        }
        break;
      case '$project':
        // Phase 3: Allow computed fields after $group operations
        const isAfterGroup = pipeline.slice(0, i).some(s => '$group' in s);
        if (!isSimpleProject(stage.$project, isAfterGroup)) {
          recordOptimizerRejection(
            pipeline,
            'Complex $project with unsupported computed fields',
            i,
            stageType
          );
          return false;
        }
        break;
      case '$sort':
        if (!isSimpleSort(stage.$sort)) {
          recordOptimizerRejection(
            pipeline,
            'Complex $sort (multi-field or expression-based) not supported in hot path',
            i,
            stageType
          );
          return false;
        }
        break;
      case '$limit':
      case '$skip':
        // Always supported
        break;
      case '$group':
        if (!isSimpleGroup(stage.$group)) {
          recordOptimizerRejection(
            pipeline,
            'Complex $group operations not supported in hot path',
            i,
            stageType
          );
          return false;
        }
        break;
      case '$unwind':
        // Phase 3: Support $unwind in combination with $group
        if (!isSimpleUnwind(stage.$unwind)) {
          recordOptimizerRejection(
            pipeline,
            'Complex $unwind operations not supported in hot path',
            i,
            stageType
          );
          return false;
        }
        break;
      case '$lookup':
        // Check if this is advanced $lookup with let/pipeline
        const lookupSpec = stage.$lookup;
        if ('pipeline' in lookupSpec || 'let' in lookupSpec) {
          recordOptimizerRejection(
            pipeline,
            'Advanced $lookup with let/pipeline not supported in hot path - fallback to standard aggregation',
            i,
            stageType
          );
          return false;
        }
        // Simple $lookup with localField/foreignField is supported
        break;
      default:
        // Unsupported stage type
        recordOptimizerRejection(
          pipeline,
          `Unsupported stage type: ${stageType}`,
          i,
          stageType
        );
        return false;
    }
  }

  // If we get here, pipeline is eligible for hot path
  if (DEBUG) {
    logPipelineExecution(
      'OPTIMIZER',
      `✅ Hot path eligible: ${pipeline.length} stages`,
      {
        pipelineLength: pipeline.length,
        stages: pipeline.map(s => Object.keys(s)[0]),
      }
    );
  }

  return true;
}

/**
 * Check if $match is simple enough for hot path
 */
function isSimpleMatch(matchExpr: any): boolean {
  if (typeof matchExpr !== 'object' || matchExpr === null) return false;

  for (const [key, value] of Object.entries(matchExpr)) {
    if (key.startsWith('$')) {
      // Logical operators
      if (key === '$and' || key === '$or') {
        if (!Array.isArray(value)) return false;
        for (const subExpr of value) {
          if (!isSimpleMatch(subExpr)) return false;
        }
      } else {
        // Other $ operators not supported in hot path
        return false;
      }
    } else {
      // Field condition
      if (typeof value === 'object' && value !== null) {
        // Check if it's a simple comparison operator
        const ops = Object.keys(value);
        const allowedOps = ['$gt', '$gte', '$lt', '$lte', '$eq', '$ne', '$in'];
        if (!ops.every(op => allowedOps.includes(op))) {
          return false;
        }
      }
      // Simple equality and comparison operators are OK
    }
  }

  return true;
}

/**
 * Check if $project is simple enough for hot path
 * Phase 3: Allow computed fields after $group operations
 */
function isSimpleProject(projectSpec: any, isAfterGroup = false): boolean {
  for (const [_field, spec] of Object.entries(projectSpec)) {
    if (spec === 0 || spec === 1 || spec === true || spec === false) {
      // Simple inclusion/exclusion always supported
      continue;
    }

    if (isAfterGroup && typeof spec === 'object' && spec !== null) {
      // Phase 3: Allow simple computed fields after $group
      if (isSimpleExpression(spec)) {
        continue;
      }
    }

    // Complex computed fields not supported in hot path
    return false;
  }
  return true;
}

/**
 * Check if $sort is simple enough for hot path
 */
function isSimpleSort(sortSpec: any): boolean {
  // Only single field sorts for P0
  const fields = Object.keys(sortSpec);
  return (
    fields.length === 1 &&
    (sortSpec[fields[0]] === 1 || sortSpec[fields[0]] === -1)
  );
}

/**
 * Check if $group is simple enough for hot path
 * Phase 3: Enhanced support with vectorized accumulators
 */
function isSimpleGroup(groupSpec: any): boolean {
  const { _id } = groupSpec;

  // Support null _id (single group)
  if (_id === null || _id === undefined) {
    return true;
  }

  // Support string field references
  if (typeof _id === 'string' && _id.startsWith('$')) {
    // Continue to accumulator validation
  } else if (typeof _id === 'object' && _id !== null) {
    // Support object-based grouping (compound keys)
    // Ensure all grouping fields are simple field references
    for (const [_key, value] of Object.entries(_id)) {
      if (typeof value !== 'string' || !value.startsWith('$')) {
        return false; // Complex grouping expressions not supported
      }
    }
  } else {
    return false;
  }

  // Check accumulators - Phase 3: support vectorized operations
  for (const [field, accumulator] of Object.entries(groupSpec)) {
    if (field === '_id') continue;

    if (typeof accumulator !== 'object' || accumulator === null) return false;

    const ops = Object.entries(accumulator);
    if (ops.length !== 1) return false;

    const [op, value] = ops[0];

    // Phase 3: Enhanced accumulator support including vectorized $addToSet and $push
    const supportedOps = [
      '$sum',
      '$avg',
      '$min',
      '$max',
      '$first',
      '$last',
      '$push',
      '$addToSet',
      '$count', // Vectorized operations
    ];
    if (!supportedOps.includes(op)) return false;

    // Validate accumulator expression
    if (!isSimpleAccumulatorExpression(value)) return false;
  }

  return true;
}

/**
 * Check if accumulator expression is simple enough for vectorized processing
 */
function isSimpleAccumulatorExpression(expr: any): boolean {
  // C) $$ROOT rejection: System variables not supported in hot path accumulators
  if (typeof expr === 'string' && expr.startsWith('$$')) {
    return false; // Force $$ROOT and other system variables through traditional path
  }

  // Simple field references
  if (typeof expr === 'string' && expr.startsWith('$')) {
    return true;
  }

  // Literals and constants
  if (typeof expr === 'number' || typeof expr === 'string' || expr === 1) {
    return true;
  }

  // Simple arithmetic expressions for $sum
  if (typeof expr === 'object' && expr !== null) {
    const keys = Object.keys(expr);
    if (keys.length === 1) {
      const op = keys[0];
      if (['$multiply', '$add', '$subtract', '$divide'].includes(op)) {
        const operands = expr[op];
        if (Array.isArray(operands) && operands.length <= 2) {
          return operands.every(isSimpleAccumulatorExpression);
        }
      }
    }
  }

  return false;
}

/**
 * Check if $unwind is simple enough for hot path
 * Phase 3: Support basic $unwind operations
 */
function isSimpleUnwind(unwindSpec: any): boolean {
  // Simple string path
  if (typeof unwindSpec === 'string') {
    return true;
  }

  // Object form with path only (no complex options)
  if (typeof unwindSpec === 'object' && unwindSpec !== null) {
    const { path, includeArrayIndex, preserveNullAndEmptyArrays } = unwindSpec;

    // Must have path
    if (!path || typeof path !== 'string') return false;

    // Phase 3: Basic support without complex options for now
    if (includeArrayIndex || preserveNullAndEmptyArrays) {
      return false;
    }

    return true;
  }

  return false;
}

/**
 * Check if expression is simple enough for hot path
 */
function isSimpleExpression(expr: any): boolean {
  // Field references
  if (typeof expr === 'string' && expr.startsWith('$')) {
    return true;
  }

  // Literals
  if (
    typeof expr === 'number' ||
    typeof expr === 'string' ||
    typeof expr === 'boolean'
  ) {
    return true;
  }

  // Simple object expressions
  if (typeof expr === 'object' && expr !== null && !Array.isArray(expr)) {
    const keys = Object.keys(expr);
    if (keys.length === 1) {
      const op = keys[0];
      const supportedOps = [
        '$multiply',
        '$add',
        '$subtract',
        '$divide',
        '$concat',
        '$toString',
      ];
      if (supportedOps.includes(op)) {
        const operands = expr[op];
        if (Array.isArray(operands)) {
          return operands.every(isSimpleExpression);
        } else {
          return isSimpleExpression(operands);
        }
      }
    }
  }

  return false;
}

/**
 * Check if pipeline should use columnar processing
 * Columnar is good for larger datasets and vectorizable operations
 */
function shouldUseColumnar(
  collection: Collection,
  pipeline: Pipeline
): boolean {
  // Use columnar for larger datasets (> 100 rows)
  if (collection.length <= 100) return false;

  // Check if pipeline contains vectorizable operations
  const vectorizableOps = ['$match', '$project', '$limit', '$skip'];
  const hasVectorizableOps = pipeline.some(stage => {
    const stageType = Object.keys(stage)[0];
    return vectorizableOps.includes(stageType);
  });

  return hasVectorizableOps;
}

/**
 * High-performance aggregate function with multi-tier optimization
 *
 * Phase 9 routing strategy:
 * 1. Columnar IVM engine for large datasets with vectorizable operations
 * 2. Zero-alloc engine for medium datasets
 * 3. Traditional aggregation for complex/unsupported operations
 */
export function hotPathAggregate<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline
): Collection<Document> {
  counters.totalOperations++;

  // Handle null/undefined collections gracefully
  if (!collection || !Array.isArray(collection)) {
    return [];
  }

  // D) Pipeline Input Validation - Ensure pipeline is an array
  if (!Array.isArray(pipeline)) {
    recordOptimizerRejection(
      pipeline as any,
      `Pipeline is not an array: ${typeof pipeline}`
    );
    counters.fallbacks++;
    return originalAggregate(collection, pipeline);
  }

  const startTime = Date.now();
  let result: Collection<Document>;

  // Phase 9: Multi-tier optimization routing
  if (shouldUseColumnar(collection, pipeline)) {
    try {
      // Route to columnar IVM engine for vectorized processing
      counters.columnarHits++;
      result = columnarEngine.execute(collection, pipeline);

      const duration = Date.now() - startTime;
      counters.columnarThroughput =
        (collection.length / Math.max(duration, 1)) * 1000;

      if (DEBUG) {
        logPipelineExecution(
          'COLUMNAR',
          `✅ Columnar processing completed: ${collection.length} → ${result.length} docs`,
          {
            duration,
            throughput: counters.columnarThroughput,
            stats: columnarEngine.getStats(),
          }
        );
      }
    } catch (error) {
      // Fallback to zero-alloc engine on columnar failure
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `Columnar engine failed, falling back to zero-alloc: ${errorMessage}`
      );

      try {
        counters.hotPathHits++;
        result = zeroAllocEngine.execute(collection, pipeline);

        const duration = Date.now() - startTime;
        counters.hotPathThroughput =
          (collection.length / Math.max(duration, 1)) * 1000;
      } catch (_secondError) {
        // Final fallback to traditional aggregation
        console.warn(
          `Zero-alloc engine also failed, using traditional aggregation`
        );
        counters.fallbacks++;
        result = originalAggregate(collection, pipeline);

        const duration = Date.now() - startTime;
        counters.fallbackThroughput =
          (collection.length / Math.max(duration, 1)) * 1000;
      }
    }
  } else if (canUseHotPath(pipeline)) {
    if (process.env.DEBUG_UNWIND) {
      console.log('[DEBUG] Using zero-alloc hot path for pipeline:', pipeline);
    }
    try {
      // Use zero-allocation hot path
      counters.hotPathHits++;
      result = zeroAllocEngine.execute(collection, pipeline);

      const duration = Date.now() - startTime;
      counters.hotPathThroughput =
        (collection.length / Math.max(duration, 1)) * 1000;
    } catch (error) {
      // Fallback on hot path failure
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (process.env.DEBUG_UNWIND) {
        console.log(
          `[DEBUG] Hot path failed, falling back to traditional aggregation: ${errorMessage}`
        );
      }
      console.warn(`Hot path failed, falling back: ${errorMessage}`);
      counters.fallbacks++;
      result = originalAggregate(collection, pipeline);

      const duration = Date.now() - startTime;
      // Safe length access
      const collectionLength =
        collection && Array.isArray(collection) ? collection.length : 0;
      counters.fallbackThroughput =
        (collectionLength / Math.max(duration, 1)) * 1000;
    }
  } else {
    if (process.env.DEBUG_UNWIND) {
      console.log('[DEBUG] Cannot use hot path, using traditional aggregation');
    }
    // Use regular aggregation
    counters.fallbacks++;
    result = originalAggregate(collection, pipeline);

    const duration = Date.now() - startTime;
    // Safe length access
    const collectionLength =
      collection && Array.isArray(collection) ? collection.length : 0;
    counters.fallbackThroughput =
      (collectionLength / Math.max(duration, 1)) * 1000;
  }

  return result;
}

/**
 * Get performance statistics
 */
export function getHotPathStats(): HotPathCounters & {
  hotPathHitRate: number;
  averageHotPathThroughput: number;
  averageFallbackThroughput: number;
  optimizerRejectionRate: number;
  topRejectionReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
} {
  const hotPathHitRate =
    counters.totalOperations > 0
      ? (counters.hotPathHits / counters.totalOperations) * 100
      : 0;

  const optimizerRejectionRate =
    counters.totalOperations > 0
      ? (counters.optimizerRejections / counters.totalOperations) * 100
      : 0;

  // Analyze rejection reasons
  const rejectionCounts = new Map<string, number>();
  for (const rejection of optimizerRejections) {
    const count = rejectionCounts.get(rejection.reason) || 0;
    rejectionCounts.set(rejection.reason, count + 1);
  }

  const topRejectionReasons = Array.from(rejectionCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5) // Top 5 reasons
    .map(([reason, count]) => ({
      reason,
      count,
      percentage:
        counters.optimizerRejections > 0
          ? (count / counters.optimizerRejections) * 100
          : 0,
    }));

  return {
    ...counters,
    hotPathHitRate,
    optimizerRejectionRate,
    averageHotPathThroughput: counters.hotPathThroughput,
    averageFallbackThroughput: counters.fallbackThroughput,
    topRejectionReasons,
  };
}

/**
 * Reset performance counters
 */
export function resetHotPathStats(): void {
  counters.hotPathHits = 0;
  counters.fallbacks = 0;
  counters.totalOperations = 0;
  counters.hotPathThroughput = 0;
  counters.fallbackThroughput = 0;
  counters.optimizerRejections = 0;
  resetOptimizerRejections();
}

/**
 * Clear hot path caches
 */
export function clearHotPathCache(): void {
  zeroAllocEngine.clearCache();
}
