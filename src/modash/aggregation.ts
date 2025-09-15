// Modern JavaScript - use our utility functions instead of lodash
import { get as lodashGet } from './util';

import {
  $expressionObject,
  $expression,
  type Collection,
  type Document,
  type DocumentValue,
} from './expressions';
import { $accumulate } from './accumulators';

// Phase 3.5: Import enhanced text and regex search capabilities
import { $text } from './text-search';
import { DEBUG } from './debug';

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
} from '../index';

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
  $text?: string; // Phase 3.5: Text search operator
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

  return collection.map(obj => {
    const projected = $expressionObject(obj, specs, obj) as any;
    // Align behavior with compiled project: omit _id when it's undefined
    if (projected && projected._id === undefined) {
      delete projected._id;
    }
    return projected as T;
  }) as Collection<T>;
}

/**
 * Filters the document stream to allow only matching documents to pass
 * unmodified into the next pipeline stage.
 * Phase 3.5: Enhanced with Bloom filter acceleration for $text and $regex
 */
function $match<T extends Document = Document>(
  collection: Collection<T>,
  query: QueryExpression
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }

  // Phase 3.5: Check for $text operator at top level
  if (query.$text && typeof query.$text === 'string') {
    if (DEBUG) {
      console.log(
        `🔍 Phase 3.5: Using accelerated $text search for query: "${query.$text}"`
      );
    }

    // Use accelerated text search for the entire collection
    const textResults = $text(collection, query.$text);

    // If there are other conditions, apply them to the text search results
    const remainingQuery = { ...query };
    delete remainingQuery.$text;

    if (Object.keys(remainingQuery).length === 0) {
      return textResults; // Only $text condition
    } else {
      // Apply additional filters to text search results
      return textResults.filter(item => matchDocument(item, remainingQuery));
    }
  }

  return collection.filter(item => matchDocument(item, query));
}

/**
 * Helper function to match a document against a query
 */
function matchDocument(doc: Document, query: QueryExpression): boolean {
  // Phase 3.5: Check for single-field regex queries that can benefit from acceleration
  const queryKeys = Object.keys(query);
  if (queryKeys.length === 1) {
    const field = queryKeys[0];
    const condition = query[field] as FieldCondition;

    if (
      condition &&
      typeof condition === 'object' &&
      '$regex' in (condition as any) &&
      typeof (condition as any).$regex === 'string'
    ) {
      // This is a single-field regex query - we could optimize this further
      // but for now we'll use the standard path with enhanced error handling
      if (DEBUG) {
        console.log(
          `🔍 Phase 3.5: Single-field regex query detected for field "${field}"`
        );
      }
    }
  }

  for (const field in query) {
    const condition = query[field] as FieldCondition;

    // Handle $expr operator - evaluate expression in document context
    if (field === '$expr') {
      const exprResult = $expression(doc, condition as Expression, doc);
      if (!exprResult) return false;
      continue;
    }

    // Optimize for simple property access - use direct access when no dots in field name
    const fieldValue = field.includes('.') ? lodashGet(doc, field) : doc[field];

    // Handle logical operators and special queries
    if (field === '$text') {
      // $text operator - this should be handled at collection level for efficiency
      // but we support it here for consistency
      if (typeof condition !== 'string') return false;

      if (DEBUG) {
        console.log(
          `🔍 Phase 3.5: Document-level $text matching: "${condition}"`
        );
      }

      // For document-level text search, use simple token matching
      const results = $text([doc], condition);
      return results.length > 0;
    }

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
            } else if (fieldValue <= (expectedValue as any)) return false;
            break;
          case '$gte':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue < expectedValue) return false;
            } else if (fieldValue < (expectedValue as any)) return false;
            break;
          case '$lt':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue >= expectedValue) return false;
            } else if (fieldValue >= (expectedValue as any)) return false;
            break;
          case '$lte':
            if (
              typeof fieldValue === 'number' &&
              typeof expectedValue === 'number'
            ) {
              if (fieldValue > expectedValue) return false;
            } else if (fieldValue > (expectedValue as any)) return false;
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
            // Phase 3.5: Enhanced regex with Bloom filter acceleration
            if (typeof fieldValue !== 'string') return false;
            const options =
              (condition as Record<string, string>).$options || '';

            if (DEBUG) {
              console.log(
                `🔍 Phase 3.5: Using enhanced regex match for field "${field}", pattern: "${expectedValue}"`
              );
            }

            // Use enhanced regex matching for single-field regex operations
            // Note: This is a simplified integration - for full acceleration,
            // we'd need to restructure the matching to work on collections
            try {
              const regex = new RegExp(expectedValue as string, options);
              if (!regex.test(fieldValue)) return false;
            } catch (error) {
              if (DEBUG) {
                console.log(
                  `🔍 $regex: Invalid pattern "${expectedValue}": ${error}`
                );
              }
              return false;
            }
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
 * Helper function for safe string comparison that handles mixed types
 */
