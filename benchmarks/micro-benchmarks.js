/**
 * Micro-benchmarks for individual operators
 * Measures performance of core pipeline stages in isolation
 */

import Aggo from '../src/aggo/index.ts';
import { generateTestData } from './setup.js';

const ITERATIONS = 10;
const TEST_SIZE = 10000;

/**
 * Operator-specific benchmark functions
 */
const OPERATOR_BENCHMARKS = {
  // $match operator micro-benchmark
  $match: {
    name: '$match',
    setup: (data) => data,
    operation: (data) => Aggo.$match(data, { category: 'electronics', active: true }),
    expectedFilter: (data) => data.filter(doc => doc.category === 'electronics' && doc.active === true)
  },

  // $project operator micro-benchmark  
  $project: {
    name: '$project',
    setup: (data) => data,
    operation: (data) => Aggo.$project(data, {
      item: 1,
      category: 1,
      revenue: { $multiply: ['$price', '$quantity'] },
      isPremium: { $gte: ['$price', 200] }
    }),
    expectedSize: (data) => data.length
  },

  // $group operator micro-benchmarks
  '$group-sum': {
    name: '$group (sum)',
    setup: (data) => data,
    operation: (data) => Aggo.$group(data, {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      count: { $sum: 1 }
    }),
    expectedGroups: 5 // categories.length
  },

  '$group-avg': {
    name: '$group (avg)',  
    setup: (data) => data,
    operation: (data) => Aggo.$group(data, {
      _id: '$category',
      avgPrice: { $avg: '$price' },
      avgQuantity: { $avg: '$quantity' }
    }),
    expectedGroups: 5
  },

  '$group-minmax': {
    name: '$group (min/max)',
    setup: (data) => data,
    operation: (data) => Aggo.$group(data, {
      _id: '$category',
      minPrice: { $min: '$price' },
      maxPrice: { $max: '$price' }
    }),
    expectedGroups: 5
  },

  // $sort operator micro-benchmark
  $sort: {
    name: '$sort',
    setup: (data) => data,
    operation: (data) => Aggo.$sort(data, { price: -1, quantity: 1 }),
    expectedSize: (data) => data.length
  },

  // Top-K ($sort + $limit) micro-benchmark
  'topK-100': {
    name: 'topK (sort+limit 100)',
    setup: (data) => data,
    operation: (data) => {
      const sorted = Aggo.$sort(data, { price: -1 });
      return Aggo.$limit(sorted, 100);
    },
    expectedSize: 100
  },

  'topK-1000': {
    name: 'topK (sort+limit 1000)', 
    setup: (data) => data,
    operation: (data) => {
      const sorted = Aggo.$sort(data, { price: -1 });
      return Aggo.$limit(sorted, 1000);
    },
    expectedSize: 1000
  },

  // $unwind operator micro-benchmark
  $unwind: {
    name: '$unwind',
    setup: (data) => data,
    operation: (data) => Aggo.$unwind(data, '$tags'),
    expectedMultiplier: 2.0 // Average tags per document
  }
};

/**
 * Delta batching micro-benchmarks 
 */
const DELTA_BENCHMARKS = {
  'delta-1': {
    name: 'Delta batch size 1',
    batchSize: 1,
    pipeline: [
      { $match: { active: true } },
      { $project: { item: 1, revenue: { $multiply: ['$price', '$quantity'] } } },
      { $group: { _id: '$category', total: { $sum: '$revenue' } } }
    ]
  },

  'delta-64': {
    name: 'Delta batch size 64', 
    batchSize: 64,
    pipeline: [
      { $match: { active: true } },
      { $project: { item: 1, revenue: { $multiply: ['$price', '$quantity'] } } },
      { $group: { _id: '$category', total: { $sum: '$revenue' } } }
    ]
  },

  'delta-256': {
    name: 'Delta batch size 256',
    batchSize: 256, 
    pipeline: [
      { $match: { active: true } },
      { $project: { item: 1, revenue: { $multiply: ['$price', '$quantity'] } } },
      { $group: { _id: '$category', total: { $sum: '$revenue' } } }
    ]
  },

  'delta-1024': {
    name: 'Delta batch size 1024',
    batchSize: 1024,
    pipeline: [
      { $match: { active: true } },
      { $project: { item: 1, revenue: { $multiply: ['$price', '$quantity'] } } },
      { $group: { _id: '$category', total: { $sum: '$revenue' } } }
    ]
  }
};

/**
 * Performance measurement utilities
 */
function measureOperation(name, operation, iterations = ITERATIONS) {
  const times = [];
  let memBefore = 0;
  let memAfter = 0;
  let result = null;

  // Warmup
  for (let i = 0; i < 3; i++) {
    operation();
  }

  // Force GC before measurement
  if (global.gc) {
    global.gc();
  }

  // Measure
  for (let i = 0; i < iterations; i++) {
    memBefore = process.memoryUsage().heapUsed;
    const start = process.hrtime.bigint();
    result = operation();
    const end = process.hrtime.bigint();
    memAfter = process.memoryUsage().heapUsed;
    
    times.push(Number(end - start) / 1_000_000); // Convert to ms
  }

  const sortedTimes = times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b) / times.length;
  const median = sortedTimes[Math.floor(sortedTimes.length / 2)];
  const min = sortedTimes[0];
  const max = sortedTimes[sortedTimes.length - 1];
  const stdDev = Math.sqrt(times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length);

  return {
    name,
    iterations,
    avg,
    median,
    min,
    max,
    stdDev,
    memoryDelta: memAfter - memBefore,
    result,
    throughput: result?.length ? (result.length / (avg / 1000)) : null
  };
}

