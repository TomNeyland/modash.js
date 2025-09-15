import Modash from '../../src/modash/index.ts';
import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine.js';

// Test data
const testData = [
  { _id: 1, item: 'laptop', category: 'electronics', price: 250, quantity: 10, active: true, date: new Date(2023, 4, 15) },
  { _id: 2, item: 'mouse', category: 'electronics', price: 50, quantity: 5, active: true, date: new Date(2023, 3, 10) }
];

// Complex pipeline from benchmark
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

// Test IVM compilation
const engine = createCrossfilterEngine();

// Add documents
testData.forEach(doc => engine.addDocument(doc));

// Compile the pipeline and check the execution plan
console.log('\n📋 Testing complexPipeline compilation:');
const executionPlan = engine.compilePipeline(complexPipeline);

console.log('\nExecution Plan:', {
  canIncrement: executionPlan.canIncrement,
  canDecrement: executionPlan.canDecrement,
  stages: executionPlan.stages.map(s => ({
    type: s.type,
    canIncrement: s.canIncrement,
    canDecrement: s.canDecrement
  }))
});

// Check which stage is causing the issue
executionPlan.stages.forEach((stage, i) => {
  if (!stage.canIncrement || !stage.canDecrement) {
    console.log(`\n❌ Stage ${i} (${stage.type}) cannot be incremented/decremented:`, {
      canIncrement: stage.canIncrement,
      canDecrement: stage.canDecrement,
      stageData: stage.stageData
    });
  }
});

// Try to execute
try {
  const result = engine.execute(complexPipeline);
  console.log('\n✅ Execution succeeded:', result);
} catch (error) {
  console.log('\n❌ Execution failed:', error.message);
}