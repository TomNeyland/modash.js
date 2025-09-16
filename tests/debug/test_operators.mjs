import Aggo from '../../src/aggo/index';

// Test $toUpper and $toLower
const data = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
  { _id: 3, name: 'Charlie', score: 90 },
];

console.log('\n📋 Testing $toUpper:');
const upperResult = Aggo.aggregate(data, [
  {
    $project: {
      displayName: { $toUpper: '$name' },
      passed: { $gte: ['$score', 90] },
    },
  },
  { $limit: 2 },
]);
console.log('Result:', upperResult);

console.log('\n📋 Testing $toLower:');
const lowerResult = Aggo.aggregate(data, [
  {
    $project: {
      displayName: { $toLower: '$name' },
      grade: { $cond: [{ $gte: ['$score', 90] }, 'A', 'B'] },
    },
  },
  { $skip: 1 },
]);
console.log('Result:', lowerResult);