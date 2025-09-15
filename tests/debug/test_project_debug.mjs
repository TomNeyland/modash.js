import Modash from '../../src/modash/index.ts';

// Test the exact failing case
const data = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
  { _id: 3, name: 'Charlie', score: 90 },
];

const pipeline = [
  {
    $project: {
      displayName: { $toUpper: '$name' },
      passed: { $gte: ['$score', 90] },
    },
  },
  { $limit: 2 },
];

console.log('\n📋 Testing projection pipeline:');
const result = Modash.aggregate(data, pipeline);
console.log('Result:', JSON.stringify(result, null, 2));

// Test without $limit too
const pipelineNoLimit = [
  {
    $project: {
      displayName: { $toUpper: '$name' },
      passed: { $gte: ['$score', 90] },
    },
  },
];

console.log('\n📋 Testing projection without limit:');
const resultNoLimit = Modash.aggregate(data, pipelineNoLimit);
console.log('Result:', JSON.stringify(resultNoLimit, null, 2));