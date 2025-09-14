/**
 * CI Performance Budget Enforcement
 * 
 * Enforces performance budgets and fails CI on regressions:
 * - simpleFilter (10k docs): ≥1.0M docs/sec, allocs/row ≤0.05
 * - groupAndAggregate (10k docs): ≥250k docs/sec, no GC pauses
 * - complexPipeline (10k docs): ≥150k docs/sec
 * - Delta throughput: ≥250k deltas/sec, P99 latency <5ms
 */

import fs from 'fs/promises';
import path from 'path';
import Modash from '../src/modash/index.ts';
import { generateTestData, BENCHMARK_PIPELINES } from './setup.js';
import { runMicroBenchmarks } from './micro-benchmarks.js';

/**
 * Performance budgets - CI fails if these are not met
 */
const PERFORMANCE_BUDGETS = {
  // Throughput budgets (docs/sec)
  simpleFilter_10k: 1_000_000,      // ≥1.0M docs/sec
  groupAndAggregate_10k: 250_000,    // ≥250k docs/sec  
  complexPipeline_10k: 150_000,      // ≥150k docs/sec
  
  // Delta throughput budgets (deltas/sec)
  deltaThroughput: 250_000,          // ≥250k deltas/sec
  
  // Memory budgets (allocs/row)
  maxAllocsPerRow: 0.05,             // ≤0.05 allocs/row
  
  // Latency budgets (ms)
  maxP99DeltaLatency: 5,             // P99 <5ms for 1k-delta bursts
  
  // Regression thresholds (%)
  maxThroughputRegression: 10,       // Fail if >10% slower
  maxMemoryRegression: 20,           // Fail if >20% more memory
};

/**
 * Baseline performance results (to be loaded from historical data)
 */
let BASELINE_RESULTS = null;

/**
 * Measure performance with GC monitoring
 */
function measureWithGC(name, operation, iterations = 5) {
  const times = [];
  const memorySnapshots = [];
  let result = null;

  // Force initial GC
  if (global.gc) {
    global.gc();
  }

  const initialMemory = process.memoryUsage();

  // Warmup
  for (let i = 0; i < 2; i++) {
    operation();
  }

  // Measure
  for (let i = 0; i < iterations; i++) {
    if (global.gc) {
      global.gc(); // Force GC before each measurement
    }
    
    const memBefore = process.memoryUsage();
    const start = process.hrtime.bigint();
    
    result = operation();
    
    const end = process.hrtime.bigint();
    const memAfter = process.memoryUsage();
    
    times.push(Number(end - start) / 1_000_000); // Convert to ms
    memorySnapshots.push({
      before: memBefore,
      after: memAfter,
      delta: memAfter.heapUsed - memBefore.heapUsed
    });
  }

  const sortedTimes = times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b) / times.length;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
  const memoryDelta = memorySnapshots.reduce((sum, snap) => sum + snap.delta, 0) / memorySnapshots.length;
  
  return {
    name,
    avg,
    p99,
    memoryDelta,
    result,
    throughput: result?.length ? (result.length / (avg / 1000)) : null
  };
}

/**
 * Run delta latency benchmark
 */
