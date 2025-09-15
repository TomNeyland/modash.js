import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';

// Enable debug
process.env.DEBUG_IVM = 'true';

// Test data
const testData = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
  { _id: 3, name: 'Charlie', score: 90 },
];

// Pipeline with projection and limit
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

// Compile and execute pipeline
console.log('\n📋 Testing IVM engine with debug:');
const result = engine.execute(pipeline);
console.log('IVM Result:', JSON.stringify(result, null, 2));