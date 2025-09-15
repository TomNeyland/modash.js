import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine.ts';

const testData = [
  { _id: 1, name: 'Alice', tags: ['developer'], dept: 'eng', salary: 100000 },
  { _id: 2, name: 'Bob', tags: ['designer'], dept: 'design', salary: 90000 },
  { _id: 3, name: 'Charlie', tags: ['lead'], dept: 'eng', salary: 120000 },
  { _id: 4, name: 'David', skills: null, dept: 'sales', salary: 80000 }, // No tags field
  { _id: 5, name: 'Eve', tags: [], dept: 'design', salary: 95000 }, // Empty tags
];

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

console.log('=== Test: $match + $project ===');
const pipeline = [
  { $match: { tags: { $exists: true } } },
  { $project: { name: 1 } }
];

const result = engine.execute(pipeline);
console.log(`Expected: 4 docs with only _id and name fields`);
console.log(`Actual: ${result.length} docs`);
console.log('Results:', result);

// Check if projection worked
const allCorrect = result.every(doc => {
  const keys = Object.keys(doc);
  return keys.length === 2 && keys.includes('_id') && keys.includes('name');
});

console.log('\nProjection test', allCorrect ? 'PASSED ✅' : 'FAILED ❌');

if (!allCorrect && result[0]) {
  console.log('First doc has keys:', Object.keys(result[0]));
}