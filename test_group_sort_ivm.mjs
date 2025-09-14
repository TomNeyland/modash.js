import { createCrossfilterEngine } from './src/modash/crossfilter-engine.js';
import { trackFallback, resetFallbackTracking, getFallbackCount } from './src/modash/debug.js';

const data = [
  { category: 'electronics', price: 100, quantity: 2 },
  { category: 'furniture', price: 200, quantity: 1 },
];

const pipeline = [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      itemCount: { $sum: 1 },
    },
  },
  { $sort: { totalRevenue: -1 } },
];

resetFallbackTracking();

const engine = createCrossfilterEngine();
data.forEach(doc => engine.addDocument(doc));

// Execute
const result = engine.execute(pipeline);
console.log('Result:', JSON.stringify(result, null, 2));
console.log('Fallback count:', getFallbackCount());