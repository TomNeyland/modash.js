import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';

const testData = [
  { _id: 1, name: 'Alice', tags: ['a'] },
  { _id: 2, name: 'Bob', tags: ['b'] },
  { _id: 3, name: 'Charlie' },
  { _id: 4, name: 'David', tags: null },
];

const pipeline = [
  { $match: { tags: { $exists: true } } },
  { $project: { name: 1 } },
];

process.env.DEBUG_IVM = 'true';

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

console.log('\n--- Executing pipeline ---');
const result = engine.execute(pipeline);

console.log('\nResult count:', result.length);
console.log('Results:', result);