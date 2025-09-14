import Modash from './src/modash/index.ts';
import { createCrossfilterEngine } from './src/modash/crossfilter-engine.js';

// Test data
const testData = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
];

// Test pipeline
const pipeline = [
  {
    $project: {
      displayName: { $toUpper: '$name' },
      passed: { $gte: ['$score', 90] },
    },
  },
  { $limit: 2 },
];

// Create engine and test
const engine = createCrossfilterEngine();

// Add documents
testData.forEach(doc => engine.addDocument(doc));

// Compile pipeline
console.log('\n📋 Compiling pipeline...');
const executionPlan = engine.compilePipeline(pipeline);
console.log('Execution plan:', {
  canIncrement: executionPlan.canIncrement,
  canDecrement: executionPlan.canDecrement,
});

// Execute pipeline
console.log('\n📋 Executing pipeline...');
const result = engine.execute(pipeline);
console.log('Result:', result);

// Test with regular aggregate too
console.log('\n📋 Using regular aggregate:');
const regularResult = Modash.aggregate(testData, pipeline);
console.log('Regular result:', regularResult);