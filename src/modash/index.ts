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
} from './aggregation.js';
import { count } from './count.js';
import { $expression, type Collection, type Document } from './expressions.js';
import { createStreamingCollection, StreamingCollection } from './streaming.js';

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
} from '../index.js';

/**
 * Performance-optimized aggregation function that uses fast paths when possible
 * and falls back to streaming collections when needed
 */
const optimizedAggregate = <T extends Document = Document>(
  collection: Collection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): Collection<Document> => {
  // If it's already a streaming collection, use streaming
  if (collection instanceof StreamingCollection) {
    return collection.stream(pipeline);
  }
  
  // For regular arrays, try performance-optimized path first
  try {
    // Use the optimized aggregation from aggregation.ts which includes fast implementations
    return originalAggregate(collection, pipeline);
  } catch (error) {
    // Fall back to streaming if optimization fails
    const streamingCollection = createStreamingCollection(collection);
    return streamingCollection.stream(pipeline);
  }
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
  aggregate: optimizedAggregate,
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
};

export default Modash;
export {
  // Export the original aggregate for backwards compatibility if needed
  originalAggregate as aggregateOriginal,
  optimizedAggregate as aggregate,
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
};

// Re-export basic types from local modules
export type { Collection, Document, QueryExpression };

// Re-export streaming capabilities
export { StreamingCollection, createStreamingCollection } from './streaming.js';

// Re-export streaming types
export type { StreamingEvents, AggregationState } from './streaming.js';

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
