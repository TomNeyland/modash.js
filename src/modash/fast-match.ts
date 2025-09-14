/**
 * Ultra-fast $match implementation for modash.js
 * 
 * Optimizations:
 * 1. Specialized code paths for common query patterns
 * 2. Precompiled field accessors
 * 3. Optimized comparison functions
 * 4. Branch prediction optimization
 * 5. SIMD-like batching for large datasets
 */

import type { Collection, Document, DocumentValue } from './expressions.js';
import type { QueryExpression } from '../index.js';

/**
 * Fast field accessor that avoids repeated property lookups
 */
function createFieldGetter(fieldPath: string): (doc: Document) => DocumentValue {
  if (!fieldPath.includes('.')) {
    // Simple field access - fastest path
    return (doc: Document) => doc[fieldPath];
  }
  
  // Nested field access - compile path once
  const segments = fieldPath.split('.');
  return (doc: Document) => {
    let current: any = doc;
    for (let i = 0; i < segments.length && current != null; i++) {
      current = current[segments[i]!];
    }
    return current;
  };
}

/**
 * Specialized matcher for simple equality queries
 * Handles patterns like { field: value } or { field1: value1, field2: value2 }
 */
function createSimpleEqualityMatcher(query: QueryExpression): ((doc: Document) => boolean) | null {
  const entries = Object.entries(query);
  
  // Check if this is a simple equality query (no operators)
  for (const [field, condition] of entries) {
    if (field.startsWith('$')) return null; // Has logical operators
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      const conditionKeys = Object.keys(condition);
      if (conditionKeys.some(key => key.startsWith('$'))) {
        return null; // Has comparison operators
      }
    }
  }
  
  // All conditions are simple equality - create optimized matcher
  if (entries.length === 1) {
    // Single field optimization
    const [field, expectedValue] = entries[0]!;
    const getter = createFieldGetter(field);
    
    // Type-specific optimizations
    if (typeof expectedValue === 'string') {
      return (doc: Document) => getter(doc) === expectedValue;
    } else if (typeof expectedValue === 'number') {
      return (doc: Document) => getter(doc) === expectedValue;
    } else if (typeof expectedValue === 'boolean') {
      return (doc: Document) => getter(doc) === expectedValue;
    } else {
      return (doc: Document) => getter(doc) === expectedValue;
    }
  } else if (entries.length === 2) {
    // Two field optimization (common case)
    const [field1, value1] = entries[0]!;
    const [field2, value2] = entries[1]!;
    const getter1 = createFieldGetter(field1);
    const getter2 = createFieldGetter(field2);
    
    return (doc: Document) => getter1(doc) === value1 && getter2(doc) === value2;
  } else {
    // Multiple fields - general case but still optimized
    const getters = entries.map(([field, value]) => ({
      getter: createFieldGetter(field),
      value
    }));
    
    return (doc: Document) => {
      for (const { getter, value } of getters) {
        if (getter(doc) !== value) return false;
      }
      return true;
    };
  }
}

/**
 * Specialized matcher for simple range queries
 * Handles patterns like { field: { $gte: min, $lte: max } }
 */
function createSimpleRangeMatcher(query: QueryExpression): ((doc: Document) => boolean) | null {
  const entries = Object.entries(query);
  
  if (entries.length !== 1) return null;
  
  const [field, condition] = entries[0]!;
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    return null;
  }
  
  const operators = Object.keys(condition);
  const isSimpleRange = operators.every(op => ['$gt', '$gte', '$lt', '$lte'].includes(op));
  
  if (!isSimpleRange) return null;
  
  const getter = createFieldGetter(field);
  
  // Number range optimization
  const gt = condition.$gt;
  const gte = condition.$gte;
  const lt = condition.$lt;
  const lte = condition.$lte;
  
  if (typeof gt === 'number' && typeof lt === 'number') {
    return (doc: Document) => {
      const value = getter(doc);
      return typeof value === 'number' && value > gt && value < lt;
    };
  } else if (typeof gte === 'number' && typeof lte === 'number') {
    return (doc: Document) => {
      const value = getter(doc);
      return typeof value === 'number' && value >= gte && value <= lte;
    };
  } else if (typeof gte === 'number' && typeof lt === 'number') {
    return (doc: Document) => {
      const value = getter(doc);
      return typeof value === 'number' && value >= gte && value < lt;
    };
  } else if (typeof gt === 'number' && typeof lte === 'number') {
    return (doc: Document) => {
      const value = getter(doc);
      return typeof value === 'number' && value > gt && value <= lte;
    };
  }
  
  return null;
}

/**
 * Specialized matcher for $in queries
 * Handles patterns like { field: { $in: [value1, value2, ...] } }
 */
function createInMatcher(query: QueryExpression): ((doc: Document) => boolean) | null {
  const entries = Object.entries(query);
  
  if (entries.length !== 1) return null;
  
  const [field, condition] = entries[0]!;
  if (typeof condition !== 'object' || condition === null || !('$in' in condition)) {
    return null;
  }
  
  const inValues = condition.$in;
  if (!Array.isArray(inValues)) return null;
  
  const getter = createFieldGetter(field);
  
  // Optimize based on value types and count
  if (inValues.length <= 4) {
    // Small sets - use direct comparison (faster than Set for small counts)
    if (inValues.length === 1) {
      const value = inValues[0];
      return (doc: Document) => getter(doc) === value;
    } else if (inValues.length === 2) {
      const [v1, v2] = inValues;
      return (doc: Document) => {
        const docValue = getter(doc);
        return docValue === v1 || docValue === v2;
      };
    } else {
      return (doc: Document) => {
        const docValue = getter(doc);
        return inValues.includes(docValue);
      };
    }
  } else {
    // Large sets - use Set for O(1) lookup
    const valueSet = new Set(inValues);
    return (doc: Document) => valueSet.has(getter(doc));
  }
}

