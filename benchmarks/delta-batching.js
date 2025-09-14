/**
 * Delta batching benchmarks for modash.js
 * Tests incremental update performance with different batch sizes
 */

import Modash from '../src/modash/index.ts';
import { generateTestData } from './setup.js';
import { PerformanceTracker } from './performance-tracker.js';
import { perfCounters } from './operators.js';

// Delta batch sizes to test
const BATCH_SIZES = [1, 64, 256, 1024];

// Test pipeline configurations
const DELTA_PIPELINES = {
  'simple_filter': [
    { $match: { active: true } },
    { $project: { item: 1, category: 1, price: 1 } }
  ],
  'aggregation': [
    { $match: { active: true } },
    { $group: { 
      _id: '$category', 
      totalPrice: { $sum: '$price' }, 
      count: { $sum: 1 } 
    }}
  ],
  'complex_pipeline': [
    { $match: { active: true, quantity: { $gt: 0 } } },
    { $project: {
      item: 1,
      category: 1,
      revenue: { $multiply: ['$price', '$quantity'] },
      month: { $month: '$date' }
    }},
    { $group: {
      _id: { category: '$category', month: '$month' },
      totalRevenue: { $sum: '$revenue' }
    }},
    { $sort: { totalRevenue: -1 } }
  ]
};

/**
 * Simulates streaming delta operations
 */
class DeltaSimulator {
  constructor(initialData, pipeline) {
    this.baseData = [...initialData];
    this.pipeline = pipeline;
    this.currentData = [...initialData];
    this.operations = [];
  }

  // Add documents in batches
  addBatch(documents) {
    const startTime = performance.now();
    
    perfCounters.reset();
    
    // Simulate incremental addition
    this.currentData.push(...documents);
    
    // Process with current pipeline
    const result = Modash.aggregate(this.currentData, this.pipeline);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.operations.push({
      type: 'add',
      count: documents.length,
      duration,
      counters: perfCounters.getReport(documents.length)
    });
    
    return { result, duration };
  }

  // Remove documents in batches
  removeBatch(count) {
    const startTime = performance.now();
    
    perfCounters.reset();
    
    // Simulate incremental removal
    const removed = this.currentData.splice(-count, count);
    
    // Process with current pipeline
    const result = Modash.aggregate(this.currentData, this.pipeline);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.operations.push({
      type: 'remove',
      count: removed.length,
      duration,
      counters: perfCounters.getReport(removed.length)
    });
    
    return { result, duration };
  }

  // Get performance statistics
  getStats() {
    const addOps = this.operations.filter(op => op.type === 'add');
    const removeOps = this.operations.filter(op => op.type === 'remove');
    
    const avgAddLatency = addOps.length > 0 
      ? addOps.reduce((sum, op) => sum + op.duration, 0) / addOps.length
      : 0;
      
    const avgRemoveLatency = removeOps.length > 0 
      ? removeOps.reduce((sum, op) => sum + op.duration, 0) / removeOps.length
      : 0;
    
    const totalDeltas = this.operations.reduce((sum, op) => sum + op.count, 0);
    const totalTime = this.operations.reduce((sum, op) => sum + op.duration, 0);
    
    const throughput = totalTime > 0 ? (totalDeltas / (totalTime / 1000)) : 0;
    
    // Calculate P99 latency for bursts
    const latencies = this.operations.map(op => op.duration).sort((a, b) => a - b);
    const p99Index = Math.floor(latencies.length * 0.99);
    const p99Latency = latencies[p99Index] || 0;
    
    return {
      avgAddLatency,
      avgRemoveLatency,
      throughput,
      p99Latency,
      totalOperations: this.operations.length,
      totalDeltas,
      operations: this.operations
    };
  }
}

