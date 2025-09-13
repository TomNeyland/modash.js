/**
 * Benchmark runner for modash.js performance testing
 */

import Modash from '../src/modash/index.js';
import { generateTestData, BENCHMARK_PIPELINES, DATA_SIZES } from './setup.js';

/**
 * Measure execution time of a function
 */
function benchmark(name, fn, iterations = 1) {
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000); // Convert to milliseconds
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  
  return {
    name,
    avg: Math.round(avg * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    iterations,
  };
}

/**
 * Run comprehensive benchmarks
 */
function runBenchmarks() {
  const results = {};
  
  console.log('🚀 Starting modash.js Performance Benchmarks\n');
  
  // Test different data sizes
  for (const [sizeName, size] of Object.entries(DATA_SIZES)) {
    console.log(`📊 Testing with ${sizeName} dataset (${size} documents):`);
    results[sizeName] = {};
    
    const testData = generateTestData(size);
    console.log(`   Generated ${testData.length} documents`);
    
    // Test each pipeline
    for (const [pipelineName, pipeline] of Object.entries(BENCHMARK_PIPELINES)) {
      const iterations = size <= 1000 ? 10 : 3; // More iterations for smaller datasets
      
      const result = benchmark(
        `${sizeName}-${pipelineName}`,
        () => Modash.aggregate(testData, pipeline),
        iterations
      );
      
      results[sizeName][pipelineName] = result;
      console.log(`   ${pipelineName}: ${result.avg}ms avg (${result.min}-${result.max}ms)`);
    }
    console.log('');
  }
  
  return results;
}

/**
 * Memory usage analysis
 */
function analyzeMemoryUsage() {
  console.log('💾 Memory Usage Analysis:');
  
  const initialMemory = process.memoryUsage();
  console.log('Initial memory:', formatMemory(initialMemory));
  
  // Test memory usage with different data sizes
  for (const [sizeName, size] of Object.entries(DATA_SIZES)) {
    const beforeMemory = process.memoryUsage();
    const testData = generateTestData(size);
    const afterGeneration = process.memoryUsage();
    
    // Run a complex pipeline
    const result = Modash.aggregate(testData, BENCHMARK_PIPELINES.complexPipeline);
    const afterPipeline = process.memoryUsage();
    
    console.log(`\n${sizeName} (${size} documents):`);
    console.log(`  Data generation: ${formatMemoryDiff(beforeMemory, afterGeneration)}`);
    console.log(`  Pipeline execution: ${formatMemoryDiff(afterGeneration, afterPipeline)}`);
    console.log(`  Result size: ${result.length} documents`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}

function formatMemory(mem) {
  return `${Math.round(mem.heapUsed / 1024 / 1024)}MB heap`;
}

function formatMemoryDiff(before, after) {
  const diff = after.heapUsed - before.heapUsed;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${Math.round(diff / 1024 / 1024)}MB`;
}

// Run benchmarks
const results = runBenchmarks();
analyzeMemoryUsage();

// Summary
console.log('\n📈 Performance Summary:');
console.log('='.repeat(50));

for (const [sizeName, sizeResults] of Object.entries(results)) {
  console.log(`\n${sizeName.toUpperCase()} Dataset:`);
  const sorted = Object.entries(sizeResults).sort((a, b) => a[1].avg - b[1].avg);
  
  for (const [pipelineName, result] of sorted) {
    console.log(`  ${pipelineName.padEnd(20)}: ${result.avg}ms`);
  }
}

export { runBenchmarks, analyzeMemoryUsage };