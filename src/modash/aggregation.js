import {
  chain,
  isArray,
  mapValues,
  drop,
  flatMap,
  get as lodashGet,
} from 'lodash-es';

import { $expressionObject, $expression } from './expressions.js';
import { $accumulate } from './accumulators.js';

/**
 * Stage Operators for MongoDB-style aggregation pipeline
 */

/**
 * Reshapes each document in the stream, such as by adding new fields or
 * removing existing fields. For each input document, outputs one document.
 */
function $project(collection, specifications) {
  if (!('_id' in specifications)) {
    specifications._id = 1;
  }

  return chain(collection).map(obj =>
    $expressionObject(obj, specifications, obj)
  );
}

/**
 * Filters the document stream to allow only matching documents to pass
 * unmodified into the next pipeline stage.
 */
function $match(collection, query) {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.filter(item => matchDocument(item, query));
}

/**
 * Helper function to match a document against a query
 */
function matchDocument(doc, query) {
  for (const field in query) {
    const condition = query[field];
    const fieldValue = lodashGet(doc, field);

    // Handle logical operators
    if (field === '$and') {
      if (!Array.isArray(condition)) return false;
      return condition.every(subQuery => matchDocument(doc, subQuery));
    }
    if (field === '$or') {
      if (!Array.isArray(condition)) return false;
      return condition.some(subQuery => matchDocument(doc, subQuery));
    }
    if (field === '$nor') {
      if (!Array.isArray(condition)) return false;
      return !condition.some(subQuery => matchDocument(doc, subQuery));
    }

    // Simple equality check
    if (typeof condition !== 'object' || condition === null) {
      if (fieldValue !== condition) return false;
    } else {
      // Handle comparison and other operators
      for (const operator in condition) {
        const expectedValue = condition[operator];
        switch (operator) {
          case '$eq':
            if (fieldValue !== expectedValue) return false;
            break;
          case '$ne':
            if (fieldValue === expectedValue) return false;
            break;
          case '$gt':
            if (fieldValue <= expectedValue) return false;
            break;
          case '$gte':
            if (fieldValue < expectedValue) return false;
            break;
          case '$lt':
            if (fieldValue >= expectedValue) return false;
            break;
          case '$lte':
            if (fieldValue > expectedValue) return false;
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
            const options = condition.$options || '';
            const regex = new RegExp(expectedValue, options);
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
function $limit(collection, count) {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.slice(0, count);
}

/**
 * Skips the first n documents where n is the specified skip number and passes
 * the remaining documents unmodified to the pipeline
 */
function $skip(collection, count) {
  if (!Array.isArray(collection)) {
    return [];
  }
  return drop(collection, count);
}

/**
 * Reorders the document stream by a specified sort key.
 */
function $sort(collection, sortSpec) {
  if (!Array.isArray(collection)) {
    return [];
  }
  const sortKeys = Object.keys(sortSpec);

  return [...collection].sort((a, b) => {
    for (const key of sortKeys) {
      const direction = sortSpec[key]; // 1 for asc, -1 for desc
      const valueA = lodashGet(a, key);
      const valueB = lodashGet(b, key);

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
function $unwind(collection, fieldPath) {
  if (!Array.isArray(collection)) {
    return [];
  }
  // Remove $ prefix if present
  const cleanPath = fieldPath.startsWith('$') ? fieldPath.slice(1) : fieldPath;

  return flatMap(collection, doc => {
    const arrayValue = lodashGet(doc, cleanPath);

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
  });
}

/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 */
function $group(collection, specifications = {}) {
  const _idSpec = specifications._id;

  const groups = chain(collection).groupBy(obj =>
    _idSpec ? JSON.stringify($expression(obj, _idSpec)) : null
  );

  return groups.map(members => {
    return mapValues(specifications, (fieldSpec, field) => {
      if (field === '_id') {
        return fieldSpec ? $expression(members[0], _idSpec) : null;
      }
      return $accumulate(members, fieldSpec);
    });
  });
}

/**
 * Performs a left outer join to an unsharded collection in the same database
 * to filter in documents from the "joined" collection for processing.
 */
function $lookup(collection, { from, localField, foreignField, as }) {
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
    const localValue = lodashGet(doc, localField);
    const matches = from.filter(
      foreignDoc => lodashGet(foreignDoc, foreignField) === localValue
    );

    return {
      ...doc,
      [as]: matches,
    };
  });
}

/**
 * Adds new fields to documents. $addFields outputs documents that
 * contain all existing fields from the input documents and newly added fields.
 */
function $addFields(collection, fieldSpecs) {
  if (!Array.isArray(collection)) {
    return [];
  }
  return collection.map(doc => {
    const newFields = {};
    for (const [fieldName, expression] of Object.entries(fieldSpecs)) {
      newFields[fieldName] = $expression(doc, expression);
    }
    return { ...doc, ...newFields };
  });
}

// Alias for $addFields
const $set = $addFields;

/**
 * Performs aggregation operation using the aggregation pipeline. The pipeline allows users
 * to process data from a collection with a sequence of stage-based manipulations.
 */
function aggregate(collection, pipeline) {
  if (!isArray(pipeline)) {
    pipeline = [pipeline];
  }

  collection = chain(collection);

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];

    if (stage.$match) {
      collection = collection.thru(data => $match(data, stage.$match));
    }
    if (stage.$project) {
      collection = $project(collection, stage.$project);
    }
    if (stage.$group) {
      collection = $group(collection, stage.$group);
    }
    if (stage.$sort) {
      collection = collection.thru(data => $sort(data, stage.$sort));
    }
    if (stage.$skip) {
      collection = collection.thru(data => $skip(data, stage.$skip));
    }
    if (stage.$limit) {
      collection = collection.thru(data => $limit(data, stage.$limit));
    }
    if (stage.$unwind) {
      collection = collection.thru(data => $unwind(data, stage.$unwind));
    }
    if (stage.$lookup) {
      collection = collection.thru(data => $lookup(data, stage.$lookup));
    }
    if (stage.$addFields) {
      collection = collection.thru(data => $addFields(data, stage.$addFields));
    }
    if (stage.$set) {
      collection = collection.thru(data => $set(data, stage.$set));
    }
  }

  return collection.value();
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
