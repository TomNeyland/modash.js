#!/usr/bin/env node
/**
 * Regression tests to lock in projection/materialization invariants
 */

import { createCrossfilterEngine } from './src/modash/crossfilter-engine.ts';

const testData = [
  { _id: 1, name: 'Alice', dept: 'eng', salary: 100000, active: true },
  { _id: 2, name: 'Bob', dept: 'sales', salary: 80000, active: true },
  { _id: 3, name: 'Charlie', dept: 'eng', salary: 120000, active: false },
  { _id: 4, name: 'David', dept: 'sales', salary: 90000, active: true },
];

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

let passed = 0;
let failed = 0;

// Test 1: $project → $limit - only projected fields survive
console.log('\n=== Test 1: $project → $limit ===');
{
  const pipeline = [
    { $project: { name: 1, dept: 1 } },
    { $limit: 2 }
  ];

  const result = engine.execute(pipeline);
  const correct = result.length === 2 &&
    result.every(doc => {
      const keys = Object.keys(doc);
      return keys.length === 3 && keys.includes('_id') && keys.includes('name') && keys.includes('dept');
    });

  if (correct) {
    console.log('✅ Only projected fields survived through $limit');
    passed++;
  } else {
    console.log('❌ FAILED: Extra fields leaked through');
    console.log('Result:', result);
    failed++;
  }
}

// Test 2: $project → $sort - verify tail stage pulls projected view
console.log('\n=== Test 2: $project → $sort ===');
{
  const pipeline = [
    { $project: { name: 1, salary: 1 } },
    { $sort: { salary: -1 } }
  ];

  const result = engine.execute(pipeline);
  const correct = result.length === 4 &&
    result[0].name === 'Charlie' && // Highest salary
    result.every(doc => {
      const keys = Object.keys(doc);
      return keys.length === 3 && !keys.includes('dept') && !keys.includes('active');
    });

  if (correct) {
    console.log('✅ Sort operated on projected view');
    passed++;
  } else {
    console.log('❌ FAILED: Sort didn\'t preserve projection');
    console.log('Result:', result);
    failed++;
  }
}

// Test 3: $match drops one → $project → $skip - row count matches filter
console.log('\n=== Test 3: $match → $project → $skip ===');
{
  const pipeline = [
    { $match: { active: true } }, // Should drop Charlie
    { $project: { name: 1 } },
    { $skip: 1 }
  ];

  const result = engine.execute(pipeline);
  const correct = result.length === 2 && // 3 active - 1 skipped = 2
    result.every(doc => {
      const keys = Object.keys(doc);
      return keys.length === 2 && keys.includes('_id') && keys.includes('name');
    });

  if (correct) {
    console.log('✅ Row count and projection correct after filter');
    passed++;
  } else {
    console.log('❌ FAILED: Wrong count or fields');
    console.log('Result:', result);
    failed++;
  }
}

// Test 4: "liveSet leak" test - ensure filtered doc doesn't reappear
console.log('\n=== Test 4: liveSet leak test ===');
{
  // Add a phantom document that should be filtered
  const phantomEngine = createCrossfilterEngine();
  phantomEngine.addDocument({ _id: 99, name: 'Phantom', dept: 'ghost', active: false });
  phantomEngine.addDocument({ _id: 1, name: 'Real', dept: 'eng', active: true });

  const pipeline = [
    { $match: { active: true } }, // Should exclude phantom
    { $project: { name: 1 } },
    { $limit: 10 } // More than available to catch any leaks
  ];

  const result = phantomEngine.execute(pipeline);
  const hasPhantom = result.some(doc => doc._id === 99);

  if (!hasPhantom && result.length === 1) {
    console.log('✅ No liveSet leak - phantom excluded');
    passed++;
  } else {
    console.log('❌ FAILED: Phantom leaked through or wrong count');
    console.log('Result:', result);
    failed++;
  }
}

// Test 5: $addFields → $project - ensure composition works
console.log('\n=== Test 5: $addFields → $project ===');
{
  const pipeline = [
    { $addFields: { bonus: { $multiply: ['$salary', 0.1] } } },
    { $project: { name: 1, bonus: 1 } }
  ];

  const result = engine.execute(pipeline);
  const correct = result.length === 4 &&
    result[0].bonus === 10000 && // Alice's bonus
    result.every(doc => {
      const keys = Object.keys(doc);
      return keys.length === 3 && keys.includes('bonus') && !keys.includes('salary');
    });

  if (correct) {
    console.log('✅ AddFields and Project composed correctly');
    passed++;
  } else {
    console.log('❌ FAILED: Composition incorrect');
    console.log('Result:', result);
    failed++;
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`INVARIANT TESTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 All invariants locked!');
  process.exit(0);
} else {
  console.log('❌ Some invariants violated');
  process.exit(1);
}