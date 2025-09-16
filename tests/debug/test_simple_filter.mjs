import Aggo from '../../src/aggo/index';
import { generateTestData } from '../../benchmarks/setup';

// Generate 10k test data (same as CI test)
const testData = generateTestData(10000);

console.log('🎯 Testing Simple Filter Performance (CI benchmark)');
console.log(`Dataset: ${testData.length} documents`);

// Use exact same pipeline as CI
const pipeline = [
  { $match: { category: 'electronics', active: true } }
];

console.log('Pipeline:', JSON.stringify(pipeline, null, 2));

// Multiple iterations like CI does
const iterations = 5;
const times = [];

for (let i = 0; i < iterations; i++) {
  const start = process.hrtime.bigint();
  const result = Aggo.aggregate(testData, pipeline);
  const end = process.hrtime.bigint();
  
  const timeMs = Number(end - start) / 1_000_000;
  times.push(timeMs);
  
  console.log(`Iteration ${i + 1}: ${result.length} results in ${timeMs.toFixed(2)}ms`);
  console.log(`  Throughput: ${(testData.length / timeMs * 1000).toFixed(0)} docs/sec`);
}

// Calculate statistics
const avg = times.reduce((a, b) => a + b) / times.length;
const min = Math.min(...times);
const max = Math.max(...times);
const throughput = testData.length / avg * 1000;

console.log('\n📊 Summary:');
console.log(`Average: ${avg.toFixed(2)}ms`);
console.log(`Range: ${min.toFixed(2)}ms - ${max.toFixed(2)}ms`);
console.log(`Throughput: ${throughput.toFixed(0)} docs/sec`);
console.log(`Target: 1,000,000 docs/sec`);
console.log(`Status: ${throughput >= 1_000_000 ? '✅ PASS' : '❌ FAIL'}`);