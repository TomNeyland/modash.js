#!/usr/bin/env node
/**
 * CI-focused performance benchmark for modash.js
 * Validates core performance targets without fallback detection
 */

import Modash from '../src/modash/index.ts';
import { generateTestData, BENCHMARK_PIPELINES } from './setup.js';

// Performance targets from the issue
const PERFORMANCE_TARGETS = {
  simpleFilter: {
    minDocsPerSec: 1000000, // 1.0M docs/sec for 10k docs
    description: 'Simple filter operations'
  },
  groupAndAggregate: {
    minDocsPerSec: 250000, // 250k docs/sec for 10k docs
    description: 'Group and aggregate operations'
  },
  complexPipeline: {
    minDocsPerSec: 150000, // 150k docs/sec for 10k docs
    description: 'Complex multi-stage pipelines'
  }
};

// Test with 10k documents (the target dataset size)
const TEST_SIZE = 10000;

export async function runCIBenchmark() {
  console.log('🚀 Running CI Performance Benchmark');
  console.log('==========================================\n');
  
  const testData = generateTestData(TEST_SIZE);
  const results = {};
  let allTargetsMet = true;
  
  console.log(`📊 Testing ${TEST_SIZE.toLocaleString()} documents`);
  console.log('-'.repeat(60));
  
  for (const [pipelineName, pipeline] of Object.entries(BENCHMARK_PIPELINES)) {
    // Only test the core pipelines that have targets
    if (!PERFORMANCE_TARGETS[pipelineName]) continue;
    
    const target = PERFORMANCE_TARGETS[pipelineName];
    
    // Warmup runs
    for (let i = 0; i < 3; i++) {
      Modash.aggregate(testData, pipeline);
    }
    
    // Measured runs
    const iterations = 5;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const output = Modash.aggregate(testData, pipeline);
      const end = performance.now();
      
      times.push(end - start);
      
      // Validate output
      if (!Array.isArray(output)) {
        throw new Error(`Expected array output for ${pipelineName}, got ${typeof output}`);
      }
    }
    
    // Calculate statistics
    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    const docsPerSec = TEST_SIZE / (avgTime / 1000);
    
    results[pipelineName] = {
      avgTimeMs: avgTime,
      docsPerSec,
      targetMet: docsPerSec >= target.minDocsPerSec,
      target: target.minDocsPerSec,
      improvement: ((docsPerSec / target.minDocsPerSec) * 100).toFixed(1)
    };
    
    // Display results
    const throughputDisplay = docsPerSec >= 1000000 
      ? `${(docsPerSec/1000000).toFixed(1)}M docs/sec`
      : `${(docsPerSec/1000).toFixed(1)}k docs/sec`;
    
    const targetDisplay = target.minDocsPerSec >= 1000000
      ? `${(target.minDocsPerSec/1000000).toFixed(1)}M`
      : `${(target.minDocsPerSec/1000).toFixed(1)}k`;
    
    console.log(`  ${pipelineName.padEnd(20)} : ${avgTime.toFixed(2)}ms | ${throughputDisplay}`);
    
    if (results[pipelineName].targetMet) {
      console.log(`    ✅ Target exceeded: ${results[pipelineName].improvement}% of ${targetDisplay} docs/sec target`);
    } else {
      console.log(`    ❌ Below target: ${throughputDisplay} < ${targetDisplay} docs/sec`);
      allTargetsMet = false;
    }
  }
  
  // Summary
  console.log('\n🎯 Performance Target Summary');
  console.log('=====================================');
  
  if (allTargetsMet) {
    console.log('✅ ALL PERFORMANCE TARGETS MET!');
    console.log('\nDetailed results:');
    
    for (const [name, result] of Object.entries(results)) {
      console.log(`  ${name}: ${result.improvement}% of target (${(result.docsPerSec/1000).toFixed(1)}k docs/sec)`);
    }
  } else {
    console.log('❌ Some performance targets not met');
    
    for (const [name, result] of Object.entries(results)) {
      const status = result.targetMet ? '✅' : '❌';
      console.log(`  ${status} ${name}: ${result.improvement}% of target`);
    }
  }
  
  // Save results for CI
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = `performance-results/ci-benchmark-${timestamp}.json`;
  
  const fullResults = {
    results,
    allTargetsMet,
    testSize: TEST_SIZE,
    timestamp: new Date().toISOString(),
    summary: {
      targetsCount: Object.keys(PERFORMANCE_TARGETS).length,
      targetsMet: Object.values(results).filter(r => r.targetMet).length,
      averageImprovement: Object.values(results).reduce((sum, r) => sum + parseFloat(r.improvement), 0) / Object.keys(results).length
    }
  };
  
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(resultsFile, JSON.stringify(fullResults, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}`);
  } catch (error) {
    console.log(`\n⚠️  Could not save results: ${error.message}`);
  }
  
  console.log(`\n🏁 CI Benchmark completed: ${allTargetsMet ? 'PASS' : 'FAIL'}`);
  
  return { success: allTargetsMet, results: fullResults };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const { success } = await runCIBenchmark();
  process.exit(success ? 0 : 1);
}