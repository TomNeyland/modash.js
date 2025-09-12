import {
    sum, min, max, size, keys, map, first, last, uniq
} from 'lodash-es';
import { $expression } from './expressions.js';

const ACCUMULATORS = {
    $accumulate,
    $sum,
    $avg,
    $first,
    $last,
    $min,
    $max,
    $push,
    $addToSet
};

function isAccumulatorExpression(expression) {
    return size(expression) === 1 && (keys(expression)[0] in ACCUMULATORS);
}

/**
 * Accumulators for aggregation operations
 */

function $accumulate(collection, operatorExpression) {
    if (isAccumulatorExpression(operatorExpression)) {
        const operator = keys(operatorExpression)[0];
        const args = operatorExpression[operator];
        const accumulatorFunction = ACCUMULATORS[operator];

        return accumulatorFunction(collection, args);
    }
}

function $sum(collection, spec) {
    if (spec === 1) {
        return size(collection);
    }
    return sum(collection, (obj) => $expression(obj, spec));
}

function $avg(collection, spec) {
    return $sum(collection, spec) / size(collection);
}

function $first(collection, spec) {
    return $expression(first(collection), spec);
}

function $last(collection, spec) {
    return $expression(last(collection), spec);
}

function $max(collection, spec) {
    return max(collection, (obj) => $expression(obj, spec));
}

function $min(collection, spec) {
    return min(collection, (obj) => $expression(obj, spec));
}

function $push(collection, spec) {
    return map(collection, (obj) => $expression(obj, spec));
}

function $addToSet(collection, spec) {
    const values = $push(collection, spec);
    return uniq(values, (obj) => JSON.stringify(obj));
}

export { $accumulate };
export default ACCUMULATORS;