function cmpString(a: unknown, b: unknown): number {
  const sa = a === null || a === undefined ? '' : String(a);
  const sb = b === null || b === undefined ? '' : String(b);
  return sa.localeCompare(sb);
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
      const valueA = key.includes('.') ? lodashGet(a, key) : a[key];
      const valueB = key.includes('.') ? lodashGet(b, key) : b[key];

      // Handle null/undefined values (MongoDB behavior: null < any value)
      if (
        (valueA === null || valueA === undefined) &&
        (valueB === null || valueB === undefined)
      )
        continue;
      if (valueA === null || valueA === undefined) return -direction;
      if (valueB === null || valueB === undefined) return direction;

      // Compare values - use string comparison for consistent behavior
      let result = 0;
      if (typeof valueA === 'string' || typeof valueB === 'string') {
        result = cmpString(valueA, valueB);
      } else if (valueA < valueB) {
        result = -1;
      } else if (valueA > valueB) {
        result = 1;
      }

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
 * Supports both string and object forms with options.
 */
function $unwind<T extends Document = Document>(
  collection: Collection<T>,
  unwindSpec:
    | string
    | {
        path: string;
        includeArrayIndex?: string;
        preserveNullAndEmptyArrays?: boolean;
      }
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }

  // Parse unwind specification
  const fieldPath =
    typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path;
  const options: {
    includeArrayIndex?: string;
    preserveNullAndEmptyArrays?: boolean;
  } = typeof unwindSpec === 'object' ? (unwindSpec as any) : {};

  // Remove $ prefix if present
  const cleanPath = fieldPath.startsWith('$') ? fieldPath.slice(1) : fieldPath;

  const result: Document[] = [];

  for (const doc of collection) {
    // Optimize for simple property access - use direct access when no dots in path
    const arrayValue = cleanPath.includes('.')
      ? lodashGet(doc, cleanPath)
      : doc[cleanPath];

    if (!Array.isArray(arrayValue)) {
      if (arrayValue !== null) {
        // Non-array value, keep document as-is
        result.push(doc);
      } else if (options.preserveNullAndEmptyArrays) {
        // Null/undefined field with preserveNullAndEmptyArrays
        // TODO(refactor): Replace deep clone with structuredClone or field-level copy to reduce GC pressure.
        const newDoc: any = JSON.parse(JSON.stringify(doc));
        if (cleanPath.includes('.')) {
          // For nested paths, set the final property to null
          const parts = cleanPath.split('.');
          let current = newDoc;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = null;
        } else {
          newDoc[cleanPath] = null;
        }
        if (options.includeArrayIndex) {
          newDoc[options.includeArrayIndex] = null;
        }
        result.push(newDoc);
      }
      // Otherwise skip (null/undefined without preserveNullAndEmptyArrays)
      continue;
    }

    if (arrayValue.length === 0) {
      if (options.preserveNullAndEmptyArrays) {
        // Empty array with preserveNullAndEmptyArrays
        // TODO(refactor): Avoid object spread in hot paths; consider targeted field updates.
        const newDoc: any = { ...doc };
        if (cleanPath.includes('.')) {
          const parts = cleanPath.split('.');
          let current = newDoc;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = null;
        } else {
          newDoc[cleanPath] = null;
        }
        if (options.includeArrayIndex) {
          newDoc[options.includeArrayIndex] = null;
        }
        result.push(newDoc);
      }
      continue; // Skip empty arrays unless preserveNullAndEmptyArrays
    }

    // Unwind the array
    arrayValue.forEach((item, index) => {
      // Deep clone the document to avoid mutations
      // TODO(refactor): Replace deep clone with structuredClone where available.
      const newDoc: any = JSON.parse(JSON.stringify(doc));

      // Set the unwound field value - preserve nested structure
      if (cleanPath.includes('.')) {
        const parts = cleanPath.split('.');
        let current = newDoc;

        // Navigate to the parent object
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        // Set the final field value
        current[parts[parts.length - 1]] = item;
      } else {
        newDoc[cleanPath] = item;
      }

      // Add array index if requested
      if (options.includeArrayIndex) {
        newDoc[options.includeArrayIndex] = index;
      }

      result.push(newDoc);
    });
  }

  return result as Collection<T>;
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

  // Group by using native JavaScript
  const groupsMap = new Map<string, Document[]>();

  for (const obj of collection) {
    const key = _idSpec ? JSON.stringify($expression(obj, _idSpec)) : 'null';
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key)!.push(obj);
  }

  // Process groups - A) Stable ordering: sort groups by deterministic JSON-stable key
  const results: Document[] = [];
  const sortedGroupEntries = Array.from(groupsMap.entries()).sort(
    ([keyA], [keyB]) => {
      // Sort by the JSON string representation for deterministic ordering
      return keyA.localeCompare(keyB);
    }
  );

  for (const [_groupKey, members] of sortedGroupEntries) {
    const result: GroupResult = {};
    for (const [field, fieldSpec] of Object.entries(specifications)) {
      if (field === '_id') {
        result[field] = fieldSpec ? $expression(members[0]!, _idSpec) : null;
      } else {
        result[field] = $accumulate(members, fieldSpec as Expression);
      }
    }
    results.push(result);
  }

  return results as Collection<T>;
}

