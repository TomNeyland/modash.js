import Aggo from '../../src/index';

const data = Array.from({ length: 50 }, (_, i) => ({
  _id: i,
  item: ['laptop', 'mouse', 'keyboard'][i % 3],
  category: ['electronics', 'furniture'][i % 2],
  price: 50 + (i * 10),
  quantity: (i % 5) + 1,
  active: i % 3 !== 0,
  date: new Date(2023, i % 12, (i % 28) + 1),
}));

console.log('Testing without $sort:');
const groupResult1 = Aggo.aggregate(data, [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      avgPrice: { $avg: '$price' },
      itemCount: { $sum: 1 },
    },
  },
]);
console.log('Result length:', groupResult1.length);
console.log('Result:', JSON.stringify(groupResult1.slice(0, 3), null, 2));

console.log('\nTesting with $sort:');
const groupResult2 = Aggo.aggregate(data, [
  {
    $group: {
      _id: '$category',
      totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      avgPrice: { $avg: '$price' },
      itemCount: { $sum: 1 },
    },
  },
  { $sort: { totalRevenue: -1 } },
]);
console.log('Result length:', groupResult2.length);
console.log('Result:', JSON.stringify(groupResult2.slice(0, 3), null, 2));