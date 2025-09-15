import Modash from '../src/index.ts';
import { expect } from 'chai';

describe('Simplified Toggle Mode', () => {
  const testData = [
    { name: 'Alice', age: 30, city: 'Seattle', score: 85, category: 'A' },
    { name: 'Bob', age: 25, city: 'Portland', score: 92, category: 'B' },
    { name: 'Charlie', age: 35, city: 'Seattle', score: 78, category: 'A' },
    { name: 'Diana', age: 28, city: 'Portland', score: 88, category: 'B' },
    { name: 'Eve', age: 32, city: 'Seattle', score: 95, category: 'A' },
  ];

  describe('Basic Stream Mode', () => {
    it('should perform basic aggregation in stream mode', () => {
      const result = Modash.aggregate(testData, [
        { $match: { score: { $gte: 85 } } },
        { $project: { name: 1, score: 1 } }
      ], { mode: 'stream' });
      
      expect(result).to.have.length(4);
      expect(result[0]).to.have.property('name');
      expect(result[0]).to.have.property('score');
    });
  });

  describe('Toggle Mode Optimizations', () => {
    it('should detect and optimize bitmap filtering pattern', () => {
      const result = Modash.aggregate(testData, [
        { $match: { category: { $in: ['A', 'B'] } } },
        { $match: { city: { $in: ['Seattle'] } } },
        { $project: { name: 1, category: 1 } }
      ], { mode: 'toggle' });
      
      expect(result).to.have.length(3); // Alice, Charlie, Eve from Seattle
      result.forEach(doc => {
        expect(doc.category).to.be.oneOf(['A']);
      });
    });

    it('should detect and optimize top-K pattern', () => {
      const result = Modash.aggregate(testData, [
        { $sort: { score: -1 } },
        { $limit: 3 }
      ], { mode: 'toggle' });
      
      expect(result).to.have.length(3);
      expect(result[0].score).to.equal(95); // Eve
      expect(result[1].score).to.equal(92); // Bob  
      expect(result[2].score).to.equal(88); // Diana
    });

    it('should detect and optimize group aggregation pattern', () => {
      const result = Modash.aggregate(testData, [
        { $group: { 
          _id: '$category', 
          totalScore: { $sum: '$score' },
          count: { $sum: 1 }
        }}
      ], { mode: 'toggle' });
      
      expect(result).to.have.length(2);
      
      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');
      
      expect(categoryA.totalScore).to.equal(258); // 85 + 78 + 95
      expect(categoryA.count).to.equal(3);
      expect(categoryB.totalScore).to.equal(180); // 92 + 88  
      expect(categoryB.count).to.equal(2);
    });

    it('should fallback to stream mode when no optimization applicable', () => {
      const result = Modash.aggregate(testData, [
        { $match: { age: { $gt: 30 } } },
        { $project: { name: 1, age: 1 } }
      ], { mode: 'toggle' });
      
      expect(result).to.have.length(2); // Charlie and Eve
      expect(result[0]).to.have.property('name');
      expect(result[0]).to.have.property('age');
    });
  });

  describe('Mode Compatibility', () => {
    it('should produce identical results in both modes', () => {
      const pipeline = [
        { $match: { score: { $gte: 85 } } },
        { $sort: { score: -1 } },
        { $limit: 2 }
      ];
      
      const streamResult = Modash.aggregate(testData, pipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(testData, pipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal(toggleResult);
    });

    it('should handle empty collections in both modes', () => {
      const pipeline = [{ $match: { score: { $gte: 85 } } }];
      
      const streamResult = Modash.aggregate([], pipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate([], pipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal([]);
      expect(toggleResult).to.deep.equal([]);
    });
  });
});