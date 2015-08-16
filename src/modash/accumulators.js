import {
    sum, min, max, size, keys, map, first, last, unique
}
from 'lodash';
import {
    $expression
}
from './expressions';

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


/*

Accumulators

 */

function $accumulate(collection, operatorExpression) {
    if (isAccumulatorExpression(operatorExpression)) {
        var operator = keys(operatorExpression)[0],
            args = operatorExpression[operator],
            accumulatorFunction = ACCUMULATORS[operator];

        var result = accumulatorFunction(collection, args);
        return result;
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
    console.debug('Please find a more efficient way to do this');
    return unique($push(collection, spec), (obj) => JSON.stringify(obj));
}


export default ACCUMULATORS;
export {
    $accumulate
};
