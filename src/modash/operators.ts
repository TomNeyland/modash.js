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
  isFunction,
} from 'lodash-es';

// Import basic types from expressions module
import type { Document, DocumentValue } from './expressions.js';

// Import complex types from main index for now
import type { Expression } from '../index.js';

/**
 * Modern MongoDB Expression Operators for TypeScript
 */

type EvaluatableValue = (() => DocumentValue) | DocumentValue;

// Type for the expression evaluation function to avoid circular dependencies
type ExpressionEvaluator = (
  obj: Document,
  expression: Expression,
  root?: Document
) => DocumentValue;

// Type for operator functions
type OperatorFunction = (
  ...args: EvaluatableValue[]
) => DocumentValue | boolean | number;

// Types for array operators with special input formats
interface FilterInput {
  input: EvaluatableValue;
  cond: Expression;
  as?: string;
}

interface MapInput {
  input: EvaluatableValue;
  in: Expression;
  as?: string;
}

function evaluate(val: EvaluatableValue): DocumentValue {
  return isFunction(val) ? (val as () => DocumentValue)() : val;
}

// Boolean Operators
function $and(...values: EvaluatableValue[]): boolean {
  return values.every(val => Boolean(evaluate(val)));
}

function $or(...values: EvaluatableValue[]): boolean {
  return values.some(val => Boolean(evaluate(val)));
}

function $not(...values: EvaluatableValue[]): boolean {
  return !some(values, evaluate);
}

// Set Operators
function $asSet(array: DocumentValue[]): DocumentValue[] {
  if (!Array.isArray(array)) return [];
  return uniq(array.map(evaluate)).sort();
}

function $setEquals(...arrays: EvaluatableValue[]): boolean {
  const sets = arrays.map(evaluate).map(arr => $asSet(arr as DocumentValue[]));
  const [firstSet] = sets;
  return every(sets, set => isEqual(firstSet, set));
}

function $setIntersection(...arrays: EvaluatableValue[]): DocumentValue[] {
  return $asSet(
    intersection(...arrays.map(arr => evaluate(arr) as DocumentValue[]))
  );
}

function $setUnion(...arrays: EvaluatableValue[]): DocumentValue[] {
  return union(
    ...arrays.map(evaluate).map(arr => $asSet(arr as DocumentValue[]))
  );
}

function $setDifference(...arrays: EvaluatableValue[]): DocumentValue[] {
  const evaluatedArrays = arrays
    .map(evaluate)
    .map(arr => $asSet(arr as DocumentValue[]));
  return difference(evaluatedArrays[0], ...evaluatedArrays.slice(1));
}

function $setIsSubset(
  subset: EvaluatableValue,
  superset: EvaluatableValue
): boolean {
  const sub = evaluate(subset) as DocumentValue[];
  const sup = evaluate(superset) as DocumentValue[];
  return isEqual($asSet(intersection(sub, sup)), $asSet(sub));
}

function $anyElementTrue(values: EvaluatableValue): boolean {
  const vals = evaluate(values);
  if (!isArray(vals)) {
    return false; // Return false instead of throwing for undefined
  }
  return $or(...(vals as DocumentValue[]));
}

function $allElementsTrue(values: EvaluatableValue): boolean {
  const vals = evaluate(values);
  if (!isArray(vals)) {
    return false; // Return false instead of throwing for undefined
  }
  return $and(...(vals as DocumentValue[]));
}

// Comparison Operators
function $cmp(value1: EvaluatableValue, value2: EvaluatableValue): number {
  const val1 = evaluate(value1);
  const val2 = evaluate(value2);

  if (isArray(val1) && isArray(val2)) {
    return 0;
  }

  if (val1 === null && val2 === null) {
    return 0;
  }
  if (val1 === null) {
    return -1;
  }
  if (val2 === null) {
    return 1;
  }

  if (val1 < val2) return -1;
  if (val1 > val2) return 1;
  return 0;
}

function $eq(value1: EvaluatableValue, value2: EvaluatableValue): boolean {
  return isEqual(evaluate(value1), evaluate(value2));
}

function $gt(value1: EvaluatableValue, value2: EvaluatableValue): boolean {
  const val1 = evaluate(value1);
  const val2 = evaluate(value2);

  if (isArray(val2) && !isArray(val1)) return false;
  if (isArray(val1) && !isArray(val2)) return true;
  return gt(val1 as any, val2 as any);
}

