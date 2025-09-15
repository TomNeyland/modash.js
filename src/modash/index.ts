import {
  aggregate as originalAggregate,
  $project,
  $group,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
} from './aggregation';
import { count } from './count';
import { $expression } from './expressions';
import type {
  Document as PublicDocument,
  Collection as PublicCollection,
  ModashStatic,
  Pipeline,
} from '../index';
import { createStreamingCollection, StreamingCollection } from './streaming';
import { hotPathAggregate } from './hot-path-aggregation';
import { explain, benchmark, fromJSONL } from './api-enhancements';
import { recordFallback, DEBUG } from './debug';

/**
 * Streaming-first aggregation with explicit fallback only for unsupported operators
 * This is the new approach that defaults to IVM/streaming engine
 */
const streamingFirstAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T>,
  pipeline: Pipeline
): PublicCollection<T> => {
  // D) Pipeline Input Validation
  if (!Array.isArray(pipeline)) {
    return originalAggregate(collection as any, pipeline as any) as any;
  }

  // Check for operators that fundamentally cannot work with streaming/IVM architecture
  const unsupportedOperators = ['$function', '$where', '$merge', '$out'];
  const hasUnsupportedOperator = pipeline.some(stage => {
    const stageType = Object.keys(stage)[0];
    if (unsupportedOperators.includes(stageType)) {
      if (DEBUG) {
        console.warn(`🚨 STREAMING-FIRST FALLBACK: ${stageType} requires standard engine (breaks IVM invariants)`);
      }
      recordFallback(pipeline, `${stageType} requires standard engine`, {
        reason: `${stageType} fundamentally incompatible with streaming architecture`,
        stageType,
        code: 'UNSUPPORTED_OPERATOR_FALLBACK'
      });
      return true;
    }
    
    // Check for advanced $lookup with pipeline/let (which requires multi-collection processing)
    if (stageType === '$lookup') {
      const lookupSpec = stage.$lookup;
      if ('pipeline' in lookupSpec || 'let' in lookupSpec) {
        if (DEBUG) {
          console.warn(`🚨 STREAMING-FIRST FALLBACK: Advanced $lookup with pipeline/let requires standard engine`);
        }
        recordFallback(pipeline, 'Advanced $lookup requires standard engine', {
          reason: 'Advanced $lookup with pipeline/let incompatible with streaming architecture',
          stageType,
          code: 'ADVANCED_LOOKUP_FALLBACK'
        });
        return true;
      }
    }
    
    return false;
  });

  if (hasUnsupportedOperator) {
    // Explicit fallback for truly unsupported operators
    if (DEBUG) {
      console.warn(`📊 STREAMING-FIRST: Using standard engine for unsupported operators`);
    }
    return originalAggregate(collection as any, pipeline as any) as any;
  }

  if (DEBUG) {
    console.log(`📊 STREAMING-FIRST: Using streaming engine (${pipeline.length} stages)`);
  }

  // Default to streaming engine for all other operations
  return hotPathAggregate(
    collection as any,
    pipeline
  ) as unknown as PublicCollection<T>;
};

/**
 * High-performance aggregation function with hot path optimization
 * @deprecated - Use streamingFirstAggregate for new streaming-first architecture
 */
const optimizedAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T>,
  pipeline: Pipeline
): PublicCollection<T> => {
  // D) Pipeline Input Validation - Check pipeline before routing to hot path
  if (!Array.isArray(pipeline)) {
    // Let the underlying aggregate handle single stages and invalid inputs
    return originalAggregate(collection as any, pipeline as any) as any;
  }

  // Route to hot path for maximum performance
  return hotPathAggregate(
    collection as any,
    pipeline
  ) as unknown as PublicCollection<T>;
};

/**
 * Fully transparent aggregation function with streaming-first execution
 * Defaults to streaming engine, explicit fallback only for unsupported operators
 */
const transparentAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): PublicCollection<T> => {
  // For regular collections, use streaming-first approach
  if (!(collection instanceof StreamingCollection)) {
    return streamingFirstAggregate(
      collection as any,
      pipeline
    ) as PublicCollection<T>;
  }

  // For streaming collections, use streaming path
  return collection.stream(pipeline) as unknown as PublicCollection<T>;
};

/**
 * Modern MongoDB-inspired aggregation library for TypeScript.
 *
 * STREAMING-FIRST EXECUTION ARCHITECTURE:
 * - Defaults to IVM/streaming engine for maximum performance
 * - Explicit fallback to standard engine only for unsupported operators:
 *   • $function, $where (arbitrary JavaScript execution)
 *   • $merge, $out (side-effect stages)  
 *   • Advanced $lookup with pipeline/let (multi-collection joins)
 * - All other operations use zero-allocation streaming engine
 * 
 * Provides transparent streaming support - all aggregations automatically
 * work with both regular arrays and streaming collections.
 */
const Modash: ModashStatic = {
  aggregate: transparentAggregate,
  aggregateStreaming: (collection: any, pipeline: Pipeline) =>
    transparentAggregate(collection as any, pipeline) as any,
  count,
  $expression,
  $group,
  $project,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
  // Streaming methods for advanced users
  createStreamingCollection,
  // Phase 6: Enhanced DX APIs
  explain,
  benchmark,
  fromJSONL,
};

export default Modash;
export {
  // Core aggregation functions - now streaming-first by default
  originalAggregate as aggregateOriginal,
  transparentAggregate as aggregate,
  streamingFirstAggregate, // New streaming-first engine
  optimizedAggregate, // Deprecated hot-path approach
  count,
  $expression,
  $group,
  $project,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
  // Phase 6: Enhanced DX APIs
  explain,
  benchmark,
  fromJSONL,
};

// Re-export basic types for convenience from the public surface
export type { Collection, Document, QueryExpression } from '../index';

// Re-export streaming capabilities
export { StreamingCollection, createStreamingCollection } from './streaming';

// Re-export streaming types
export type { StreamingEvents, AggregationState } from './streaming';

// Re-export complex types from main index for convenience
export type { Pipeline, ModashStatic } from '../index';
