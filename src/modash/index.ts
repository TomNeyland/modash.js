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

/**
 * High-performance aggregation function with hot path optimization
 */
const optimizedAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T>,
  pipeline: Pipeline,
  options?: { mode?: 'stream' | 'toggle' }
): PublicCollection<T> => {
  // D) Pipeline Input Validation - Check pipeline before routing to hot path
  if (!Array.isArray(pipeline)) {
    // Let the underlying aggregate handle single stages and invalid inputs
    return originalAggregate(collection as any, pipeline as any, options) as any;
  }

  // Route to hot path for maximum performance
  return hotPathAggregate(
    collection as any,
    pipeline,
    options
  ) as unknown as PublicCollection<T>;
};

/**
 * Fully transparent aggregation function that creates streaming collections
 * for all operations, providing unified incremental capabilities
 */
const transparentAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T> | StreamingCollection<T>,
  pipeline: Pipeline,
  options?: { mode?: 'stream' | 'toggle' }
): PublicCollection<T> => {
  // For regular collections, use hot path optimization
  if (!(collection instanceof StreamingCollection)) {
    return optimizedAggregate(
      collection as any,
      pipeline,
      options
    ) as PublicCollection<T>;
  }

  // For streaming collections, use streaming path
  return collection.stream(pipeline) as unknown as PublicCollection<T>;
};

/**
 * Modern MongoDB-inspired aggregation library for TypeScript.
 *
 * Provides a clean, elegant API for processing JavaScript arrays using
 * MongoDB aggregation pipeline syntax and operators.
 *
 * Now includes transparent streaming support - all aggregations automatically
 * work with both regular arrays and streaming collections.
 */
const Modash: ModashStatic = {
  aggregate: (collection: any, pipeline: Pipeline, options?: { mode?: 'stream' | 'toggle' }) =>
    transparentAggregate(collection as any, pipeline, options) as any,
  aggregateStreaming: (collection: any, pipeline: Pipeline, options?: { mode?: 'stream' | 'toggle' }) =>
    transparentAggregate(collection as any, pipeline, options) as any,
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
  // Export the original aggregate for backwards compatibility if needed
  originalAggregate as aggregateOriginal,
  transparentAggregate as aggregate,
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