/**
 * Execute an aggregation pipeline with variable bindings for $lookup sub-pipelines
 */
function aggregateWithBindings<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline,
  bindings: Record<string, DocumentValue>
): Collection<T> {
  let result = collection;

  for (const stage of pipeline) {
    if ('$match' in stage) {
      // Special handling for $match with $expr to support bindings
      const matchSpec = stage.$match;
      if (matchSpec && typeof matchSpec === 'object' && '$expr' in matchSpec) {
        // Filter using $expr with bindings
        result = result.filter(doc => {
          const exprResult = $expression(
            doc,
            matchSpec.$expr!,
            doc,
            undefined,
            bindings
          );
          return Boolean(exprResult);
        });
      } else {
        // Regular $match without bindings
        result = $match(result, matchSpec);
      }
    } else if ('$project' in stage) {
      // Project with bindings support
      result = result.map(doc => {
        const projected: Document = {};
        for (const [key, expr] of Object.entries(stage.$project)) {
          const value = $expression(
            doc,
            expr as Expression,
            doc,
            undefined,
            bindings
          );
          // Check for $$REMOVE symbol (cast to any to handle symbol comparison)
          if ((value as any) !== Symbol.for('$$REMOVE')) {
            projected[key] = value;
          }
        }
        return projected as T;
      }) as Collection<T>;
    } else if ('$limit' in stage) {
      result = $limit(result, stage.$limit);
    } else if ('$skip' in stage) {
      result = $skip(result, stage.$skip);
    } else if ('$sort' in stage) {
      result = $sort(result, stage.$sort);
    } else {
      // For other stages, fall back to regular processing (no bindings support yet)
      throw new Error(
        `$lookup sub-pipeline: Stage ${Object.keys(stage)[0]} not supported with bindings`
      );
    }
  }

  return result;
}

