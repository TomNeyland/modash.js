/**
 * Head-to-Head Performance Comparison: Stream vs Toggle Modes
 *
 * This benchmark puts both execution modes head-to-head to validate that
 * toggle mode's crossfilter/dc.js-style optimizations actually make it faster
 * at the use cases it's designed for.
 */

import Modash from '../src/index.ts';

// Test configurations
const WARMUP_ITERATIONS = 3;
const BENCHMARK_ITERATIONS = 10;
const DATASET_SIZES = [100, 500, 1000, 2500, 5000, 10000];

/**
 * Generate test data for different use case scenarios
 */
function generateDashboardData(size) {
  const categories = [
    'sales',
    'marketing',
    'support',
    'development',
    'finance',
  ];
  const regions = ['north', 'south', 'east', 'west', 'central'];
  const statuses = ['active', 'inactive', 'pending', 'completed'];

  return Array.from({ length: size }, (_, i) => ({
    id: i,
    category: categories[i % categories.length],
    region: regions[i % regions.length],
    status: statuses[i % statuses.length],
    amount: Math.floor(Math.random() * 10000) + 100,
    count: Math.floor(Math.random() * 100) + 1,
    date: new Date(2023, i % 12, (i % 28) + 1).toISOString().split('T')[0],
    priority: Math.floor(Math.random() * 5) + 1,
    score: Math.random() * 100,
    active: i % 3 !== 0, // ~67% active
    featured: i % 4 === 0, // 25% featured
  }));
}

/**
 * Test use cases optimized for toggle mode (crossfilter/dc.js patterns)
 */
const TOGGLE_OPTIMIZED_PIPELINES = {
  // 1. Multi-dimensional filtering (dashboard-style)
  dimensionalFilter: [
    { $match: { active: true } },
    { $match: { category: { $in: ['sales', 'marketing'] } } },
    { $match: { amount: { $gte: 1000 } } },
    { $project: { category: 1, region: 1, amount: 1 } },
  ],

  // 2. Refcounted aggregation (crossfilter group.reduceSum)
  refcountedAggregation: [
    { $match: { status: { $in: ['active', 'completed'] } } },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        avgScore: { $avg: '$score' },
        count: { $sum: 1 },
        maxAmount: { $max: '$amount' },
      },
    },
  ],

  // 3. Order statistics optimization (topK/ranking)
  orderStatistics: [
    { $match: { featured: true, active: true } },
    { $sort: { score: -1, amount: -1 } },
    { $limit: 10 },
    { $project: { id: 1, category: 1, score: 1, amount: 1 } },
  ],

  // 4. Complex membership filtering
  membershipFiltering: [
    {
      $match: {
        $and: [
          { region: { $in: ['north', 'south'] } },
          { priority: { $gte: 3 } },
          { amount: { $gte: 500, $lte: 5000 } },
        ],
      },
    },
    {
      $group: {
        _id: { region: '$region', category: '$category' },
        avgAmount: { $avg: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.region': 1, '_id.category': 1 } },
  ],

  // 5. Multi-stage aggregation with sorting
  multiStageAggregation: [
    { $match: { active: true } },
    {
      $addFields: {
        efficiency: { $divide: ['$amount', '$count'] },
      },
    },
    {
      $group: {
        _id: '$region',
        avgEfficiency: { $avg: '$efficiency' },
        totalAmount: { $sum: '$amount' },
        recordCount: { $sum: 1 },
      },
    },
    { $sort: { avgEfficiency: -1 } },
  ],

  // 6. Dashboard-style aggregation with multiple dimensions
  dashboardAggregation: [
    { $match: { status: 'active', score: { $gte: 50 } } },
    {
      $group: {
        _id: {
          category: '$category',
          priority: '$priority',
        },
        totalAmount: { $sum: '$amount' },
        avgScore: { $avg: '$score' },
        count: { $sum: 1 },
        minAmount: { $min: '$amount' },
        maxAmount: { $max: '$amount' },
      },
    },
    { $match: { count: { $gte: 2 } } },
    { $sort: { totalAmount: -1 } },
  ],
};

/**
 * Test use cases that should favor streaming mode
 */
const STREAM_OPTIMIZED_PIPELINES = {
  // Large dataset scanning
  largeScan: [
    {
      $project: {
        category: 1,
        amount: 1,
        computed: { $multiply: ['$amount', '$count'] },
      },
    },
  ],

  // Complex expression evaluation
  complexExpression: [
    {
      $addFields: {
        complexScore: {
          $add: [
            { $multiply: ['$score', 0.7] },
            { $multiply: ['$priority', 10] },
            { $cond: { if: '$featured', then: 25, else: 0 } },
          ],
        },
      },
    },
    { $match: { complexScore: { $gte: 50 } } },
    { $project: { id: 1, category: 1, complexScore: 1 } },
  ],
};

/**
 * Benchmark a single pipeline with both modes
 */
function benchmarkPipeline(
  data,
  pipeline,
  name,
  warmupIterations = WARMUP_ITERATIONS
) {
  // Warmup phase
  console.log(`    🔥 Warming up ${name}...`);
  for (let i = 0; i < warmupIterations; i++) {
    Modash.aggregate(data, pipeline, { mode: 'stream' });
    Modash.aggregate(data, pipeline, { mode: 'toggle' });
  }

  // Benchmark stream mode
  const streamTimes = [];
  let streamResult;
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    streamResult = Modash.aggregate(data, pipeline, { mode: 'stream' });
    const end = process.hrtime.bigint();
    streamTimes.push(Number(end - start) / 1000000); // Convert to milliseconds
  }

  // Benchmark toggle mode
  const toggleTimes = [];
  let toggleResult;
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const start = process.hrtime.bigint();
    toggleResult = Modash.aggregate(data, pipeline, { mode: 'toggle' });
    const end = process.hrtime.bigint();
    toggleTimes.push(Number(end - start) / 1000000); // Convert to milliseconds
  }

  // Verify results are identical
  try {
    expect(streamResult).to.deep.equal(toggleResult);
  } catch (error) {
    console.error(`    ❌ Results differ between modes for ${name}!`);
    console.error('    Stream result length:', streamResult.length);
    console.error('    Toggle result length:', toggleResult.length);
    if (streamResult.length <= 5 && toggleResult.length <= 5) {
      console.error(
        '    Stream result:',
        JSON.stringify(streamResult, null, 2)
      );
      console.error(
        '    Toggle result:',
        JSON.stringify(toggleResult, null, 2)
      );
    }
    throw error;
  }

  // Calculate statistics
  const streamAvg = streamTimes.reduce((a, b) => a + b, 0) / streamTimes.length;
  const toggleAvg = toggleTimes.reduce((a, b) => a + b, 0) / toggleTimes.length;
  const streamMin = Math.min(...streamTimes);
  const toggleMin = Math.min(...toggleTimes);

  const speedup = streamAvg / toggleAvg;
  const winner = speedup > 1 ? 'toggle' : 'stream';
  const winnerSymbol = speedup > 1 ? '🏆' : speedup < 0.9 ? '⚠️' : '🔄';

  return {
    name,
    stream: {
      avg: Math.round(streamAvg * 1000) / 1000,
      min: Math.round(streamMin * 1000) / 1000,
      throughput: Math.round(data.length / (streamAvg / 1000)),
    },
    toggle: {
      avg: Math.round(toggleAvg * 1000) / 1000,
      min: Math.round(toggleMin * 1000) / 1000,
      throughput: Math.round(data.length / (toggleAvg / 1000)),
    },
    speedup: Math.round(speedup * 1000) / 1000,
    winner,
    winnerSymbol,
    resultCount: streamResult.length,
  };
}