/**
 * Run operator micro-benchmarks
 */
export async function runOperatorBenchmarks() {
  console.log('🔬 Running Operator Micro-Benchmarks\n');
  console.log(`Test data: ${TEST_SIZE.toLocaleString()} documents`);
  console.log(`Iterations: ${ITERATIONS} per test`);
  console.log('─'.repeat(80));

  const testData = generateTestData(TEST_SIZE);
  const results = [];

  for (const [key, benchmark] of Object.entries(OPERATOR_BENCHMARKS)) {
    const { name, setup, operation, expectedSize, expectedGroups, expectedMultiplier } = benchmark;
    
    try {
      const preparedData = setup(testData);
      const result = measureOperation(name, () => operation(preparedData));
      
      // Validate results
      let validation = '✅';
      if (expectedSize && typeof expectedSize === 'function') {
        const expected = expectedSize(testData);
        if (result.result?.length !== expected) {
          validation = `❌ Expected ${expected}, got ${result.result?.length}`;
        }
      } else if (expectedSize && result.result?.length !== expectedSize) {
        validation = `❌ Expected ${expectedSize}, got ${result.result?.length}`;
      } else if (expectedGroups && result.result?.length !== expectedGroups) {
        validation = `❌ Expected ${expectedGroups} groups, got ${result.result?.length}`;
      } else if (expectedMultiplier) {
        const expectedCount = Math.round(testData.length * expectedMultiplier);
        const tolerance = expectedCount * 0.1; // 10% tolerance
        if (Math.abs(result.result?.length - expectedCount) > tolerance) {
          validation = `❌ Expected ~${expectedCount}, got ${result.result?.length}`;
        }
      }

      console.log(`${name.padEnd(25)} : ${result.avg.toFixed(2)}ms ±${result.stdDev.toFixed(2)}ms ${validation}`);
      
      if (result.throughput) {
        const throughputStr = result.throughput > 1000000 
          ? `${(result.throughput / 1000000).toFixed(2)}M docs/sec`
          : `${(result.throughput / 1000).toFixed(0)}k docs/sec`;
        console.log(`${' '.repeat(27)}   ${throughputStr}`);
      }

      results.push({
        operator: key,
        ...result,
        validation
      });
      
    } catch (error) {
      console.log(`${name.padEnd(25)} : ❌ Error: ${error.message}`);
      results.push({
        operator: key,
        name,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Run delta batching benchmarks
 */
export async function runDeltaBenchmarks() {
  console.log('\n📦 Running Delta Batching Benchmarks\n');
  console.log('Simulating streaming updates with different batch sizes');
  console.log('─'.repeat(80));

  const baseData = generateTestData(1000); // Smaller base for streaming
  const results = [];

  for (const [key, benchmark] of Object.entries(DELTA_BENCHMARKS)) {
    const { name, batchSize, pipeline } = benchmark;
    
    try {
      // Create streaming collection
      const streamingCollection = Aggo.createStreamingCollection(baseData);
      
      // Generate delta data
      const deltaData = generateTestData(batchSize);
      
      const result = measureOperation(name, () => {
        // Add delta batch
        streamingCollection.addBulk(deltaData);
        
        // Run aggregation
        return Aggo.aggregate(streamingCollection, pipeline);
      }, 5); // Fewer iterations for streaming tests

      console.log(`${name.padEnd(25)} : ${result.avg.toFixed(2)}ms ±${result.stdDev.toFixed(2)}ms`);
      
      const deltaThroughput = batchSize / (result.avg / 1000);
      const throughputStr = deltaThroughput > 1000000
        ? `${(deltaThroughput / 1000000).toFixed(2)}M deltas/sec`
        : `${(deltaThroughput / 1000).toFixed(0)}k deltas/sec`;
      console.log(`${' '.repeat(27)}   ${throughputStr}`);

      results.push({
        benchmark: key,
        batchSize,
        ...result,
        deltaThroughput
      });
      
    } catch (error) {
      console.log(`${name.padEnd(25)} : ❌ Error: ${error.message}`);
      results.push({
        benchmark: key,
        name,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Main benchmark runner
 */
export async function runMicroBenchmarks() {
  console.log('🚀 Running Aggo Micro-Benchmarks\n');
  
  const operatorResults = await runOperatorBenchmarks();
  const deltaResults = await runDeltaBenchmarks();
  
  console.log('\n📊 Summary');
  console.log('─'.repeat(80));
  
  // Analyze results for performance insights
  const slowOperators = operatorResults
    .filter(r => r.avg && r.avg > 50) // Operations taking > 50ms
    .sort((a, b) => b.avg - a.avg);
    
  if (slowOperators.length > 0) {
    console.log('\n⚠️  Slow Operations (> 50ms):');
    slowOperators.forEach(op => {
      console.log(`  ${op.name}: ${op.avg.toFixed(2)}ms`);
    });
  }

  // Memory usage analysis
  const highMemoryOps = operatorResults
    .filter(r => r.memoryDelta && r.memoryDelta > 10 * 1024 * 1024) // > 10MB
    .sort((a, b) => b.memoryDelta - a.memoryDelta);
    
  if (highMemoryOps.length > 0) {
    console.log('\n💾 High Memory Usage Operations (> 10MB):');
    highMemoryOps.forEach(op => {
      console.log(`  ${op.name}: ${(op.memoryDelta / 1024 / 1024).toFixed(2)}MB`);
    });
  }

  return {
    operators: operatorResults,
    deltas: deltaResults,
    timestamp: new Date().toISOString()
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runMicroBenchmarks().catch(console.error);
}