#!/usr/bin/env node

import Modash from './src/index.ts';

console.log('Testing with forced standard aggregation path...');

const documents = [
  { _id: 4, values: [] },                        // Empty array
  { _id: 5, values: null }                       // Null
];

// Force standard aggregation by using a complex pipeline that can't be optimized
const result = Modash.aggregate(documents, [
  { $unwind: '$values' },
  { $project: { _id: 1, values: 1 } }  // This should prevent hot path optimization
]);

console.log('Result:', result);
console.log('Length:', result.length);