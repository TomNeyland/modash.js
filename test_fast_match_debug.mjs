#!/usr/bin/env node

import { fastMatch } from './src/modash/fast-match.ts';
import { generateTestData } from './benchmarks/setup.js';

console.log('Testing fast match directly...');

const testData = generateTestData(1000);
const query = { category: 'electronics', active: true };

console.log('Test data length:', testData.length);
console.log('Query:', query);

// Time the fast match operation
const start = performance.now();
const result = fastMatch(testData, query);
const end = performance.now();

console.log('Result length:', result.length);
console.log('Time taken:', (end - start).toFixed(2), 'ms');
console.log('Throughput:', (testData.length / ((end - start) / 1000) / 1000).toFixed(1), 'k docs/sec');

// Test with a larger dataset
console.log('\nTesting with 10k documents...');

const largeTestData = generateTestData(10000);

const start2 = performance.now();
const result2 = fastMatch(largeTestData, query);
const end2 = performance.now();

console.log('Result length:', result2.length);
console.log('Time taken:', (end2 - start2).toFixed(2), 'ms');
console.log('Throughput:', (largeTestData.length / ((end2 - start2) / 1000) / 1000).toFixed(1), 'k docs/sec');