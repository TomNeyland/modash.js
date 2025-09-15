import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine.js';

const data = [
  { category: 'electronics', price: 100, quantity: 2 },
  { category: 'furniture', price: 200, quantity: 1 },
];

const pipeline = [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      itemCount: { $sum: 1 },
    },
  },
  { $sort: { totalRevenue: -1 } },
];

const engine = createCrossfilterEngine();
data.forEach(doc => engine.addDocument(doc));

console.log('Pipeline:', JSON.stringify(pipeline, null, 2));

// Compile the pipeline
const plan = engine.compilePipeline(pipeline);
console.log('\nExecution plan stages:', plan.stages.map(s => ({
  type: s.type,
  data: s.stageData,
  inputFields: s.inputFields,
  outputFields: s.outputFields
})));

// Execute
const result = engine.execute(pipeline);
console.log('\nResult:', JSON.stringify(result, null, 2));