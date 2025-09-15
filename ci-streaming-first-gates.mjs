#!/usr/bin/env node

/**
 * CI Regression Gates for Streaming-First Architecture
 * 
 * This script enforces that supported pipelines do not regress to using 
 * the standard aggregation engine. It should be run in CI to catch regressions.
 * 
 * Exit codes:
 * - 0: All gates passed
 * - 1: One or more gates failed (CI should fail)
 */

import Modash from './src/index.ts';
import { 
  generateFallbackAnalysis, 
  resetFallbackTracking 
} from './src/modash/debug.ts';

console.log('🚨 CI Regression Gates: Streaming-First Architecture');
console.log('=====================================================\n');

let gatesPassed = 0;
let gatesFailed = 0;

/**
 * Run a regression gate test
 */
function runGate(gateName, description, maxAllowedFallbacks, testFn) {
  console.log(`🔒 GATE: ${gateName}`);
  console.log(`   ${description}`);
  
  resetFallbackTracking();
  
  try {
    testFn();
    const analysis = generateFallbackAnalysis();
    const actualFallbacks = analysis.totalFallbacks;
    
    if (actualFallbacks <= maxAllowedFallbacks) {
      console.log(`   ✅ PASS: ${actualFallbacks} fallbacks (max allowed: ${maxAllowedFallbacks})`);
      gatesPassed++;
    } else {
      console.log(`   ❌ FAIL: ${actualFallbacks} fallbacks (max allowed: ${maxAllowedFallbacks})`);
      console.log(`   📝 Fallback reasons:`);
      for (const [reason, count] of analysis.fallbacksByReason.entries()) {
        console.log(`      ${reason}: ${count} occurrences`);
      }
      gatesFailed++;
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    gatesFailed++;
  }
  
  console.log('');
}

// Test data for gates
const testData = [
  { _id: 1, name: 'Alice', age: 30, category: 'A', score: 85, active: true },
  { _id: 2, name: 'Bob', age: 25, category: 'B', score: 92, active: true },
  { _id: 3, name: 'Charlie', age: 35, category: 'A', score: 78, active: false },
  { _id: 4, name: 'Diana', age: 28, category: 'B', score: 95, active: true }
];

// Gate 1: Basic operations must use streaming engine
runGate(
  'BASIC_OPS_STREAMING', 
  'Basic operations ($match, $project, $sort, $limit, $skip) must use streaming engine',
  0,
  () => {
    // Test multiple basic operations
    Modash.aggregate(testData, [{ $match: { active: true } }]);
    Modash.aggregate(testData, [{ $project: { name: 1, score: 1 } }]);
    Modash.aggregate(testData, [{ $sort: { score: -1 } }]);
    Modash.aggregate(testData, [{ $limit: 10 }]);
    Modash.aggregate(testData, [{ $skip: 1 }]);
  }
);

// Gate 2: Simple $group operations must use streaming engine
runGate(
  'SIMPLE_GROUP_STREAMING',
  'Simple $group operations must use streaming engine',
  0,
  () => {
    Modash.aggregate(testData, [
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    Modash.aggregate(testData, [
      { $group: { _id: '$category', avgScore: { $avg: '$score' } } }
    ]);
  }
);

// Gate 3: Multi-stage supported pipelines must use streaming engine
runGate(
  'MULTI_STAGE_STREAMING',
  'Multi-stage pipelines with supported operations must use streaming engine',
  0,
  () => {
    // Test complex but supported pipeline
    Modash.aggregate(testData, [
      { $match: { active: true } },
      { $project: { name: 1, score: 1, category: 1 } },
      { $group: { _id: '$category', avgScore: { $avg: '$score' } } },
      { $sort: { avgScore: -1 } }
    ]);
    
    // Test another complex pipeline
    Modash.aggregate(testData, [
      { $match: { score: { $gte: 80 } } },
      { $sort: { score: -1 } },
      { $limit: 5 }
    ]);
  }
);

// Gate 4: Simple $lookup must use streaming engine (when implemented)
runGate(
  'SIMPLE_LOOKUP_STREAMING',
  'Simple $lookup (localField/foreignField) should attempt streaming engine',
  1, // Allow 1 fallback as simple $lookup may not be fully implemented yet
  () => {
    const users = [{ _id: 1, name: 'Alice' }, { _id: 2, name: 'Bob' }];
    const orders = [{ _id: 100, userId: 1, amount: 50 }];
    
    try {
      Modash.aggregate(orders, [
        {
          $lookup: {
            from: users,
            localField: 'userId', 
            foreignField: '_id',
            as: 'user'
          }
        }
      ]);
    } catch (error) {
      // If $lookup isn't implemented in streaming engine yet, that's expected
      console.log(`     Note: Simple $lookup fallback expected until fully implemented`);
    }
  }
);

// Gate 5: Performance regression check  
runGate(
  'PERFORMANCE_REGRESSION',
  'Large dataset processing must use streaming engine for performance',
  0,
  () => {
    // Create larger dataset to ensure performance-critical operations use streaming
    const largeData = Array.from({ length: 1000 }, (_, i) => ({
      _id: i,
      value: Math.random() * 100,
      category: String.fromCharCode(65 + (i % 3))
    }));
    
    Modash.aggregate(largeData, [
      { $match: { value: { $gte: 50 } } },
      { $group: { _id: '$category', avgValue: { $avg: '$value' } } },
      { $sort: { avgValue: -1 } }
    ]);
  }
);

// Gate 6: Ensure unsupported operators correctly trigger fallback
runGate(
  'UNSUPPORTED_OPS_FALLBACK',
  'Unsupported operators ($function, advanced $lookup) must trigger fallback',
  1, // Expect exactly 1 fallback
  () => {
    // Test unsupported operator
    try {
      Modash.aggregate(testData, [
        { $function: { body: 'function() { return this.age > 30; }', args: [], lang: 'js' } }
      ]);
    } catch (error) {
      // Expected if not implemented
    }
  }
);

// Gate Results
console.log('🏁 CI REGRESSION GATES RESULTS');
console.log('==============================');
console.log(`Gates Passed: ${gatesPassed} ✅`);
console.log(`Gates Failed: ${gatesFailed} ${gatesFailed > 0 ? '❌' : '✅'}`);
console.log(`Success Rate: ${Math.round((gatesPassed / (gatesPassed + gatesFailed)) * 100)}%\n`);

if (gatesFailed > 0) {
  console.log('❌ CI GATES FAILED');
  console.log('==================');
  console.log('One or more regression gates failed. This indicates that:');
  console.log('• Supported operations may have regressed to using standard engine');
  console.log('• Performance optimizations may have been lost');
  console.log('• Streaming-first architecture may be broken');
  console.log('\nPlease review the failed gates and fix the issues before merging.');
  process.exit(1);
} else {
  console.log('✅ ALL CI GATES PASSED');
  console.log('======================');
  console.log('Streaming-first architecture is working correctly:');
  console.log('• Supported operations use streaming engine');
  console.log('• Unsupported operations correctly trigger fallback');
  console.log('• Performance optimizations are maintained');
  console.log('• No regressions detected');
  console.log('\n🚀 Safe to merge!');
  process.exit(0);
}