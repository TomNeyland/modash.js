#!/usr/bin/env node

import Modash from './src/index.ts';

console.log('Testing mixed array sizes...');

const documents = [
  { _id: 1, values: [1, 2] },                    // 2 elements
  { _id: 2, values: [3, 4, 5, 6] },             // 4 elements
  { _id: 3, values: [7, 8, 9, 10, 11, 12, 13, 14] }, // 8 elements
  { _id: 4, values: [] },                        // Empty array (should be skipped)
  { _id: 5, values: null }                       // Null (should be skipped)
];

console.log('Input documents:', documents.length);

const result = Modash.aggregate(documents, [
  { $unwind: '$values' }
]);

console.log('Output documents:', result.length);
console.log('Results:');
result.forEach((doc, i) => {
  console.log(`  [${i}] _id: ${doc._id}, values: ${doc.values}`);
});

// Verify all values are present
const allValues = result.map(doc => doc.values).sort((a, b) => a - b);
console.log('All values:', allValues);
console.log('Expected: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]');
console.log('Match:', JSON.stringify(allValues) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]));