/**
 * Crossfilter/DC.js Style Optimizations Demo
 * Demonstrates toggle mode optimizations for dashboard analytics
 */

import Modash from '../src/index.ts';

console.log('🎯 Crossfilter/DC.js Style Optimizations Demo\n');

// Sample dashboard data - simulating a business intelligence dataset
const salesData = [
  { date: '2023-01-01', category: 'electronics', region: 'north', product: 'laptop', amount: 1200, quantity: 2 },
  { date: '2023-01-01', category: 'electronics', region: 'south', product: 'phone', amount: 800, quantity: 4 },
  { date: '2023-01-02', category: 'books', region: 'north', product: 'novel', amount: 25, quantity: 10 },
  { date: '2023-01-02', category: 'books', region: 'east', product: 'textbook', amount: 150, quantity: 3 },
  { date: '2023-01-03', category: 'electronics', region: 'west', product: 'tablet', amount: 600, quantity: 2 },
  { date: '2023-01-03', category: 'clothing', region: 'south', product: 'jacket', amount: 120, quantity: 6 },
  { date: '2023-01-04', category: 'clothing', region: 'north', product: 'shoes', amount: 180, quantity: 4 },
  { date: '2023-01-04', category: 'electronics', region: 'east', product: 'headphones', amount: 200, quantity: 5 },
  { date: '2023-01-05', category: 'books', region: 'west', product: 'magazine', amount: 15, quantity: 20 },
  { date: '2023-01-05', category: 'electronics', region: 'north', product: 'camera', amount: 900, quantity: 1 }
];

console.log('📊 Sample Sales Data:');
console.table(salesData);
console.log('');

// Demo 1: Crossfilter-style dimension filtering
console.log('🔍 Demo 1: Dimension-Based Filtering (like crossfilter dimensions)\n');

const dimensionFilterPipeline = [
  { $match: { category: { $in: ['electronics', 'clothing'] } } }, // Filter by category dimension
  { $match: { amount: { $gte: 150 } } }, // Filter by amount dimension  
  { $project: { product: 1, amount: 1, region: 1, category: 1 } }
];

console.log('Pipeline (optimized for toggle mode):');
console.log(JSON.stringify(dimensionFilterPipeline, null, 2));

const streamResult1 = Modash.aggregate(salesData, dimensionFilterPipeline, { mode: 'stream' });
const toggleResult1 = Modash.aggregate(salesData, dimensionFilterPipeline, { mode: 'toggle' });

console.log('\n📈 Stream Mode Result:');
console.table(streamResult1);

console.log('\n⚡ Toggle Mode Result (crossfilter-optimized):');
console.table(toggleResult1);

console.log(`\n✅ Results identical: ${JSON.stringify(streamResult1) === JSON.stringify(toggleResult1)}`);
console.log('');

// Demo 2: Refcounted aggregates (like crossfilter group.reduceSum())
console.log('📊 Demo 2: Refcounted Aggregates (like crossfilter group operations)\n');

const aggregatePipeline = [
  { 
    $group: { 
      _id: '$category', 
      totalRevenue: { $sum: '$amount' },
      totalQuantity: { $sum: '$quantity' },
      avgAmount: { $avg: '$amount' },
      maxAmount: { $max: '$amount' },
      minAmount: { $min: '$amount' },
      productCount: { $sum: 1 }
    }
  },
  { $sort: { totalRevenue: -1 } }
];

console.log('Pipeline (crossfilter group.reduceSum() style):');
console.log(JSON.stringify(aggregatePipeline, null, 2));

const streamResult2 = Modash.aggregate(salesData, aggregatePipeline, { mode: 'stream' });
const toggleResult2 = Modash.aggregate(salesData, aggregatePipeline, { mode: 'toggle' });

console.log('\n📈 Stream Mode Result:');
console.table(streamResult2);

console.log('\n⚡ Toggle Mode Result (refcounted aggregates):');
console.table(toggleResult2);

console.log(`\n✅ Results identical: ${JSON.stringify(streamResult2) === JSON.stringify(toggleResult2)}`);
console.log('');

// Demo 3: Multi-dimensional dashboard analytics
console.log('🎯 Demo 3: Multi-Dimensional Dashboard Analytics (like DC.js charts)\n');

const dashboardPipeline = [
  { $match: { amount: { $gte: 100 } } }, // Revenue filter
  { 
    $addFields: { 
      amountTier: {
        $switch: {
          branches: [
            { case: { $lt: ['$amount', 200] }, then: 'small' },
            { case: { $lt: ['$amount', 600] }, then: 'medium' },
            { case: { $gte: ['$amount', 600] }, then: 'large' }
          ],
          default: 'unknown'
        }
      }
    }
  },
  { 
    $group: { 
      _id: { region: '$region', tier: '$amountTier' },
      totalRevenue: { $sum: '$amount' },
      averageOrder: { $avg: '$amount' },
      orderCount: { $sum: 1 }
    }
  },
  { $sort: { '_id.region': 1, totalRevenue: -1 } }
];

console.log('Pipeline (DC.js multi-chart dashboard style):');
console.log(JSON.stringify(dashboardPipeline, null, 2));

const streamResult3 = Modash.aggregate(salesData, dashboardPipeline, { mode: 'stream' });
const toggleResult3 = Modash.aggregate(salesData, dashboardPipeline, { mode: 'toggle' });

console.log('\n📈 Stream Mode Result:');
console.table(streamResult3);

console.log('\n⚡ Toggle Mode Result (multi-dimensional optimized):');
console.table(toggleResult3);

console.log(`\n✅ Results identical: ${JSON.stringify(streamResult3) === JSON.stringify(toggleResult3)}`);
console.log('');

// Demo 4: Order statistics and ranking (topK operations)
console.log('🏆 Demo 4: Order Statistics & Ranking (like crossfilter topK)\n');

const rankingPipeline = [
  { $match: { category: 'electronics' } },
  { $sort: { amount: -1, product: 1 } }, // Sort by amount descending
  { $limit: 3 }, // Top 3
  { 
    $addFields: { 
      rank: { $add: [{ $indexOfArray: [[], '$product'] }, 1] } // Simulated ranking
    }
  }
];

console.log('Pipeline (topK ranking style):');
console.log(JSON.stringify(rankingPipeline, null, 2));

const streamResult4 = Modash.aggregate(salesData, rankingPipeline, { mode: 'stream' });
const toggleResult4 = Modash.aggregate(salesData, rankingPipeline, { mode: 'toggle' });

console.log('\n📈 Stream Mode Result:');
console.table(streamResult4);

console.log('\n⚡ Toggle Mode Result (order-statistic optimized):');
console.table(toggleResult4);

console.log(`\n✅ Results identical: ${JSON.stringify(streamResult4) === JSON.stringify(toggleResult4)}`);
console.log('');

// Performance comparison
console.log('⚡ Performance Characteristics:\n');
console.log('🔄 Stream Mode:');
console.log('  - Optimized for real-time event feeds');
console.log('  - Efficient for incremental data updates');
console.log('  - Best for streaming analytics');
console.log('');
console.log('⚡ Toggle Mode (Crossfilter-optimized):');
console.log('  - Dimension-based indexing for fast filtering');
console.log('  - Refcounted aggregates for efficient group operations');
console.log('  - Order-statistic trees for ranking operations');
console.log('  - Membership tracking for dashboard-style analytics');
console.log('  - Optimized for fixed datasets with frequent filtering');
console.log('');

console.log('🎯 Crossfilter/DC.js Style Optimizations Complete!');
console.log('Both execution modes produce identical results with mode-specific optimizations.');