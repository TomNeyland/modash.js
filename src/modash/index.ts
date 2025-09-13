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
import {
  createStreamingCollection,
  aggregateStreaming,
  StreamingCollection,
} from './streaming.js';

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
 * Fully transparent aggregation function that creates streaming collections
 * for all operations, providing unified incremental capabilities
 */
const transparentAggregate = <T extends Document = Document>(
  collection: Collection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): Collection<Document> => {
  // Always use streaming collections - create one if needed
  if (!(collection instanceof StreamingCollection)) {
    const streamingCollection = createStreamingCollection(collection);
    return streamingCollection.stream(pipeline);
  }
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
};

// Re-export basic types from local modules
export type { Collection, Document, QueryExpression };

// Re-export streaming capabilities
export {
  StreamingCollection,
  createStreamingCollection,
} from './streaming.js';

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
