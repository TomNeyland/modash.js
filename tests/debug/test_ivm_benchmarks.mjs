#!/usr/bin/env node
/**
 * IVM benchmark tests to verify no fallbacks
 */

import { createCrossfilterEngine } from '../../src/aggo/crossfilter-engine';
import { getFallbackCount, resetFallbackTracking } from '../../src/aggo/debug';

// Generate test data
const generateData = (size) => {
  return Array.from({ length: size }, (_, i) => ({
    _id: i,
    item: ['laptop', 'mouse', 'keyboard'][i % 3],
    category: ['electronics', 'furniture', 'office'][i % 3],
    price: 50 + (i % 100),
    quantity: (i % 5) + 1,
    tags: i % 2 === 0 ? ['sale'] : ['regular'],
    active: i % 3 !== 0,
    date: new Date(2023, i % 12, (i % 28) + 1),
  }));
};

const testData = generateData(100);
const engine = createCrossfilterEngine();

console.log('=== IVM Benchmark Suite ===');
console.log(`Test data size: ${testData.length} documents\n`);

// Add all documents
testData.forEach(doc => engine.addDocument(doc));

const benchmarks = [
  {
    name: 'simpleFilter',
    pipeline: [
      { $match: { active: true } }
    ]
  },
  {
    name: 'filterAndProject',
    pipeline: [
      { $match: { category: 'electronics' } },
      { $project: { item: 1, price: 1 } }
    ]
  },
  {
    name: 'groupAndAggregate',
    pipeline: [
      { $group: {
        _id: '$category',
        totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' },
        count: { $sum: 1 }
      }},
      { $sort: { totalRevenue: -1 } }
    ]
  },
  {
    name: 'complexPipeline',
    pipeline: [
      { $match: { active: true } },
      { $addFields: { revenue: { $multiply: ['$price', '$quantity'] } } },
      { $project: { item: 1, category: 1, revenue: 1 } },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]
  },
  {
    name: 'projectSortLimit',
    pipeline: [
      { $project: { item: 1, price: 1 } },
      { $sort: { price: -1 } },
      { $limit: 5 }
    ]
  }
];

let totalPassed = 0;
let totalFailed = 0;

benchmarks.forEach(({ name, pipeline }) => {
  console.log(`\n📊 Benchmark: ${name}`);
  console.log(`Pipeline: ${JSON.stringify(pipeline)}`);

  // Reset fallback counter
  resetFallbackTracking();

  // Execute pipeline
  const startTime = Date.now();
  const result = engine.execute(pipeline);
  const duration = Date.now() - startTime;

  const fallbacks = getFallbackCount();

  console.log(`  ⏱️  Duration: ${duration}ms`);
  console.log(`  📦 Result count: ${result.length}`);
  console.log(`  🔄 Fallbacks: ${fallbacks}`);

  // Verify no fallbacks for supported pipelines
  const expectNoFallback = ['simpleFilter', 'filterAndProject', 'projectSortLimit', 'complexPipeline'];
  if (expectNoFallback.includes(name)) {
    if (fallbacks === 0) {
      console.log(`  ✅ No fallbacks as expected`);
      totalPassed++;
    } else {
      console.log(`  ❌ UNEXPECTED FALLBACKS!`);
      totalFailed++;
    }
  } else {
    console.log(`  ⚠️  Fallbacks expected (unsupported operations)`);
    totalPassed++;
  }

  // Sample result
  if (result.length > 0) {
    console.log(`  Sample result:`, result[0]);
  }
});

console.log('\n' + '='.repeat(50));
console.log(`BENCHMARK SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log('🎉 All benchmarks passed without unexpected fallbacks!');
  process.exit(0);
} else {
  console.log('❌ Some benchmarks had unexpected fallbacks');
  process.exit(1);
}