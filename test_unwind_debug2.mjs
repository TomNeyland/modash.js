import Modash from './src/index.ts';

// Enable debug to see hot path messages
process.env.DEBUG = '1';

const testDoc = [
  { _id: 1, tags: ['red', 'blue'], name: 'item1' },
  { _id: 2, tags: ['green'], name: 'item2' },
];

console.log('Input documents:', JSON.stringify(testDoc, null, 2));

// Try with a simpler case first
const simpleTest = [{ _id: 1, tags: ['red', 'blue'] }];
console.log('\n=== Simple test (one document) ===');
const simpleResult = Modash.aggregate(simpleTest, [{ $unwind: '$tags' }]);
console.log('Simple result:', JSON.stringify(simpleResult, null, 2));

console.log('\n=== Full test ===');
const result = Modash.aggregate(testDoc, [{ $unwind: '$tags' }]);
console.log('Result length:', result.length);
console.log('Result:', JSON.stringify(result, null, 2));
