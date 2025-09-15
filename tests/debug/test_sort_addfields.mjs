import Modash from '../../src/index.js';

const testData = [
  { _id: 1, name: 'Alice', scores: [85, 90, 88] },
  { _id: 2, name: 'Bob', scores: [92, 87] },
  { _id: 3, name: 'Charlie', scores: [78, 85, 82, 90] },
];

const pipeline = [
  {
    $addFields: {
      avgScore: { $avg: '$scores' },
    },
  },
  { $sort: { avgScore: -1 } },
];

console.log('Test data:', JSON.stringify(testData, null, 2));
console.log('\nPipeline:', JSON.stringify(pipeline, null, 2));

const result = Modash.aggregate(testData, pipeline);

console.log('\nResult:');
result.forEach(doc => {
  console.log(`${doc.name}: avgScore=${doc.avgScore}`);
});