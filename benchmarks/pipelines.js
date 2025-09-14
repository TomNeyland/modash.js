/**
 * Pipeline-level benchmarks for modash.js
 * Tests complete pipeline performance and validates targets
 */

import Modash from '../src/modash/index.ts';
import { generateTestData, BENCHMARK_PIPELINES } from './setup.js';
import { PerformanceTracker } from './performance-tracker.js';
import { perfCounters } from './operators.js';

// Performance targets from the issue
const PERFORMANCE_TARGETS = {
  simpleFilter: {
    minDocsPerSec: 1000000, // 1.0M docs/sec for 10k docs
    maxAllocsPerRow: 0.05,
    description: 'Simple filter operations'
  },
  groupAndAggregate: {
    minDocsPerSec: 250000, // 250k docs/sec for 10k docs
    maxAllocsPerRow: 0.05,
    description: 'Group and aggregate operations'
  },
  complexPipeline: {
    minDocsPerSec: 150000, // 150k docs/sec for 10k docs
    maxAllocsPerRow: 0.05,
    description: 'Complex multi-stage pipelines'
  }
};

// Enhanced pipeline configurations with more test cases
const ENHANCED_PIPELINES = {
  ...BENCHMARK_PIPELINES,
  
  // Additional pipeline variations for testing
  'match_project_fusion': [
    { $match: { category: 'electronics', active: true } },
    { $project: { item: 1, price: 1, revenue: { $multiply: ['$price', '$quantity'] } } }
  ],
  
  'topK_heap': [
    { $sort: { price: -1 } },
    { $limit: 100 }
  ],
  
  'group_sort_limit': [
    { $group: { _id: '$category', avgPrice: { $avg: '$price' }, count: { $sum: 1 } } },
    { $sort: { avgPrice: -1 } },
    { $limit: 5 }
  ],
  
  'unwind_group': [
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]
};

// Test data sizes focused on performance targets
const PIPELINE_TEST_SIZES = [1000, 5000, 10000, 25000];

