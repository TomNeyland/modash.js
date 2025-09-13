import { size, keys, map, first, last, uniq } from 'lodash-es';
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
  $addToSet,
};

function isAccumulatorExpression(expression) {
  return size(expression) === 1 && keys(expression)[0] in ACCUMULATORS;
}

/**
 * Accumulators for aggregation operations
 */

function $accumulate(collection, operatorExpression) {
  if (isAccumulatorExpression(operatorExpression)) {
    const [operator] = keys(operatorExpression);
    const args = operatorExpression[operator];
    const accumulatorFunction = ACCUMULATORS[operator];

    return accumulatorFunction(collection, args);
  }
}

function $sum(collection, spec) {
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

function $avg(collection, spec) {
  const totalSum = $sum(collection, spec);
  const count = size(collection);
  return count > 0 ? totalSum / count : 0;
}

function $first(collection, spec) {
  return $expression(first(collection), spec);
}

function $last(collection, spec) {
  return $expression(last(collection), spec);
}

function $max(collection, spec) {
  let maxValue = -Infinity;
  for (const obj of collection) {
    const value = $expression(obj, spec);
    if (typeof value === 'number' && value > maxValue) {
      maxValue = value;
    }
  }
  return maxValue === -Infinity ? undefined : maxValue;
}

function $min(collection, spec) {
  let minValue = Infinity;
  for (const obj of collection) {
    const value = $expression(obj, spec);
    if (typeof value === 'number' && value < minValue) {
      minValue = value;
    }
  }
  return minValue === Infinity ? undefined : minValue;
}

function $push(collection, spec) {
  return map(collection, obj => $expression(obj, spec));
}

function $addToSet(collection, spec) {
  const values = $push(collection, spec);
  return uniq(values.map(obj => JSON.stringify(obj))).map(str =>
    JSON.parse(str)
  );
}

export { $accumulate };
export default ACCUMULATORS;
