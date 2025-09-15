/**
 * Execution Modes Demo
 * 
 * Demonstrates both execution modes in modash.js:
 * - 'stream': Optimized for real-time event feeds and incremental updates
 * - 'toggle': Optimized for fixed datasets with membership filtering (like crossfilter/dc.js)
 */

import Modash from '../src/index.ts';

console.log('🚀 Execution Modes Demo\n');

// Sample data for demonstrations
const salesData = [
  { product: 'laptop', category: 'electronics', price: 1000, quantity: 2, region: 'north' },
  { product: 'mouse', category: 'electronics', price: 25, quantity: 10, region: 'south' },
  { product: 'book', category: 'media', price: 15, quantity: 5, region: 'north' },
  { product: 'headphones', category: 'electronics', price: 150, quantity: 3, region: 'east' },
  { product: 'magazine', category: 'media', price: 8, quantity: 20, region: 'west' },
];

const pipeline = [
  { $addFields: { revenue: { $multiply: ['$price', '$quantity'] } } },
  { $group: { 
    _id: '$category', 
    totalRevenue: { $sum: '$revenue' },
    avgPrice: { $avg: '$price' },
    productCount: { $sum: 1 }
  }},
  { $sort: { totalRevenue: -1 } }
];

console.log('📊 Sample pipeline: Calculate revenue by category');
console.log('Pipeline stages:');
console.log('1. Add revenue field (price × quantity)');
console.log('2. Group by category with aggregations');
console.log('3. Sort by total revenue\n');

// Demo 1: Stream Mode (default)
console.log('🌊 STREAM MODE (mode: "stream")');
console.log('Optimized for: Real-time event feeds, incremental streaming updates');
const streamResult = Modash.aggregate(salesData, pipeline, { mode: 'stream' });
console.log('Result:', JSON.stringify(streamResult, null, 2));
console.log();

// Demo 2: Toggle Mode
console.log('🔄 TOGGLE MODE (mode: "toggle")');
console.log('Optimized for: Fixed datasets with membership toggling, dashboard filtering');
const toggleResult = Modash.aggregate(salesData, pipeline, { mode: 'toggle' });
console.log('Result:', JSON.stringify(toggleResult, null, 2));
console.log();

// Demo 3: Backward Compatibility
console.log('⚡ DEFAULT MODE (backward compatible)');
console.log('No options specified - defaults to stream mode');
const defaultResult = Modash.aggregate(salesData, pipeline);
console.log('Result:', JSON.stringify(defaultResult, null, 2));
console.log();

// Verify results are identical
const resultsMatch = JSON.stringify(streamResult) === JSON.stringify(toggleResult) && 
                    JSON.stringify(streamResult) === JSON.stringify(defaultResult);

console.log('✅ Result verification:');
console.log(`All modes produce identical results: ${resultsMatch}`);
console.log();

// Demo 4: Real-world usage scenarios
console.log('🎯 REAL-WORLD USAGE SCENARIOS\n');

console.log('Scenario 1: Real-time Dashboard (Stream Mode)');
console.log('Use case: Processing live sales events as they arrive');
const liveEvents = [
  { timestamp: '2024-01-01T10:00:00Z', product: 'laptop', amount: 1200 },
  { timestamp: '2024-01-01T10:05:00Z', product: 'tablet', amount: 800 },
];
const streamingPipeline = [{ $group: { _id: null, totalSales: { $sum: '$amount' } } }];
const liveResult = Modash.aggregate(liveEvents, streamingPipeline, { mode: 'stream' });
console.log('Live sales total:', liveResult[0].totalSales);
console.log();

console.log('Scenario 2: Analytics Filtering (Toggle Mode)');
console.log('Use case: Dashboard with sliders/filters (crossfilter-style)');
const products = [
  { name: 'Product A', price: 100, inStock: true, rating: 4.5 },
  { name: 'Product B', price: 250, inStock: false, rating: 4.2 },
  { name: 'Product C', price: 50, inStock: true, rating: 3.8 },
];
// Simulating price filter: $50-$200, in stock only
const filterPipeline = [
  { $match: { price: { $gte: 50, $lte: 200 }, inStock: true } },
  { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
];
const filteredResult = Modash.aggregate(products, filterPipeline, { mode: 'toggle' });
console.log('Filtered products:', filteredResult[0]);
console.log();

console.log('🏆 Both modes are first-class citizens with identical APIs!');
console.log('Choose the mode that best fits your use case:');
console.log('• Stream mode: Event feeds, real-time data, incremental updates');
console.log('• Toggle mode: Fixed datasets, dashboard filtering, membership changes');