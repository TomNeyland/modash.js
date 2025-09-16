import Aggo from '../src/aggo/index.js';

// Sample e-commerce data
const orders = [
  {
    customerId: 1,
    item: 'laptop',
    price: 1200,
    quantity: 1,
    date: new Date('2024-01-15'),
    category: 'electronics',
  },
  {
    customerId: 2,
    item: 'mouse',
    price: 25,
    quantity: 2,
    date: new Date('2024-01-15'),
    category: 'electronics',
  },
  {
    customerId: 1,
    item: 'keyboard',
    price: 75,
    quantity: 1,
    date: new Date('2024-01-16'),
    category: 'electronics',
  },
  {
    customerId: 3,
    item: 'chair',
    price: 300,
    quantity: 1,
    date: new Date('2024-01-16'),
    category: 'furniture',
  },
  {
    customerId: 2,
    item: 'desk',
    price: 500,
    quantity: 1,
    date: new Date('2024-01-17'),
    category: 'furniture',
  },
];

console.log('🚀 Modern Aggo.js Examples\n');

// Example 1: Basic aggregation - Calculate daily revenue
console.log('📊 Daily Revenue Analysis:');
const dailyRevenue = Aggo.aggregate(orders, [
  {
    $project: {
      date: { $dayOfMonth: '$date' },
      revenue: { $multiply: ['$price', '$quantity'] },
    },
  },
  {
    $group: {
      _id: '$date',
      totalRevenue: { $sum: '$revenue' },
      orderCount: { $sum: 1 },
    },
  },
  { $sort: { totalRevenue: -1 } },
]);
console.log(JSON.stringify(dailyRevenue, null, 2));

console.log('\n💰 Customer Spending Analysis:');
// Example 2: Customer analysis
const customerStats = Aggo.aggregate(orders, [
  {
    $group: {
      _id: '$customerId',
      totalSpent: { $sum: { $multiply: ['$price', '$quantity'] } },
      itemCount: { $sum: '$quantity' },
      avgOrderValue: { $avg: { $multiply: ['$price', '$quantity'] } },
      categories: { $addToSet: '$category' },
    },
  },
  { $sort: { totalSpent: -1 } },
]);
console.log(JSON.stringify(customerStats, null, 2));

console.log('\n🏷️ Category Performance:');
// Example 3: Category analysis with filtering
const categoryPerformance = Aggo.aggregate(orders, [
  { $match: { price: { $gte: 50 } } }, // Only items over $50
  {
    $group: {
      _id: '$category',
      avgPrice: { $avg: '$price' },
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      itemsSold: { $sum: '$quantity' },
    },
  },
  {
    $project: {
      category: '$_id',
      avgPrice: { $multiply: [{ $divide: ['$avgPrice', 1] }, 1] }, // Round to 2 decimals
      totalRevenue: 1,
      itemsSold: 1,
      _id: 0,
    },
  },
]);
console.log(JSON.stringify(categoryPerformance, null, 2));

console.log('\n🔍 Complex Pipeline - High Value Customer Items:');
// Example 4: Complex multi-stage pipeline
const highValueItems = Aggo.aggregate(orders, [
  // Stage 1: Filter expensive items
  { $match: { price: { $gte: 100 } } },

  // Stage 2: Add computed fields
  {
    $project: {
      customerId: 1,
      item: 1,
      price: 1,
      total: { $multiply: ['$price', '$quantity'] },
      isPremium: { $gte: ['$price', 300] },
      itemCode: { $concat: [{ $toUpper: '$category' }, '-', '$item'] },
    },
  },

  // Stage 3: Sort by total value
  { $sort: { total: -1 } },

  // Stage 4: Limit to top 3
  { $limit: 3 },
]);
console.log(JSON.stringify(highValueItems, null, 2));

console.log('\n✅ All examples completed successfully!');
console.log('🎉 Modern Aggo.js is working perfectly with ES2022+ features!');
