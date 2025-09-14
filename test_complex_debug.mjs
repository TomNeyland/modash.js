#!/usr/bin/env node

import Modash from './src/modash/index.ts';
import { generateTestData } from './benchmarks/setup.js';
import { canUseFastProject } from './src/modash/fast-project.ts';
import { canUseFastGroup } from './src/modash/fast-group.ts';

// Test the complex pipeline components
const testData = generateTestData(100);
console.log('Testing complex pipeline components...');

// Test the individual stages
const complexPipeline = [
  { $match: { active: true, quantity: { $gt: 0 } } },
  {
    $project: {
      item: 1,
      category: 1,
      revenue: { $multiply: ['$price', '$quantity'] },
      isPremium: { $gte: ['$price', 200] },
      month: { $month: '$date' },
    },
  },
  {
    $group: {
      _id: { category: '$category', month: '$month' },
      totalRevenue: { $sum: '$revenue' },
    },
  },
  { $sort: { totalRevenue: -1 } },
  { $limit: 10 },
];

console.log('Pipeline stages:');
complexPipeline.forEach((stage, index) => {
  console.log(`${index + 1}. ${Object.keys(stage)[0]}`);
});

// Check if individual stages can use fast implementations
const projectStage = complexPipeline[1].$project;
const groupStage = complexPipeline[2].$group;

console.log('\nOptimization analysis:');
console.log('Can use fast project:', canUseFastProject(projectStage));
console.log('Can use fast group:', canUseFastGroup(groupStage));

// Test the project stage expressions
console.log('\nProject stage expressions:');
Object.entries(projectStage).forEach(([field, expr]) => {
  console.log(`${field}:`, JSON.stringify(expr));
});

// Run the pipeline
console.log('\nRunning pipeline...');
const start = performance.now();
const result = Modash.aggregate(testData, complexPipeline);
const end = performance.now();

console.log('Result length:', result.length);
console.log('Time taken:', (end - start).toFixed(2), 'ms');
console.log('Sample result:', result[0]);