export async function runPipelineBenchmarks() {
  const tracker = new PerformanceTracker();
  
  console.log('⚡ Running Pipeline Performance Benchmarks\n');
  console.log('='.repeat(80));
  
  const results = {};
  const targetViolations = [];
  
  for (const size of PIPELINE_TEST_SIZES) {
    console.log(`\n📊 Dataset Size: ${size.toLocaleString()} documents`);
    console.log('-'.repeat(60));
    
    const testData = generateTestData(size);
    results[size] = {};
    
    for (const [pipelineName, pipeline] of Object.entries(ENHANCED_PIPELINES)) {
      // Reset counters for each test
      perfCounters.reset();
      
      // Warmup runs to eliminate JIT compilation effects
      for (let i = 0; i < 5; i++) {
        try {
          Modash.aggregate(testData, pipeline);
        } catch (error) {
          console.log(`  ${pipelineName.padEnd(25)} : ❌ Warmup Error: ${error.message}`);
          break;
        }
      }
      
      // Reset counters after warmup
      perfCounters.reset();
      
      // Measured runs
      const iterations = size >= 25000 ? 3 : 5;
      const result = tracker.benchmark(
        `${pipelineName} (${size})`,
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
        console.log(`  ${pipelineName.padEnd(25)} : ❌ Error: ${result.error}`);
        results[size][pipelineName] = { error: result.error };
        continue;
      }
      
      // Calculate performance metrics
      const docsPerSec = size / (result.avg / 1000);
      const counters = perfCounters.getReport(size);
      
      results[size][pipelineName] = {
        ...result,
        docsPerSec,
        counters,
        size
      };
      
      // Display results
      const throughputDisplay = docsPerSec >= 1000 
        ? `${(docsPerSec/1000).toFixed(1)}k docs/sec`
        : `${Math.round(docsPerSec)} docs/sec`;
        
      console.log(`  ${pipelineName.padEnd(25)} : ${result.avg.toFixed(2)}ms ±${result.stdDev.toFixed(2)}ms | ${throughputDisplay}`);
      
      // Check against performance targets (for 10k dataset)
      if (size === 10000 && PERFORMANCE_TARGETS[pipelineName]) {
        const target = PERFORMANCE_TARGETS[pipelineName];
        
        if (docsPerSec < target.minDocsPerSec) {
          const violation = {
            pipeline: pipelineName,
            metric: 'throughput',
            actual: docsPerSec,
            target: target.minDocsPerSec,
            severity: 'critical'
          };
          targetViolations.push(violation);
          console.log(`    ❌ Below throughput target: ${(docsPerSec/1000).toFixed(1)}k < ${(target.minDocsPerSec/1000).toFixed(1)}k docs/sec`);
        } else {
          console.log(`    ✅ Throughput target met: ${(docsPerSec/1000).toFixed(1)}k >= ${(target.minDocsPerSec/1000).toFixed(1)}k docs/sec`);
        }
        
        if (counters.allocsPerRow > target.maxAllocsPerRow) {
          const violation = {
            pipeline: pipelineName,
            metric: 'allocations',
            actual: counters.allocsPerRow,
            target: target.maxAllocsPerRow,
            severity: 'major'
          };
          targetViolations.push(violation);
          console.log(`    ❌ High allocations: ${counters.allocsPerRow.toFixed(3)} > ${target.maxAllocsPerRow} allocs/row`);
        } else if (counters.allocsPerRow > 0) {
          console.log(`    ✅ Allocation target met: ${counters.allocsPerRow.toFixed(3)} <= ${target.maxAllocsPerRow} allocs/row`);
        }
      }
      
      // Check for fallbacks (should be zero in hot path)
      if (counters.fallbacks > 0) {
        console.log(`    ❌ Fallbacks detected: ${counters.fallbacks} (should be 0)`);
        targetViolations.push({
          pipeline: pipelineName,
          metric: 'fallbacks',
          actual: counters.fallbacks,
          target: 0,
          severity: 'critical'
        });
      }
      
      // Memory efficiency warnings
      if (counters.bytesPerRow > 1000) {
        console.log(`    ⚠️  High memory usage: ${(counters.bytesPerRow/1024).toFixed(2)}KB per row`);
      }
    }
  }
  
  // Performance summary and target compliance
  console.log('\n🎯 Performance Target Compliance Report');
  console.log('='.repeat(80));
  
  if (targetViolations.length === 0) {
    console.log('✅ All performance targets met!');
  } else {
    console.log(`❌ ${targetViolations.length} performance target violations detected:\n`);
    
    const criticalViolations = targetViolations.filter(v => v.severity === 'critical');
    const majorViolations = targetViolations.filter(v => v.severity === 'major');
    
    if (criticalViolations.length > 0) {
      console.log('🚨 CRITICAL VIOLATIONS (will fail CI):');
      criticalViolations.forEach(v => {
        const actualStr = v.metric === 'throughput' 
          ? `${(v.actual/1000).toFixed(1)}k docs/sec`
          : v.actual.toString();
        const targetStr = v.metric === 'throughput'
          ? `${(v.target/1000).toFixed(1)}k docs/sec`
          : v.target.toString();
        console.log(`  - ${v.pipeline}: ${v.metric} ${actualStr} (target: ${targetStr})`);
      });
      console.log('');
    }
    
    if (majorViolations.length > 0) {
      console.log('⚠️  MAJOR VIOLATIONS (performance regression):');
      majorViolations.forEach(v => {
        console.log(`  - ${v.pipeline}: ${v.metric} ${v.actual.toFixed(3)} (target: ${v.target})`);
      });
    }
  }
  
  // Scaling efficiency analysis
  console.log('\n📈 Scaling Efficiency Analysis');
  console.log('-'.repeat(60));
  
  for (const [pipelineName] of Object.entries(PERFORMANCE_TARGETS)) {
    if (!results[1000] || !results[10000] || !results[1000][pipelineName] || !results[10000][pipelineName]) {
      continue;
    }
    
    const small = results[1000][pipelineName];
    const large = results[10000][pipelineName];
    
    if (small.error || large.error) continue;
    
    const scaleFactor = 10; // 10000 / 1000
    const expectedTime = small.avg * scaleFactor;
    const actualTime = large.avg;
    const efficiency = expectedTime / actualTime;
    
    console.log(`${pipelineName.padEnd(20)} : ${efficiency.toFixed(2)}x scaling efficiency`);
    
    if (efficiency < 0.5) {
      console.log(`  ⚠️  Poor scaling - may have O(n²) behavior`);
    } else if (efficiency > 0.8) {
      console.log(`  ✅ Good scaling - likely O(n) or better`);
    }
  }
  
  // Save comprehensive results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = `performance-results/pipelines-${timestamp}.json`;
  
  const fullResults = {
    results,
    targetViolations,
    targets: PERFORMANCE_TARGETS,
    timestamp: new Date().toISOString()
  };
  
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(resultsFile, JSON.stringify(fullResults, null, 2));
    console.log(`\n💾 Detailed results saved to: ${resultsFile}`);
  } catch (error) {
    console.log(`\n❌ Failed to save results: ${error.message}`);
  }
  
  console.log('\n⚡ Pipeline benchmarks completed!');
  
  // Return exit code based on critical violations for CI
  const hasCriticalViolations = targetViolations.some(v => v.severity === 'critical');
  return { results: fullResults, success: !hasCriticalViolations };
}