function $gte(value1: EvaluatableValue, value2: EvaluatableValue): boolean {
  const val1 = evaluate(value1);
  const val2 = evaluate(value2);

  if (isArray(val2) && !isArray(val1)) return false;
  if (isArray(val1) && !isArray(val2)) return true;
  return gte(val1 as any, val2 as any);
}

function $lt(value1: EvaluatableValue, value2: EvaluatableValue): boolean {
  const val1 = evaluate(value1);
  const val2 = evaluate(value2);

  if (isArray(val2) && !isArray(val1)) return true;
  if (isArray(val1) && !isArray(val2)) return false;
  return lt(val1 as any, val2 as any);
}

function $lte(value1: EvaluatableValue, value2: EvaluatableValue): boolean {
  const val1 = evaluate(value1);
  const val2 = evaluate(value2);

  if (isArray(val2) && !isArray(val1)) return true;
  if (isArray(val1) && !isArray(val2)) return false;
  return lte(val1 as any, val2 as any);
}

function $ne(value1: EvaluatableValue, value2: EvaluatableValue): boolean {
  return !$eq(value1, value2);
}

// Arithmetic Operators
function $add(...values: EvaluatableValue[]): number | Date {
  const evaluatedValues = values.map(evaluate);
  let result = evaluatedValues.shift() as number | Date;
  let resultAsDate = false;

  if (isDate(result)) {
    resultAsDate = true;
    result = (result as Date).getTime();
  }

  for (let i = evaluatedValues.length - 1; i >= 0; i--) {
    let value = evaluatedValues[i] as number | Date;
    if (isDate(value)) {
      resultAsDate = true;
      value = (value as Date).getTime();
    }
    (result as number) += value as number;
  }

  return resultAsDate ? new Date(result as number) : result;
}

function $subtract(
  value1: EvaluatableValue,
  value2: EvaluatableValue
): number | Date {
  const val1 = evaluate(value1) as number | Date;
  const val2 = evaluate(value2) as number | Date;

  if (isDate(val1) && isDate(val2)) {
    return (val1 as Date).getTime() - (val2 as Date).getTime();
  } else if (isDate(val1) && !isDate(val2)) {
    return new Date((val1 as Date).getTime() - (val2 as number));
  } else if (!isDate(val1) && isDate(val2)) {
    return new Date((val1 as number) - (val2 as Date).getTime());
  }
  return (val1 as number) - (val2 as number);
}

function $multiply(...values: EvaluatableValue[]): number {
  return values
    .map(evaluate)
    .reduce((product: number, n) => product * (n as number), 1);
}

function $divide(value1: EvaluatableValue, value2: EvaluatableValue): number {
  return (evaluate(value1) as number) / (evaluate(value2) as number);
}

function $mod(value1: EvaluatableValue, value2: EvaluatableValue): number {
  return (evaluate(value1) as number) % (evaluate(value2) as number);
}

// Additional Math Operators
function $abs(value: EvaluatableValue): number {
  return Math.abs(evaluate(value) as number);
}

function $ceil(value: EvaluatableValue): number {
  return Math.ceil(evaluate(value) as number);
}

function $floor(value: EvaluatableValue): number {
  return Math.floor(evaluate(value) as number);
}

function $round(value: EvaluatableValue, place?: EvaluatableValue): number {
  const val = evaluate(value) as number;
  const p = place !== undefined ? (evaluate(place) as number) : 0;
  const factor = Math.pow(10, p);
  return Math.round(val * factor) / factor;
}

function $sqrt(value: EvaluatableValue): number {
  return Math.sqrt(evaluate(value) as number);
}

function $pow(base: EvaluatableValue, exponent: EvaluatableValue): number {
  return Math.pow(evaluate(base) as number, evaluate(exponent) as number);
}

// String Operators
function $concat(...expressions: EvaluatableValue[]): string {
  return expressions.map(evaluate).join('');
}

function $substr(
  string: EvaluatableValue,
  start: EvaluatableValue,
  len: EvaluatableValue
): string {
  const str = evaluate(string) as string;
  const startPos = evaluate(start) as number;
  const length = evaluate(len) as number;
  return str.slice(startPos, startPos + length);
}

function $toLower(string: EvaluatableValue): string {
  return (evaluate(string) as string).toLowerCase();
}

function $toUpper(string: EvaluatableValue): string {
  return (evaluate(string) as string).toUpperCase();
}

// Additional String Operators
function $split(
  string: EvaluatableValue,
  delimiter: EvaluatableValue
): string[] {
  const str = evaluate(string) as string;
  const delim = evaluate(delimiter) as string;
  return str.split(delim);
}

function $strLen(string: EvaluatableValue): number {
  const str = evaluate(string);
  return str !== null ? (str as string).length : 0;
}

