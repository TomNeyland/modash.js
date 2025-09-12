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

// Import $expression for array operators that need it
import { $expression } from './expressions.js';

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

// Additional Math Operators
function $abs(value) {
    return Math.abs(evaluate(value));
}

function $ceil(value) {
    return Math.ceil(evaluate(value));
}

function $floor(value) {
    return Math.floor(evaluate(value));
}

function $round(value, place) {
    value = evaluate(value);
    place = place !== undefined ? evaluate(place) : 0;
    const factor = Math.pow(10, place);
    return Math.round(value * factor) / factor;
}

function $sqrt(value) {
    return Math.sqrt(evaluate(value));
}

function $pow(base, exponent) {
    return Math.pow(evaluate(base), evaluate(exponent));
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

// Additional String Operators
function $split(string, delimiter) {
    string = evaluate(string);
    delimiter = evaluate(delimiter);
    return string.split(delimiter);
}

function $strLen(string) {
    return evaluate(string).length;
}

function $trim(string, chars) {
    string = evaluate(string);
    chars = chars !== undefined ? evaluate(chars) : ' ';
    
    if (chars === ' ') {
        return string.trim();
    }
    
    // Manual trimming for custom characters
    const charsArray = chars.split('');
    let start = 0;
    let end = string.length;
    
    while (start < end && charsArray.includes(string[start])) start++;
    while (end > start && charsArray.includes(string[end - 1])) end--;
    
    return string.slice(start, end);
}

function $ltrim(string, chars) {
    string = evaluate(string);
    chars = chars !== undefined ? evaluate(chars) : ' ';
    
    if (chars === ' ') {
        return string.replace(/^\s+/, '');
    }
    
    const charsArray = chars.split('');
    let start = 0;
    while (start < string.length && charsArray.includes(string[start])) start++;
    return string.slice(start);
}

function $rtrim(string, chars) {
    string = evaluate(string);
    chars = chars !== undefined ? evaluate(chars) : ' ';
    
    if (chars === ' ') {
        return string.replace(/\s+$/, '');
    }
    
    const charsArray = chars.split('');
    let end = string.length;
    while (end > 0 && charsArray.includes(string[end - 1])) end--;
    return string.slice(0, end);
}

// Array Operators
function $size(collection) {
    return size(evaluate(collection));
}

function $arrayElemAt(array, index) {
    array = evaluate(array);
    index = evaluate(index);
    if (!Array.isArray(array)) return null;
    
    // Handle negative indices
    if (index < 0) {
        index = array.length + index;
    }
    
    return index >= 0 && index < array.length ? array[index] : null;
}

function $filter(input) {
    const { input: array, cond, as = 'this' } = input;
    const evaluatedArray = evaluate(array);
    
    if (!Array.isArray(evaluatedArray)) return null;
    
    return evaluatedArray.filter(item => {
        // Create temporary context with the array element
        const tempDoc = { [as]: item };
        return $expression(tempDoc, cond);
    });
}

function $map(input) {
    const { input: array, in: expression, as = 'this' } = input;
    const evaluatedArray = evaluate(array);
    
    if (!Array.isArray(evaluatedArray)) return null;
    
    return evaluatedArray.map(item => {
        // Create temporary context with the array element
        const tempDoc = { [as]: item };
        return $expression(tempDoc, expression);
    });
}

function $slice(array, position, n) {
    array = evaluate(array);
    position = evaluate(position);
    
    if (!Array.isArray(array)) return null;
    
    if (n === undefined) {
        // $slice: [array, n] format
        n = position;
        position = n >= 0 ? 0 : array.length + n;
    } else {
        n = evaluate(n);
    }
    
    if (position < 0) {
        position = Math.max(0, array.length + position);
    }
    
    return array.slice(position, position + n);
}

function $concatArrays(...arrays) {
    const evaluatedArrays = arrays.map(evaluate);
    
    // Check all inputs are arrays
    for (const arr of evaluatedArrays) {
        if (!Array.isArray(arr)) return null;
    }
    
    return [].concat(...evaluatedArrays);
}

function $in(value, array) {
    value = evaluate(value);
    array = evaluate(array);
    
    if (!Array.isArray(array)) return false;
    return array.includes(value);
}

function $indexOfArray(array, searchValue, start, end) {
    array = evaluate(array);
    searchValue = evaluate(searchValue);
    start = start !== undefined ? evaluate(start) : 0;
    end = end !== undefined ? evaluate(end) : array.length;
    
    if (!Array.isArray(array)) return null;
    
    for (let i = start; i < Math.min(end, array.length); i++) {
        if (isEqual(array[i], searchValue)) {
            return i;
        }
    }
    
    return -1;
}

function $reverseArray(array) {
    array = evaluate(array);
    if (!Array.isArray(array)) return null;
    return [...array].reverse();
}

// Accumulator operators that can also be used as expressions
function $avg(array) {
    array = evaluate(array);
    if (!Array.isArray(array)) return null;
    
    const numbers = array.filter(val => typeof val === 'number' && !isNaN(val));
    if (numbers.length === 0) return null;
    
    const sum = numbers.reduce((total, val) => total + val, 0);
    return sum / numbers.length;
}

function $sum(array) {
    array = evaluate(array);
    if (!Array.isArray(array)) return null;
    
    const numbers = array.filter(val => typeof val === 'number' && !isNaN(val));
    return numbers.reduce((total, val) => total + val, 0);
}

function $min(array) {
    array = evaluate(array);
    if (!Array.isArray(array)) return null;
    
    const numbers = array.filter(val => typeof val === 'number' && !isNaN(val));
    if (numbers.length === 0) return null;
    
    return Math.min(...numbers);
}

function $max(array) {
    array = evaluate(array);
    if (!Array.isArray(array)) return null;
    
    const numbers = array.filter(val => typeof val === 'number' && !isNaN(val));
    if (numbers.length === 0) return null;
    
    return Math.max(...numbers);
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
    $abs,
    $ceil,
    $floor,
    $round,
    $sqrt,
    $pow,
    
    // String
    $concat,
    $substr,
    $toLower,
    $toUpper,
    $split,
    $strLen,
    $trim,
    $ltrim,
    $rtrim,
    
    // Array
    $size,
    $arrayElemAt,
    $filter,
    $map,
    $slice,
    $concatArrays,
    $in,
    $indexOfArray,
    $reverseArray,
    
    // Accumulator expressions
    $avg,
    $sum,
    $min,
    $max,
    
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