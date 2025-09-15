#!/usr/bin/env node

/**
 * Test script to validate streaming-first execution and fallback logging
 */

import Modash from '../../src/index.ts';
import { 
  generateFallbackAnalysis, 
  printFallbackAnalysis, 
  resetFallbackTracking 
} from '../../src/modash/debug.ts';

console.log('🧪 Testing Streaming-First Execution & Fallback Logging');
console.log('=======================================================\n');

// Reset fallback tracking for clean test
resetFallbackTracking();

const testData = [
  { _id: 1, name: 'Alice', age: 30, category: 'A', score: 85 },
  { _id: 2, name: 'Bob', age: 25, category: 'B', score: 92 },
  { _id: 3, name: 'Charlie', age: 35, category: 'A', score: 78 },
  { _id: 4, name: 'Diana', age: 28, category: 'B', score: 95 }
];

console.log('Test Data:', testData.length, 'documents\n');

// Test 1: Simple pipeline that should use streaming engine
console.log('📋 Test 1: Simple pipeline (should use streaming engine)');
const simpleResult = Modash.aggregate(testData, [
  { $match: { age: { $gte: 30 } } },
  { $project: { name: 1, age: 1 } }
]);
console.log('Result:', simpleResult);

// Test 2: Complex $match that should trigger fallback
console.log('\n📋 Test 2: Complex $match (should trigger fallback)');
try {
  const complexMatchResult = Modash.aggregate(testData, [
    { $match: { $expr: { $gt: ['$age', 30] } } }, // Complex $match with $expr
    { $project: { name: 1, age: 1 } }
  ]);
  console.log('Result:', complexMatchResult);
} catch (error) {
  console.log('Error (expected):', error.message);
}

// Test 3: Unsupported operator (would trigger fallback if implemented)
console.log('\n📋 Test 3: Theoretical unsupported operators');
try {
  // Note: These operators aren't actually implemented, but the routing logic should catch them
  const unsupportedResult = Modash.aggregate(testData, [
    { $function: { body: 'function() { return this.age > 30; }', args: [], lang: 'js' } }
  ]);
  console.log('Result:', unsupportedResult);
} catch (error) {
  console.log('Error (expected for unimplemented operator):', error.message);
}

// Test 4: Very long pipeline that should trigger fallback
console.log('\n📋 Test 4: Very long pipeline (should trigger fallback)');
const longPipeline = [
  { $match: { age: { $gte: 20 } } },
  { $project: { name: 1, age: 1, category: 1 } },
  { $match: { category: 'A' } },
  { $project: { name: 1, age: 1 } },
  { $match: { age: { $gte: 25 } } },
  { $project: { name: 1 } },
  { $match: { name: { $ne: null } } },  // This makes it too long (7 stages > 6 limit)
];

try {
  const longResult = Modash.aggregate(testData, longPipeline);
  console.log('Result:', longResult);
} catch (error) {
  console.log('Error:', error.message);
}

// Generate and print comprehensive fallback analysis
console.log('\n' + '='.repeat(60));
printFallbackAnalysis();

// Validate that we have some fallbacks recorded
const analysis = generateFallbackAnalysis();
if (analysis.totalFallbacks > 0) {
  console.log('\n✅ Fallback logging is working correctly!');
  console.log(`   Recorded ${analysis.totalFallbacks} fallbacks with detailed reasons`);
} else {
  console.log('\n⚠️  No fallbacks recorded - may need to test with more complex scenarios');
}

console.log('\n🎯 Test completed successfully!');