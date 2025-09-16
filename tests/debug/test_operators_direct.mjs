import EXPRESSION_OPERATORS from '../../src/aggo/operators';
import { $expressionObject, $expression } from '../../src/aggo/expressions';

console.log('\n📋 Testing EXPRESSION_OPERATORS:');
console.log('Has $toUpper?', '$toUpper' in EXPRESSION_OPERATORS);
console.log('Has $toLower?', '$toLower' in EXPRESSION_OPERATORS);

// Test the operators directly
const toUpperFn = EXPRESSION_OPERATORS.$toUpper;
const toLowerFn = EXPRESSION_OPERATORS.$toLower;

console.log('\n📋 Testing operator functions directly:');
console.log('toUpper("alice"):', toUpperFn(() => 'alice'));
console.log('toLower("BOB"):', toLowerFn(() => 'BOB'));

// Test through $expression
const testDoc = { name: 'Alice', score: 95 };

console.log('\n📋 Testing through $expression:');
const upperResult = $expression(testDoc, { $toUpper: '$name' });
console.log('$toUpper result:', upperResult);

const lowerResult = $expression(testDoc, { $toLower: '$name' });
console.log('$toLower result:', lowerResult);

// Test through $expressionObject
console.log('\n📋 Testing through $expressionObject:');
const projectedDoc = $expressionObject(testDoc, {
  displayName: { $toUpper: '$name' },
  passed: { $gte: ['$score', 90] }
});
console.log('Projected doc:', projectedDoc);