import * as fs from 'fs';

/**
 * Deep parse dates in an object/array structure
 * Converts ISO date strings to Date objects recursively
 */
export function deepParseDates(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if it's an ISO date string
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(obj)) {
      return new Date(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepParseDates(item));
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepParseDates(value);
    }
    return result;
  }

  return obj;
}

/**
 * Load JSONL fixture with deep date parsing
 */
export function loadFixture(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => deepParseDates(JSON.parse(line)));
}

/**
 * Measure query performance with warmup passes
 */
export function measurePerformance(name, fn, options = {}) {
  const { warmupPasses = 3, measurePasses = 5, verbose = false } = options;

  // Warmup passes
  if (verbose) console.log(`  Warming up ${name}...`);
  for (let i = 0; i < warmupPasses; i++) {
    fn();
  }

  // Measurement passes
  const times = [];
  for (let i = 0; i < measurePasses; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
    times.push(duration);
  }

  // Calculate statistics
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

  const result = {
    name,
    avg: Math.round(avg * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    median: Math.round(median * 100) / 100,
    passes: measurePasses,
  };

  if (verbose) {
    console.log(`  Performance for ${name}:`);
    console.log(`    Average: ${result.avg}ms`);
    console.log(`    Median:  ${result.median}ms`);
    console.log(`    Min:     ${result.min}ms`);
    console.log(`    Max:     ${result.max}ms`);
  }

  return result;
}

/**
 * Compare floating point numbers with tolerance
 */
export function assertCloseTo(
  actual,
  expected,
  tolerance = 0.01,
  message = ''
) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      message ||
        `Expected ${actual} to be close to ${expected} (tolerance: ${tolerance}, diff: ${diff})`
    );
  }
  return true;
}

/**
 * Format performance results for display
 */
export function formatPerformanceReport(results) {
  const lines = [];
  lines.push('\n=== Performance Report ===');

  for (const result of results) {
    lines.push(`\n${result.name}:`);
    lines.push(
      `  Avg: ${result.avg}ms | Med: ${result.median}ms | Min: ${result.min}ms | Max: ${result.max}ms`
    );
  }

  lines.push('\n========================\n');
  return lines.join('\n');
}