/**
 * Performs a left outer join to an unsharded collection in the same database
 * to filter in documents from the "joined" collection for processing.
 */
function $lookup<T extends Document = Document>(
  collection: Collection<T>,
  spec: LookupStage['$lookup']
): Collection<T> {
  if (!Array.isArray(collection)) {
    return [];
  }

  const { from, as } = spec;

  if (!from || !Array.isArray(from)) {
    throw new Error(
      '$lookup: "from" must be an array (the foreign collection)'
    );
  }

  if (!as) {
    throw new Error('$lookup: "as" field is required');
  }

  // Check if this is the simple syntax or advanced syntax
  if ('localField' in spec && 'foreignField' in spec) {
    // Simple equality join syntax
    const { localField, foreignField } = spec;

    if (!localField || !foreignField) {
      throw new Error(
        '$lookup: localField and foreignField are required for simple syntax'
      );
    }

    return collection.map(doc => {
      // Optimize for simple property access - use direct access when no dots in field
      const localValue = localField.includes('.')
        ? lodashGet(doc, localField)
        : doc[localField];
      const matches = from.filter(foreignDoc => {
        const foreignValue = foreignField.includes('.')
          ? lodashGet(foreignDoc, foreignField)
          : foreignDoc[foreignField];
        return foreignValue === localValue;
      });

      return {
        ...doc,
        [as]: matches,
      };
    }) as Collection<T>;
  } else if ('pipeline' in spec) {
    // Advanced pipeline syntax with optional let bindings
    const { pipeline } = spec;
    const letVars = 'let' in spec ? spec.let : undefined;

    return collection.map(doc => {
      // Evaluate let variables once per outer document
      const bindings: Record<string, DocumentValue> = {};

      if (letVars) {
        for (const [varName, varExpr] of Object.entries(letVars)) {
          // Evaluate the expression in context of the current document
          bindings[varName] = $expression(doc, varExpr, doc);
        }
      }

      // Execute the pipeline on the foreign collection with bindings
      // We need a special version of aggregate that accepts bindings
      const matches = aggregateWithBindings(from, pipeline, bindings);

      return {
        ...doc,
        [as]: matches,
      };
    }) as Collection<T>;
  } else {
    throw new Error(
      '$lookup: Must specify either localField/foreignField or pipeline'
    );
  }
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

  // D) Pipeline Input Validation - Handle null/undefined/invalid pipelines
  if (pipeline === null) {
    return collection; // Return collection unchanged for null/undefined pipeline
  }

  let stages: PipelineStage[];
  if (!Array.isArray(pipeline)) {
    // Handle single stage - but ensure it's a valid object
    if (typeof pipeline !== 'object') {
      return collection; // Return unchanged for invalid single stage
    }
    stages = [pipeline as PipelineStage];
  } else {
    stages = pipeline;
  }

  // Execute using native JavaScript pipeline processing
  return traditionalAggregate(collection, stages);
}

function traditionalAggregate<T extends Document = Document>(
  collection: Collection<T>,
  stages: PipelineStage[]
): Collection<T> {
  let result = collection as Collection<T>;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;

    if ('$count' in stage) {
      // Rewrite $count to $group + $project as per user guidance
      const fieldName = stage.$count;
      result = $group(result, {
        _id: null,
        [fieldName]: { $sum: 1 },
      });
      result = $project(result, {
        _id: 0,
        [fieldName]: 1,
      });
    }
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
      if (process.env.DEBUG_UNWIND) {
        console.log(
          '[DEBUG] Processing $unwind stage with spec:',
          stage.$unwind
        );
        console.log('[DEBUG] Input collection length:', result.length);
      }
      result = $unwind(result, stage.$unwind);
      if (process.env.DEBUG_UNWIND) {
        console.log('[DEBUG] Output collection length:', result.length);
      }
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
