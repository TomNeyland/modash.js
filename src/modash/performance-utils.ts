/**
 * Performance utilities for modash.js
 * Provides access to performance features and diagnostics
 */

import { globalQueryCache } from './query-cache.js';
import { globalStreamingProcessor } from './streaming-processor.js';
import type { Collection, Document } from './expressions.js';
import type { Pipeline } from '../index.js';

export interface PerformanceInfo {
  cacheStats: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
  streamingRecommendation: {
    strategy: 'regular' | 'chunked' | 'streaming' | 'adaptive';
    estimatedMemory: number;
    recommendedChunkSize?: number;
    warnings: string[];
  };
  optimizationTips: string[];
}

/**
 * Get comprehensive performance information for a collection and pipeline
 */
export function getPerformanceInfo<T extends Document>(
  collection: Collection<T>,
  pipeline: Pipeline
): PerformanceInfo {
  const cacheStats = globalQueryCache.getStats();
  const streamingRecommendation = globalStreamingProcessor.getProcessingRecommendation(
    collection,
    pipeline
  );

  const optimizationTips: string[] = [];

  // Generate optimization tips
  if (collection.length > 10000) {
    optimizationTips.push('Consider using streaming processing for very large datasets');
  }

  if (collection.length > 100 && cacheStats.hitRate < 20) {
    optimizationTips.push('Query result caching could improve performance for repeated operations');
  }

  // Check pipeline for optimization opportunities
  for (const stage of pipeline) {
    if ('$match' in stage) {
      optimizationTips.push('Place $match stages early in pipeline for better performance');
      break;
    }
  }

  const hasSort = pipeline.some(stage => '$sort' in stage);
  const hasLimit = pipeline.some(stage => '$limit' in stage);
  if (hasSort && hasLimit) {
    optimizationTips.push('Consider using $limit after $sort for better memory efficiency');
  }

  return {
    cacheStats,
    streamingRecommendation,
    optimizationTips,
  };
}

/**
 * Clear all performance caches and reset statistics
 */
export function clearPerformanceCaches(): void {
  globalQueryCache.clear();
}

/**
 * Get detailed cache debug information
 */
export function getCacheDebugInfo() {
  return globalQueryCache.getDebugInfo();
}

/**
 * Process a large collection with streaming
 */
export async function processLargeCollection<T extends Document>(
  collection: Collection<T>,
  pipeline: Pipeline,
  options?: {
    chunkSize?: number;
    maxMemoryMB?: number;
    enableParallelProcessing?: boolean;
  }
): Promise<Collection<T>> {
  return globalStreamingProcessor.processLargeCollection(collection, pipeline, options);
}

/**
 * Force garbage collection and cleanup (Node.js only)
 */
export function performGarbageCollection(): void {
  if (typeof global !== 'undefined' && global.gc) {
    global.gc();
  }
  globalQueryCache.cleanup();
}

/**
 * Get performance recommendations based on usage patterns
 */
export function getPerformanceRecommendations(): {
  recommendations: string[];
  cacheEfficiency: 'excellent' | 'good' | 'fair' | 'poor';
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
} {
  const stats = globalQueryCache.getStats();
  const recommendations: string[] = [];
  
  let cacheEfficiency: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';
  let overallHealth: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent';

  if (stats.hitRate < 30) {
    cacheEfficiency = 'poor';
    recommendations.push('Query cache hit rate is low - consider optimizing query patterns');
  } else if (stats.hitRate < 50) {
    cacheEfficiency = 'fair';
    recommendations.push('Query cache hit rate could be improved');
  } else if (stats.hitRate < 70) {
    cacheEfficiency = 'good';
  }

  if (stats.total > 1000 && stats.size < 10) {
    recommendations.push('Consider increasing cache size for high-volume operations');
  }

  // Determine overall health
  if (cacheEfficiency === 'poor') {
    overallHealth = 'fair';
  } else if (cacheEfficiency === 'fair') {
    overallHealth = 'good';
  }

  return {
    recommendations,
    cacheEfficiency,
    overallHealth,
  };
}

// Export performance utilities as a namespace
export const PerformanceUtils = {
  getPerformanceInfo,
  clearPerformanceCaches,
  getCacheDebugInfo,
  processLargeCollection,
  performGarbageCollection,
  getPerformanceRecommendations,
};