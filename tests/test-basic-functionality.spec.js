import Modash from '../src/index.ts';
import { expect } from 'chai';

describe('Basic Functionality Test', () => {
  const testData = [
    { name: 'Alice', age: 30, city: 'Seattle', score: 85, category: 'A' },
    { name: 'Bob', age: 25, city: 'Portland', score: 92, category: 'B' },
    { name: 'Charlie', age: 35, city: 'Seattle', score: 78, category: 'A' },
    { name: 'Diana', age: 28, city: 'Portland', score: 88, category: 'B' },
    { name: 'Eve', age: 32, city: 'Seattle', score: 95, category: 'A' },
  ];

  it('should work with basic stream mode', () => {
    const result = Modash.aggregate(testData, [
      { $match: { score: { $gte: 85 } } },
      { $project: { name: 1, score: 1 } }
    ], { mode: 'stream' });
    
    console.log('Stream mode result:', result);
    expect(result).to.have.length(4);
  });

  it('should sort correctly in stream mode', () => {
    const result = Modash.aggregate(testData, [
      { $sort: { score: -1 } },
      { $limit: 3 }
    ], { mode: 'stream' });
    
    console.log('Stream sort result:', result);
    expect(result).to.have.length(3);
    expect(result[0].name).to.equal('Eve'); // score: 95
    expect(result[1].name).to.equal('Bob'); // score: 92
    expect(result[2].name).to.equal('Diana'); // score: 88
  });

  it('should try toggle mode but fallback', () => {
    console.log('Testing toggle mode...');
    const result = Modash.aggregate(testData, [
      { $sort: { score: -1 } },
      { $limit: 3 }
    ], { mode: 'toggle' });
    
    console.log('Toggle mode result:', result);
    expect(result).to.have.length(3);
  });
});