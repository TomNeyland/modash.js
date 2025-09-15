#!/usr/bin/env node

import Modash from '../../src/index.ts';

console.log('Testing simple $unwind...');

const documents = [
  { _id: 1, items: ['a', 'b', 'c'] },
  { _id: 2, items: ['d', 'e'] }
];

console.log('Input:', documents);

const result = Modash.aggregate(documents, [
  { $unwind: '$items' }
]);

console.log('Output:', result);
console.log('Length:', result.length);

console.log('\nTesting edge cases...');

const edgeDocuments = [
  { _id: 1, tags: 'not_an_array' },  // Non-array value
  { _id: 2, tags: [] },              // Empty array
  { _id: 3, tags: null },            // Null value
  { _id: 4 },                        // Missing field
  { _id: 5, tags: [null, undefined, 0, false, ''] }  // Array with falsy values
];

console.log('Edge Input:', edgeDocuments);

const edgeResult = Modash.aggregate(edgeDocuments, [
  { $unwind: '$tags' }
]);

console.log('Edge Output:', edgeResult);
console.log('Edge Length:', edgeResult.length);