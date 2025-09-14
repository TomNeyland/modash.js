/**
 * Hot Path Aggregation - P0 Performance Implementation
 * 
 * Routes simple, high-performance pipelines to zero-allocation engine
 * Falls back to regular aggregation for complex operations
 */

import { ZeroAllocEngine } from './zero-alloc-engine.js';
import { aggregate as originalAggregate } from './aggregation.js';
import type { Collection, Document } from './expressions.js';
import type { Pipeline } from '../index.js';

/**
 * Singleton zero-allocation engine
 */
const zeroAllocEngine = new ZeroAllocEngine();

/**
 * Performance counters
 */
interface HotPathCounters {
  hotPathHits: number;
  fallbacks: number;
  totalOperations: number;
  hotPathThroughput: number;
  fallbackThroughput: number;
}

const counters: HotPathCounters = {
  hotPathHits: 0,
  fallbacks: 0,
  totalOperations: 0,
  hotPathThroughput: 0,
  fallbackThroughput: 0
};

/**
 * Determine if pipeline can use hot path (zero-alloc engine)
 */
function canUseHotPath(pipeline: Pipeline): boolean {
  // Hot path criteria for P0:
  // 1. Pipeline length ≤ 4 stages (complexity limit)
  // 2. Only supported operations: $match, $project, $sort, $limit, $skip
  // 3. No complex expressions (nested objects, arrays, etc.)
  // 4. No $lookup, $unwind, complex $group operations
  
  if (pipeline.length === 0 || pipeline.length > 4) {
    return false;
  }

  for (const stage of pipeline) {
    const stageType = Object.keys(stage)[0];
    
    switch (stageType) {
      case '$match':
        if (!isSimpleMatch(stage.$match)) return false;
        break;
      case '$project':
        if (!isSimpleProject(stage.$project)) return false;
        break;
      case '$sort':
        if (!isSimpleSort(stage.$sort)) return false;
        break;
      case '$limit':
      case '$skip':
        // Always supported
        break;
      case '$group':
        if (!isSimpleGroup(stage.$group)) return false;
        break;
      default:
        // Unsupported stage type
        return false;
    }
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
 */
function isSimpleProject(projectSpec: any): boolean {
  // For P0, only support simple inclusion/exclusion
  // No computed fields for maximum performance
  for (const [field, spec] of Object.entries(projectSpec)) {
    if (spec !== 0 && spec !== 1 && spec !== true && spec !== false) {
      // Has computed fields - not suitable for hot path
      return false;
    }
  }
  return true;
}

/**
 * Check if $sort is simple enough for hot path
 */
function isSimpleSort(sortSpec: any): boolean {
  // Only single field sorts for P0
  const fields = Object.keys(sortSpec);
  return fields.length === 1 && (sortSpec[fields[0]] === 1 || sortSpec[fields[0]] === -1);
}

/**
 * Check if $group is simple enough for hot path
 */
function isSimpleGroup(groupSpec: any): boolean {
  // For P0, only support very simple grouping by single field
  const { _id } = groupSpec;
  
  // Only string field references
  if (typeof _id !== 'string' || !_id.startsWith('$')) {
    return false;
  }

  // Check accumulators - only support $sum: 1 for counts
  for (const [field, accumulator] of Object.entries(groupSpec)) {
    if (field === '_id') continue;
    
    if (typeof accumulator !== 'object' || accumulator === null) return false;
    
    const ops = Object.entries(accumulator);
    if (ops.length !== 1) return false;
    
    const [op, value] = ops[0];
    if (op !== '$sum' || value !== 1) return false;
  }

  return true;
}

/**
 * High-performance aggregate function with hot path optimization
 */
export function hotPathAggregate<T extends Document = Document>(
  collection: Collection<T>, 
  pipeline: Pipeline
): Collection<Document> {
  counters.totalOperations++;
  
  const startTime = Date.now();
  let result: Collection<Document>;
  
  if (canUseHotPath(pipeline)) {
    try {
      // Use zero-allocation hot path
      counters.hotPathHits++;
      result = zeroAllocEngine.execute(collection, pipeline);
      
      const duration = Date.now() - startTime;
      counters.hotPathThroughput = collection.length / Math.max(duration, 1) * 1000;
      
    } catch (error) {
      // Fallback on hot path failure
      console.warn(`Hot path failed, falling back: ${error.message}`);
      counters.fallbacks++;
      result = originalAggregate(collection, pipeline);
      
      const duration = Date.now() - startTime;
      counters.fallbackThroughput = collection.length / Math.max(duration, 1) * 1000;
    }
  } else {
    // Use regular aggregation
    counters.fallbacks++;
    result = originalAggregate(collection, pipeline);
    
    const duration = Date.now() - startTime;
    counters.fallbackThroughput = collection.length / Math.max(duration, 1) * 1000;
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
} {
  const hotPathHitRate = counters.totalOperations > 0 
    ? (counters.hotPathHits / counters.totalOperations) * 100 
    : 0;

  return {
    ...counters,
    hotPathHitRate,
    averageHotPathThroughput: counters.hotPathThroughput,
    averageFallbackThroughput: counters.fallbackThroughput
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
}

/**
 * Clear hot path caches
 */
export function clearHotPathCache(): void {
  zeroAllocEngine.clearCache();
}