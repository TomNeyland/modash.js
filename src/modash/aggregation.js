import {
    chain, isArray, mapValues, first, sortBy, drop, flatMap, get as lodashGet
} from 'lodash-es';

import {
    $expressionObject, $expression
} from './expressions.js';
import {
    $accumulate
} from './accumulators.js';

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

    return chain(collection).map((obj) => $expressionObject(obj, specifications, obj));
}

/**
 * Filters the document stream to allow only matching documents to pass
 * unmodified into the next pipeline stage.
 */
function $match(collection, query) {
    return collection.filter(item => {
        for (const field in query) {
            const condition = query[field];
            const fieldValue = lodashGet(item, field);
            
            // Simple equality check
            if (typeof condition !== 'object') {
                if (fieldValue !== condition) return false;
            } else {
                // Handle operators like $gt, $lt, etc.
                for (const operator in condition) {
                    const expectedValue = condition[operator];
                    switch (operator) {
                        case '$eq': if (fieldValue !== expectedValue) return false; break;
                        case '$ne': if (fieldValue === expectedValue) return false; break;
                        case '$gt': if (fieldValue <= expectedValue) return false; break;
                        case '$gte': if (fieldValue < expectedValue) return false; break;
                        case '$lt': if (fieldValue >= expectedValue) return false; break;
                        case '$lte': if (fieldValue > expectedValue) return false; break;
                        case '$in': if (!expectedValue.includes(fieldValue)) return false; break;
                        case '$nin': if (expectedValue.includes(fieldValue)) return false; break;
                        default: return false;
                    }
                }
            }
        }
        return true;
    });
}

/**
 * Limits the number of documents passed to the next stage in the pipeline.
 */
function $limit(collection, count) {
    return collection.slice(0, count);
}

/**
 * Skips the first n documents where n is the specified skip number and passes
 * the remaining documents unmodified to the pipeline
 */
function $skip(collection, count) {
    return drop(collection, count);
}

/**
 * Reorders the document stream by a specified sort key.
 */
function $sort(collection, sortSpec) {
    const sortKeys = Object.keys(sortSpec);
    const sortOrders = sortKeys.map(key => sortSpec[key] === -1 ? 'desc' : 'asc');
    
    return sortBy(collection, sortKeys).reverse(); // Simple implementation
}

/**
 * Deconstructs an array field from the input documents to output a document
 * for each element. Each output document replaces the array with an element value.
 */
function $unwind(collection, fieldPath) {
    // Remove $ prefix if present
    const cleanPath = fieldPath.startsWith('$') ? fieldPath.slice(1) : fieldPath;
    
    return flatMap(collection, (doc) => {
        const arrayValue = lodashGet(doc, cleanPath);
        
        if (!isArray(arrayValue)) {
            return [doc]; // Return original document if field is not an array
        }
        
        if (arrayValue.length === 0) {
            return []; // Skip documents with empty arrays
        }
        
        return arrayValue.map(item => ({
            ...doc,
            [cleanPath]: item
        }));
    });
}

/**
 * Groups input documents by a specified identifier expression and applies the
 * accumulator expression(s), if specified, to each group.
 */
function $group(collection, specifications = {}) {
    const _idSpec = specifications._id;

    const groups = chain(collection).groupBy((obj) => 
        _idSpec ? JSON.stringify($expression(obj, _idSpec)) : null
    );

    return groups.map((members, key, group) => {
        return mapValues(specifications, (fieldSpec, field) => {
            if (field === '_id') {
                return fieldSpec ? $expression(members[0], _idSpec) : null;
            } else {
                return $accumulate(members, fieldSpec);
            }
        });
    });
}

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
    }

    return collection.value();
}

export { aggregate, $project, $group, $match, $limit, $skip, $sort, $unwind };
export default { aggregate, $project, $group };
