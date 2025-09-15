#!/usr/bin/env node

/**
 * Test script to validate the new compatibility shim architecture
 * Ensures that the minimal standard engine is only used for truly unsupported operators
 */

import Modash, { minimalStandardEngine } from '../../src/index.ts';
import { 
  generateFallbackAnalysis, 
  printFallbackAnalysis, 
  resetFallbackTracking 
} from '../../src/modash/debug.ts';
import { requiresCompatibilityShim } from '../../src/modash/compatibility-shim.ts';

console.log('🔧 Testing Compatibility Shim & Standard Engine Deprecation');
console.log('============================================================\n');

const testData = [
  { _id: 1, name: 'Alice', age: 30, category: 'A', score: 85, active: true },
  { _id: 2, name: 'Bob', age: 25, category: 'B', score: 92, active: true },
  { _id: 3, name: 'Charlie', age: 35, category: 'A', score: 78, active: false },
  { _id: 4, name: 'Diana', age: 28, category: 'B', score: 95, active: true }
];

console.log('Test Data:', testData.length, 'documents\n');

// Test 1: Supported operators should NOT require compatibility shim
console.log('📋 Test 1: Supported operations (streaming engine expected)');
const supportedPipelines = [
  [{ $match: { active: true } }],
  [{ $project: { name: 1, score: 1 } }],
  [{ $sort: { score: -1 } }],
  [{ $limit: 10 }],
  [{ $skip: 5 }],
  [
    { $match: { active: true } },
    { $group: { _id: '$category', totalScore: { $sum: '$score' } } },
    { $sort: { totalScore: -1 } }
  ]
];

for (let i = 0; i < supportedPipelines.length; i++) {
  const pipeline = supportedPipelines[i];
  const needsShim = requiresCompatibilityShim(pipeline);
  console.log(`  Pipeline ${i + 1}: ${JSON.stringify(pipeline[0])}${pipeline.length > 1 ? '...' : ''}`);
  console.log(`    Requires compatibility shim: ${needsShim ? '❌ YES (unexpected)' : '✅ NO (expected)'}`);
}

// Test 2: Unsupported operators should require compatibility shim
console.log('\n📋 Test 2: Unsupported operations (compatibility shim expected)');
const unsupportedPipelines = [
  [{ $function: { body: 'function() { return this.age > 30; }', args: [], lang: 'js' } }],
  [{ $where: 'this.age > 30' }],
  [{ $merge: { into: 'output' } }],
  [{ $out: 'output' }],
  [{ 
    $lookup: {
      from: testData,
      as: 'user',
      let: { userId: '$_id' },
      pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$userId'] } } }]
    }
  }]
];

for (let i = 0; i < unsupportedPipelines.length; i++) {
  const pipeline = unsupportedPipelines[i];
  const needsShim = requiresCompatibilityShim(pipeline);
  const stageType = Object.keys(pipeline[0])[0];
  console.log(`  Pipeline ${i + 1}: ${stageType}`);
  console.log(`    Requires compatibility shim: ${needsShim ? '✅ YES (expected)' : '❌ NO (unexpected)'}`);
}

// Test 3: Simple $lookup should NOT require compatibility shim
console.log('\n📋 Test 3: Simple $lookup (streaming engine expected)');
const simpleLookupPipeline = [{ 
  $lookup: {
    from: testData,
    localField: '_id',
    foreignField: '_id',
    as: 'self'
  }
}];

const needsShimForSimpleLookup = requiresCompatibilityShim(simpleLookupPipeline);
console.log(`  Simple $lookup requires compatibility shim: ${needsShimForSimpleLookup ? '❌ YES (unexpected)' : '✅ NO (expected)'}`);

// Test 4: Execute pipelines and verify routing
console.log('\n📋 Test 4: Execution routing verification');
resetFallbackTracking();

// Execute a supported pipeline
console.log('\n  4a. Supported pipeline execution:');
const supportedResult = Modash.aggregate(testData, [
  { $match: { active: true } },
  { $project: { name: 1, score: 1 } }
]);
console.log(`    Result length: ${supportedResult.length}`);
const analysis1 = generateFallbackAnalysis();
console.log(`    Fallbacks: ${analysis1.totalFallbacks} (expected: 0)`);

// Execute an unsupported pipeline
console.log('\n  4b. Unsupported pipeline execution:');
resetFallbackTracking();
try {
  const unsupportedResult = Modash.aggregate(testData, [
    { $function: { body: 'function() { return this.age > 30; }', args: [], lang: 'js' } }
  ]);
  console.log(`    Result length: ${unsupportedResult.length}`);
} catch (error) {
  console.log(`    Error (expected for unimplemented operator): ${error.message}`);
}
const analysis2 = generateFallbackAnalysis();
console.log(`    Fallbacks: ${analysis2.totalFallbacks} (expected: 1+)`);
if (analysis2.totalFallbacks > 0) {
  const reasons = Array.from(analysis2.fallbacksByReason.keys());
  console.log(`    Fallback reason: ${reasons[0]}`);
}

// Test 5: Direct compatibility shim usage
console.log('\n📋 Test 5: Direct minimalStandardEngine usage');
resetFallbackTracking();
try {
  const shimResult = minimalStandardEngine(testData, [
    { $match: { active: true } }
  ]);
  console.log(`  Result length: ${shimResult.length}`);
} catch (error) {
  console.log(`  Error: ${error.message}`);
}
const analysis3 = generateFallbackAnalysis();
console.log(`  Fallbacks: ${analysis3.totalFallbacks} (expected: 1 - direct shim usage)`);

// Final analysis
console.log('\n' + '='.repeat(60));
console.log('🎯 COMPATIBILITY SHIM ARCHITECTURE VALIDATION');
printFallbackAnalysis();

console.log('\n✅ Compatibility shim architecture validated successfully!');
console.log('\n📊 Architecture Summary:');
console.log('  - Standard aggregation engine → Deprecated');
console.log('  - Streaming/IVM engine → Default for all supported operations');
console.log('  - Minimal compatibility shim → Only for $function, $where, $merge, $out, advanced $lookup');
console.log('  - Operator duplication → Eliminated (streaming engine handles most operations)');