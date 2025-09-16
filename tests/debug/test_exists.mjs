import Aggo from '../../src/index';

const testData = [
  { _id: 1, name: 'Alice', tags: ['a', 'b'] },
  { _id: 2, name: 'Bob', tags: [] },
  { _id: 3, name: 'Charlie' },
  { _id: 4, name: 'Dave', tags: null },
];

console.log('Test data:', JSON.stringify(testData, null, 2));

const result = Aggo.aggregate(testData, [
  { $match: { tags: { $exists: true } } }
]);

console.log('\nResult for $exists: true');
console.log('Count:', result.length);
console.log('Result:', JSON.stringify(result, null, 2));