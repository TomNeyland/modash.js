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
  type QueryExpression,
} from './aggregation';
import { count } from './count';
import { $expression, type Collection, type Document } from './expressions';
import { createStreamingCollection, StreamingCollection } from './streaming';
import { hotPathAggregate } from './hot-path-aggregation';
import { explain, benchmark, fromJSONL } from './api-enhancements';

// Import complex types from main index that need to stay centralized
import type {
  ModashStatic,
  Pipeline,
  Expression,
  DocumentValue,
  GroupStage,
  ProjectStage,
  SortStage,
  LookupStage,
  AddFieldsStage,
  SetStage,
} from '../index';

/**
 * High-performance aggregation function with hot path optimization
 */
const optimizedAggregate = <T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline
): Collection<Document> => {
  // D) Pipeline Input Validation - Check pipeline before routing to hot path
  if (!Array.isArray(pipeline)) {
    // Let the underlying aggregate handle single stages and invalid inputs
    return originalAggregate(collection, pipeline as any);
  }

  // Route to hot path for maximum performance
  return hotPathAggregate(collection, pipeline);
};

/**
 * Fully transparent aggregation function that creates streaming collections
 * for all operations, providing unified incremental capabilities
 */
const transparentAggregate = <T extends Document = Document>(
  collection: Collection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): Collection<Document> => {
  // For regular collections, use hot path optimization
  if (!(collection instanceof StreamingCollection)) {
    return optimizedAggregate(collection, pipeline);
  }

  // For streaming collections, use streaming path
  return collection.stream(pipeline);
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
  aggregate: transparentAggregate,
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

  // Hot path performance monitoring
  getHotPathStats: () =>
    import('./hot-path-aggregation').then(m => m.getHotPathStats()),
  resetHotPathStats: () =>
    import('./hot-path-aggregation').then(m => m.resetHotPathStats()),
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

// Re-export basic types from local modules
export type { Collection, Document, QueryExpression };

// Re-export streaming capabilities
export { StreamingCollection, createStreamingCollection } from './streaming';

// Re-export streaming types
export type { StreamingEvents, AggregationState } from './streaming';

// Re-export complex types from main index for convenience
export type {
  Pipeline,
  Expression,
  DocumentValue,
  GroupStage,
  ProjectStage,
  SortStage,
  LookupStage,
  AddFieldsStage,
  SetStage,
  ModashStatic,
};
