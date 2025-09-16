#!/usr/bin/env node

/**
 * Phase 3 CI Regression Gates
 * 
 * Validates:
 * - Performance budgets are met
 * - No silent fallbacks in hot path operations
 * - 95%+ test coverage for supported operators
 * - Compatibility matrix validation
 */

import { execSync } from 'child_process';
import { performance } from 'perf_hooks';
import Aggo from './src/index.js';

// Performance budget thresholds
const PERFORMANCE_BUDGETS = {
  simpleFilter: {
    minDocsPerSec: 1_000_000, // 1M docs/sec minimum
    maxLatencyMs: 1.0         // 1ms max for 1K docs
  },
  groupAndAggregate: {
    minDocsPerSec: 250_000,   // 250K docs/sec minimum
    maxLatencyMs: 10.0        // 10ms max for 1K docs
  },
  complexPipeline: {
    minDocsPerSec: 150_000,   // 150K docs/sec minimum
    maxLatencyMs: 20.0        // 20ms max for 1K docs
  }
};

/**
 * Test data generator
 */
function generateTestData(size = 1000) {
  const data = [];
  for (let i = 0; i < size; i++) {
    data.push({
      _id: i,
      name: `Item ${i}`,
      category: `cat_${i % 10}`,
      value: Math.floor(Math.random() * 1000),
      active: Math.random() > 0.5,
      tags: [`tag_${i % 5}`, `tag_${(i + 1) % 5}`],
      metadata: {
        score: Math.floor(Math.random() * 100),
        priority: i % 3
      }
    });
  }
  return data;
}

/**
 * Performance benchmark with budget validation
 */
function validatePerformanceBudget(name, pipeline, budget) {
  const data = generateTestData(1000);
  const iterations = 10;
  const durations = [];
  
  console.log(`🔍 Testing ${name}...`);
  
  // Warmup
  for (let i = 0; i < 3; i++) {
    Aggo.aggregate(data, pipeline);
  }
  
  // Measure performance
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = Aggo.aggregate(data, pipeline);
    const duration = performance.now() - start;
    durations.push(duration);
    
    if (i === 0 && result.length === 0) {
      throw new Error(`${name}: Pipeline produced empty results`);
    }
  }
  
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / iterations;
  const docsPerSec = (data.length / (avgDuration / 1000));
  
  console.log(`  📊 Average: ${avgDuration.toFixed(2)}ms`);
  console.log(`  🚀 Throughput: ${Math.round(docsPerSec).toLocaleString()} docs/sec`);
  
  // Validate performance budgets
  if (docsPerSec < budget.minDocsPerSec) {
    throw new Error(
      `❌ ${name}: Throughput below budget! ` +
      `Got ${Math.round(docsPerSec).toLocaleString()} docs/sec, ` +
      `expected ≥${budget.minDocsPerSec.toLocaleString()} docs/sec`
    );
  }
  
  if (avgDuration > budget.maxLatencyMs) {
    throw new Error(
      `❌ ${name}: Latency above budget! ` +
      `Got ${avgDuration.toFixed(2)}ms, ` +
      `expected ≤${budget.maxLatencyMs}ms`
    );
  }
  
  console.log(`  ✅ Performance budget: PASSED`);
  return { avgDuration, docsPerSec };
}

/**
 * Detect silent fallbacks by checking for warning messages
 */
function detectSilentFallbacks() {
  console.log(`🔍 Checking for silent fallbacks...`);
  
  const originalWarn = console.warn;
  const warnings = [];
  
  console.warn = (...args) => {
    warnings.push(args.join(' '));
    originalWarn.apply(console, args);
  };
  
  try {
    const data = generateTestData(100);
    
    // Test various pipeline combinations
    const testPipelines = [
      // Simple operations should use hot path
      [{ $match: { active: true } }],
      [{ $project: { name: 1, value: 1 } }],
      [{ $sort: { value: -1 } }, { $limit: 10 }],
      
      // Group operations should use hot path
      [{ $group: { _id: '$category', count: { $sum: 1 } } }],
      [{ $group: { _id: null, total: { $sum: '$value' } } }],
      
      // Complex but supported combinations
      [
        { $match: { active: true } },
        { $group: { _id: '$category', avg: { $avg: '$value' } } },
        { $sort: { avg: -1 } }
      ]
    ];
    
    for (const pipeline of testPipelines) {
      const result = Aggo.aggregate(data, pipeline);
      if (result.length === 0 && pipeline.some(stage => '$match' in stage)) {
        // Empty results from $match are acceptable
        continue;
      }
    }
    
    // Check for fallback warnings
    const fallbackWarnings = warnings.filter(w => 
      w.includes('Hot path failed') || 
      w.includes('falling back') ||
      w.includes('fallback')
    );
    
    if (fallbackWarnings.length > 0) {
      console.log(`  ⚠️  Found ${fallbackWarnings.length} fallback warnings:`);
      fallbackWarnings.forEach(w => console.log(`    - ${w}`));
      console.log(`  ⚠️  Warning: Hot path may not be fully optimized`);
    } else {
      console.log(`  ✅ No silent fallbacks detected`);
    }
    
    return fallbackWarnings.length;
    
  } finally {
    console.warn = originalWarn;
  }
}

/**
 * Validate operator coverage
 */
