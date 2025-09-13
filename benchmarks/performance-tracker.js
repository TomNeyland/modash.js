/**
 * Performance tracking module for modash.js
 * Handles recording, comparing, and analyzing performance results over time
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '../performance-results');

export class PerformanceTracker {
  constructor() {
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.isCI = process.env.CI === 'true' || process.env.NODE_ENV === 'test';
  }

  /**
   * Benchmark a function with multiple iterations and return detailed stats
   */
  benchmark(name, fn, iterations = 5) {
    const times = [];
    const memoryBefore = process.memoryUsage().heapUsed;
    
    // Run the function multiple times to get reliable measurements
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // Convert to milliseconds
    }
    
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryDelta = (memoryAfter - memoryBefore) / 1024 / 1024; // MB
    
    // Calculate statistics
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const median = this.calculateMedian(times);
    const stdDev = this.calculateStdDev(times, avg);
    
    return {
      name,
      avg: Math.round(avg * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      median: Math.round(median * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      iterations,
      memoryDelta: Math.round(memoryDelta * 100) / 100,
      rawTimes: times
    };
  }

  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  calculateStdDev(numbers, mean) {
    const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
    return Math.sqrt(variance);
  }

  /**
   * Record performance results to file (only if not in CI)
   */
  async recordResults(results) {
    if (this.isCI) {
      console.log('📊 CI environment detected - performance results not persisted');
      return null;
    }

    try {
      await fs.mkdir(RESULTS_DIR, { recursive: true });
      
      const performanceData = {
        timestamp: new Date().toISOString(),
        testTimestamp: this.timestamp,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        results
      };

      const filename = `performance-${this.timestamp}.json`;
      const filepath = join(RESULTS_DIR, filename);
      
      await fs.writeFile(filepath, JSON.stringify(performanceData, null, 2));
      console.log(`📁 Performance results saved to: ${filename}`);
      
      return filepath;
    } catch (error) {
      console.error('❌ Failed to record performance results:', error.message);
      return null;
    }
  }

  /**
   * Load previous performance results for comparison
   */
  async loadPreviousResults() {
    try {
      const files = await fs.readdir(RESULTS_DIR);
      const performanceFiles = files
        .filter(f => f.startsWith('performance-') && f.endsWith('.json'))
        .sort(); // Chronological order by filename

      if (performanceFiles.length === 0) {
        return { first: null, previous: null, history: [] };
      }

      const loadFile = async (filename) => {
        try {
          const content = await fs.readFile(join(RESULTS_DIR, filename), 'utf-8');
          return JSON.parse(content);
        } catch (error) {
          console.warn(`⚠️  Failed to load ${filename}:`, error.message);
          return null;
        }
      };

      // Load first run results
      const firstFile = performanceFiles[0];
      const first = await loadFile(firstFile);

      // Load previous run results (second to last)
      let previous = null;
      if (performanceFiles.length > 1) {
        const previousFile = performanceFiles[performanceFiles.length - 1];
        previous = await loadFile(previousFile);
      }

      // Load recent history for trend analysis (last 5 runs)
      const recentFiles = performanceFiles.slice(-5);
      const history = [];
      for (const file of recentFiles) {
        const data = await loadFile(file);
        if (data) history.push(data);
      }

      return { first, previous, history };
    } catch (error) {
      console.warn('⚠️  Could not load previous results:', error.message);
      return { first: null, previous: null, history: [] };
    }
  }

  /**
   * Compare current results with historical data and add deltas
   */
  addPerformanceDeltas(currentResults, historicalData) {
    const { first, previous } = historicalData;
    
    const enhancedResults = {};
    
    for (const [datasetSize, benchmarks] of Object.entries(currentResults)) {
      enhancedResults[datasetSize] = {};
      
      for (const [benchmarkName, currentBenchmark] of Object.entries(benchmarks)) {
        const enhanced = { ...currentBenchmark };
        
        // Add delta from first run
        if (first?.results?.[datasetSize]?.[benchmarkName]) {
          const firstBenchmark = first.results[datasetSize][benchmarkName];
          enhanced.deltaFromFirst = {
            avg: Math.round((currentBenchmark.avg - firstBenchmark.avg) * 100) / 100,
            percentChange: Math.round(((currentBenchmark.avg - firstBenchmark.avg) / firstBenchmark.avg) * 10000) / 100
          };
        }
        
        // Add delta from previous run
        if (previous?.results?.[datasetSize]?.[benchmarkName]) {
          const previousBenchmark = previous.results[datasetSize][benchmarkName];
          enhanced.deltaFromPrevious = {
            avg: Math.round((currentBenchmark.avg - previousBenchmark.avg) * 100) / 100,
            percentChange: Math.round(((currentBenchmark.avg - previousBenchmark.avg) / previousBenchmark.avg) * 10000) / 100
          };
        }
        
        enhancedResults[datasetSize][benchmarkName] = enhanced;
      }
    }
    
    return enhancedResults;
  }

  /**
   * Print performance comparison analysis
   */
  printPerformanceComparison(results, historicalData) {
    const { first, previous, history } = historicalData;
    
    console.log('\n🔍 Performance Comparison Analysis');
    console.log('=' .repeat(60));
    
    if (first) {
      console.log(`📈 Comparing against first run: ${new Date(first.timestamp).toLocaleDateString()}`);
    } else {
      console.log('🆕 This is your first performance run!');
    }
    
    if (previous) {
      console.log(`📊 Comparing against previous run: ${new Date(previous.timestamp).toLocaleDateString()}`);
    }
    
    if (history.length > 1) {
      console.log(`📚 Performance history: ${history.length} previous runs`);
    }
    
    console.log('');
    
    // Print detailed comparisons for each benchmark
    for (const [datasetSize, benchmarks] of Object.entries(results)) {
      console.log(`📊 Dataset Size: ${datasetSize} documents`);
      console.log('-'.repeat(50));
      
      for (const [benchmarkName, benchmark] of Object.entries(benchmarks)) {
        console.log(`\n${benchmarkName}:`);
        console.log(`  Current: ${benchmark.avg}ms ±${benchmark.stdDev}ms (${benchmark.iterations} runs)`);
        
        if (benchmark.deltaFromFirst) {
          const delta = benchmark.deltaFromFirst;
          const symbol = delta.avg >= 0 ? '+' : '';
          const trend = delta.percentChange >= 0 ? '📈' : '📉';
          console.log(`  vs First: ${symbol}${delta.avg}ms (${symbol}${delta.percentChange}%) ${trend}`);
        }
        
        if (benchmark.deltaFromPrevious) {
          const delta = benchmark.deltaFromPrevious;
          const symbol = delta.avg >= 0 ? '+' : '';
          const trend = delta.percentChange >= 0 ? '📈' : '📉';
          console.log(`  vs Previous: ${symbol}${delta.avg}ms (${symbol}${delta.percentChange}%) ${trend}`);
        }
      }
      
      console.log('');
    }
  }
}