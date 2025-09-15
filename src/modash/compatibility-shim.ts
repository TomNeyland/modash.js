/**
 * Minimal Compatibility Shim for Standard Aggregation Engine
 * 
 * This module provides fallback support for operators that fundamentally
 * cannot work with the streaming/IVM architecture:
 * - $function, $where (arbitrary JavaScript execution)
 * - $merge, $out (side-effect stages)
 * - Advanced $lookup with pipeline/let (multi-collection joins)
 * 
 * For all other operations, the streaming engine should be used.
 * This replaces the full aggregation.ts implementation with minimal fallback support.
 */

import type { Collection, Document } from './expressions';
import type { Pipeline } from '../index';
import { recordFallback, DEBUG } from './debug';
import { aggregate as originalAggregate } from './aggregation';

/**
 * Minimal standard engine that only handles truly unsupported operators
 * Falls back to the original full aggregation implementation for now
 */
export function minimalStandardEngine<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline
): Collection<T> {
  if (DEBUG) {
    console.warn('🔧 COMPATIBILITY SHIM: Using minimal standard engine for unsupported operators');
  }

  recordFallback(pipeline, 'Using compatibility shim for unsupported operators', {
    reason: 'Minimal standard engine fallback',
    code: 'COMPATIBILITY_SHIM'
  });

  return originalAggregate(collection, pipeline);
}

/**
 * Check if a pipeline contains operators that require the compatibility shim
 */
export function requiresCompatibilityShim(pipeline: Pipeline): boolean {
  const unsupportedOperators = ['$function', '$where', '$merge', '$out'];
  
  return pipeline.some(stage => {
    const stageType = Object.keys(stage)[0];
    
    if (unsupportedOperators.includes(stageType)) {
      return true;
    }
    
    // Check for advanced $lookup with pipeline/let
    if (stageType === '$lookup') {
      const lookupSpec = stage.$lookup;
      if ('pipeline' in lookupSpec || 'let' in lookupSpec) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Future: Minimal implementations of truly unsupported operators
 * These would replace the full aggregation.ts implementations
 */

// TODO: Implement minimal $function support (if ever needed)
// TODO: Implement minimal $where support (if ever needed)  
// TODO: Implement minimal $merge support (if ever needed)
// TODO: Implement minimal $out support (if ever needed)
// TODO: Implement minimal advanced $lookup support

/**
 * Placeholder for future minimal operator implementations
 * For now, we delegate everything to the original aggregation engine
 */