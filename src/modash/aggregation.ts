// Modern JavaScript - use our utility functions instead of lodash
import { fastGet } from './util.js';
import { PerformanceOptimizedEngine } from './performance-optimized-engine.js';
import { globalQueryCache } from './query-cache.js';

import {
  $expressionObject,
  $expression,
  type Collection,
  type Document,
  type DocumentValue,
} from './expressions.js';
import { $accumulate } from './accumulators.js';

// Import complex types from main index for now
import type {
  Pipeline,
  PipelineStage,
  Expression,
  GroupStage,
  ProjectStage,
  SortStage,
  LookupStage,
  AddFieldsStage,
} from '../index.js';

// Create a singleton optimized engine instance
const optimizedEngine = new PerformanceOptimizedEngine();

// Match-related type definitions
// Comparison operators for $match
export interface ComparisonOperators<T = DocumentValue> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
}

// Query operators for $match
export interface QueryOperators {
  $and?: QueryExpression[];
  $or?: QueryExpression[];
  $nor?: QueryExpression[];
  $regex?: string;
  $options?: string;
  $exists?: boolean;
  $all?: DocumentValue[];
  $elemMatch?: QueryExpression;
  $size?: number;
}

export type QueryExpression = {
  [K in string]?: DocumentValue | (ComparisonOperators & QueryOperators);
};

// Local type definitions for better type safety
type FieldCondition = DocumentValue | (ComparisonOperators & QueryOperators);
type GroupResult = Record<string, DocumentValue>;

/**
 * Stage Operators for MongoDB-style aggregation pipeline
 */

/**
 * Reshapes each document in the stream, such as by adding new fields or
 * removing existing fields. For each input document, outputs one document.
 */
function $project<T extends Document = Document>(
  collection: Collection<T>,
  specifications: ProjectStage['$project']
): Collection<T> {
  const specs = { ...specifications };
  if (!('_id' in specs)) {
    specs._id = 1;
  }

  return collection.map(obj =>
    $expressionObject(obj, specs, obj)
  ) as Collection<T>;
}

/**
 * Filters the document stream to allow only matching documents to pass
 * unmodified into the next pipeline stage.
 */
function $match<T extends Document = Document>(
  collection: Collection<T>,
  query: QueryExpression
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.filter(item => matchDocument(item, query));
}

/**
 * Helper function to match a document against a query
 */
function matchDocument(doc: Document, query: QueryExpression): boolean {
  for (const field in query) {
    const condition = query[field] as FieldCondition;
    // Optimize for simple property access - use direct access when no dots in field name
    const fieldValue = field.includes('.') ? fastGet(doc, field) : doc[field];

    // Handle logical operators
    if (field === '$and') {
      if (!Array.isArray(condition)) return false;
      return condition.every(subQuery =>
        matchDocument(doc, subQuery as QueryExpression)
      );
    }
    if (field === '$or') {
      if (!Array.isArray(condition)) return false;
      return condition.some(subQuery =>
        matchDocument(doc, subQuery as QueryExpression)
      );
    }
    if (field === '$nor') {
      if (!Array.isArray(condition)) return false;
      return !condition.some(subQuery =>
        matchDocument(doc, subQuery as QueryExpression)
      );
    }

    // Simple equality check
    if (typeof condition !== 'object' || condition === null) {
      if (fieldValue !== condition) return false;
    } else {
      // Handle comparison and other operators
      for (const operator in condition) {
        const expectedValue = (condition as Record<string, DocumentValue>)[
          operator
        ];
        switch (operator) {
          case '$eq':
            if (fieldValue !== expectedValue) return false;
            break;
          case '$ne':
            if (fieldValue === expectedValue) return false;
            break;
          case '$gt':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue <= expectedValue) return false;
            } else if (fieldValue <= expectedValue) return false;
            break;
          case '$gte':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue < expectedValue) return false;
            } else if (fieldValue < expectedValue) return false;
            break;
          case '$lt':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue >= expectedValue) return false;
            } else if (fieldValue >= expectedValue) return false;
            break;
          case '$lte':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue > expectedValue) return false;
            } else if (fieldValue > expectedValue) return false;
            break;
          case '$in':
            if (
              !Array.isArray(expectedValue) ||
              !expectedValue.includes(fieldValue)
            )
              return false;
            break;
          case '$nin':
            if (
              !Array.isArray(expectedValue) ||
              expectedValue.includes(fieldValue)
            )
              return false;
            break;
          case '$exists':
            const exists =
              doc.hasOwnProperty(field) && fieldValue !== undefined;
            if (expectedValue !== exists) return false;
            break;
          case '$regex':
            if (typeof fieldValue !== 'string') return false;
            const options =
              (condition as Record<string, string>).$options || '';
            const regex = new RegExp(expectedValue as string, options);
            if (!regex.test(fieldValue)) return false;
            break;
          case '$all':
            if (!Array.isArray(fieldValue) || !Array.isArray(expectedValue))
              return false;
            if (!expectedValue.every(val => fieldValue.includes(val)))
              return false;
            break;
          case '$elemMatch':
            if (!Array.isArray(fieldValue)) return false;
            if (
              !fieldValue.some(elem =>
                matchDocument({ elem }, { elem: expectedValue })
              )
            )
              return false;
            break;
          case '$size':
            if (!Array.isArray(fieldValue)) return false;
            if (fieldValue.length !== expectedValue) return false;
            break;
          default:
            return false;
        }
      }
    }
  }
  return true;
}

