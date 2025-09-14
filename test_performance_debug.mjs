#!/usr/bin/env node

import Modash from './src/modash/index.ts';
import { generateTestData } from './benchmarks/setup.js';

// Test the simple filter case
const testData = generateTestData(1000);
console.log('Testing simple filter performance...');

const simpleFilterPipeline = [
  { $match: { category: 'electronics', active: true } },
];

console.log('Test data sample:', testData[0]);
console.log('Pipeline:', simpleFilterPipeline);

// Time the operation
const start = performance.now();
const result = Modash.aggregate(testData, simpleFilterPipeline);
const end = performance.now();

console.log('Result length:', result.length);
console.log('Time taken:', (end - start).toFixed(2), 'ms');
console.log('Throughput:', (testData.length / ((end - start) / 1000) / 1000).toFixed(1), 'k docs/sec');

// Test group operation
console.log('\nTesting group performance...');

const groupPipeline = [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      avgPrice: { $avg: '$price' },
      itemCount: { $sum: 1 },
    },
  },
  { $sort: { totalRevenue: -1 } },
];

const start2 = performance.now();
const result2 = Modash.aggregate(testData, groupPipeline);
const end2 = performance.now();

console.log('Group result length:', result2.length);
console.log('Time taken:', (end2 - start2).toFixed(2), 'ms');
console.log('Throughput:', (testData.length / ((end2 - start2) / 1000) / 1000).toFixed(1), 'k docs/sec');
console.log('Sample result:', result2[0]);