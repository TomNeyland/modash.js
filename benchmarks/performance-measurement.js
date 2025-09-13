/**
 * Enhanced Performance measurement for modash.js
 * Integrated with performance tracking for persistent results and comparisons
 */

import Modash from '../src/modash/index.ts';
import { generateTestData, BENCHMARK_PIPELINES } from './setup.js';
import { PerformanceTracker } from './performance-tracker.js';

// Test data sizes for comprehensive benchmarking
const TEST_SIZES = [100, 500, 1000, 2500, 5000, 10000];

export async function runPerformanceMeasurement() {
  const tracker = new PerformanceTracker();
  
  console.log('🚀 Running modash.js Performance Measurement\n');
  
  // Load historical data for comparison
  const historicalData = await tracker.loadPreviousResults();
  
  const results = {};
  
  for (const size of TEST_SIZES) {
    console.log(`📊 Measuring dataset size: ${size.toLocaleString()} documents`);
    console.log('─'.repeat(60));
    
    const testData = generateTestData(size);
    results[size] = {};
    
    // Test each pipeline type with multiple iterations for accuracy
    for (const [pipelineName, pipelineStages] of Object.entries(BENCHMARK_PIPELINES)) {
      const iterations = size > 10000 ? 3 : 5; // Fewer iterations for large datasets
      
      const result = tracker.benchmark(
        `${pipelineName} (${size})`,
        () => Modash.aggregate(testData, pipelineStages),
        iterations
      );
      
      results[size][pipelineName] = result;
      
      // Display immediate results
      const performance = result.avg < 1 ? `${(result.avg * 1000).toFixed(0)}μs` : `${result.avg}ms`;
      const throughput = Math.round((size / result.avg) * 1000).toLocaleString();
      const consistency = `±${result.stdDev}ms`;
      
      console.log(`  ${pipelineName.padEnd(20)} : ${performance.padStart(8)} ${consistency.padStart(10)} | ${throughput} docs/sec`);
    }
    
    console.log('');
  }
  
  // Add performance deltas compared to previous runs
  const enhancedResults = tracker.addPerformanceDeltas(results, historicalData);
  
  // Record results to file (if not in CI)
  await tracker.recordResults(enhancedResults);
  
  // Print comprehensive comparison analysis
  tracker.printPerformanceComparison(enhancedResults, historicalData);
  
  // Print performance insights
  printPerformanceInsights(enhancedResults);
  
  return enhancedResults;
}

function printPerformanceInsights(results) {
  console.log('💡 Performance Insights');
  console.log('=' .repeat(60));
  
  // Find fastest and slowest operations
  const benchmarks = [];
  for (const [size, sizeResults] of Object.entries(results)) {
    for (const [name, result] of Object.entries(sizeResults)) {
      benchmarks.push({ size: parseInt(size), name, ...result });
    }
  }
  
  // Analyze by operation type
  const operationTypes = {};
  for (const benchmark of benchmarks) {
    if (!operationTypes[benchmark.name]) {
      operationTypes[benchmark.name] = [];
    }
    operationTypes[benchmark.name].push(benchmark);
  }
  
  console.log('\n🏆 Best Performing Operations:');
  console.log('-'.repeat(40));
  
  for (const [operation, benchmarks] of Object.entries(operationTypes)) {
    const avgThroughput = benchmarks.map(b => (b.size / b.avg) * 1000);
    const bestThroughput = Math.max(...avgThroughput);
    const bestSize = benchmarks[avgThroughput.indexOf(bestThroughput)].size;
    
    console.log(`${operation.padEnd(20)}: ${bestThroughput.toLocaleString().padStart(10)} docs/sec (${bestSize} docs)`);
  }
  
  // Scaling efficiency analysis
  console.log('\n📈 Scaling Efficiency Analysis:');
  console.log('-'.repeat(40));
  
  const sizes = Object.keys(results).map(Number).sort((a, b) => a - b);
  
  for (const operation of Object.keys(operationTypes)) {
    const operationBenchmarks = sizes.map(size => results[size]?.[operation]).filter(Boolean);
    
    if (operationBenchmarks.length >= 2) {
      const small = operationBenchmarks[0];
      const large = operationBenchmarks[operationBenchmarks.length - 1];
      
      const sizeRatio = parseInt(Object.keys(results)[Object.keys(results).length - 1]) / parseInt(Object.keys(results)[0]);
      const timeRatio = large.avg / small.avg;
      const efficiency = sizeRatio / timeRatio;
      
      const efficiencyIndicator = efficiency > 0.8 ? '✅' : efficiency > 0.5 ? '⚠️' : '❌';
      
      console.log(`${operation.padEnd(20)}: ${efficiency.toFixed(2)}x efficiency ${efficiencyIndicator}`);
    }
  }
  
  // Memory usage insights
  console.log('\n💾 Memory Usage Analysis:');
  console.log('-'.repeat(40));
  
  for (const operation of Object.keys(operationTypes)) {
    const memoryUsages = operationTypes[operation].map(b => b.memoryDelta);
    const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;
    
    const memoryIndicator = avgMemory < 1 ? '✅' : avgMemory < 5 ? '⚠️' : '❌';
    const sign = avgMemory >= 0 ? '+' : '';
    
    console.log(`${operation.padEnd(20)}: ${sign}${avgMemory.toFixed(2)}MB avg ${memoryIndicator}`);
  }
  
  console.log('\n✨ Measurement completed successfully!');
}

// Run the measurement if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceMeasurement().catch(console.error);
}