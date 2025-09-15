/**
 * Simplified Toggle Mode Implementation
 * Orchestrates 3 targeted optimizations for specific high-impact scenarios
 * Target: 2x+ speedup with ~550 lines total vs previous 4,600+ lines
 */

import { applyBitmapOptimization } from './bitmap-index.js';
import { applyRunningTotalsOptimization } from './running-totals.js';
import { applySimpleTopKOptimization } from './simple-topk.js';

export interface ToggleOptimizationResult {
  optimized: boolean;
  strategy: 'bitmap' | 'running-totals' | 'topk' | 'none';
  data: any[];
  performance?: {
    documentsProcessed: number;
    optimizationTime: number;
    speedupFactor?: number;
  };
}

/**
 * Simplified Toggle Mode Engine
 * Uses pattern detection to apply one of three targeted optimizations
 */
export class SimplifiedToggleMode {
  /**
   * Apply optimizations with simple pattern matching and fallback
   * Returns optimized result or falls back to stream mode
   */
  static process(data: any[], pipeline: any[]): ToggleOptimizationResult {
    const startTime = performance.now();
    
    // Try optimizations in order of impact potential
    
    // 1. Try Top-K optimization (highest impact for sort+limit)
    const topkResult = applySimpleTopKOptimization(data, pipeline);
    if (topkResult !== null) {
      return {
        optimized: true,
        strategy: 'topk',
        data: topkResult,
        performance: {
          documentsProcessed: data.length,
          optimizationTime: performance.now() - startTime
        }
      };
    }
    
    // 2. Try Bitmap optimization (high impact for multi-match)
    const bitmapResult = applyBitmapOptimization(data, pipeline);
    if (bitmapResult !== null) {
      // Apply remaining pipeline to filtered data
      const filteredData = bitmapResult.indices.size > 0 ? 
        Array.from(bitmapResult.indices).map(i => data[i]) : [];
      
      // For now, return filtered data (full pipeline processing would go here)
      return {
        optimized: true,
        strategy: 'bitmap',
        data: filteredData,
        performance: {
          documentsProcessed: data.length,
          optimizationTime: performance.now() - startTime
        }
      };
    }
    
    // 3. Try Running Totals optimization (good for group operations)
    const totalsResult = applyRunningTotalsOptimization(data, pipeline);
    if (totalsResult !== null) {
      return {
        optimized: true,
        strategy: 'running-totals',
        data: totalsResult,
        performance: {
          documentsProcessed: data.length,
          optimizationTime: performance.now() - startTime
        }
      };
    }
    
    // No optimizations applicable - fall back to stream mode
    return {
      optimized: false,
      strategy: 'none',
      data: [], // Stream mode will handle this
      performance: {
        documentsProcessed: data.length,
        optimizationTime: performance.now() - startTime
      }
    };
  }

  /**
   * Quick check if any optimizations are applicable
   * Used to decide between stream and toggle mode
   */
  static canOptimize(pipeline: any[]): boolean {
    // Quick pattern checks without heavy analysis
    
    // Check for sort+limit pattern
    for (let i = 0; i < pipeline.length - 1; i++) {
      if (pipeline[i].$sort && pipeline[i + 1].$limit) {
        const limit = pipeline[i + 1].$limit;
        if (typeof limit === 'number' && limit < 1000) {
          return true; // TopK optimization applicable
        }
      }
    }
    
    // Check for multiple match stages with $in
    let matchWithInCount = 0;
    for (const stage of pipeline) {
      if (stage.$match) {
        for (const [_, condition] of Object.entries(stage.$match)) {
          if (typeof condition === 'object' && condition !== null && (condition as any).$in) {
            matchWithInCount++;
            break;
          }
        }
      }
    }
    if (matchWithInCount >= 2) {
      return true; // Bitmap optimization applicable
    }
    
    // Check for simple group operations
    for (const stage of pipeline) {
      if (stage.$group) {
        const hasSimpleAggregations = Object.entries(stage.$group).every(([field, operation]) => {
          if (field === '_id') return true;
          if (typeof operation === 'object' && operation !== null) {
            const op = operation as any;
            return op.$sum !== undefined || op.$avg !== undefined || 
                   op.$count !== undefined || op.$first !== undefined || op.$last !== undefined;
          }
          return false;
        });
        
        if (hasSimpleAggregations) {
          return true; // Running totals optimization applicable
        }
      }
    }
    
    return false;
  }

  /**
   * Get optimization statistics for analysis
   */
  static getOptimizationStats(results: ToggleOptimizationResult[]): any {
    const stats = {
      totalRuns: results.length,
      optimizedRuns: results.filter(r => r.optimized).length,
      strategies: {
        bitmap: results.filter(r => r.strategy === 'bitmap').length,
        'running-totals': results.filter(r => r.strategy === 'running-totals').length,
        topk: results.filter(r => r.strategy === 'topk').length,
        none: results.filter(r => r.strategy === 'none').length
      },
      averageOptimizationTime: 0,
      documentsProcessed: 0
    };
    
    if (results.length > 0) {
      const totalTime = results.reduce((sum, r) => sum + (r.performance?.optimizationTime || 0), 0);
      const totalDocs = results.reduce((sum, r) => sum + (r.performance?.documentsProcessed || 0), 0);
      
      stats.averageOptimizationTime = totalTime / results.length;
      stats.documentsProcessed = totalDocs;
    }
    
    return stats;
  }
}

/**
 * Integration point for the main aggregation engine
 */
export function trySimplifiedToggleOptimization(
  data: any[], 
  pipeline: any[]
): { success: boolean; result?: any[]; fallbackToStream: boolean } {
  
  // Quick check if optimization is worth attempting
  if (!SimplifiedToggleMode.canOptimize(pipeline)) {
    return {
      success: false,
      fallbackToStream: true
    };
  }
  
  try {
    const result = SimplifiedToggleMode.process(data, pipeline);
    
    if (result.optimized) {
      return {
        success: true,
        result: result.data,
        fallbackToStream: false
      };
    } else {
      return {
        success: false,
        fallbackToStream: true
      };
    }
  } catch (error) {
    // On any error, fall back to stream mode
    console.warn('Toggle mode optimization failed, falling back to stream mode:', error);
    return {
      success: false,
      fallbackToStream: true
    };
  }
}