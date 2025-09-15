import Modash from '../src/index.ts';
import { expect } from 'chai';

describe('Group Aggregation Debug', () => {
  const testData = [
    { name: 'Alice', age: 30, city: 'Seattle', score: 85, category: 'A' },
    { name: 'Bob', age: 25, city: 'Portland', score: 92, category: 'B' },
    { name: 'Charlie', age: 35, city: 'Seattle', score: 78, category: 'A' },
    { name: 'Diana', age: 28, city: 'Portland', score: 88, category: 'B' },
    { name: 'Eve', age: 32, city: 'Seattle', score: 95, category: 'A' },
  ];

  it('should test group aggregation in stream mode', () => {
    const result = Modash.aggregate(testData, [
      { $group: { 
        _id: '$category', 
        totalScore: { $sum: '$score' },
        count: { $sum: 1 }
      }}
    ], { mode: 'stream' });
    
    console.log('Stream group result:', result);
    
    const categoryA = result.find(r => r._id === 'A');
    const categoryB = result.find(r => r._id === 'B');
    
    console.log('Category A:', categoryA);
    console.log('Category B:', categoryB);
    console.log('Expected A total:', 85 + 78 + 95);
    console.log('Expected B total:', 92 + 88);
  });

  it('should test group aggregation in toggle mode', () => {
    const result = Modash.aggregate(testData, [
      { $group: { 
        _id: '$category', 
        totalScore: { $sum: '$score' },
        count: { $sum: 1 }
      }}
    ], { mode: 'toggle' });
    
    console.log('Toggle group result:', result);
    
    const categoryA = result.find(r => r._id === 'A');
    const categoryB = result.find(r => r._id === 'B');
    
    console.log('Toggle Category A:', categoryA);
    console.log('Toggle Category B:', categoryB);
  });
});