import Modash from '../../src/index.js';
import { resetFallbackTracking, getFallbackCount } from '../../src/modash/debug.js';

const testData = [
  {
    _id: 1,
    name: 'Alice',
    age: 30,
    tags: ['developer', 'senior'],
    scores: [85, 90, 88],
  },
  { _id: 2, name: 'Bob', age: 25, tags: ['designer'], scores: [92, 87] },
  {
    _id: 3,
    name: 'Charlie',
    age: 35,
    tags: ['developer', 'lead'],
    scores: [78, 85, 82, 90],
  },
  { _id: 4, name: 'David', age: 28, skills: null, scores: [88] },
];

const pipeline = [
  { $match: { tags: { $exists: true } } },
  {
    $addFields: {
      avgScore: { $avg: '$scores' },
      firstTag: { $arrayElemAt: ['$tags', 0] },
    },
  },
  { $sort: { avgScore: -1 } },
  {
    $project: {
      name: 1,
      avgScore: { $round: ['$avgScore', 1] },
      firstTag: 1,
      isTopPerformer: { $gte: ['$avgScore', 85] },
    },
  },
];

resetFallbackTracking();
const result = Modash.aggregate(testData, pipeline);

console.log('Result count:', result.length);
console.log('Fallback count:', getFallbackCount());
console.log('Results:', result.map(d => d.name));