export async function runDeltaBenchmarks() {
  const tracker = new PerformanceTracker();
  
  console.log('📈 Running Delta Batching Benchmarks\n');
  console.log('='.repeat(80));
  
  const results = {};
  
  // Base dataset size for delta operations
  const baseSize = 5000;
  const baseData = generateTestData(baseSize);
  
  for (const [pipelineName, pipeline] of Object.entries(DELTA_PIPELINES)) {
    console.log(`\n🔄 Pipeline: ${pipelineName}`);
    console.log('-'.repeat(50));
    
    results[pipelineName] = {};
    
    for (const batchSize of BATCH_SIZES) {
      console.log(`  Batch Size: ${batchSize}`);
      
      const simulator = new DeltaSimulator(baseData, pipeline);
      
      // Warmup
      const warmupData = generateTestData(batchSize);
      simulator.addBatch(warmupData);
      simulator.removeBatch(batchSize);
      
      // Reset for actual test
      simulator.operations = [];
      
      // Perform test operations
      const testIterations = Math.max(3, Math.floor(256 / batchSize)); // Ensure reasonable test duration
      
      for (let i = 0; i < testIterations; i++) {
        // Add batch
        const addData = generateTestData(batchSize);
        simulator.addBatch(addData);
        
        // Remove batch (simulate turnover)
        if (i > 0) { // Don't remove on first iteration
          simulator.removeBatch(batchSize);
        }
      }
      
      const stats = simulator.getStats();
      results[pipelineName][batchSize] = stats;
      
      console.log(`    Throughput: ${(stats.throughput / 1000).toFixed(1)}k deltas/sec`);
      console.log(`    Avg Add Latency: ${stats.avgAddLatency.toFixed(2)}ms`);
      console.log(`    Avg Remove Latency: ${stats.avgRemoveLatency.toFixed(2)}ms`);
      console.log(`    P99 Latency: ${stats.p99Latency.toFixed(2)}ms`);
      
      // Check performance targets
      if (stats.throughput < 250000) {
        console.log(`    ⚠️  Below target throughput (250k deltas/sec)`);
      }
      if (stats.p99Latency > 5.0) {
        console.log(`    ⚠️  P99 latency above target (5ms)`);
      }
      
      // Check allocation metrics
      const avgCounters = stats.operations.reduce((acc, op) => {
        acc.allocsPerRow = (acc.allocsPerRow || 0) + (op.counters.allocsPerRow || 0);
        acc.fallbacks = (acc.fallbacks || 0) + (op.counters.fallbacks || 0);
        return acc;
      }, {});
      
      avgCounters.allocsPerRow /= stats.operations.length;
      
      if (avgCounters.allocsPerRow > 0.05) {
        console.log(`    ❌ High allocations: ${avgCounters.allocsPerRow.toFixed(3)} allocs/row`);
      }
      if (avgCounters.fallbacks > 0) {
        console.log(`    ❌ Fallbacks detected: ${avgCounters.fallbacks}`);
      }
    }
  }
  
  // Performance summary
  console.log('\n📊 Delta Batching Performance Summary');
  console.log('='.repeat(80));
  
  for (const [pipelineName, pipelineResults] of Object.entries(results)) {
    console.log(`\n${pipelineName}:`);
    
    const bestBatch = Object.entries(pipelineResults).reduce((best, [size, stats]) => {
      return stats.throughput > best.throughput ? { size: parseInt(size), ...stats } : best;
    }, { throughput: 0 });
    
    console.log(`  Best batch size: ${bestBatch.size} (${(bestBatch.throughput/1000).toFixed(1)}k deltas/sec)`);
    
    // Check if targets are met
    const meetsTarget = bestBatch.throughput >= 250000 && bestBatch.p99Latency <= 5.0;
    console.log(`  Meets performance targets: ${meetsTarget ? '✅' : '❌'}`);
  }
  
  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = `performance-results/delta-batching-${timestamp}.json`;
  
  try {
    await tracker.saveResults(results, resultsFile);
    console.log(`\n💾 Detailed results saved to: ${resultsFile}`);
  } catch (error) {
    console.log(`\n❌ Failed to save results: ${error.message}`);
  }
  
  console.log('\n📈 Delta batching benchmarks completed!');
  return results;
}