#!/usr/bin/env node
import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine.ts';

console.log('Testing operator fixes for RowId[] returns and upstreamActiveIds...\n');

// Test data with mix of documents
const testData = [
  { _id: 1, name: 'Alice', tags: ['developer'], dept: 'eng', salary: 100000 },
  { _id: 2, name: 'Bob', tags: ['designer'], dept: 'design', salary: 90000 },
  { _id: 3, name: 'Charlie', tags: ['lead'], dept: 'eng', salary: 120000 },
  { _id: 4, name: 'David', skills: null, dept: 'sales', salary: 80000 }, // No tags field
  { _id: 5, name: 'Eve', tags: [], dept: 'design', salary: 95000 }, // Empty tags
];

// Enable debug mode
process.env.DEBUG_IVM = 'true';

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

// Test 1: Match should filter properly
console.log('\n=== Test 1: $match filtering ===');
const pipeline1 = [
  { $match: { tags: { $exists: true } } }
];
const result1 = engine.execute(pipeline1);
console.log(`Expected: 4 docs (all except David)`);
console.log(`Actual: ${result1.length} docs`);
console.log('Results:', result1.map(d => d.name));

// Test 2: Match + Project should preserve filtering
console.log('\n=== Test 2: $match + $project ===');
const pipeline2 = [
  { $match: { tags: { $exists: true } } },
  { $project: { name: 1 } }
];
const result2 = engine.execute(pipeline2);
console.log(`Expected: 4 docs with only name field`);
console.log(`Actual: ${result2.length} docs`);
console.log('Results:', result2);

// Test 3: Match + AddFields + Sort should preserve filtering
console.log('\n=== Test 3: $match + $addFields + $sort ===');
const pipeline3 = [
  { $match: { tags: { $exists: true } } },
  { $addFields: { tagCount: { $size: { $ifNull: ['$tags', []] } } } },
  { $sort: { tagCount: -1 } }
];
const result3 = engine.execute(pipeline3);
console.log(`Expected: 4 docs sorted by tag count`);
console.log(`Actual: ${result3.length} docs`);
console.log('Results:', result3.map(d => ({ name: d.name, tagCount: d.tagCount })));

// Test 4: Group + Sort + Limit
console.log('\n=== Test 4: $group + $sort + $limit ===');
const pipeline4 = [
  { $group: { _id: '$dept', totalSalary: { $sum: '$salary' }, count: { $sum: 1 } } },
  { $sort: { totalSalary: -1 } },
  { $limit: 2 }
];
const result4 = engine.execute(pipeline4);
console.log(`Expected: Top 2 departments by total salary`);
console.log(`Actual: ${result4.length} groups`);
console.log('Results:', result4);

// Test 5: Match + Limit + Skip
console.log('\n=== Test 5: $match + $limit + $skip ===');
const pipeline5 = [
  { $match: { salary: { $gte: 90000 } } },
  { $sort: { salary: -1 } },
  { $limit: 3 },
  { $skip: 1 }
];
const result5 = engine.execute(pipeline5);
console.log(`Expected: 2 docs (skip first of top 3 high earners)`);
console.log(`Actual: ${result5.length} docs`);
console.log('Results:', result5.map(d => ({ name: d.name, salary: d.salary })));

// Test 6: Complex pipeline with all operators
console.log('\n=== Test 6: Complex pipeline ===');
const pipeline6 = [
  { $match: { tags: { $exists: true }, tags: { $ne: [] } } }, // Should get Alice, Bob, Charlie
  { $addFields: { firstTag: { $arrayElemAt: ['$tags', 0] } } },
  { $project: { name: 1, dept: 1, salary: 1, firstTag: 1 } },
  { $group: { _id: '$dept', avgSalary: { $avg: '$salary' }, people: { $push: '$name' } } },
  { $sort: { avgSalary: -1 } },
  { $limit: 1 }
];
const result6 = engine.execute(pipeline6);
console.log(`Expected: 1 group (eng dept with highest avg salary)`);
console.log(`Actual: ${result6.length} groups`);
console.log('Results:', result6);

console.log('\n=== Summary ===');
const allPassed =
  result1.length === 4 &&
  result2.length === 4 &&
  result3.length === 4 &&
  result4.length === 2 &&
  result5.length === 2 &&
  result6.length === 1;

console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed');