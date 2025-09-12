// Modash.js - Modern MongoDB-inspired aggregation library
// Distribution build - re-exports from source

export { 
  default,
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
} from '../src/modash/index.js';