/**
 * Run head-to-head benchmarks for a specific dataset size
 */
function runHeadToHeadBenchmarks(size) {
  console.log(
    `\n📊 Head-to-Head Benchmark: ${size.toLocaleString()} documents`
  );
  console.log('━'.repeat(80));

  const data = generateDashboardData(size);
  const results = [];

  console.log('\n  🎯 Toggle-Optimized Use Cases (Expected: Toggle wins):');
  console.log('  ' + '─'.repeat(60));

  for (const [name, pipeline] of Object.entries(TOGGLE_OPTIMIZED_PIPELINES)) {
    try {
      const result = benchmarkPipeline(data, pipeline, name);
      results.push({ ...result, category: 'toggle-optimized' });

      const speedupText =
        result.speedup > 1
          ? `${result.speedup}x faster`
          : `${Math.round((1 / result.speedup) * 100) / 100}x slower`;

      console.log(
        `    ${result.winnerSymbol} ${name.padEnd(25)} | Stream: ${result.stream.avg.toString().padStart(6)}ms | Toggle: ${result.toggle.avg.toString().padStart(6)}ms | Toggle is ${speedupText}`
      );
    } catch (error) {
      console.error(`    ❌ Failed to benchmark ${name}:`, error.message);
    }
  }

  console.log('\n  🌊 Stream-Optimized Use Cases (Expected: Stream wins):');
  console.log('  ' + '─'.repeat(60));

  for (const [name, pipeline] of Object.entries(STREAM_OPTIMIZED_PIPELINES)) {
    try {
      const result = benchmarkPipeline(data, pipeline, name);
      results.push({ ...result, category: 'stream-optimized' });

      const speedupText =
        result.speedup < 1
          ? `${Math.round((1 / result.speedup) * 100) / 100}x faster`
          : `${result.speedup}x slower`;

      console.log(
        `    ${result.winnerSymbol} ${name.padEnd(25)} | Stream: ${result.stream.avg.toString().padStart(6)}ms | Toggle: ${result.toggle.avg.toString().padStart(6)}ms | Stream is ${speedupText}`
      );
    } catch (error) {
      console.error(`    ❌ Failed to benchmark ${name}:`, error.message);
    }
  }

  return results;
}

/**
 * Analyze and report results
 */
