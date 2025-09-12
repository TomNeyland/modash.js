import Modash from '../src/modash/index.js';
import testData from './test-data.js';
import { expect } from 'chai';

describe('New Aggregation Operators', () => {
  describe('$match', () => {
    it('should filter documents based on criteria', () => {
      const result = Modash.aggregate(testData.inventory, [
        { $match: { qty: { $gte: 250 } } },
      ]);

      expect(result).to.have.lengthOf(3);
      expect(result.every(item => item.qty >= 250)).to.be.true;
    });

    it('should handle simple equality matching', () => {
      const result = Modash.aggregate(testData.inventory, [
        { $match: { item: 'abc1' } },
      ]);

      expect(result).to.have.lengthOf(1);
      expect(result[0].item).to.equal('abc1');
    });
  });

  describe('$limit', () => {
    it('should limit the number of documents', () => {
      const result = Modash.aggregate(testData.inventory, [{ $limit: 2 }]);

      expect(result).to.have.lengthOf(2);
    });
  });

  describe('$skip', () => {
    it('should skip the specified number of documents', () => {
      const result = Modash.aggregate(testData.inventory, [{ $skip: 2 }]);

      expect(result).to.have.lengthOf(3); // Original 5 - 2 skipped = 3
    });
  });

  describe('$unwind', () => {
    it('should unwind array fields', () => {
      const testDoc = [
        { _id: 1, tags: ['red', 'blue'], name: 'item1' },
        { _id: 2, tags: ['green'], name: 'item2' },
      ];

      const result = Modash.aggregate(testDoc, [{ $unwind: '$tags' }]);

      expect(result).to.have.lengthOf(3);
      expect(result[0].tags).to.equal('red');
      expect(result[1].tags).to.equal('blue');
      expect(result[2].tags).to.equal('green');
    });
  });

  describe('Complex Pipeline', () => {
    it('should handle a complex multi-stage pipeline', () => {
      const result = Modash.aggregate(testData.inventory, [
        { $match: { qty: { $gte: 200 } } },
        {
          $project: {
            item: 1,
            qty: 1,
            category: { $concat: ['product-', '$item'] },
          },
        },
        { $limit: 3 },
      ]);

      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.have.property('category');
    });
  });
});
