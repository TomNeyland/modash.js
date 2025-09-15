/**
 * Streaming Switchover Performance Comparison
 * 
 * Benchmarks comparing performance before and after making streaming the default
 * for the .aggregate() method. Tests both approaches side-by-side.
 */

import { createStreamingCollection } from '../src/modash/streaming.js';
import { aggregateTransparent, aggregate as streamingDefaultAggregate } from '../src/modash/index.js';
import { generateTestData, BENCHMARK_PIPELINES } from './setup.js';

// Test data sizes for comparison
const COMPARISON_SIZES = [100, 500, 1000, 2500, 5000];

/**
 * Benchmark a function with multiple iterations and return performance metrics
 */
function benchmark(name, fn, iterations = 5) {
  const times = [];
  let result = null;
  
  // Warm up
  for (let i = 0; i < 2; i++) {
    fn();
  }
  
  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    result = fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000); // Convert to milliseconds
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const stdDev = Math.sqrt(times.reduce((acc, time) => acc + Math.pow(time - avg, 2), 0) / times.length);
  
  return {
    name,
    avg,
    min,
    max,
    stdDev,
    times,
    resultSize: Array.isArray(result) ? result.length : 1
  };
}

/**
 * Old approach: Uses hot path optimization for regular arrays, streaming for StreamingCollection
 */
function benchmarkOldApproach(testData, pipeline) {
  return aggregateTransparent(testData, pipeline);
}

/**
 * New approach: Always uses StreamingCollection internally (now the default)
 */
function benchmarkNewApproach(testData, pipeline) {
  return streamingDefaultAggregate(testData, pipeline);
}

/**
 * Run comparison benchmarks
 */
export async function runStreamingSwitchoverComparison() {
  console.log('🔄 Streaming Switchover Performance Comparison\n');
  console.log('Comparing OLD approach (hot path + selective streaming) vs NEW approach (streaming by default)\n');

  const results = {};

  for (const size of COMPARISON_SIZES) {
    console.log(`📊 Dataset size: ${size.toLocaleString()} documents`);
    console.log('─'.repeat(70));

    const testData = generateTestData(size);
    results[size] = {};

    for (const [pipelineName, pipelineStages] of Object.entries(BENCHMARK_PIPELINES)) {
      console.log(`\n  Testing: ${pipelineName}`);

      try {
        // Benchmark old approach (hot path + selective streaming)
        const oldResult = benchmark(
          `Old (${pipelineName})`,
          () => benchmarkOldApproach(testData, pipelineStages),
          5
        );

        // Benchmark new approach (streaming by default)
        const newResult = benchmark(
          `New (${pipelineName})`,
          () => benchmarkNewApproach(testData, pipelineStages),
          5
        );

        // Validate results are equivalent
        const oldOutput = benchmarkOldApproach(testData, pipelineStages);
        const newOutput = benchmarkNewApproach(testData, pipelineStages);
        
        const resultsMatch = JSON.stringify(oldOutput.sort((a, b) => 
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        )) === JSON.stringify(newOutput.sort((a, b) => 
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        ));

        if (!resultsMatch) {
          console.log(`    ❌ Results don't match! Old: ${oldOutput.length}, New: ${newOutput.length}`);
        }

        // Calculate performance difference
        const perfDiff = ((newResult.avg - oldResult.avg) / oldResult.avg) * 100;
        const perfIndicator = perfDiff > 0 ? '📈' : perfDiff < 0 ? '📉' : '📊';
        const perfSign = perfDiff > 0 ? '+' : '';

        console.log(`    Old (hot path): ${oldResult.avg.toFixed(2)}ms ±${oldResult.stdDev.toFixed(2)}ms`);
        console.log(`    New (streaming): ${newResult.avg.toFixed(2)}ms ±${newResult.stdDev.toFixed(2)}ms`);
        console.log(`    Difference: ${perfSign}${perfDiff.toFixed(2)}% ${perfIndicator} ${resultsMatch ? '✅' : '❌'}`);

        results[size][pipelineName] = {
          old: oldResult,
          new: newResult,
          perfDiff,
          resultsMatch,
          throughputOld: (size / oldResult.avg * 1000).toFixed(0),
          throughputNew: (size / newResult.avg * 1000).toFixed(0)
        };

      } catch (error) {
        console.log(`    ❌ Error testing ${pipelineName}: ${error.message}`);
        results[size][pipelineName] = { error: error.message };
      }
    }

    console.log('');
  }

  // Summary analysis
  console.log('\n🎯 Summary Analysis');
  console.log('═'.repeat(70));

  let totalTests = 0;
  let fasterTests = 0;
  let slowerTests = 0;
  let errorTests = 0;
  const perfDiffs = [];

  for (const [size, sizeResults] of Object.entries(results)) {
    for (const [pipeline, result] of Object.entries(sizeResults)) {
      if (result.error) {
        errorTests++;
      } else if (result.resultsMatch) {
        totalTests++;
        if (result.perfDiff < 0) {
          fasterTests++;
        } else if (result.perfDiff > 0) {
          slowerTests++;
        }
        perfDiffs.push(result.perfDiff);
      }
    }
  }

  const avgPerfDiff = perfDiffs.reduce((a, b) => a + b, 0) / perfDiffs.length;
  const medianPerfDiff = perfDiffs.sort((a, b) => a - b)[Math.floor(perfDiffs.length / 2)];

  console.log(`📈 Tests where new approach is faster: ${fasterTests}/${totalTests} (${(fasterTests/totalTests*100).toFixed(1)}%)`);
  console.log(`📉 Tests where new approach is slower: ${slowerTests}/${totalTests} (${(slowerTests/totalTests*100).toFixed(1)}%)`);
  console.log(`❌ Tests with errors: ${errorTests}`);
  console.log(`📊 Average performance difference: ${avgPerfDiff > 0 ? '+' : ''}${avgPerfDiff.toFixed(2)}%`);
  console.log(`📊 Median performance difference: ${medianPerfDiff > 0 ? '+' : ''}${medianPerfDiff.toFixed(2)}%`);

  // Detailed breakdown by operation type
  console.log('\n🔍 Performance by Operation Type');
  console.log('─'.repeat(70));
  
  const operationSummary = {};
  for (const [size, sizeResults] of Object.entries(results)) {
    for (const [pipeline, result] of Object.entries(sizeResults)) {
      if (!result.error && result.resultsMatch) {
        if (!operationSummary[pipeline]) {
          operationSummary[pipeline] = [];
        }
        operationSummary[pipeline].push(result.perfDiff);
      }
    }
  }

  for (const [operation, diffs] of Object.entries(operationSummary)) {
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const indicator = avgDiff > 0 ? '📈' : avgDiff < 0 ? '📉' : '📊';
    console.log(`${operation.padEnd(20)}: ${avgDiff > 0 ? '+' : ''}${avgDiff.toFixed(2)}% ${indicator}`);
  }

  return results;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runStreamingSwitchoverComparison().catch(console.error);
}