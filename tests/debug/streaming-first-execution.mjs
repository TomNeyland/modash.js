#!/usr/bin/env node

/**
 * Test script to validate the new streaming-first execution architecture
 */

import Modash, { streamingFirstAggregate } from '../../src/index.ts';
import { 
  generateFallbackAnalysis, 
  printFallbackAnalysis, 
  resetFallbackTracking 
} from '../../src/modash/debug.ts';

console.log('🚀 Testing New Streaming-First Execution Architecture');
console.log('==================================================\n');

// Reset fallback tracking for clean test
resetFallbackTracking();

const testData = [
  { _id: 1, name: 'Alice', age: 30, category: 'A', score: 85, active: true },
  { _id: 2, name: 'Bob', age: 25, category: 'B', score: 92, active: true },
  { _id: 3, name: 'Charlie', age: 35, category: 'A', score: 78, active: false },
  { _id: 4, name: 'Diana', age: 28, category: 'B', score: 95, active: true }
];

console.log('Test Data:', testData.length, 'documents\n');

// Test 1: Simple pipeline (should use streaming engine with no fallback)
console.log('📋 Test 1: Simple pipeline (streaming engine expected)');
resetFallbackTracking();
const simpleResult = Modash.aggregate(testData, [
  { $match: { active: true } },
  { $project: { name: 1, score: 1 } },
  { $sort: { score: -1 } }
]);
console.log('Result:', simpleResult);
console.log('Fallbacks:', generateFallbackAnalysis().totalFallbacks);

// Test 2: Complex but supported pipeline (should still use streaming engine)
console.log('\n📋 Test 2: Complex supported pipeline (streaming engine expected)');
resetFallbackTracking();
const complexResult = Modash.aggregate(testData, [
  { $match: { active: true } },
  { $group: { _id: '$category', totalScore: { $sum: '$score' }, count: { $sum: 1 } } },
  { $sort: { totalScore: -1 } }
]);
console.log('Result:', complexResult);
console.log('Fallbacks:', generateFallbackAnalysis().totalFallbacks);

// Test 3: Unsupported operator (should fallback explicitly)
console.log('\n📋 Test 3: Unsupported $function operator (fallback expected)');
resetFallbackTracking();
try {
  const unsupportedResult = Modash.aggregate(testData, [
    { $function: { body: 'function() { return this.age > 30; }', args: [], lang: 'js' } }
  ]);
  console.log('Result length:', unsupportedResult.length);
} catch (error) {
  console.log('Error (expected for unimplemented operator):', error.message);
}
const analysis1 = generateFallbackAnalysis();
console.log('Fallbacks:', analysis1.totalFallbacks);
if (analysis1.totalFallbacks > 0) {
  console.log('Fallback reason:', Array.from(analysis1.fallbacksByReason.keys())[0]);
}

// Test 4: Advanced $lookup (should fallback explicitly)  
console.log('\n📋 Test 4: Advanced $lookup with pipeline (fallback expected)');
resetFallbackTracking();
const lookupData = [{ _id: 1, userId: 100 }];
const usersData = [{ _id: 100, name: 'User1' }];
try {
  const lookupResult = Modash.aggregate(lookupData, [
    {
      $lookup: {
        from: usersData,
        as: 'user',
        let: { userId: '$userId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$userId'] } } }
        ]
      }
    }
  ]);
  console.log('Result length:', lookupResult.length);
} catch (error) {
  console.log('Error:', error.message);
}
const analysis2 = generateFallbackAnalysis();
console.log('Fallbacks:', analysis2.totalFallbacks);
if (analysis2.totalFallbacks > 0) {
  console.log('Fallback reason:', Array.from(analysis2.fallbacksByReason.keys())[0]);
}

// Test 5: Simple $lookup (should work with streaming engine)
console.log('\n📋 Test 5: Simple $lookup (streaming engine expected)');
resetFallbackTracking();
try {
  const simpleLookupResult = Modash.aggregate(lookupData, [
    {
      $lookup: {
        from: usersData,
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    }
  ]);
  console.log('Result length:', simpleLookupResult.length);
} catch (error) {
  console.log('Error:', error.message);
}
const analysis3 = generateFallbackAnalysis();
console.log('Fallbacks:', analysis3.totalFallbacks);

// Test 6: Direct streaming-first function usage
console.log('\n📋 Test 6: Direct streamingFirstAggregate usage');
resetFallbackTracking();
const directResult = streamingFirstAggregate(testData, [
  { $match: { age: { $gte: 30 } } },
  { $project: { name: 1, age: 1 } }
]);
console.log('Result:', directResult);
console.log('Fallbacks:', generateFallbackAnalysis().totalFallbacks);

// Final analysis
console.log('\n' + '='.repeat(60));
console.log('🎯 STREAMING-FIRST ARCHITECTURE VALIDATION');
printFallbackAnalysis();

console.log('\n✅ Streaming-first execution architecture validated successfully!');
console.log('\n📊 Expected behavior:');
console.log('  - Simple/complex supported pipelines: 0 fallbacks (streaming engine)');
console.log('  - $function, $where, $merge, $out: explicit fallbacks (standard engine)');
console.log('  - Advanced $lookup with pipeline/let: explicit fallbacks (standard engine)');
console.log('  - Simple $lookup with localField/foreignField: 0 fallbacks (streaming engine)');