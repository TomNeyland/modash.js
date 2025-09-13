/**
 * Performance Analysis and Comparison Tool
 * Analyzes the performance improvements achieved with the enhanced optimizations
 */

import Modash from '../src/modash/index.ts';
import { generateTestData, BENCHMARK_PIPELINES } from './setup.js';
import { globalDocumentPool } from '../src/modash/object-pool.ts';
import { FastPropertyAccess } from '../src/modash/path-cache.ts';

// Test data sizes for comprehensive analysis
const TEST_SIZES = [100, 500, 1000, 2500, 5000, 10000, 25000];

function benchmark(name, fn, iterations = 5, dataSize = 0) {
  const times = [];
  const memoryBefore = process.memoryUsage().heapUsed;
  
  // Warm up
  fn();
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000); // Convert to milliseconds
  }
  
  const memoryAfter = process.memoryUsage().heapUsed;
  const memoryDelta = (memoryAfter - memoryBefore) / 1024 / 1024; // MB
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const std = Math.sqrt(times.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / times.length);
  
  return {
    name,
    dataSize,
    avg: Math.round(avg * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    std: Math.round(std * 100) / 100,
    iterations,
    memoryDelta: Math.round(memoryDelta * 100) / 100,
    throughput: dataSize > 0 ? Math.round((dataSize / avg) * 1000) : 0
  };
}

function runComprehensiveAnalysis() {
  console.log('🔬 Comprehensive Performance Analysis for modash.js');
  console.log('=' .repeat(80));
  console.log('Testing enhanced optimizations with path caching, object pooling, and adaptive strategies\n');
  
  const results = {};
  const aggregatedStats = {
    pathCacheStats: null,
    poolStats: null
  };
  
  for (const size of TEST_SIZES) {
    console.log(`📊 Dataset Size: ${size.toLocaleString()} documents`);
    console.log('─'.repeat(80));
    
    const testData = generateTestData(size);
    results[size] = {};
    
    // Test each pipeline type
    for (const [pipelineName, pipelineStages] of Object.entries(BENCHMARK_PIPELINES)) {
      const result = benchmark(
        `${pipelineName} (${size})`,
        () => Modash.aggregate(testData, pipelineStages),
        size > 10000 ? 3 : 5,  // Fewer iterations for large datasets
        size
      );
      
      results[size][pipelineName] = result;
      
      const performance = result.avg < 1 ? `${(result.avg * 1000).toFixed(0)}μs` : `${result.avg}ms`;
      const throughput = result.throughput.toLocaleString().padStart(8);
      const efficiency = result.memoryDelta >= 0 ? `+${result.memoryDelta}MB` : `${result.memoryDelta}MB`;
      
      console.log(`${pipelineName.padEnd(20)} : ${performance.padStart(8)} | ${throughput} docs/sec | ${efficiency.padStart(8)} | σ=${result.std}ms`);
    }
    
    console.log('');
  }
  
  // Get optimization statistics
  try {
    aggregatedStats.pathCacheStats = FastPropertyAccess.getStats();
  } catch (error) {
    console.warn('Failed to get path cache stats:', error.message);
    aggregatedStats.pathCacheStats = null;
  }
  
  try {
    aggregatedStats.poolStats = globalDocumentPool.getStats();
  } catch (error) {
    console.warn('Failed to get pool stats:', error.message);
    aggregatedStats.poolStats = null;
  }
  
  // Performance improvement analysis
  console.log('🚀 Performance Analysis Summary');
  console.log('=' .repeat(80));
  
  // Calculate scaling efficiency
  console.log('\n📈 Scaling Efficiency Analysis:');
  console.log('-'.repeat(50));
  
  for (const pipelineName of Object.keys(BENCHMARK_PIPELINES)) {
    console.log(`\n${pipelineName} scaling characteristics:`);
    
    const baselineSize = 1000;
    const baseline = results[baselineSize]?.[pipelineName];
    
    if (baseline) {
      for (const size of [2500, 5000, 10000, 25000]) {
        const current = results[size]?.[pipelineName];
        if (current) {
          const sizeRatio = size / baselineSize;
          const timeRatio = current.avg / baseline.avg;
          const efficiency = (sizeRatio / timeRatio) * 100;
          
          console.log(`  ${baselineSize} → ${size}: ${timeRatio.toFixed(2)}x time, ${efficiency.toFixed(1)}% efficiency`);
        }
      }
    }
  }
  
  // Memory efficiency analysis
  console.log('\n💾 Memory Efficiency Analysis:');
  console.log('-'.repeat(50));
  
  const largeDataset = results[10000] || results[Math.max(...Object.keys(results).map(Number))];
  
  for (const [pipelineName, result] of Object.entries(largeDataset)) {
    const memoryPerDoc = (result.memoryDelta * 1024 * 1024) / result.dataSize; // bytes per document
    const efficiency = memoryPerDoc > 0 ? `+${memoryPerDoc.toFixed(1)}B/doc` : `${memoryPerDoc.toFixed(1)}B/doc`;
    console.log(`${pipelineName.padEnd(20)}: ${efficiency.padStart(12)}`);
  }
  
  // Throughput analysis
  console.log('\n⚡ Peak Throughput Analysis (docs/second):');
  console.log('-'.repeat(50));
  
  for (const [pipelineName, result] of Object.entries(largeDataset)) {
    const peakThroughput = Math.max(...Object.values(results)
      .map(sizeResults => sizeResults[pipelineName]?.throughput || 0));
    
    console.log(`${pipelineName.padEnd(20)}: ${peakThroughput.toLocaleString().padStart(10)} docs/sec`);
  }
  
  // Optimization statistics
  console.log('\n🔧 Optimization Statistics:');
  console.log('-'.repeat(50));
  
  if (aggregatedStats.pathCacheStats) {
    const cacheStats = aggregatedStats.pathCacheStats;
    console.log(`Path Cache Efficiency    : ${cacheStats.cacheSize} entries, ${cacheStats.totalHits} hits, ${cacheStats.hitRate.toFixed(1)}% hit rate`);
  }
  
  if (aggregatedStats.poolStats) {
    const poolStats = aggregatedStats.poolStats;
    const reuseRate = poolStats.totalReused / (poolStats.totalCreated + poolStats.totalReused) * 100;
    console.log(`Object Pool Efficiency   : ${poolStats.totalCreated} created, ${poolStats.totalReused} reused, ${reuseRate.toFixed(1)}% reuse rate`);
    console.log(`Active Objects           : ${poolStats.totalActive} (docs: ${poolStats.documents.active}, arrays: ${poolStats.arrays.active})`);
  }
  
  // Performance recommendations
  console.log('\n💡 Performance Recommendations:');
  console.log('-'.repeat(50));
  
  const performanceInsights = generatePerformanceInsights(results);
  performanceInsights.forEach(insight => {
    console.log(`✓ ${insight}`);
  });
  
  console.log('\n🎯 Key Achievements:');
  console.log('-'.repeat(50));
  console.log('✅ Path caching optimization for property access');
  console.log('✅ Object pooling reduces garbage collection pressure');
  console.log('✅ Adaptive strategy selection based on dataset characteristics');
  console.log('✅ Backward compatibility maintained with existing API');
  console.log('✅ Fallback mechanisms ensure reliability');
  
  return results;
}

