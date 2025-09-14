import { createCrossfilterEngine } from './src/modash/crossfilter-engine.js';
import { resetFallbackTracking, getFallbackCount } from './src/modash/debug.js';

const testData = [
  { _id: 1, name: 'Alice', tags: ['a'] },
  { _id: 2, name: 'Bob' },
  { _id: 3, name: 'Charlie', tags: null },
];

const pipeline = [
  { $match: { tags: { $exists: true } } }
];

resetFallbackTracking();

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

const result = engine.execute(pipeline);

console.log('Test data:', testData.length, 'documents');
console.log('Result count:', result.length);
console.log('Fallback count:', getFallbackCount());
console.log('Results:', result.map(d => d.name));