/**
 * Ultra-fast $match implementation with specialized paths
 */
export function fastMatch<T extends Document = Document>(
  collection: Collection<T>,
  query: QueryExpression
): Collection<T> {
  if (!Array.isArray(collection) || collection.length === 0) {
    return [];
  }
  
  // Try specialized matchers first (fastest paths)
  let matcher = createSimpleEqualityMatcher(query) ||
                createSimpleRangeMatcher(query) ||
                createInMatcher(query);
  
  if (!matcher) {
    // Fall back to general matcher for complex queries
    matcher = createGeneralMatcher(query);
  }
  
  // Process collection with optimized matcher
  const result: T[] = [];
  
  if (collection.length < 1000) {
    // Small collections - simple loop
    for (let i = 0; i < collection.length; i++) {
      const doc = collection[i]!;
      if (matcher(doc)) {
        result.push(doc);
      }
    }
  } else {
    // Large collections - batched processing for better cache performance
    const batchSize = 256;
    for (let i = 0; i < collection.length; i += batchSize) {
      const end = Math.min(i + batchSize, collection.length);
      for (let j = i; j < end; j++) {
        const doc = collection[j]!;
        if (matcher(doc)) {
          result.push(doc);
        }
      }
    }
  }
  
  return result;
}

/**
 * General matcher for complex queries (fallback)
 */
function createGeneralMatcher(query: QueryExpression): (doc: Document) => boolean {
  const conditions: Array<(doc: Document) => boolean> = [];
  
  for (const [field, condition] of Object.entries(query)) {
    // Handle logical operators
    if (field === '$and' && Array.isArray(condition)) {
      const subMatchers = condition.map(subQuery => createGeneralMatcher(subQuery as QueryExpression));
      conditions.push((doc: Document) => subMatchers.every(matcher => matcher(doc)));
      continue;
    }
    
    if (field === '$or' && Array.isArray(condition)) {
      const subMatchers = condition.map(subQuery => createGeneralMatcher(subQuery as QueryExpression));
      conditions.push((doc: Document) => subMatchers.some(matcher => matcher(doc)));
      continue;
    }
    
    if (field === '$nor' && Array.isArray(condition)) {
      const subMatchers = condition.map(subQuery => createGeneralMatcher(subQuery as QueryExpression));
      conditions.push((doc: Document) => !subMatchers.some(matcher => matcher(doc)));
      continue;
    }
    
    // Handle field conditions
    const getter = createFieldGetter(field);
    
    if (typeof condition !== 'object' || condition === null) {
      // Simple equality
      conditions.push((doc: Document) => getter(doc) === condition);
    } else {
      // Operator conditions
      for (const [operator, expectedValue] of Object.entries(condition)) {
        switch (operator) {
          case '$eq':
            conditions.push((doc: Document) => getter(doc) === expectedValue);
            break;
          case '$ne':
            conditions.push((doc: Document) => getter(doc) !== expectedValue);
            break;
          case '$gt':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              return typeof value === 'number' && typeof expectedValue === 'number'
                ? value > expectedValue
                : value > expectedValue;
            });
            break;
          case '$gte':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              return typeof value === 'number' && typeof expectedValue === 'number'
                ? value >= expectedValue
                : value >= expectedValue;
            });
            break;
          case '$lt':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              return typeof value === 'number' && typeof expectedValue === 'number'
                ? value < expectedValue
                : value < expectedValue;
            });
            break;
          case '$lte':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              return typeof value === 'number' && typeof expectedValue === 'number'
                ? value <= expectedValue
                : value <= expectedValue;
            });
            break;
          case '$in':
            if (Array.isArray(expectedValue)) {
              if (expectedValue.length <= 4) {
                conditions.push((doc: Document) => expectedValue.includes(getter(doc)));
              } else {
                const valueSet = new Set(expectedValue);
                conditions.push((doc: Document) => valueSet.has(getter(doc)));
              }
            }
            break;
          case '$nin':
            if (Array.isArray(expectedValue)) {
              if (expectedValue.length <= 4) {
                conditions.push((doc: Document) => !expectedValue.includes(getter(doc)));
              } else {
                const valueSet = new Set(expectedValue);
                conditions.push((doc: Document) => !valueSet.has(getter(doc)));
              }
            }
            break;
          case '$exists':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              return expectedValue ? value !== undefined : value === undefined;
            });
            break;
          case '$regex':
            if (typeof expectedValue === 'string') {
              const regex = new RegExp(expectedValue, condition.$options as string);
              conditions.push((doc: Document) => {
                const value = getter(doc);
                return typeof value === 'string' && regex.test(value);
              });
            }
            break;
          case '$all':
            if (Array.isArray(expectedValue)) {
              conditions.push((doc: Document) => {
                const value = getter(doc);
                return Array.isArray(value) && expectedValue.every(val => value.includes(val));
              });
            }
            break;
          case '$size':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              return Array.isArray(value) && value.length === expectedValue;
            });
            break;
          case '$elemMatch':
            conditions.push((doc: Document) => {
              const value = getter(doc);
              if (!Array.isArray(value)) return false;
              return value.some(elem =>
                createGeneralMatcher({ elem: expectedValue })({ elem })
              );
            });
            break;
          // Add other operators as needed
        }
      }
    }
  }
  
  // Return optimized condition function
  if (conditions.length === 1) {
    return conditions[0]!;
  } else {
    return (doc: Document) => conditions.every(condition => condition(doc));
  }
}