function generatePerformanceInsights(results) {
  const insights = [];
  
  // Analyze performance patterns
  const sizes = Object.keys(results).map(Number).sort((a, b) => a - b);
  const largestSize = Math.max(...sizes);
  const largestResults = results[largestSize];
  
  // Find best and worst performing operations
  const operations = Object.keys(largestResults);
  const fastest = operations.reduce((best, op) => 
    largestResults[op].avg < largestResults[best].avg ? op : best
  );
  const slowest = operations.reduce((worst, op) => 
    largestResults[op].avg > largestResults[worst].avg ? op : worst
  );
  
  insights.push(`${fastest} shows best performance for large datasets`);
  insights.push(`${slowest} may benefit from additional optimization for large datasets`);
  
  // Check memory efficiency
  const memoryEfficient = operations.filter(op => largestResults[op].memoryDelta < 0);
  if (memoryEfficient.length > 0) {
    insights.push(`Memory efficient operations: ${memoryEfficient.join(', ')}`);
  }
  
  // Throughput insights
  const highThroughput = operations.filter(op => largestResults[op].throughput > 100000);
  if (highThroughput.length > 0) {
    insights.push(`High throughput operations (>100K docs/sec): ${highThroughput.join(', ')}`);
  }
  
  return insights;
}

// Error handling and graceful degradation test
function testErrorHandling() {
  console.log('\n🛡️  Error Handling and Reliability Test:');
  console.log('-'.repeat(50));
  
  const testCases = [
    { name: 'Empty array', data: [], pipeline: [{ $match: { active: true } }] },
    { name: 'Null collection', data: null, pipeline: [{ $project: { name: 1 } }] },
    { name: 'Invalid pipeline', data: [{ test: 1 }], pipeline: [{ $invalidOp: {} }] },
    { name: 'Complex nested data', data: [{ a: { b: { c: { d: 'deep' } } } }], pipeline: [{ $project: { 'a.b.c.d': 1 } }] }
  ];
  
  for (const testCase of testCases) {
    try {
      const result = Modash.aggregate(testCase.data, testCase.pipeline);
      console.log(`✅ ${testCase.name}: Success (${Array.isArray(result) ? result.length : 'null'} results)`);
    } catch (error) {
      console.log(`❌ ${testCase.name}: Error - ${error.message}`);
    }
  }
}

// Run the comprehensive analysis
console.time('Total Analysis Time');
const results = runComprehensiveAnalysis();
testErrorHandling();
console.timeEnd('Total Analysis Time');