import Modash from './src/index.js';

const testData = [
  {
    _id: 1,
    name: 'Alice',
    scores: [85, 90, 88],
  },
  {
    _id: 2,
    name: 'Bob',
    scores: [92, 87]
  },
  {
    _id: 3,
    name: 'Charlie',
    scores: [78, 85, 82, 90],
  },
];

console.log('Test data:', JSON.stringify(testData, null, 2));

const pipeline = [
  {
    $addFields: {
      avgScore: { $avg: '$scores' },
    },
  },
];

console.log('\nPipeline:', JSON.stringify(pipeline, null, 2));

const result = Modash.aggregate(testData, pipeline);

console.log('\nResult:', JSON.stringify(result, null, 2));