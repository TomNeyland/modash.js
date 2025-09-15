/**
 * Tests for TopK Heap Implementation
 */

import { expect } from 'chai';
import { TopKHeap } from '../src/modash/topk-heap.ts';

describe('TopK Heap Implementation', function () {
  describe('Constructor', function () {
    it('should create a heap with given k and sort specification', function () {
      const heap = new TopKHeap(3, { score: -1 });
      expect(heap).to.be.an.instanceOf(TopKHeap);
    });

    it('should handle multiple sort fields', function () {
      const heap = new TopKHeap(5, { category: 1, score: -1 });
      expect(heap).to.be.an.instanceOf(TopKHeap);
    });
  });

  describe('Adding Documents', function () {
    it('should add documents when heap is not full', function () {
      const heap = new TopKHeap(3, { score: -1 });

      heap.add({ name: 'Alice', score: 85 }, 0);
      heap.add({ name: 'Bob', score: 92 }, 1);
      heap.add({ name: 'Charlie', score: 78 }, 2);

      const results = heap.getSorted();
      expect(results).to.have.length(3);
    });

    it('should maintain top-k property for descending sort', function () {
      const heap = new TopKHeap(2, { score: -1 }); // Top 2 highest scores

      heap.add({ name: 'Alice', score: 85 }, 0);
      heap.add({ name: 'Bob', score: 92 }, 1);
      heap.add({ name: 'Charlie', score: 78 }, 2); // Should not be in top 2
      heap.add({ name: 'Diana', score: 95 }, 3); // Should replace Charlie

      const results = heap.getSorted();
      expect(results).to.have.length(2);

      const scores = results.map(r => r.score);
      expect(scores).to.include(92);
      expect(scores).to.include(95);
      expect(scores).to.not.include(78);
    });

    it('should maintain top-k property for ascending sort', function () {
      const heap = new TopKHeap(2, { score: 1 }); // Top 2 lowest scores

      heap.add({ name: 'Alice', score: 85 }, 0);
      heap.add({ name: 'Bob', score: 92 }, 1);
      heap.add({ name: 'Charlie', score: 78 }, 2); // Should be in top 2
      heap.add({ name: 'Diana', score: 95 }, 3); // Should not be in top 2

      const results = heap.getSorted();
      expect(results).to.have.length(2);

      const scores = results.map(r => r.score);
      expect(scores).to.include(78);
      expect(scores).to.include(85);
      expect(scores).to.not.include(95);
    });
  });

  describe('Multi-field Sorting', function () {
    it('should handle multi-field sort specifications', function () {
      const heap = new TopKHeap(3, { category: 1, score: -1 });

      heap.add({ name: 'Alice', category: 'A', score: 85 }, 0);
      heap.add({ name: 'Bob', category: 'B', score: 92 }, 1);
      heap.add({ name: 'Charlie', category: 'A', score: 95 }, 2);
      heap.add({ name: 'Diana', category: 'B', score: 78 }, 3);

      const results = heap.getSorted();
      expect(results).to.have.length(3);

      // Should be sorted by category first (A comes before B), then by score desc within category
      const firstResult = results[0];
      expect(firstResult.category).to.equal('A');
      expect(firstResult.score).to.equal(95); // Highest score in category A
    });
  });

  describe('Edge Cases', function () {
    it('should handle k=0', function () {
      const heap = new TopKHeap(0, { score: -1 });

      heap.add({ name: 'Alice', score: 85 }, 0);

      const results = heap.getSorted();
      expect(results).to.have.length(0);
    });

    it('should handle k=1', function () {
      const heap = new TopKHeap(1, { score: -1 });

      heap.add({ name: 'Alice', score: 85 }, 0);
      heap.add({ name: 'Bob', score: 92 }, 1);
      heap.add({ name: 'Charlie', score: 78 }, 2);

      const results = heap.getSorted();
      expect(results).to.have.length(1);
      expect(results[0].name).to.equal('Bob'); // Highest score
      expect(results[0].score).to.equal(92);
    });

    it('should handle documents with missing sort fields', function () {
      const heap = new TopKHeap(3, { score: -1 });

      heap.add({ name: 'Alice', score: 85 }, 0);
      heap.add({ name: 'Bob' }, 1); // Missing score field
      heap.add({ name: 'Charlie', score: 78 }, 2);

      const results = heap.getSorted();
      expect(results).to.have.length(3);

      // Document with missing field should be handled gracefully
      const bobResult = results.find(r => r.name === 'Bob');
      expect(bobResult).to.exist;
    });

    it('should handle identical sort values', function () {
      const heap = new TopKHeap(2, { score: -1 });

      heap.add({ name: 'Alice', score: 85 }, 0);
      heap.add({ name: 'Bob', score: 85 }, 1);
      heap.add({ name: 'Charlie', score: 85 }, 2);

      const results = heap.getSorted();
      expect(results).to.have.length(2);

      // All have same score, so any 2 should be valid
      results.forEach(result => {
        expect(result.score).to.equal(85);
      });
    });
  });

  describe('Performance Characteristics', function () {
    it('should efficiently handle large numbers of documents', function () {
      const heap = new TopKHeap(10, { score: -1 });

      // Add many documents
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        heap.add({ name: `Doc${i}`, score: Math.random() * 100 }, i);
      }
      const endTime = Date.now();

      const results = heap.getSorted();
      expect(results).to.have.length(10);

      // Should complete reasonably quickly (less than 100ms for 1000 docs)
      expect(endTime - startTime).to.be.lessThan(100);

      // Results should be sorted correctly
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).to.be.at.least(results[i + 1].score);
      }
    });
  });

  describe('Memory Management', function () {
    it('should not grow beyond k items in memory', function () {
      const heap = new TopKHeap(5, { score: -1 });

      // Add more than k documents
      for (let i = 0; i < 100; i++) {
        heap.add({ name: `Doc${i}`, score: i }, i);
      }

      const results = heap.getSorted();
      expect(results).to.have.length(5);

      // Should contain the 5 highest scores (95, 96, 97, 98, 99)
      const scores = results.map(r => r.score).sort((a, b) => b - a);
      expect(scores).to.deep.equal([99, 98, 97, 96, 95]);
    });
  });
});
