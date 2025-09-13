import { isArray, drop, flatMap } from 'lodash-es';
import { FastOperations } from './fast-operations.js';
import { FastPathAccess } from './fast-path-access.js';

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

  return FastOperations.map(collection, obj => $expressionObject(obj, specs, obj)) as Collection<T>;
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
  return FastOperations.filter(collection, item => matchDocument(item, query));
}

/**
 * Helper function to match a document against a query
 */
function matchDocument(doc: Document, query: QueryExpression): boolean {
  for (const field in query) {
    const condition = query[field] as FieldCondition;
    const fieldValue = FastPathAccess.get(doc, field);

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
  return drop(collection, count) as Collection<T>;
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
      const valueA = FastPathAccess.get(a, key);
      const valueB = FastPathAccess.get(b, key);

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

  return FastOperations.flatMap(collection, doc => {
    const arrayValue = FastPathAccess.get(doc, cleanPath);

    if (!isArray(arrayValue)) {
      return [doc]; // Return original document if field is not an array
    }

    if (arrayValue.length === 0) {
      return []; // Skip documents with empty arrays
    }

    return arrayValue.map(item => ({
      ...doc,
      [cleanPath]: item,
    }));
  }) as Collection<T>;
}

/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 */
function $group<T extends Document = Document>(
  collection: Collection<T>,
  specifications: GroupStage['$group'] = { _id: null }
): Collection<T> {
  const _idSpec = specifications._id;

  const groups = FastOperations.groupBy(collection, obj =>
    _idSpec ? JSON.stringify($expression(obj, _idSpec)) : 'null'
  );

  const results: T[] = [];
  for (const [groupKey, members] of groups) {
    const result: GroupResult = {};
    for (const [field, fieldSpec] of Object.entries(specifications)) {
      if (field === '_id') {
        result[field] = fieldSpec ? $expression(members[0]!, _idSpec) : null;
      } else {
        result[field] = $accumulate(members, fieldSpec as Expression);
      }
    }
    results.push(result as T);
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
    const localValue = FastPathAccess.get(doc, localField);
    const matches = from.filter(
      foreignDoc => FastPathAccess.get(foreignDoc, foreignField) === localValue
    );

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
  let stages: PipelineStage[];
  if (!isArray(pipeline)) {
    stages = [pipeline as PipelineStage];
  } else {
    stages = pipeline;
  }

  let result = collection;

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