function analyzeResults(allResults) {
  console.log('\n🏆 HEAD-TO-HEAD PERFORMANCE ANALYSIS');
  console.log('━'.repeat(80));

  const toggleOptimizedResults = allResults.filter(
    r => r.category === 'toggle-optimized'
  );
  const streamOptimizedResults = allResults.filter(
    r => r.category === 'stream-optimized'
  );

  // Analyze toggle-optimized results
  const toggleWins = toggleOptimizedResults.filter(
    r => r.winner === 'toggle'
  ).length;
  const toggleTotal = toggleOptimizedResults.length;
  const toggleWinRate = Math.round((toggleWins / toggleTotal) * 100);

  console.log('\n📈 Toggle Mode Optimization Effectiveness:');
  console.log('─'.repeat(50));
  console.log(
    `  Toggle wins in toggle-optimized use cases: ${toggleWins}/${toggleTotal} (${toggleWinRate}%)`
  );

  if (toggleWins > 0) {
    const avgToggleSpeedup =
      toggleOptimizedResults
        .filter(r => r.winner === 'toggle')
        .reduce((acc, r) => acc + r.speedup, 0) / toggleWins;
    console.log(
      `  Average speedup when toggle wins: ${Math.round(avgToggleSpeedup * 100) / 100}x`
    );
  }

  // Analyze stream-optimized results
  const streamWins = streamOptimizedResults.filter(
    r => r.winner === 'stream'
  ).length;
  const streamTotal = streamOptimizedResults.length;
  const streamWinRate = Math.round((streamWins / streamTotal) * 100);

  console.log('\n🌊 Stream Mode Baseline Performance:');
  console.log('─'.repeat(50));
  console.log(
    `  Stream wins in stream-optimized use cases: ${streamWins}/${streamTotal} (${streamWinRate}%)`
  );

  if (streamWins > 0) {
    const avgStreamSpeedup =
      streamOptimizedResults
        .filter(r => r.winner === 'stream')
        .reduce((acc, r) => acc + 1 / r.speedup, 0) / streamWins;
    console.log(
      `  Average speedup when stream wins: ${Math.round(avgStreamSpeedup * 100) / 100}x`
    );
  }

  // Overall assessment
  console.log('\n🎯 Specialization Assessment:');
  console.log('─'.repeat(50));

  if (toggleWinRate >= 75) {
    console.log('  ✅ Toggle mode specializations are HIGHLY EFFECTIVE');
  } else if (toggleWinRate >= 50) {
    console.log('  🟡 Toggle mode specializations show MODERATE EFFECTIVENESS');
  } else {
    console.log('  ❌ Toggle mode specializations need IMPROVEMENT');
  }

  // Performance by dataset size
  const sizeGroups = {};
  allResults.forEach(result => {
    // Extract dataset size from context (we'll track this in the main function)
    if (!sizeGroups[result.datasetSize]) {
      sizeGroups[result.datasetSize] = [];
    }
    sizeGroups[result.datasetSize].push(result);
  });

  console.log('\n📊 Performance Scaling Analysis:');
  console.log('─'.repeat(50));

  Object.entries(sizeGroups)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([size, results]) => {
      const toggleWinsInSize = results.filter(
        r => r.category === 'toggle-optimized' && r.winner === 'toggle'
      ).length;
      const toggleTotalInSize = results.filter(
        r => r.category === 'toggle-optimized'
      ).length;
      const winRateInSize = Math.round(
        (toggleWinsInSize / toggleTotalInSize) * 100
      );

      console.log(
        `  ${size.padStart(6)} docs: Toggle wins ${toggleWinsInSize}/${toggleTotalInSize} (${winRateInSize}%) of toggle-optimized cases`
      );
    });
}

/**
 * Main benchmark runner
 */
function runHeadToHeadComparison() {
  console.log('🥊 HEAD-TO-HEAD PERFORMANCE: Stream vs Toggle Execution Modes');
  console.log(
    '🎯 Testing crossfilter/dc.js-style optimizations in toggle mode'
  );
  console.log('⚡ After warmup phase to ensure fair comparison\n');

  const allResults = [];

  for (const size of DATASET_SIZES) {
    const results = runHeadToHeadBenchmarks(size);

    // Add dataset size to results for analysis
    results.forEach(result => {
      result.datasetSize = size;
    });

    allResults.push(...results);
  }

  analyzeResults(allResults);

  console.log('\n✨ Head-to-head comparison completed!\n');
}

// Simple assertion helper since we can't import chai in this context
function expect(actual) {
  return {
    to: {
      deep: {
        equal(expected) {
          const actualStr = JSON.stringify(actual);
          const expectedStr = JSON.stringify(expected);
          if (actualStr !== expectedStr) {
            throw new Error(
              `Expected ${actualStr} to deep equal ${expectedStr}`
            );
          }
        },
      },
    },
  };
}

// Export for use as a module or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHeadToHeadComparison();
}

export { runHeadToHeadComparison, benchmarkPipeline, generateDashboardData };
