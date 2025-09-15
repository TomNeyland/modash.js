import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';

process.env.DEBUG_IVM = 'true';

const testData = [
  { _id: 1, name: 'Alice', dept: 'eng' },
];

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

console.log('\n=== Testing $project → $limit ===');
const pipeline = [
  { $project: { name: 1 } },
  { $limit: 1 }
];

const result = engine.execute(pipeline);
console.log('Result:', result);
console.log('Keys:', result[0] ? Object.keys(result[0]) : 'no result');