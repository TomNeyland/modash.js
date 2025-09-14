import { createCrossfilterEngine } from './src/modash/crossfilter-engine.ts';

const testData = [
  { _id: 1, name: 'Alice', tags: ['a'], extra: 'x' },
  { _id: 2, name: 'Bob', tags: ['b'], extra: 'y' },
];

const pipeline = [
  { $project: { name: 1 } },
];

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

console.log('--- Testing projection ---');
console.log('Input docs:', testData);

// Add some debug to understand what's happening
const operators = engine._operators;
console.log('Number of operators created:', operators?.length);

const result = engine.execute(pipeline);

console.log('\nExpected: Documents with only _id and name fields');
console.log('Actual results:', result);

// Check if projection worked
const hasOnlyExpectedFields = result.every(doc => {
  const keys = Object.keys(doc);
  return keys.length === 2 && keys.includes('_id') && keys.includes('name');
});

console.log('\nProjection worked correctly:', hasOnlyExpectedFields);

if (!hasOnlyExpectedFields && result[0]) {
  console.log('ERROR: Documents have extra fields:', Object.keys(result[0]));
  console.log('Full first doc:', result[0]);
}