import { size, keys, map, first, last, uniq } from 'lodash-es';
import { $expression } from './expressions.js';
import type { Collection, Document, Expression, DocumentValue, AccumulatorExpression } from '../index.js';

const ACCUMULATORS: Record<string, (collection: Collection, spec: Expression) => any> = {
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

function isAccumulatorExpression(expression: unknown): expression is AccumulatorExpression {
  return typeof expression === 'object' && 
         expression !== null && 
         size(expression) === 1 && 
         keys(expression)[0]! in ACCUMULATORS;
}

/**
 * Accumulators for aggregation operations
 */

function $accumulate(collection: Collection, operatorExpression: Expression): DocumentValue {
  if (isAccumulatorExpression(operatorExpression)) {
    const [operator] = keys(operatorExpression);
    const args = (operatorExpression as any)[operator!];
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
    return size(collection);
  }

  // Calculate sum manually to handle expressions properly
  let total = 0;
  for (const obj of collection) {
    const value = $expression(obj, spec);
    if (typeof value === 'number' && !isNaN(value)) {
      total += value;
    }
  }
  return total;
}

function $avg(collection: Collection, spec: Expression): number {
  const totalSum = $sum(collection, spec);
  const count = size(collection);
  return count > 0 ? totalSum / count : 0;
}

function $first(collection: Collection, spec: Expression): DocumentValue {
  const firstDoc = first(collection);
  return firstDoc ? $expression(firstDoc, spec) : null;
}

function $last(collection: Collection, spec: Expression): DocumentValue {
  const lastDoc = last(collection);
  return lastDoc ? $expression(lastDoc, spec) : null;
}

function $max(collection: Collection, spec: Expression): number | null {
  let maxValue = -Infinity;
  for (const obj of collection) {
    const value = $expression(obj, spec);
    if (typeof value === 'number' && value > maxValue) {
      maxValue = value;
    }
  }
  return maxValue === -Infinity ? null : maxValue;
}

function $min(collection: Collection, spec: Expression): number | null {
  let minValue = Infinity;
  for (const obj of collection) {
    const value = $expression(obj, spec);
    if (typeof value === 'number' && value < minValue) {
      minValue = value;
    }
  }
  return minValue === Infinity ? null : minValue;
}

function $push(collection: Collection, spec: Expression): DocumentValue[] {
  return map(collection, obj => $expression(obj, spec));
}

function $addToSet(collection: Collection, spec: Expression): DocumentValue[] {
  const values = $push(collection, spec);
  return uniq(values.map(obj => JSON.stringify(obj))).map(str =>
    JSON.parse(str)
  );
}

export { $accumulate };
export default ACCUMULATORS;