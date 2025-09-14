#!/usr/bin/env node

import Modash from './src/index.ts';

console.log('Debugging empty array handling...');

const documents = [
  { _id: 4, values: [] },                        // Empty array
  { _id: 5, values: null }                       // Null
];

console.log('Input:');
documents.forEach(doc => {
  console.log(`  _id: ${doc._id}, values:`, doc.values, `isArray: ${Array.isArray(doc.values)}, length: ${doc.values?.length}`);
});

const result = Modash.aggregate(documents, [
  { $unwind: '$values' }
]);

console.log('\nOutput:');
result.forEach(doc => {
  console.log(`  _id: ${doc._id}, values:`, doc.values);
});

console.log('\nExpected: empty result array (both should be skipped)');