/**
 * Limits the number of documents passed to the next stage in the pipeline.
 */
function $limit<T extends Document = Document>(
  collection: Collection<T>,
  count: number
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.slice(0, count);
}

/**
 * Skips the first n documents where n is the specified skip number and passes
 * the remaining documents unmodified to the pipeline
 */
function $skip<T extends Document = Document>(
  collection: Collection<T>,
  count: number
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.slice(count) as Collection<T>;
}

/**
 * Reorders the document stream by a specified sort key.
 */
function $sort<T extends Document = Document>(
  collection: Collection<T>,
  sortSpec: SortStage['$sort']
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  const sortKeys = Object.keys(sortSpec);

  return [...collection].sort((a, b) => {
    for (const key of sortKeys) {
      const direction = sortSpec[key]!; // 1 for asc, -1 for desc
      // Optimize for simple property access - use direct access when no dots in key
      const valueA = key.includes('.') ? fastGet(a, key) : a[key];
      const valueB = key.includes('.') ? fastGet(b, key) : b[key];

      // Handle null/undefined values (MongoDB behavior: null < any value)
      if (
        (valueA === null || valueA === undefined) &&
        (valueB === null || valueB === undefined)
      )
        continue;
      if (valueA === null || valueA === undefined) return -direction;
      if (valueB === null || valueB === undefined) return direction;

      // Compare values
      let result = 0;
      if (valueA < valueB) result = -1;
      else if (valueA > valueB) result = 1;

      if (result !== 0) {
        return result * direction;
      }
    }
    return 0;
  });
}

/**
 * Deconstructs an array field from the input documents to output a document
 * for each element. Each output document replaces the array with an element value.
 */
function $unwind<T extends Document = Document>(
  collection: Collection<T>,
  fieldPath: string
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  // Remove $ prefix if present
  const cleanPath = fieldPath.startsWith('$') ? fieldPath.slice(1) : fieldPath;

  const result: Document[] = [];

  for (const doc of collection) {
    // Optimize for simple property access - use direct access when no dots in path
    const arrayValue = cleanPath.includes('.')
      ? fastGet(doc, cleanPath)
      : doc[cleanPath];

    if (!Array.isArray(arrayValue)) {
      result.push(doc); // Return original document if field is not an array
      continue;
    }

    if (arrayValue.length === 0) {
      continue; // Skip documents with empty arrays
    }

    const newDocs = arrayValue.map(item => ({
      ...doc,
      [cleanPath]: item,
    }));
    result.push(...newDocs);
  }

  return result as Collection<T>;
}

/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 * Optimized version using Map for better performance
 */
function $group<T extends Document = Document>(
  collection: Collection<T>,
  specifications: GroupStage['$group'] = { _id: null }
): Collection<T> {
  const _idSpec = specifications._id;

  // Use Map for O(1) key lookups instead of object property access
  const groupsMap = new Map<string, Document[]>();

  // Optimize for common grouping patterns
  if (_idSpec === null) {
    // Special case: group all documents into single group
    const result: Document = {};
    for (const [field, fieldSpec] of Object.entries(specifications)) {
      if (field === '_id') {
        result[field] = null;
      } else {
        result[field] = $accumulate(collection, fieldSpec as Expression);
      }
    }
    return [result] as Collection<T>;
  }

  // Group documents efficiently
  for (const obj of collection) {
    const keyValue = $expression(obj, _idSpec);
    // Use JSON.stringify for complex keys, but optimize for simple types
    const key = typeof keyValue === 'object' && keyValue !== null 
      ? JSON.stringify(keyValue) 
      : String(keyValue);
    
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key)!.push(obj);
  }

  // Process groups with pre-allocated result array
  const results: Document[] = new Array(groupsMap.size);
  let resultIndex = 0;

  for (const [key, members] of groupsMap) {
    const result: GroupResult = {};
    
    // Optimize _id field assignment
    if ('_id' in specifications) {
      result._id = _idSpec ? $expression(members[0]!, _idSpec) : null;
    }

    // Process other fields
    for (const [field, fieldSpec] of Object.entries(specifications)) {
      if (field !== '_id') {
        result[field] = $accumulate(members, fieldSpec as Expression);
      }
    }
    
    results[resultIndex++] = result;
  }

  return results as Collection<T>;
}

