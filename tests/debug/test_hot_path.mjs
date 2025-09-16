import Aggo from '../../src/aggo/index';
import { getHotPathStats, resetHotPathStats } from '../../src/aggo/hot-path-aggregation';

// Generate test data
const testData = [];
for (let i = 0; i < 10000; i++) {
  testData.push({
    _id: i,
    category: i % 5 === 0 ? 'electronics' : 'other',
    active: i % 3 === 0,
    price: Math.random() * 1000,
    quantity: Math.floor(Math.random() * 100)
  });
}

console.log('🧪 Testing Hot Path Performance\n');

// Reset stats
await resetHotPathStats();

// Test 1: Simple filter (should use hot path)
console.log('Test 1: Simple filter');
const start1 = Date.now();
const result1 = Aggo.aggregate(testData, [
  { $match: { category: 'electronics', active: true } }
]);
const time1 = Date.now() - start1;
console.log(`Result: ${result1.length} documents in ${time1}ms`);
console.log(`Throughput: ${(testData.length / time1 * 1000).toFixed(0)} docs/sec`);

// Test 2: Simple sort + limit (should use hot path with Top-K)
console.log('\nTest 2: Sort + limit (Top-K)');
const start2 = Date.now();
const result2 = Aggo.aggregate(testData, [
  { $sort: { price: -1 } },
  { $limit: 100 }
]);
const time2 = Date.now() - start2;
console.log(`Result: ${result2.length} documents in ${time2}ms`);
console.log(`Throughput: ${(testData.length / time2 * 1000).toFixed(0)} docs/sec`);

// Test 3: Complex pipeline (should fallback)
console.log('\nTest 3: Complex pipeline (fallback expected)');
const start3 = Date.now();
const result3 = Aggo.aggregate(testData, [
  { $match: { active: true } },
  { $project: { 
    category: 1, 
    revenue: { $multiply: ['$price', '$quantity'] } // Computed field - should fallback
  }}
]);
const time3 = Date.now() - start3;
console.log(`Result: ${result3.length} documents in ${time3}ms`);
console.log(`Throughput: ${(testData.length / time3 * 1000).toFixed(0)} docs/sec`);

// Get hot path stats
console.log('\n📊 Hot Path Statistics:');
const stats = await getHotPathStats();
console.log(`Total operations: ${stats.totalOperations}`);
console.log(`Hot path hits: ${stats.hotPathHits}`);
console.log(`Fallbacks: ${stats.fallbacks}`);
console.log(`Hit rate: ${stats.hotPathHitRate.toFixed(1)}%`);
console.log(`Hot path throughput: ${stats.averageHotPathThroughput.toFixed(0)} docs/sec`);
console.log(`Fallback throughput: ${stats.averageFallbackThroughput.toFixed(0)} docs/sec`);