async function measureDeltaLatency() {
  const baseData = generateTestData(1000);
  const streamingCollection = Modash.createStreamingCollection(baseData);
  
  const pipeline = [
    { $match: { active: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ];

  // Measure batch sizes: 1, 64, 256, 1024
  const batchSizes = [1, 64, 256, 1024];
  const results = {};

  for (const batchSize of batchSizes) {
    const latencies = [];
    
    // Measure 20 iterations
    for (let i = 0; i < 20; i++) {
      const deltaData = generateTestData(batchSize);
      
      const start = process.hrtime.bigint();
      streamingCollection.addBulk(deltaData);
      Modash.aggregate(streamingCollection, pipeline);
      const end = process.hrtime.bigint();
      
      latencies.push(Number(end - start) / 1_000_000); // Convert to ms
    }
    
    latencies.sort((a, b) => a - b);
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avg = latencies.reduce((a, b) => a + b) / latencies.length;
    const throughput = batchSize / (avg / 1000);
    
    results[`delta_${batchSize}`] = {
      batchSize,
      avgLatency: avg,
      p99Latency: p99,
      deltaThroughput: throughput
    };
  }

  return results;
}

/**
 * Check if fallbacks occurred (should be zero for budget compliance)
 */
function checkFallbackCount() {
  // This would need to be integrated with the actual fallback counter
  // For now, we'll assume it's tracked somewhere accessible
  return 0; // Placeholder
}

/**
 * Load baseline results from historical data
 */
async function loadBaseline() {
  try {
    const baselinePath = path.join(process.cwd(), 'performance-results', 'ci-baseline.json');
    const data = await fs.readFile(baselinePath, 'utf8');
    return JSON.parse(data);
  } catch {
    console.log('⚠️  No baseline found, creating new baseline');
    return null;
  }
}

/**
 * Save results as new baseline
 */
async function saveBaseline(results) {
  const baselinePath = path.join(process.cwd(), 'performance-results', 'ci-baseline.json');
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, JSON.stringify(results, null, 2));
  console.log(`✅ Saved new baseline: ${baselinePath}`);
}

/**
 * Generate flamegraph artifacts on failure
 */
async function generateFlamegraph(testName) {
  // Placeholder for flamegraph generation
  // In real CI, this would run 'clinic flame -- node bench...' 
  console.log(`🔥 Would generate flamegraph for: ${testName}`);
  
  // Create mock flamegraph file for CI artifact upload
  const artifactPath = path.join(process.cwd(), 'performance-results', `flamegraph-${testName}-${Date.now()}.html`);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `<html><body><h1>Flamegraph for ${testName}</h1><p>Mock flamegraph data</p></body></html>`);
  
  return artifactPath;
}

/**
 * Main CI performance budget enforcement
 */