function $trim(string: EvaluatableValue, chars?: EvaluatableValue): string {
  const str = evaluate(string) as string;
  if (!str) return '';

  const c = chars !== undefined ? (evaluate(chars) as string) : ' ';

  if (c === ' ') {
    return str.trim();
  }

  // Manual trimming for custom characters
  const charsArray = c.split('');
  let start = 0;
  let end = str.length;

  while (start < end && charsArray.includes(str[start]!)) start++;
  while (end > start && charsArray.includes(str[end - 1]!)) end--;

  return str.slice(start, end);
}

function $ltrim(string: EvaluatableValue, chars?: EvaluatableValue): string {
  const str = evaluate(string) as string;
  const c = chars !== undefined ? (evaluate(chars) as string) : ' ';

  if (c === ' ') {
    return str.replace(/^\s+/, '');
  }

  const charsArray = c.split('');
  let start = 0;
  while (start < str.length && charsArray.includes(str[start]!)) start++;
  return str.slice(start);
}

function $rtrim(string: EvaluatableValue, chars?: EvaluatableValue): string {
  const str = evaluate(string) as string;
  const c = chars !== undefined ? (evaluate(chars) as string) : ' ';

  if (c === ' ') {
    return str.replace(/\s+$/, '');
  }

  const charsArray = c.split('');
  let end = str.length;
  while (end > 0 && charsArray.includes(str[end - 1]!)) end--;
  return str.slice(0, end);
}

// Array Operators
function $size(collection: EvaluatableValue): number {
  const val = evaluate(collection);
  if (typeof val === 'string' || Array.isArray(val)) {
    return size(val);
  }
  return 0;
}

function $arrayElemAt(
  array: EvaluatableValue,
  index: EvaluatableValue
): DocumentValue {
  const arr = evaluate(array) as DocumentValue[];
  let idx = evaluate(index) as number;
  if (!Array.isArray(arr)) return null;

  // Handle negative indices
  if (idx < 0) {
    idx = arr.length + idx;
  }

  return idx >= 0 && idx < arr.length ? arr[idx]! : null;
}

// We need to handle $expression import to avoid circular dependency
// This will be set by the expressions module when it's loaded
let _$expression: ExpressionEvaluator | null = null;

export function set$expression(fn: ExpressionEvaluator) {
  _$expression = fn;
}

function getExpressionFunction(): ExpressionEvaluator {
  if (!_$expression) {
    throw new Error('$expression function not initialized');
  }
  return _$expression;
}

function $filter(input: FilterInput): DocumentValue[] | null {
  const { input: array, cond, as = 'this' } = input;
  const evaluatedArray = evaluate(array);

  if (!Array.isArray(evaluatedArray)) return null;

  const $expression = getExpressionFunction();

  return evaluatedArray.filter(item => {
    // Create temporary context with the array element
    const tempDoc = { [as]: item };
    return Boolean($expression(tempDoc, cond));
  });
}

function $map(input: MapInput): DocumentValue[] | null {
  const { input: array, in: expression, as = 'this' } = input;
  const evaluatedArray = evaluate(array);

  if (!Array.isArray(evaluatedArray)) return null;

  const $expression = getExpressionFunction();

  return evaluatedArray.map(item => {
    // Create temporary context with the array element
    const tempDoc = { [as]: item };
    return $expression(tempDoc, expression);
  });
}

function $slice(
  array: EvaluatableValue,
  position: EvaluatableValue,
  n?: EvaluatableValue
): DocumentValue[] | null {
  const arr = evaluate(array) as DocumentValue[];
  let pos = evaluate(position) as number;

  if (!Array.isArray(arr)) return null;

  if (n === undefined) {
    // $slice: [array, n] format - take n elements from start or end
    const count = pos;
    if (count >= 0) {
      // Take first 'count' elements
      return arr.slice(0, count);
    } else {
      // Take last 'count' elements
      return arr.slice(count);
    }
  } else {
    // $slice: [array, start, count] format
    const count = evaluate(n) as number;
    if (pos < 0) {
      pos = Math.max(0, arr.length + pos);
    }
    return arr.slice(pos, pos + count);
  }
}

function $concatArrays(...arrays: EvaluatableValue[]): DocumentValue[] | null {
  const evaluatedArrays = arrays.map(evaluate);

  // Check all inputs are arrays
  for (const arr of evaluatedArrays) {
    if (!Array.isArray(arr)) return null;
  }

  return ([] as DocumentValue[]).concat(
    ...(evaluatedArrays as DocumentValue[][])
  );
}

