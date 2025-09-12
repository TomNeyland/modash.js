import {
    chain, isArray, mapValues, first
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
    const result = [];

    for (let i = 0; i < collection.length; i++) {
        const item = collection[i];
        let itemMatched = true;

        for (const param in query) {
            const expression = query[param];
            const expressionValue = $expressionObject(item, expression);

            if (expression === false) {
                itemMatched = false;
                break;
            }
        }

        if (itemMatched) {
            result.push(item);
        }
    }

    return result;
}

/**
 * Limits the number of documents passed to the next stage in the pipeline.
 */
function $limit(collection, count) {
    return first(collection, count);
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

        if (stage.$project) {
            collection = $project(collection, stage.$project);
        }
        if (stage.$group) {
            collection = $group(collection, stage.$group);
        }
        if (stage.$match) {
            collection = $match(collection, stage.$match);
        }
        if (stage.$limit) {
            collection = $limit(collection, stage.$limit);
        }
    }

    return collection.value();
}

export { aggregate, $project, $group, $match, $limit };
export default { aggregate, $project, $group };