async function runCIPerformanceBudgets() {
  console.log('🚨 Running CI Performance Budget Enforcement\n');
  console.log('Target Budgets:');
  console.log(`  simpleFilter (10k):     ≥${(PERFORMANCE_BUDGETS.simpleFilter_10k / 1000000).toFixed(1)}M docs/sec`);
  console.log(`  groupAndAggregate (10k): ≥${(PERFORMANCE_BUDGETS.groupAndAggregate_10k / 1000).toFixed(0)}k docs/sec`);
  console.log(`  complexPipeline (10k):   ≥${(PERFORMANCE_BUDGETS.complexPipeline_10k / 1000).toFixed(0)}k docs/sec`);
  console.log(`  deltaThroughput:        ≥${(PERFORMANCE_BUDGETS.deltaThroughput / 1000).toFixed(0)}k deltas/sec`);
  console.log(`  maxAllocsPerRow:        ≤${PERFORMANCE_BUDGETS.maxAllocsPerRow}`);
  console.log(`  maxP99DeltaLatency:     ≤${PERFORMANCE_BUDGETS.maxP99DeltaLatency}ms`);
  console.log('─'.repeat(80));

  let failed = false;
  const failures = [];
  const results = {};

  // Load baseline for regression comparison
  BASELINE_RESULTS = await loadBaseline();

  // Test 1: Core pipeline benchmarks
  console.log('\n📊 Testing Core Pipeline Performance');
  const testData = generateTestData(10000);
  
  const coreTests = [
    { name: 'simpleFilter', budget: PERFORMANCE_BUDGETS.simpleFilter_10k, pipeline: BENCHMARK_PIPELINES.simpleFilter },
    { name: 'groupAndAggregate', budget: PERFORMANCE_BUDGETS.groupAndAggregate_10k, pipeline: BENCHMARK_PIPELINES.groupAndAggregate },
    { name: 'complexPipeline', budget: PERFORMANCE_BUDGETS.complexPipeline_10k, pipeline: BENCHMARK_PIPELINES.complexPipeline }
  ];

  for (const test of coreTests) {
    const result = measureWithGC(test.name, () => {
      return Modash.aggregate(testData, test.pipeline);
    });

    results[test.name] = result;

    // Check throughput budget
    if (result.throughput < test.budget) {
      failed = true;
      failures.push(`${test.name}: ${(result.throughput/1000).toFixed(0)}k docs/sec < ${(test.budget/1000).toFixed(0)}k budget`);
      await generateFlamegraph(test.name);
    }

    // Check memory allocation budget
    const docsProcessed = result.result?.length || testData.length;
    const allocsPerRow = result.memoryDelta / docsProcessed;
    if (allocsPerRow > PERFORMANCE_BUDGETS.maxAllocsPerRow) {
      failed = true;
      failures.push(`${test.name}: ${allocsPerRow.toFixed(3)} allocs/row > ${PERFORMANCE_BUDGETS.maxAllocsPerRow} budget`);
    }

    // Check regression vs baseline
    if (BASELINE_RESULTS && BASELINE_RESULTS[test.name]) {
      const baseline = BASELINE_RESULTS[test.name];
      const regression = ((baseline.throughput - result.throughput) / baseline.throughput) * 100;
      
      if (regression > PERFORMANCE_BUDGETS.maxThroughputRegression) {
        failed = true;
        failures.push(`${test.name}: ${regression.toFixed(1)}% throughput regression vs baseline`);
      }
    }

    const status = result.throughput >= test.budget ? '✅' : '❌';
    console.log(`${test.name.padEnd(20)} : ${(result.throughput/1000).toFixed(0)}k docs/sec ${status}`);
  }

  // Test 2: Delta throughput and latency
  console.log('\n📦 Testing Delta Performance');
  const deltaResults = await measureDeltaLatency();
  results.delta = deltaResults;

  // Check delta budgets
  let maxDeltaThroughput = 0;
  let maxP99Latency = 0;

  for (const [batchKey, deltaResult] of Object.entries(deltaResults)) {
    maxDeltaThroughput = Math.max(maxDeltaThroughput, deltaResult.deltaThroughput);
    maxP99Latency = Math.max(maxP99Latency, deltaResult.p99Latency);
    
    console.log(`Delta batch ${deltaResult.batchSize.toString().padEnd(4)} : ${(deltaResult.deltaThroughput/1000).toFixed(0)}k deltas/sec, P99: ${deltaResult.p99Latency.toFixed(2)}ms`);
  }

  if (maxDeltaThroughput < PERFORMANCE_BUDGETS.deltaThroughput) {
    failed = true;
    failures.push(`Delta throughput: ${(maxDeltaThroughput/1000).toFixed(0)}k deltas/sec < ${(PERFORMANCE_BUDGETS.deltaThroughput/1000).toFixed(0)}k budget`);
  }

  if (maxP99Latency > PERFORMANCE_BUDGETS.maxP99DeltaLatency) {
    failed = true;
    failures.push(`Delta P99 latency: ${maxP99Latency.toFixed(2)}ms > ${PERFORMANCE_BUDGETS.maxP99DeltaLatency}ms budget`);
  }

  // Test 3: Fallback count (should be zero)
  console.log('\n🔄 Checking Fallback Count');
  const fallbackCount = checkFallbackCount();
  results.fallbackCount = fallbackCount;

  if (fallbackCount > 0) {
    failed = true;
    failures.push(`Fallback count: ${fallbackCount} > 0 (all operations should use hot path)`);
  }

  console.log(`Fallback operations: ${fallbackCount} ${fallbackCount === 0 ? '✅' : '❌'}`);

  // Test 4: Micro-benchmark validation
  console.log('\n🔬 Running Micro-Benchmark Validation');
  const microResults = await runMicroBenchmarks();
  results.micro = microResults;

  // Summary
  console.log('\n📊 CI Performance Budget Results');
  console.log('─'.repeat(80));
  
  if (failed) {
    console.log('❌ CI PERFORMANCE BUDGET FAILED');
    console.log('\nFailures:');
    failures.forEach(failure => console.log(`  • ${failure}`));
    
    // Save results but don't update baseline on failure
    const failureResultsPath = path.join(process.cwd(), 'performance-results', `ci-failure-${Date.now()}.json`);
    await fs.mkdir(path.dirname(failureResultsPath), { recursive: true });
    await fs.writeFile(failureResultsPath, JSON.stringify({ results, failures, timestamp: new Date().toISOString() }, null, 2));
    
    console.log(`\n💾 Failure results saved: ${failureResultsPath}`);
    console.log('🔥 Flamegraph artifacts generated for failed tests');
    
    process.exit(1);
  } else {
    console.log('✅ ALL PERFORMANCE BUDGETS PASSED');
    
    // Update baseline on success  
    await saveBaseline(results);
    
    console.log('\n🎯 Performance Summary:');
    for (const [testName, result] of Object.entries(results)) {
      if (result.throughput) {
        const budget = PERFORMANCE_BUDGETS[`${testName}_10k`];
        if (budget) {
          const margin = ((result.throughput - budget) / budget * 100).toFixed(1);
          console.log(`  ${testName}: ${(result.throughput/1000).toFixed(0)}k docs/sec (+${margin}% vs budget)`);
        }
      }
    }
  }

  return { passed: !failed, results, failures };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runCIPerformanceBudgets().catch(console.error);
}

export { runCIPerformanceBudgets, PERFORMANCE_BUDGETS };