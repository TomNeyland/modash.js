import { expect } from 'chai';
import Modash from '../src/index';

describe('IVM Context Chaining Regression Tests', () => {
  describe('$addFields -> $project chaining', () => {
    it('should propagate computed fields through project stage', () => {
      const data = [
        { _id: 1, values: [10, 20, 30] },
        { _id: 2, values: [5, 15, 25] },
      ];

      const result = Modash.aggregate(data, [
        { $addFields: { avg: { $avg: '$values' } } },
        { $project: { _id: 1, avg: 1, doubled: { $multiply: ['$avg', 2] } } },
      ]);

      expect(result).to.have.length(2);
      expect(result[0].avg).to.equal(20);
      expect(result[0].doubled).to.equal(40);
      expect(result[1].avg).to.equal(15);
      expect(result[1].doubled).to.equal(30);
    });

    it('should handle complex expressions referencing added fields', () => {
      const data = [{ name: 'Bob', scores: [92, 87] }];

      const result = Modash.aggregate(data, [
        { $addFields: { avgScore: { $avg: '$scores' } } },
        {
          $project: {
            name: 1,
            avgScore: { $round: ['$avgScore', 1] },
            isTopPerformer: { $gte: ['$avgScore', 85] },
          },
        },
      ]);

      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('Bob');
      expect(result[0].avgScore).to.equal(89.5);
      expect(result[0].isTopPerformer).to.be.true;
    });
  });

  describe('Multi-stage pipeline chaining', () => {
    it('should maintain field transformations across multiple stages', () => {
      const data = [
        { name: 'Alice', scores: [85, 90], category: 'A' },
        { name: 'Bob', scores: [92, 87], category: 'B' },
        { name: 'Charlie', scores: [78, 85], category: 'A' },
      ];

      const result = Modash.aggregate(data, [
        { $addFields: { avgScore: { $avg: '$scores' } } },
        { $match: { avgScore: { $gte: 85 } } },
        { $addFields: { bonus: { $multiply: ['$avgScore', 0.1] } } },
        {
          $project: {
            name: 1,
            avgScore: 1,
            bonus: 1,
            total: { $add: ['$avgScore', '$bonus'] },
          },
        },
      ]);

      expect(result).to.have.length(2);

      const alice = result.find(r => r.name === 'Alice');
      const bob = result.find(r => r.name === 'Bob');

      expect(alice.avgScore).to.equal(87.5);
      expect(bob.avgScore).to.equal(89.5);
      expect(alice.total).to.be.closeTo(96.25, 0.01);
      expect(bob.total).to.be.closeTo(98.45, 0.01);
    });

    it('should handle $addFields -> $sort -> $project pipeline', () => {
      const data = [
        { name: 'Alice', scores: [85, 90] },
        { name: 'Bob', scores: [92, 87] },
        { name: 'Charlie', scores: [78, 85] },
      ];

      const result = Modash.aggregate(data, [
        { $addFields: { avgScore: { $avg: '$scores' } } },
        { $sort: { avgScore: -1 } },
        { $project: { name: 1, avgScore: 1 } },
      ]);

      expect(result).to.have.length(3);
      expect(result[0].name).to.equal('Bob'); // Highest avg
      expect(result[0].avgScore).to.equal(89.5);
      expect(result[1].name).to.equal('Alice');
      expect(result[1].avgScore).to.equal(87.5);
      expect(result[2].name).to.equal('Charlie');
      expect(result[2].avgScore).to.equal(81.5);
    });
  });

  describe('$addFields -> $group -> $project chaining', () => {
    it('should use transformed fields in grouping operations', () => {
      const data = [
        { category: 'A', value: 10 },
        { category: 'B', value: 20 },
        { category: 'A', value: 30 },
        { category: 'B', value: 40 },
      ];

      const result = Modash.aggregate(data, [
        { $addFields: { doubled: { $multiply: ['$value', 2] } } },
        {
          $group: {
            _id: '$category',
            totalDoubled: { $sum: '$doubled' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 1,
            totalDoubled: 1,
            avgDoubled: { $divide: ['$totalDoubled', '$count'] },
          },
        },
      ]);

      expect(result).to.have.length(2);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.totalDoubled).to.equal(80); // (10*2) + (30*2)
      expect(categoryA.avgDoubled).to.equal(40);
      expect(categoryB.totalDoubled).to.equal(120); // (20*2) + (40*2)
      expect(categoryB.avgDoubled).to.equal(60);
    });
  });

  describe('Complex expression evaluation', () => {
    it('should evaluate expressions using added fields from multiple stages', () => {
      const data = [{ _id: 1, baseValue: 50, multiplier: 2 }];

      const result = Modash.aggregate(data, [
        {
          $addFields: {
            totalValue: { $multiply: ['$baseValue', '$multiplier'] },
          },
        },
        { $addFields: { tax: { $multiply: ['$totalValue', 0.1] } } },
        {
          $project: {
            _id: 1,
            totalValue: 1,
            tax: 1,
            grandTotal: { $add: ['$totalValue', '$tax'] },
          },
        },
      ]);

      expect(result).to.have.length(1);
      expect(result[0].totalValue).to.equal(100); // 50 * 2
      expect(result[0].tax).to.equal(10); // 100 * 0.1
      expect(result[0].grandTotal).to.equal(110); // 100 + 10
    });
  });
});
