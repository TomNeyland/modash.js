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
const result = engine.execute(pipeline);

console.log('Expected: Documents with only _id and name fields');
console.log('Actual results:', result);

// Check if projection worked
const hasOnlyExpectedFields = result.every(doc => {
  const keys = Object.keys(doc);
  return keys.length === 2 && keys.includes('_id') && keys.includes('name');
});

console.log('Projection worked correctly:', hasOnlyExpectedFields);

if (!hasOnlyExpectedFields) {
  console.log('ERROR: Documents have extra fields:', result[0] ? Object.keys(result[0]) : 'no results');
}