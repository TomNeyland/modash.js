/**
 * Tests for StreamingCollection removal capabilities
 * Validates incremental subtraction and result updates
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { EventEmitter } from 'events';
import Modash, { createStreamingCollection } from '../src/index.js';

describe('Streaming Collection - Record Removal', () => {
  describe('Basic Removal Operations', () => {
    it('should remove documents by predicate function', () => {
      const initialData = [
        { id: 1, name: 'Alice', age: 30, department: 'Engineering' },
        { id: 2, name: 'Bob', age: 25, department: 'Marketing' },
        { id: 3, name: 'Charlie', age: 35, department: 'Engineering' },
        { id: 4, name: 'Diana', age: 28, department: 'Sales' },
      ];

      const streaming = createStreamingCollection(initialData);

      // Remove all Engineering employees
      const removed = streaming.remove(doc => doc.department === 'Engineering');

      expect(removed).to.have.length(2);
      expect(removed.map(d => d.name)).to.deep.equal(['Alice', 'Charlie']);
      expect(streaming.count()).to.equal(2);
      expect(streaming.getDocuments().map(d => d.name)).to.deep.equal([
        'Bob',
        'Diana',
      ]);
    });

    it('should remove document by ID', () => {
      const initialData = [
        { id: 1, name: 'Alice', score: 95 },
        { id: 2, name: 'Bob', score: 87 },
        { id: 3, name: 'Charlie', score: 92 },
      ];

      const streaming = createStreamingCollection(initialData);

      const removed = streaming.removeById(2);

      expect(removed).to.deep.equal({ id: 2, name: 'Bob', score: 87 });
      expect(streaming.count()).to.equal(2);
      expect(streaming.getDocuments().map(d => d.name)).to.deep.equal([
        'Alice',
        'Charlie',
      ]);
    });

    it('should remove multiple documents by IDs', () => {
      const initialData = [
        { id: 1, name: 'Alice', score: 95 },
        { id: 2, name: 'Bob', score: 87 },
        { id: 3, name: 'Charlie', score: 92 },
        { id: 4, name: 'Diana', score: 88 },
      ];

      const streaming = createStreamingCollection(initialData);

      const removed = streaming.removeByIds([1, 3]);

      expect(removed).to.have.length(2);
      expect(removed.map(d => d.name)).to.deep.equal(['Alice', 'Charlie']);
      expect(streaming.count()).to.equal(2);
      expect(streaming.getDocuments().map(d => d.name)).to.deep.equal([
        'Bob',
        'Diana',
      ]);
    });

    it('should remove documents by query', () => {
      const initialData = [
        { id: 1, status: 'active', priority: 'high' },
        { id: 2, status: 'inactive', priority: 'low' },
        { id: 3, status: 'active', priority: 'medium' },
        { id: 4, status: 'active', priority: 'high' },
      ];

      const streaming = createStreamingCollection(initialData);

      const removed = streaming.removeByQuery({
        status: 'active',
        priority: 'high',
      });

      expect(removed).to.have.length(2);
      expect(removed.map(d => d.id)).to.deep.equal([1, 4]);
      expect(streaming.count()).to.equal(2);
    });

    it('should remove first N documents', () => {
      const initialData = [
        { id: 1, value: 'first' },
        { id: 2, value: 'second' },
        { id: 3, value: 'third' },
        { id: 4, value: 'fourth' },
      ];

      const streaming = createStreamingCollection(initialData);

      const removed = streaming.removeFirst(2);

      expect(removed).to.have.length(2);
      expect(removed.map(d => d.value)).to.deep.equal(['first', 'second']);
      expect(streaming.getDocuments().map(d => d.value)).to.deep.equal([
        'third',
        'fourth',
      ]);
    });

    it('should remove last N documents', () => {
      const initialData = [
        { id: 1, value: 'first' },
        { id: 2, value: 'second' },
        { id: 3, value: 'third' },
        { id: 4, value: 'fourth' },
      ];

      const streaming = createStreamingCollection(initialData);

      const removed = streaming.removeLast(2);

      expect(removed).to.have.length(2);
      expect(removed.map(d => d.value)).to.deep.equal(['third', 'fourth']);
      expect(streaming.getDocuments().map(d => d.value)).to.deep.equal([
        'first',
        'second',
      ]);
    });
  });

  describe('Event Emission on Removal', () => {
    it('should emit data-removed event when documents are removed', done => {
      const initialData = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ];

      const streaming = createStreamingCollection(initialData);

      streaming.on('data-removed', event => {
        expect(event.removedDocuments).to.have.length(2);
        expect(event.removedCount).to.equal(2);
        expect(event.totalCount).to.equal(1);
        expect(event.removedDocuments.map(d => d.name)).to.deep.equal([
          'Alice',
          'Charlie',
        ]);
        done();
      });

      streaming.removeByIds([1, 3]);
    });

    it('should not emit event when no documents are removed', () => {
      const streaming = createStreamingCollection([{ id: 1, name: 'Alice' }]);
      let eventEmitted = false;

      streaming.on('data-removed', () => {
        eventEmitted = true;
      });

      streaming.removeById(999); // Non-existent ID

      // Allow event loop to process
      setTimeout(() => {
        expect(eventEmitted).to.be.false;
      }, 10);
    });
  });

  describe('Streaming Aggregation Updates on Removal', () => {
    it('should update streaming results when documents are removed', done => {
      const initialData = [
        { category: 'A', value: 10 },
        { category: 'A', value: 20 },
        { category: 'B', value: 15 },
        { category: 'B', value: 25 },
      ];

      const streaming = createStreamingCollection(initialData);

      const pipeline = [
        {
          $group: {
            _id: '$category',
            total: { $sum: '$value' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ];

      // Start streaming
      const initialResult = streaming.stream(pipeline);
      expect(initialResult).to.deep.equal([
        { _id: 'A', total: 30, count: 2 },
        { _id: 'B', total: 40, count: 2 },
      ]);

      let updateCount = 0;
      streaming.on('result-updated', event => {
        updateCount++;
        if (updateCount === 1) {
          // After removing one category A document
          expect(event.result).to.deep.equal([
            { _id: 'A', total: 10, count: 1 },
            { _id: 'B', total: 40, count: 2 },
          ]);
          done();
        }
      });

      // Remove one document from category A
      streaming.remove(doc => doc.category === 'A' && doc.value === 20);
    });

    it('should handle removal that affects multiple pipeline stages', () => {
      const initialData = [
        { id: 1, type: 'premium', score: 95, active: true },
        { id: 2, type: 'premium', score: 87, active: false },
        { id: 3, type: 'basic', score: 78, active: true },
        { id: 4, type: 'premium', score: 92, active: true },
        { id: 5, type: 'basic', score: 85, active: true },
      ];

      const streaming = createStreamingCollection(initialData);

      const pipeline = [
        { $match: { active: true } },
        {
          $group: {
            _id: '$type',
            avgScore: { $avg: '$score' },
            count: { $sum: 1 },
          },
        },
        { $sort: { avgScore: -1 } },
      ];

      // Get initial results
      const initialResult = streaming.stream(pipeline);
      expect(initialResult).to.deep.equal([
        { _id: 'premium', avgScore: 93.5, count: 2 },
        { _id: 'basic', avgScore: 81.5, count: 2 },
      ]);

      // Remove the highest scoring premium user
      streaming.removeById(1);

      const updatedResult = streaming.getStreamingResult(pipeline);
      expect(updatedResult).to.deep.equal([
        { _id: 'premium', avgScore: 92, count: 1 },
        { _id: 'basic', avgScore: 81.5, count: 2 },
      ]);
    });

    it('should handle complete category removal in group operations', () => {
      const initialData = [
        { category: 'X', amount: 100 },
        { category: 'Y', amount: 200 },
        { category: 'Y', amount: 150 },
      ];

      const streaming = createStreamingCollection(initialData);

      const pipeline = [
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ];

      streaming.stream(pipeline);

      // Remove all documents from category Y
      streaming.remove(doc => doc.category === 'Y');

      const result = streaming.getStreamingResult(pipeline);
      expect(result).to.deep.equal([{ _id: 'X', total: 100 }]);
    });
  });

  describe('Mixed Add/Remove Operations', () => {
    it('should handle alternating add and remove operations correctly', () => {
      const streaming = createStreamingCollection([{ id: 1, score: 80 }]);

      const pipeline = [
        {
          $group: {
            _id: null,
            avgScore: { $avg: '$score' },
            count: { $sum: 1 },
          },
        },
      ];

      streaming.stream(pipeline);

      // Initial: avg = 80, count = 1
      let result = streaming.getStreamingResult(pipeline);
      expect(result[0]).to.deep.include({ avgScore: 80, count: 1 });

      // Add high score: avg should increase
      streaming.add({ id: 2, score: 100 });
      result = streaming.getStreamingResult(pipeline);
      expect(result[0]).to.deep.include({ avgScore: 90, count: 2 });

      // Remove low score: avg should increase further
      streaming.removeById(1);
      result = streaming.getStreamingResult(pipeline);
      expect(result[0]).to.deep.include({ avgScore: 100, count: 1 });

      // Add medium score: avg should decrease
      streaming.add({ id: 3, score: 70 });
      result = streaming.getStreamingResult(pipeline);
      expect(result[0]).to.deep.include({ avgScore: 85, count: 2 });
    });

    it('should maintain result consistency across complex add/remove scenarios', () => {
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
        { $sort: { avgBoosted: -1 } },
      ];

      streaming.stream(pipeline);

      // Build up data
      streaming.addBulk([
        { id: 1, category: 'A', score: 80, active: true },
        { id: 2, category: 'A', score: 90, active: true },
        { id: 3, category: 'B', score: 70, active: true },
        { id: 4, category: 'B', score: 85, active: false }, // Will be filtered out
      ]);

      let result = streaming.getStreamingResult(pipeline);
      expect(result).to.deep.equal([
        { _id: 'A', avgBoosted: 93.5, count: 2 }, // (80*1.1 + 90*1.1) / 2 = 93.5
        { _id: 'B', avgBoosted: 77, count: 1 }, // 70*1.1 = 77
      ]);

      // Remove and add simultaneously
      streaming.removeById(2); // Remove high score from A
      streaming.add({ id: 5, category: 'B', score: 95, active: true }); // Add high score to B

      result = streaming.getStreamingResult(pipeline);
      expect(result).to.deep.equal([
        { _id: 'B', avgBoosted: 90.75, count: 2 }, // (70*1.1 + 95*1.1) / 2 = 90.75
        { _id: 'A', avgBoosted: 88, count: 1 }, // 80*1.1 = 88
      ]);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle removal from empty collection gracefully', () => {
      const streaming = createStreamingCollection([]);

      const removed = streaming.remove(() => true);
      expect(removed).to.have.length(0);
      expect(streaming.count()).to.equal(0);
    });

    it('should handle removal when no documents match predicate', () => {
      const streaming = createStreamingCollection([
        { id: 1, status: 'active' },
      ]);

      const removed = streaming.remove(doc => doc.status === 'inactive');
      expect(removed).to.have.length(0);
      expect(streaming.count()).to.equal(1);
    });

    it('should handle removeById with non-existent ID', () => {
      const streaming = createStreamingCollection([{ id: 1, name: 'Alice' }]);

      const removed = streaming.removeById(999);
      expect(removed).to.be.null;
      expect(streaming.count()).to.equal(1);
    });

    it('should handle removal with complex predicate functions', () => {
      const streaming = createStreamingCollection([
        { id: 1, tags: ['urgent', 'priority'], score: 95 },
        { id: 2, tags: ['normal'], score: 80 },
        { id: 3, tags: ['urgent', 'review'], score: 88 },
      ]);

      // Remove documents that have 'urgent' tag and score > 90
      const removed = streaming.remove(
        doc => doc.tags.includes('urgent') && doc.score > 90
      );

      expect(removed).to.have.length(1);
      expect(removed[0].id).to.equal(1);
      expect(streaming.count()).to.equal(2);
    });

    it('should handle removal during active streaming without errors', () => {
      const streaming = createStreamingCollection([
        { category: 'A', value: 10 },
        { category: 'B', value: 20 },
      ]);

      const pipeline = [
        { $group: { _id: '$category', sum: { $sum: '$value' } } },
      ];
      streaming.stream(pipeline);

      // This should not throw errors
      expect(() => {
        streaming.remove(doc => doc.category === 'A');
      }).to.not.throw();

      const result = streaming.getStreamingResult(pipeline);
      expect(result).to.deep.equal([{ _id: 'B', sum: 20 }]);
    });
  });

  describe('Performance Validation for Removal Operations', () => {
    it('should handle large-scale removal operations efficiently', () => {
      // Create a large dataset
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        category: `cat-${i % 10}`,
        value: Math.floor(Math.random() * 100),
        active: i % 3 === 0,
      }));

      const streaming = createStreamingCollection(largeDataset);

      const pipeline = [
        { $match: { active: true } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            avgValue: { $avg: '$value' },
          },
        },
      ];

      streaming.stream(pipeline);

      const startTime = Date.now();

      // Remove half the documents
      streaming.remove((doc, index) => index % 2 === 0);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).to.be.below(100); // 100ms threshold
      expect(streaming.count()).to.equal(500);

      // Verify results are still correct
      const result = streaming.getStreamingResult(pipeline);
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
    });
  });

  describe('Streaming vs Non-Streaming Equivalence for Removal', () => {
    it('should produce identical results between removal in streaming and non-streaming collections', () => {
      const initialData = [
        { id: 1, department: 'Engineering', salary: 100000, active: true },
        { id: 2, department: 'Marketing', salary: 80000, active: true },
        { id: 3, department: 'Engineering', salary: 120000, active: false },
        { id: 4, department: 'Sales', salary: 90000, active: true },
        { id: 5, department: 'Marketing', salary: 85000, active: true },
      ];

      const pipeline = [
        { $match: { active: true } },
        {
          $group: {
            _id: '$department',
            avgSalary: { $avg: '$salary' },
            count: { $sum: 1 },
          },
        },
        { $sort: { avgSalary: -1 } },
      ];

      // Streaming approach
      const streaming = createStreamingCollection([...initialData]);
      streaming.stream(pipeline);
      streaming.remove(doc => doc.department === 'Marketing');
      const streamingResult = streaming.getStreamingResult(pipeline);

      // Non-streaming approach (manual filtering)
      const filteredData = initialData.filter(
        doc => doc.department !== 'Marketing'
      );
      const nonStreamingResult = Modash.aggregate(filteredData, pipeline);

      expect(streamingResult).to.deep.equal(nonStreamingResult);
    });
  });
});
