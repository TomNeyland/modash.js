/**
 * Operator-specific micro-benchmarks for modash.js
 * Measures performance of individual pipeline operators
 */

import Modash from '../src/modash/index.ts';
import { generateTestData } from './setup.js';
import { PerformanceTracker } from './performance-tracker.js';

// Performance counters for detailed instrumentation
export class PerformanceCounters {
  constructor() {
    this.reset();
  }

  reset() {
    this.adds = 0;
    this.removes = 0;
    this.drops = 0;
    this.allocations = 0;
    this.bytesAllocated = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.hashTableLoadFactor = 0;
    this.averageProbeLength = 0;
    this.fallbacks = 0;
  }

  recordAdd() { this.adds++; }
  recordRemove() { this.removes++; }
  recordDrop() { this.drops++; }
  recordAllocation(bytes = 0) { 
    this.allocations++; 
    this.bytesAllocated += bytes;
  }
  recordCacheHit() { this.cacheHits++; }
  recordCacheMiss() { this.cacheMisses++; }
  recordFallback() { this.fallbacks++; }

  getAllocsPerRow(rowCount) {
    return rowCount > 0 ? this.allocations / rowCount : 0;
  }

  getBytesPerRow(rowCount) {
    return rowCount > 0 ? this.bytesAllocated / rowCount : 0;
  }

  getCacheHitRatio() {
    const total = this.cacheHits + this.cacheMisses;
    return total > 0 ? this.cacheHits / total : 0;
  }

  getReport(rowCount = 1) {
    return {
      adds: this.adds,
      removes: this.removes,
      drops: this.drops,
      allocations: this.allocations,
      bytesAllocated: this.bytesAllocated,
      allocsPerRow: this.getAllocsPerRow(rowCount),
      bytesPerRow: this.getBytesPerRow(rowCount),
      cacheHitRatio: this.getCacheHitRatio(),
      fallbacks: this.fallbacks,
      hashTableLoadFactor: this.hashTableLoadFactor,
      averageProbeLength: this.averageProbeLength,
    };
  }
}

// Global performance counters instance
export const perfCounters = new PerformanceCounters();

// Operator micro-benchmarks
const OPERATOR_BENCHMARKS = {
  '$match': {
    name: '$match - Simple field equality',
    setup: (data) => ({ $match: { category: 'electronics' } }),
    pipeline: (matchStage) => [matchStage],
  },
  '$match_complex': {
    name: '$match - Complex conditions',
    setup: (data) => ({ 
      $match: { 
        $and: [
          { category: 'electronics' },
          { price: { $gte: 100, $lte: 500 } },
          { active: true }
        ]
      } 
    }),
    pipeline: (matchStage) => [matchStage],
  },
  '$project': {
    name: '$project - Field selection',
    setup: (data) => ({ 
      $project: { 
        item: 1, 
        category: 1, 
        price: 1,
        _id: 0 
      } 
    }),
    pipeline: (projectStage) => [projectStage],
  },
  '$project_computed': {
    name: '$project - Computed fields',
    setup: (data) => ({ 
      $project: { 
        item: 1,
        revenue: { $multiply: ['$price', '$quantity'] },
        isPremium: { $gte: ['$price', 200] },
        _id: 0 
      } 
    }),
    pipeline: (projectStage) => [projectStage],
  },
  '$group_sum': {
    name: '$group - Sum aggregation',
    setup: (data) => ({ 
      $group: { 
        _id: '$category',
        totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        count: { $sum: 1 }
      } 
    }),
    pipeline: (groupStage) => [groupStage],
  },
  '$group_avg': {
    name: '$group - Average aggregation',
    setup: (data) => ({ 
      $group: { 
        _id: '$category',
        avgPrice: { $avg: '$price' },
        count: { $sum: 1 }
      } 
    }),
    pipeline: (groupStage) => [groupStage],
  },
  '$group_min_max': {
    name: '$group - Min/Max aggregation',
    setup: (data) => ({ 
      $group: { 
        _id: '$category',
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
        count: { $sum: 1 }
      } 
    }),
    pipeline: (groupStage) => [groupStage],
  },
  '$sort': {
    name: '$sort - Single field',
    setup: (data) => ({ $sort: { price: -1 } }),
    pipeline: (sortStage) => [sortStage],
  },
  '$sort_multi': {
    name: '$sort - Multiple fields',
    setup: (data) => ({ $sort: { category: 1, price: -1 } }),
    pipeline: (sortStage) => [sortStage],
  },
  '$topK': {
    name: '$sort + $limit - Top K (heap)',
    setup: (data) => [
      { $sort: { price: -1 } },
      { $limit: 100 }
    ],
    pipeline: (stages) => stages,
  },
  '$unwind': {
    name: '$unwind - Array expansion',
    setup: (data) => ({ $unwind: '$tags' }),
    pipeline: (unwindStage) => [unwindStage],
  },
};

// Test data sizes for micro-benchmarks
const MICRO_BENCH_SIZES = [1000, 5000, 10000];

export async function runOperatorBenchmarks() {
  const tracker = new PerformanceTracker();
  
  console.log('🔬 Running Operator Micro-benchmarks\n');
  console.log('='.repeat(80));
  
  const results = {};
  
  for (const size of MICRO_BENCH_SIZES) {
    console.log(`\n📊 Dataset Size: ${size.toLocaleString()} documents`);
    console.log('-'.repeat(60));
    
    const testData = generateTestData(size);
    results[size] = {};
    
    for (const [operatorKey, benchmark] of Object.entries(OPERATOR_BENCHMARKS)) {
      perfCounters.reset();
      
      const setupResult = benchmark.setup(testData);
      const pipeline = benchmark.pipeline(setupResult);
      
      // Warmup runs
      for (let i = 0; i < 3; i++) {
        Modash.aggregate(testData, pipeline);
      }
      
      // Measured runs
      const iterations = size >= 10000 ? 3 : 5;
      const result = tracker.benchmark(
        `${benchmark.name} (${size})`,
        () => {
          const output = Modash.aggregate(testData, pipeline);
          if (!Array.isArray(output)) {
            throw new Error(`Expected array output, got ${typeof output}`);
          }
          return output;
        },
        iterations
      );
      
      if (result.error) {
        console.log(`  ${benchmark.name.padEnd(40)} : ❌ Error: ${result.error}`);
        continue;
      }
      
      // Calculate throughput and performance metrics
      const docsPerSec = size / (result.avg / 1000);
      const counters = perfCounters.getReport(size);
      
      results[size][operatorKey] = {
        ...result,
        docsPerSec,
        counters,
      };
      
      console.log(`  ${benchmark.name.padEnd(40)} : ${result.avg.toFixed(2)}ms ±${result.stdDev.toFixed(2)}ms | ${(docsPerSec/1000).toFixed(1)}k docs/sec`);
      
      // Report performance issues
      if (counters.allocsPerRow > 0.05) {
        console.log(`    ⚠️  High allocations: ${counters.allocsPerRow.toFixed(3)} allocs/row`);
      }
      if (counters.fallbacks > 0) {
        console.log(`    ❌ Fallbacks detected: ${counters.fallbacks}`);
      }
    }
  }
  
  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = `performance-results/operators-${timestamp}.json`;
  
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed results saved to: ${resultsFile}`);
  } catch (error) {
    console.log(`\n❌ Failed to save results: ${error.message}`);
  }
  
  console.log('\n🔬 Operator benchmarking completed!');
  return results;
}

// Export for use in main benchmark suite
export { OPERATOR_BENCHMARKS };