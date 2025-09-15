import Modash from '../../src/index.js';

const data = [
  { category: 'electronics', price: 100, quantity: 2 },
  { category: 'electronics', price: 200, quantity: 1 },
  { category: 'furniture', price: 300, quantity: 1 },
  { category: 'furniture', price: 400, quantity: 2 },
];

const result = Modash.aggregate(data, [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      itemCount: { $sum: 1 },
    },
  },
]);

console.log('Group result:');
console.log(JSON.stringify(result, null, 2));
console.log('Length:', result.length);