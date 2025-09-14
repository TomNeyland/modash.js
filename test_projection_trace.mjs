import { createCrossfilterEngine } from './src/modash/crossfilter-engine.ts';

// Minimal test to understand the issue
const testData = [
  { _id: 1, name: 'Alice', extra: 'x' },
];

const pipeline = [
  { $project: { name: 1 } },
];

process.env.DEBUG_IVM = 'true';

const engine = createCrossfilterEngine();

console.log('=== Adding document ===');
testData.forEach(doc => engine.addDocument(doc));

console.log('\n=== Executing pipeline ===');
const result = engine.execute(pipeline);

console.log('\n=== Result ===');
console.log('Expected: { _id: 1, name: "Alice" }');
console.log('Actual:  ', result[0]);

const correct = result[0] && Object.keys(result[0]).length === 2 &&
                result[0]._id === 1 && result[0].name === 'Alice';

console.log('\nTest', correct ? 'PASSED ✅' : 'FAILED ❌');