function $in(value: EvaluatableValue, array: EvaluatableValue): boolean {
  const val = evaluate(value);
  const arr = evaluate(array) as DocumentValue[];

  if (!Array.isArray(arr)) return false;
  return arr.includes(val);
}

function $indexOfArray(
  array: EvaluatableValue,
  searchValue: EvaluatableValue,
  start?: EvaluatableValue,
  end?: EvaluatableValue
): number | null {
  const arr = evaluate(array) as DocumentValue[];
  const searchVal = evaluate(searchValue);
  const startPos = start !== undefined ? (evaluate(start) as number) : 0;
  const endPos = end !== undefined ? (evaluate(end) as number) : arr.length;

  if (!Array.isArray(arr)) return null;

  for (let i = startPos; i < Math.min(endPos, arr.length); i++) {
    if (isEqual(arr[i], searchVal)) {
      return i;
    }
  }

  return -1;
}

function $reverseArray(array: EvaluatableValue): DocumentValue[] | null {
  const arr = evaluate(array) as DocumentValue[];
  if (!Array.isArray(arr)) return null;
  return [...arr].reverse();
}

// Accumulator operators that can also be used as expressions
function $avg(array: EvaluatableValue): number | null {
  const arr = evaluate(array) as DocumentValue[];
  if (!Array.isArray(arr)) return null;

  const numbers = arr.filter(
    val => typeof val === 'number' && !isNaN(val)
  ) as number[];
  if (numbers.length === 0) return null;

  const sum = numbers.reduce((total, val) => total + val, 0);
  return sum / numbers.length;
}

function $sum(array: EvaluatableValue): number | null {
  const arr = evaluate(array) as DocumentValue[];
  if (!Array.isArray(arr)) return null;

  const numbers = arr.filter(
    val => typeof val === 'number' && !isNaN(val)
  ) as number[];
  return numbers.reduce((total, val) => total + val, 0);
}

function $min(array: EvaluatableValue): number | null {
  const arr = evaluate(array) as DocumentValue[];
  if (!Array.isArray(arr)) return null;

  const numbers = arr.filter(
    val => typeof val === 'number' && !isNaN(val)
  ) as number[];
  if (numbers.length === 0) return null;

  return Math.min(...numbers);
}

function $max(array: EvaluatableValue): number | null {
  const arr = evaluate(array) as DocumentValue[];
  if (!Array.isArray(arr)) return null;

  const numbers = arr.filter(
    val => typeof val === 'number' && !isNaN(val)
  ) as number[];
  if (numbers.length === 0) return null;

  return Math.max(...numbers);
}

// Date Operators
function $dayOfYear(date: EvaluatableValue): number {
  const d = evaluate(date) as Date;
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function $dayOfMonth(date: EvaluatableValue): number | null {
  const d = evaluate(date) as Date;
  return d ? d.getDate() : null;
}

function $dayOfWeek(date: EvaluatableValue): number | null {
  const d = evaluate(date) as Date;
  return d ? d.getDay() : null;
}

function $year(date: EvaluatableValue): number | null {
  const d = evaluate(date) as Date;
  return d ? d.getFullYear() : null;
}

function $month(date: EvaluatableValue): number | null {
  const d = evaluate(date) as Date;
  return d ? d.getMonth() + 1 : null;
}

function $week(date: EvaluatableValue): number {
  const d = evaluate(date) as Date;
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
  return 1 + Math.ceil(dayDiff / 7);
}

function $hour(date: EvaluatableValue): number {
  return (evaluate(date) as Date).getHours();
}

function $minute(date: EvaluatableValue): number {
  return (evaluate(date) as Date).getMinutes();
}

function $second(date: EvaluatableValue): number {
  return (evaluate(date) as Date).getSeconds();
}

function $millisecond(date: EvaluatableValue): number {
  return (evaluate(date) as Date).getMilliseconds();
}

// Conditional Operators
function $cond(
  isTrue: EvaluatableValue,
  thenValue: EvaluatableValue,
  elseValue: EvaluatableValue
): DocumentValue {
  return evaluate(isTrue) ? evaluate(thenValue) : evaluate(elseValue);
}

function $ifNull(
  value: EvaluatableValue,
  defaultValue: EvaluatableValue
): DocumentValue {
  const val = evaluate(value);
  return val !== null ? val : evaluate(defaultValue);
}

const EXPRESSION_OPERATORS: Record<string, OperatorFunction> = {
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
  $ifNull,
};

export default EXPRESSION_OPERATORS;
