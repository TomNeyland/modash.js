import {
  aggregate,
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
import { createStreamingCollection, aggregateStreaming } from './streaming.js';

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
 * Modern MongoDB-inspired aggregation library for TypeScript.
 *
 * Provides a clean, elegant API for processing JavaScript arrays using
 * MongoDB aggregation pipeline syntax and operators.
 */
const Modash: ModashStatic = {
  aggregate,
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
  // Streaming methods
  createStreamingCollection,
  aggregateStreaming,
};

export default Modash;
export {
  aggregate,
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
  aggregateStreaming,
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
