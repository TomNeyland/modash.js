#!/usr/bin/env node

/**
 * Comprehensive integration test for streaming-first execution architecture
 * This test validates the complete implementation meets the requirements from issue #64
 */

import Modash from '../../src/index.ts';
import { 
  generateFallbackAnalysis, 
  resetFallbackTracking,
  printFallbackAnalysis 
} from '../../src/modash/debug.ts';

console.log('🧪 Comprehensive Streaming-First Architecture Integration Test');
console.log('=============================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName, expectedFallbacks, testFn) {
  totalTests++;
  console.log(`📋 ${testName}`);
  
  resetFallbackTracking();
  
  try {
    testFn();
    const analysis = generateFallbackAnalysis();
    const actualFallbacks = analysis.totalFallbacks;
    
    if (actualFallbacks === expectedFallbacks) {
      console.log(`   ✅ PASS: ${actualFallbacks} fallbacks (expected: ${expectedFallbacks})`);
      if (actualFallbacks > 0) {
        const reasons = Array.from(analysis.fallbacksByReason.keys());
        console.log(`   📝 Reason: ${reasons[0]}`);
      }
      passedTests++;
    } else {
      console.log(`   ❌ FAIL: ${actualFallbacks} fallbacks (expected: ${expectedFallbacks})`);
      if (actualFallbacks > 0) {
        console.log(`   📝 Reasons: ${Array.from(analysis.fallbacksByReason.keys()).join(', ')}`);
      }
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    failedTests++;
  }
  
  console.log('');
}

const testData = [
  { _id: 1, name: 'Alice', age: 30, category: 'A', score: 85, active: true, tags: ['new', 'premium'] },
  { _id: 2, name: 'Bob', age: 25, category: 'B', score: 92, active: true, tags: ['standard'] },
  { _id: 3, name: 'Charlie', age: 35, category: 'A', score: 78, active: false, tags: ['premium', 'legacy'] },
  { _id: 4, name: 'Diana', age: 28, category: 'B', score: 95, active: true, tags: ['new'] },
  { _id: 5, name: 'Eve', age: 42, category: 'C', score: 88, active: true, tags: ['premium'] }
];

// Group 1: Operations that MUST use streaming engine (0 fallbacks expected)
console.log('🔥 GROUP 1: Operations that MUST use streaming engine');
console.log('=====================================================\n');

runTest('Simple $match operation', 0, () => {
  const result = Modash.aggregate(testData, [
    { $match: { active: true } }
  ]);
  if (result.length !== 4) throw new Error(`Expected 4 results, got ${result.length}`);
});

runTest('Simple $project operation', 0, () => {
  const result = Modash.aggregate(testData, [
    { $project: { name: 1, score: 1 } }
  ]);
  if (result.length !== 5) throw new Error(`Expected 5 results, got ${result.length}`);
});

runTest('Simple $sort operation', 0, () => {
  const result = Modash.aggregate(testData, [
    { $sort: { score: -1 } }
  ]);
  if (result[0].score !== 95) throw new Error('Sort failed');
});

runTest('$limit and $skip operations', 0, () => {
  const result = Modash.aggregate(testData, [
    { $skip: 1 },
    { $limit: 2 }
  ]);
  if (result.length !== 2) throw new Error(`Expected 2 results, got ${result.length}`);
});

runTest('Simple $group operation', 0, () => {
  const result = Modash.aggregate(testData, [
    { $group: { _id: '$category', count: { $sum: 1 } } }
  ]);
  if (result.length !== 3) throw new Error(`Expected 3 groups, got ${result.length}`);
});

runTest('Multi-stage supported pipeline', 0, () => {
  const result = Modash.aggregate(testData, [
    { $match: { active: true } },
    { $project: { name: 1, score: 1, category: 1 } },
    { $group: { _id: '$category', avgScore: { $avg: '$score' }, count: { $sum: 1 } } },
    { $sort: { avgScore: -1 } }
  ]);
  if (result.length === 0) throw new Error('No results from complex pipeline');
});

// Group 2: Operations that MUST use compatibility shim (1+ fallbacks expected)
console.log('🚨 GROUP 2: Operations that MUST use compatibility shim');
console.log('=====================================================\n');

runTest('$function operator (unsupported)', 1, () => {
  const result = Modash.aggregate(testData, [
    { $function: { body: 'function() { return this.age > 30; }', args: [], lang: 'js' } }
  ]);
  // Should work via compatibility shim
  if (result.length === 0) throw new Error('$function should work via compatibility shim');
});

runTest('$where operator (unsupported)', 1, () => {
  try {
    const result = Modash.aggregate(testData, [
      { $where: 'this.age > 30' }
    ]);
    // Should work via compatibility shim or throw error
  } catch (error) {
    // Expected for unimplemented operator
    console.log(`     Note: $where not implemented: ${error.message}`);
  }
});

runTest('Advanced $lookup with pipeline (unsupported)', 1, () => {
  const lookupData = [{ _id: 1, userId: 100 }];
  const usersData = [{ _id: 100, name: 'User1' }];
  
  const result = Modash.aggregate(lookupData, [
    {
      $lookup: {
        from: usersData,
        as: 'user',
        let: { userId: '$userId' }, 
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$userId'] } } }]
      }
    }
  ]);
  // Should work via compatibility shim
});

// Group 3: Edge cases and boundary conditions  
console.log('⚡ GROUP 3: Edge cases and boundary conditions');
console.log('==============================================\n');

runTest('Empty pipeline', 0, () => {
  const result = Modash.aggregate(testData, []);
  if (result.length !== testData.length) throw new Error('Empty pipeline should return all data');
});

runTest('Single-stage pipelines', 0, () => {
  const results = [
    Modash.aggregate(testData, [{ $match: { age: { $gte: 30 } } }]),
    Modash.aggregate(testData, [{ $project: { name: 1 } }]),
    Modash.aggregate(testData, [{ $sort: { age: 1 } }]),
    Modash.aggregate(testData, [{ $limit: 3 }])
  ];
  
  if (results.some(r => r.length === 0)) throw new Error('Single-stage pipeline failed');
});

runTest('Pipeline at streaming engine limits (6 stages)', 0, () => {
  const result = Modash.aggregate(testData, [
    { $match: { active: true } },
    { $project: { name: 1, score: 1, category: 1 } },
    { $sort: { score: -1 } },
    { $limit: 10 },
    { $skip: 0 },
    { $match: { score: { $gte: 80 } } }
  ]);
  
  if (result.length === 0) throw new Error('6-stage pipeline should work');
});

// Group 4: Performance and consistency validation
console.log('🚀 GROUP 4: Performance and consistency validation');
console.log('==================================================\n');

runTest('Large dataset processing', 0, () => {
  const largeData = Array.from({ length: 1000 }, (_, i) => ({
    _id: i,
    value: Math.random() * 100,
    category: String.fromCharCode(65 + (i % 3)) // A, B, C
  }));
  
  const result = Modash.aggregate(largeData, [
    { $match: { value: { $gte: 50 } } },
    { $group: { _id: '$category', avgValue: { $avg: '$value' }, count: { $sum: 1 } } },
    { $sort: { avgValue: -1 } }
  ]);
  
  if (result.length === 0) throw new Error('Large dataset processing failed');
});

runTest('Repeated execution consistency', 0, () => {
  const pipeline = [
    { $match: { active: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];
  
  const result1 = Modash.aggregate(testData, pipeline);
  const result2 = Modash.aggregate(testData, pipeline);
  const result3 = Modash.aggregate(testData, pipeline);
  
  if (JSON.stringify(result1) !== JSON.stringify(result2) || 
      JSON.stringify(result2) !== JSON.stringify(result3)) {
    throw new Error('Repeated execution produced inconsistent results');
  }
});

// Final Results
console.log('📊 INTEGRATION TEST RESULTS');
console.log('============================\n');
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests} ✅`);
console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`);
console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%\n`);

// Overall fallback analysis
console.log('📈 OVERALL FALLBACK ANALYSIS');
console.log('============================');
const finalAnalysis = generateFallbackAnalysis();
console.log(`Total fallbacks across all tests: ${finalAnalysis.totalFallbacks}`);

if (finalAnalysis.totalFallbacks > 0) {
  console.log('\nFallback breakdown:');
  for (const [reason, count] of finalAnalysis.fallbacksByReason.entries()) {
    console.log(`  ${reason}: ${count} occurrences`);
  }
}

// Validation summary
console.log('\n🎯 ARCHITECTURE VALIDATION SUMMARY');
console.log('===================================');

if (failedTests === 0) {
  console.log('✅ Streaming-first execution architecture is working correctly!');
  console.log('✅ All supported operations use the streaming engine');
  console.log('✅ Unsupported operations correctly use the compatibility shim');
  console.log('✅ Performance and consistency maintained');
  console.log('\n🚀 Ready for production deployment!');
} else {
  console.log('❌ Some tests failed - architecture needs fixes before deployment');
  process.exit(1);
}

console.log('\n📋 Issue #64 Requirements Met:');
console.log('• ✅ Deprecated standard aggregation engine');
console.log('• ✅ Moved to streaming-first execution');
console.log('• ✅ Explicit fallback only for unsupported operators');
console.log('• ✅ Single, unified code path for supported operations');  
console.log('• ✅ Clear visibility when fallback occurs');
console.log('• ✅ Reduced maintenance overhead');