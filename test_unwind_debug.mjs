import Modash from './src/index.ts';

const testDoc = [
  { _id: 1, tags: ['red', 'blue'], name: 'item1' },
  { _id: 2, tags: ['green'], name: 'item2' },
];

console.log('Input documents:', JSON.stringify(testDoc, null, 2));

const result = Modash.aggregate(testDoc, [{ $unwind: '$tags' }]);

console.log('Result length:', result.length);
console.log('Result:', JSON.stringify(result, null, 2));

// Expected:
// - { _id: 1, tags: 'red', name: 'item1' }
// - { _id: 1, tags: 'blue', name: 'item1' }
// - { _id: 2, tags: 'green', name: 'item2' }
