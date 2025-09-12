import {
    every,
    some,
    isArray,
    isEqual,
    intersection,
    union,
    difference,
    gt,
    gte,
    lt,
    lte,
    uniq,
    isDate,
    size,
    isFunction
} from 'lodash-es';

/**
 * Modern MongoDB Expression Operators for JavaScript
 */

function evaluate(val) {
    return isFunction(val) ? val() : val;
}

// Boolean Operators
function $and(...values) {
    return every(values.map(evaluate));
}

function $or(...values) {
    return some(values, evaluate);
}

function $not(...values) {
    return !some(values, evaluate);
}

// Set Operators
function $asSet(array) {
    return uniq(array.map(evaluate)).sort();
}

function $setEquals(...arrays) {
    const sets = arrays.map(evaluate).map($asSet);
    const firstSet = sets[0];
    return every(sets, set => isEqual(firstSet, set));
}

function $setIntersection(...arrays) {
    return $asSet(intersection(...arrays.map(evaluate)));
}

function $setUnion(...arrays) {
    return union(...arrays.map(evaluate).map($asSet));
}

function $setDifference(...arrays) {
    return difference(...arrays.map(evaluate).map($asSet));
}

function $setIsSubset(subset, superset) {
    subset = evaluate(subset);
    superset = evaluate(superset);
    return isEqual($asSet(intersection(subset, superset)), $asSet(subset));
}

function $anyElementTrue(values) {
    values = evaluate(values);
    if (!isArray(values)) {
        throw new Error(`values must be an array, got ${typeof values}`);
    }
    return $or(...values);
}

function $allElementsTrue(values) {
    values = evaluate(values);
    if (!isArray(values)) {
        throw new Error(`values must be an array, got ${typeof values}`);
    }
    return $and(...values);
}

// Comparison Operators
function $cmp(value1, value2) {
    value1 = evaluate(value1);
    value2 = evaluate(value2);

    if (isArray(value1) && isArray(value2)) {
        return 0;
    }

    if (value1 < value2) return -1;
    if (value1 > value2) return 1;
    return 0;
}

function $eq(value1, value2) {
    return isEqual(evaluate(value1), evaluate(value2));
}

function $gt(value1, value2) {
    value1 = evaluate(value1);
    value2 = evaluate(value2);

    if (isArray(value2) && !isArray(value1)) return false;
    if (isArray(value1) && !isArray(value2)) return true;
    return gt(value1, value2);
}

function $gte(value1, value2) {
    value1 = evaluate(value1);
    value2 = evaluate(value2);

    if (isArray(value2) && !isArray(value1)) return false;
    if (isArray(value1) && !isArray(value2)) return true;
    return gte(value1, value2);
}

function $lt(value1, value2) {
    value1 = evaluate(value1);
    value2 = evaluate(value2);

    if (isArray(value2) && !isArray(value1)) return true;
    if (isArray(value1) && !isArray(value2)) return false;
    return lt(value1, value2);
}

function $lte(value1, value2) {
    value1 = evaluate(value1);
    value2 = evaluate(value2);

    if (isArray(value2) && !isArray(value1)) return true;
    if (isArray(value1) && !isArray(value2)) return false;
    return lte(value1, value2);
}

function $ne(value1, value2) {
    return !$eq(value1, value2);
}

// Arithmetic Operators
function $add(...values) {
    values = values.map(evaluate);
    let result = values.shift();
    let resultAsDate = false;

    if (isDate(result)) {
        resultAsDate = true;
        result = result.getTime();
    }

    for (let i = values.length - 1; i >= 0; i--) {
        let value = values[i];
        if (isDate(value)) {
            resultAsDate = true;
            value = value.getTime();
        }
        result += value;
    }

    return resultAsDate ? new Date(result) : result;
}

function $subtract(value1, value2) {
    value1 = evaluate(value1);
    value2 = evaluate(value2);

    if (isDate(value1) && isDate(value2)) {
        return value1.getTime() - value2.getTime();
    } else if (isDate(value1) && !isDate(value2)) {
        return new Date(value1.getTime() - value2);
    } else if (!isDate(value1) && isDate(value2)) {
        return new Date(value1 - value2.getTime());
    } else {
        return value1 - value2;
    }
}

function $multiply(...values) {
    return values.map(evaluate).reduce((product, n) => product * n, 1);
}

function $divide(value1, value2) {
    return evaluate(value1) / evaluate(value2);
}

function $mod(value1, value2) {
    return evaluate(value1) % evaluate(value2);
}

// String Operators
function $concat(...expressions) {
    return expressions.map(evaluate).join('');
}

function $substr(string, start, len) {
    string = evaluate(string);
    start = evaluate(start);
    len = evaluate(len);
    return string.slice(start, start + len);
}

function $toLower(string) {
    return evaluate(string).toLowerCase();
}

function $toUpper(string) {
    return evaluate(string).toUpperCase();
}

// Array Operators
function $size(collection) {
    return size(evaluate(collection));
}

// Date Operators
function $dayOfYear(date) {
    date = evaluate(date);
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

function $dayOfMonth(date) {
    date = evaluate(date);
    return date ? date.getDate() : null;
}

function $dayOfWeek(date) {
    date = evaluate(date);
    return date ? date.getDay() : null;
}

function $year(date) {
    date = evaluate(date);
    return date ? date.getFullYear() : null;
}

function $month(date) {
    date = evaluate(date);
    return date ? date.getMonth() + 1 : null;
}

function $week(date) {
    date = evaluate(date);
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const jan4 = new Date(target.getFullYear(), 0, 4);
    const dayDiff = (target - jan4) / 86400000;
    return 1 + Math.ceil(dayDiff / 7);
}

function $hour(date) {
    return evaluate(date).getHours();
}

function $minute(date) {
    return evaluate(date).getMinutes();
}

function $second(date) {
    return evaluate(date).getSeconds();
}

function $millisecond(date) {
    return evaluate(date).getMilliseconds();
}

// Conditional Operators
function $cond(isTrue, thenValue, elseValue) {
    return evaluate(isTrue) ? evaluate(thenValue) : evaluate(elseValue);
}

function $ifNull(value, defaultValue) {
    const val = evaluate(value);
    return val !== null ? val : evaluate(defaultValue);
}

const EXPRESSION_OPERATORS = {
    // Boolean
    $and,
    $or,
    $not,
    
    // Set
    $setEquals,
    $setIntersection,
    $setUnion,
    $setDifference,
    $setIsSubset,
    $anyElementTrue,
    $allElementsTrue,
    
    // Comparison
    $cmp,
    $eq,
    $gt,
    $gte,
    $lt,
    $lte,
    $ne,
    
    // Arithmetic
    $add,
    $subtract,
    $multiply,
    $divide,
    $mod,
    
    // String
    $concat,
    $substr,
    $toLower,
    $toUpper,
    
    // Array
    $size,
    
    // Date
    $dayOfYear,
    $dayOfMonth,
    $dayOfWeek,
    $year,
    $month,
    $week,
    $hour,
    $minute,
    $second,
    $millisecond,
    
    // Conditional
    $cond,
    $ifNull
};

export default EXPRESSION_OPERATORS;