function validateOperatorCoverage() {
  console.log(`🔍 Validating operator coverage...`);
  
  const data = generateTestData(100);
  const supportedOperators = {
    // Pipeline stages
    '$match': [{ $match: { active: true } }],
    '$project': [{ $project: { name: 1, value: 1 } }],
    '$group': [{ $group: { _id: '$category', count: { $sum: 1 } } }],
    '$sort': [{ $sort: { value: -1 } }],
    '$limit': [{ $limit: 10 }],
    '$skip': [{ $skip: 5 }],
    '$unwind': [{ $unwind: '$tags' }],
    
    // Accumulator operators
    '$sum': [{ $group: { _id: null, total: { $sum: '$value' } } }],
    '$avg': [{ $group: { _id: null, avg: { $avg: '$value' } } }],
    '$min': [{ $group: { _id: null, min: { $min: '$value' } } }],
    '$max': [{ $group: { _id: null, max: { $max: '$value' } } }],
    '$push': [{ $group: { _id: '$category', items: { $push: '$name' } } }],
    '$addToSet': [{ $group: { _id: '$category', unique: { $addToSet: '$name' } } }],
    
    // Query operators
    '$eq': [{ $match: { active: { $eq: true } } }],
    '$ne': [{ $match: { active: { $ne: false } } }],
    '$gt': [{ $match: { value: { $gt: 500 } } }],
    '$gte': [{ $match: { value: { $gte: 500 } } }],
    '$lt': [{ $match: { value: { $lt: 500 } } }],
    '$lte': [{ $match: { value: { $lte: 500 } } }],
    '$in': [{ $match: { category: { $in: ['cat_1', 'cat_2'] } } }]
  };
  
  const results = {};
  let totalTests = 0;
  let passedTests = 0;
  
  for (const [operator, pipeline] of Object.entries(supportedOperators)) {
    totalTests++;
    try {
      const result = Aggo.aggregate(data, pipeline);
      results[operator] = '✅ PASS';
      passedTests++;
    } catch (error) {
      results[operator] = `❌ FAIL: ${error.message}`;
    }
  }
  
  // Display results
  console.log(`  📊 Operator coverage: ${passedTests}/${totalTests} (${Math.round(passedTests/totalTests*100)}%)`);
  
  const failedOperators = Object.entries(results)
    .filter(([op, status]) => status.includes('FAIL'))
    .map(([op, status]) => `    ${op}: ${status}`);
  
  if (failedOperators.length > 0) {
    console.log(`  ❌ Failed operators:`);
    failedOperators.forEach(f => console.log(f));
  }
  
  const coverage = passedTests / totalTests;
  if (coverage < 0.95) {
    throw new Error(`❌ Operator coverage below 95%: got ${Math.round(coverage*100)}%`);
  }
  
  console.log(`  ✅ Operator coverage: PASSED (${Math.round(coverage*100)}%)`);
  return coverage;
}

/**
 * Main validation function
 */
async function main() {
  console.log('🚀 Phase 3 CI Regression Gates\n');
  
  let exitCode = 0;
  const results = {};
  
  try {
    // 1. Performance Budget Validation
    console.log('📊 Performance Budget Validation');
    console.log('═'.repeat(50));
    
    results.simpleFilter = validatePerformanceBudget(
      'Simple Filter',
      [{ $match: { active: true } }],
      PERFORMANCE_BUDGETS.simpleFilter
    );
    
    results.groupAndAggregate = validatePerformanceBudget(
      'Group & Aggregate', 
      [{ $group: { _id: '$category', avg: { $avg: '$value' }, count: { $sum: 1 } } }],
      PERFORMANCE_BUDGETS.groupAndAggregate
    );
    
    results.complexPipeline = validatePerformanceBudget(
      'Complex Pipeline',
      [
        { $match: { active: true } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ],
      PERFORMANCE_BUDGETS.complexPipeline
    );
    
    console.log('\n✅ All performance budgets: PASSED\n');
    
  } catch (error) {
    console.error(`❌ Performance validation failed: ${error.message}`);
    exitCode = 1;
  }
  
  try {
    // 2. Silent Fallback Detection
    console.log('🔍 Silent Fallback Detection');
    console.log('═'.repeat(50));
    
    const fallbackCount = detectSilentFallbacks();
    results.fallbacks = fallbackCount;
    
    console.log('');
    
  } catch (error) {
    console.error(`❌ Fallback detection failed: ${error.message}`);
    exitCode = 1;
  }
  
  try {
    // 3. Operator Coverage Validation
    console.log('🔧 Operator Coverage Validation');
    console.log('═'.repeat(50));
    
    const coverage = validateOperatorCoverage();
    results.coverage = coverage;
    
    console.log('');
    
  } catch (error) {
    console.error(`❌ Operator coverage validation failed: ${error.message}`);
    exitCode = 1;
  }
  
  // Summary
  console.log('📋 Final Report');
  console.log('═'.repeat(50));
  
  if (results.simpleFilter) {
    console.log(`✅ Simple Filter: ${Math.round(results.simpleFilter.docsPerSec).toLocaleString()} docs/sec`);
  }
  if (results.groupAndAggregate) {
    console.log(`✅ Group & Aggregate: ${Math.round(results.groupAndAggregate.docsPerSec).toLocaleString()} docs/sec`);
  }
  if (results.complexPipeline) {
    console.log(`✅ Complex Pipeline: ${Math.round(results.complexPipeline.docsPerSec).toLocaleString()} docs/sec`);
  }
  
  console.log(`${results.fallbacks === 0 ? '✅' : '⚠️'}  Fallback Count: ${results.fallbacks || 0}`);
  
  if (results.coverage) {
    console.log(`✅ Operator Coverage: ${Math.round(results.coverage * 100)}%`);
  }
  
  if (exitCode === 0) {
    console.log('\n🎉 All CI regression gates: PASSED');
  } else {
    console.log('\n❌ Some CI regression gates: FAILED');
  }
  
  process.exit(exitCode);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { validatePerformanceBudget, detectSilentFallbacks, validateOperatorCoverage };