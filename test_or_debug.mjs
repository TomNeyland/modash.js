import Modash from './src/index.ts';

const testData = [
  {
    _id: 1,
    name: 'Alice',
    age: 30,
    tags: ['developer', 'senior'],
    scores: [85, 90, 88],
  },
  { _id: 2, name: 'Bob', age: 25, tags: ['designer'], scores: [92, 87] },
  {
    _id: 3,
    name: 'Charlie',
    age: 35,
    tags: ['developer', 'lead'],
    scores: [78, 85, 82, 90],
  },
  { _id: 4, name: 'David', age: 28, skills: null, scores: [88] },
];

console.log('Input data:');
console.log(JSON.stringify(testData, null, 2));

console.log('\n=== $or test ===');
const result = Modash.aggregate(testData, [
  { $match: { $or: [{ age: { $lt: 26 } }, { name: 'Alice' }] } },
]);

console.log('Result length:', result.length);
console.log('Result:');
console.log(JSON.stringify(result, null, 2));

console.log('\nResult names:', result.map(r => r.name));

// Expected: Alice (age 30, name=Alice matches) and Bob (age 25 < 26)