/**
 * Performs a left outer join to an unsharded collection in the same database
 * to filter in documents from the "joined" collection for processing.
 */
function $lookup<T extends Document = Document>(
  collection: Collection<T>,
  { from, localField, foreignField, as }: LookupStage['$lookup']
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  if (!from || !Array.isArray(from)) {
    throw new Error(
      '$lookup: "from" must be an array (the foreign collection)'
    );
  }
  if (!localField || !foreignField || !as) {
    throw new Error('$lookup: localField, foreignField, and as are required');
  }

  return collection.map(doc => {
    // Optimize for simple property access - use direct access when no dots in field
    const localValue = localField.includes('.')
      ? fastGet(doc, localField)
      : doc[localField];
    const matches = from.filter(foreignDoc => {
      const foreignValue = foreignField.includes('.')
        ? fastGet(foreignDoc, foreignField)
        : foreignDoc[foreignField];
      return foreignValue === localValue;
    });

    return {
      ...doc,
      [as]: matches,
    };
  }) as Collection<T>;
}

/**
 * Adds new fields to documents. $addFields outputs documents that
 * contain all existing fields from the input documents and newly added fields.
 */
function $addFields<T extends Document = Document>(
  collection: Collection<T>,
  fieldSpecs: AddFieldsStage['$addFields']
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.map(doc => {
    const newFields: Record<string, DocumentValue> = {};
    for (const [fieldName, expression] of Object.entries(fieldSpecs)) {
      newFields[fieldName] = $expression(doc, expression);
    }
    return { ...doc, ...newFields };
  }) as Collection<T>;
}

// Alias for $addFields
const $set = $addFields;

/**
 * Performs aggregation operation using the aggregation pipeline. The pipeline allows users
 * to process data from a collection with a sequence of stage-based manipulations.
 */
function aggregate<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline | PipelineStage
): Collection<T> {
  // Handle null/undefined collections
  if (!collection || !Array.isArray(collection)) {
    return [] as Collection<T>;
  }

  let stages: PipelineStage[];
  if (!Array.isArray(pipeline)) {
    stages = [pipeline as PipelineStage];
  } else {
    stages = pipeline;
  }

  // Check query cache first for repeated operations on collections > 25 documents
  if (collection.length > 25) {
    const cachedResult = globalQueryCache.get(collection, stages);
    if (cachedResult) {
      return cachedResult as Collection<T>;
    }
  }

  // Try optimized execution for collections with optimizable stages
  // Lower threshold to benefit smaller collections (was 100, now 50)
  const shouldOptimize = collection.length > 50 && isOptimizable(stages);

  let result: Collection<T>;

  if (shouldOptimize) {
    try {
      result = optimizedEngine.aggregate(collection, stages);
    } catch (error) {
      // Fallback to traditional execution if optimization fails
      console.warn(
        'Optimized execution failed, falling back to traditional:',
        error
      );
      result = traditionalAggregate(collection, stages);
    }
  } else {
    // Traditional execution using native JavaScript
    result = traditionalAggregate(collection, stages);
  }

  // Cache the result for future use if collection is large enough
  if (collection.length > 25 && result.length < 10000) {
    globalQueryCache.set(collection, stages, result);
  }

  return result;
}

// Check if pipeline stages are optimizable
function isOptimizable(stages: PipelineStage[]): boolean {
  for (const stage of stages) {
    // Skip optimization for complex stages that need special handling
    if ('$lookup' in stage || '$unwind' in stage) {
      return false;
    }
  }
  return true;
}

function traditionalAggregate<T extends Document = Document>(
  collection: Collection<T>,
  stages: PipelineStage[]
): Collection<T> {
  let result = collection as Collection<T>;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;

    if ('$match' in stage) {
      result = $match(result, stage.$match);
    }
    if ('$project' in stage) {
      result = $project(result, stage.$project);
    }
    if ('$group' in stage) {
      result = $group(result, stage.$group);
    }
    if ('$sort' in stage) {
      result = $sort(result, stage.$sort);
    }
    if ('$skip' in stage) {
      result = $skip(result, stage.$skip);
    }
    if ('$limit' in stage) {
      result = $limit(result, stage.$limit);
    }
    if ('$unwind' in stage) {
      const unwindSpec = stage.$unwind;
      const fieldPath =
        typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path;
      result = $unwind(result, fieldPath);
    }
    if ('$lookup' in stage) {
      result = $lookup(result, stage.$lookup);
    }
    if ('$addFields' in stage) {
      result = $addFields(result, stage.$addFields);
    }
    if ('$set' in stage) {
      result = $addFields(result, stage.$set);
    }
  }

  return result;
}

export {
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
};
export default { aggregate, $project, $group };
