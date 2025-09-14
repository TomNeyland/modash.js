// No lodash imports needed - using native JavaScript
import {
  $expression,
  type Collection,
  type DocumentValue,
} from './expressions';

// Import complex types from main index for now
import type { Expression, AccumulatorExpression } from '../index';

// Local type definitions for accumulator functions
type AccumulatorFunction = (
  collection: Collection,
  spec: Expression
) => DocumentValue;
type AccumulatorOperatorObject =
  | AccumulatorExpression
  | { [key: string]: Expression };

const ACCUMULATORS: Record<string, AccumulatorFunction> = {
  $accumulate,
  $sum,
  $avg,
  $first,
  $last,
  $min,
  $max,
  $push,
  $addToSet,
};

function isAccumulatorExpression(
  expression: AccumulatorOperatorObject
): expression is AccumulatorExpression {
  const expressionKeys = Object.keys(expression);
  return (
    typeof expression === 'object' &&
    expression !== null &&
    expressionKeys.length === 1 &&
    expressionKeys[0]! in ACCUMULATORS
  );
}

/**
 * Accumulators for aggregation operations
 */

function $accumulate(
  collection: Collection,
  operatorExpression: Expression
): DocumentValue {
  if (isAccumulatorExpression(operatorExpression)) {
    const [operator] = Object.keys(operatorExpression);
    const args = operatorExpression[operator as keyof AccumulatorExpression];
    const accumulatorFunction = ACCUMULATORS[operator!];

    if (!accumulatorFunction) {
      throw new Error(`Unknown accumulator: ${operator}`);
    }

    return accumulatorFunction(collection, args);
  }

  throw new Error('Invalid accumulator expression');
}

function $sum(collection: Collection, spec: Expression): number {
  if (spec === 1) {
    return collection.length;
  }

  // Calculate sum manually to handle expressions properly
  let total = 0;
  for (const obj of collection) {
    // C) $$ROOT resolution: Pass obj as both current document and root
    const value = $expression(obj, spec, obj);
    if (typeof value === 'number' && !isNaN(value)) {
      total += value;
    }
  }
  return total;
}

function $avg(collection: Collection, spec: Expression): number {
  const totalSum = $sum(collection, spec);
  const count = collection.length;
  return count > 0 ? totalSum / count : 0;
}

function $first(collection: Collection, spec: Expression): DocumentValue {
  const firstDoc = collection[0];
  // C) $$ROOT resolution: Pass firstDoc as both current document and root
  return firstDoc ? $expression(firstDoc, spec, firstDoc) : null;
}

function $last(collection: Collection, spec: Expression): DocumentValue {
  const lastDoc = collection[collection.length - 1];
  // C) $$ROOT resolution: Pass lastDoc as both current document and root
  return lastDoc ? $expression(lastDoc, spec, lastDoc) : null;
}

function $max(collection: Collection, spec: Expression): number | null {
  let maxValue = -Infinity;
  for (const obj of collection) {
    // C) $$ROOT resolution: Pass obj as both current document and root
    const value = $expression(obj, spec, obj);
    if (typeof value === 'number' && value > maxValue) {
      maxValue = value;
    }
  }
  return maxValue === -Infinity ? null : maxValue;
}

function $min(collection: Collection, spec: Expression): number | null {
  let minValue = Infinity;
  for (const obj of collection) {
    // C) $$ROOT resolution: Pass obj as both current document and root
    const value = $expression(obj, spec, obj);
    if (typeof value === 'number' && value < minValue) {
      minValue = value;
    }
  }
  return minValue === Infinity ? null : minValue;
}

function $push(collection: Collection, spec: Expression): DocumentValue[] {
  // C) $$ROOT resolution: Pass each obj as both current document and root
  return collection.map(obj => $expression(obj, spec, obj));
}

function $addToSet(collection: Collection, spec: Expression): DocumentValue[] {
  const values = $push(collection, spec);
  return [...new Set(values.map(obj => JSON.stringify(obj)))].map(str =>
    JSON.parse(str)
  );
}

export { $accumulate };
export default ACCUMULATORS;
