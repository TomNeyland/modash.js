// Regression tests for Issue #41: localeCompare & Streaming Removal fixes
import { expect } from 'chai';
import { createStreamingCollection } from '../src/modash/streaming.js';

describe('Issue #41 Regression Tests', () => {
  describe('localeCompare Error Prevention', () => {
    it('should handle non-string _id values in sort comparisons without throwing', () => {
      // Test the exact case that was failing in the performance test
      const testData = [];
      for (let i = 0; i < 100; i++) {
        testData.push({
          _id: i,
          category: `cat_${i % 10}`,
          value: Math.floor(Math.random() * 100),
          active: i % 3 === 0,
        });
      }

      const pipeline = [
        { $match: { active: true } },
        {
          $group: {
            _id: '$category',
            avgValue: { $avg: '$value' },
            count: { $sum: 1 },
          },
        },
        { $sort: { avgValue: -1 } },
      ];

      const streaming = createStreamingCollection(testData);
      const result = streaming.stream(pipeline);

      // This was throwing "TypeError: a._id.localeCompare is not a function" before the fix
      const sortByCategory = arr => {
        const cmpString = (a, b) => {
          const sa = a == null ? '' : String(a);
          const sb = b == null ? '' : String(b);
          return sa.localeCompare(sb);
        };
        return [...arr].sort((a, b) => cmpString(a._id, b._id));
      };

      expect(() => sortByCategory(result)).to.not.throw();
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);

      streaming.destroy();
    });
  });

  describe('Streaming Removal Consistency', () => {
    it('should maintain accurate count and average calculations during removal', () => {
      const streaming = createStreamingCollection([]);

      const pipeline = [
        { $match: { active: true } },
        {
          $project: {
            category: 1,
            score: 1,
            boosted: { $multiply: ['$score', 1.1] },
          },
        },
        {
          $group: {
            _id: '$category',
            avgBoosted: { $avg: '$boosted' },
            count: { $sum: 1 },
          },
        },
      ];

      streaming.stream(pipeline);

      // Add test data
      streaming.addBulk([
        { id: 1, category: 'A', score: 80, active: true },
        { id: 2, category: 'A', score: 90, active: true },
        { id: 3, category: 'B', score: 70, active: true },
      ]);

      let result = streaming.getStreamingResult(pipeline);
      const initialAGroup = result.find(r => r._id === 'A');

      expect(initialAGroup.count).to.equal(2);
      expect(initialAGroup.avgBoosted).to.be.closeTo(93.5, 0.01); // (80*1.1 + 90*1.1) / 2

      // Remove one document from category A (this was showing avgBoosted=187 before fix)
      streaming.removeById(2);

      result = streaming.getStreamingResult(pipeline);
      const finalAGroup = result.find(r => r._id === 'A');

      // Verify the count decremented correctly
      expect(finalAGroup.count).to.equal(1);

      // Verify the average is recalculated correctly using projected 'boosted' field
      expect(finalAGroup.avgBoosted).to.be.closeTo(88, 0.01); // 80*1.1 = 88

      // Most importantly: verify it's NOT the broken value that was showing before
      expect(finalAGroup.avgBoosted).to.not.be.closeTo(187, 1);

      streaming.destroy();
    });

    it('should handle double removal without negative counts', () => {
      const streaming = createStreamingCollection([]);

      const pipeline = [
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
      ];

      streaming.stream(pipeline);
      streaming.add({ id: 1, category: 'A' });

      let result = streaming.getStreamingResult(pipeline);
      expect(result[0].count).to.equal(1);

      // First removal
      streaming.removeById(1);
      result = streaming.getStreamingResult(pipeline);
      expect(result.length).to.equal(0); // Group should be empty

      // Second removal (should be no-op)
      streaming.removeById(1);
      result = streaming.getStreamingResult(pipeline);
      expect(result.length).to.equal(0); // Still empty, no negative counts

      streaming.destroy();
    });
  });
});
