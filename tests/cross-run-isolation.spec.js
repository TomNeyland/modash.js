/**
 * Cross-Run State Leakage Prevention - Regression Tests
 *
 * These tests validate that the hot-path/zero-alloc engine maintains
 * deterministic execution across multiple runs and prevents state contamination
 * between different pipeline executions.
 */

import { expect } from 'chai';
import Modash from '../src/index.js';

describe('Cross-Run State Leakage Prevention', function () {
  beforeEach(function () {
    // Clear any cached state before each test
    if (process.env.NODE_ENV === 'test') {
      // Reset any global engine state if available
      try {
        const ZeroAllocEngine =
          require('../src/aggo/zero-alloc-engine.js').ZeroAllocEngine;
        if (ZeroAllocEngine.resetGlobalState) {
          ZeroAllocEngine.resetGlobalState();
        }
      } catch (err) {
        // Engine might not be available in all test contexts
      }
    }
  });

  describe('Back-to-Back Pipeline Isolation', function () {
    it('should not leak $group results into subsequent $unwind pipeline', function () {
      const documents = [
        { _id: 1, category: 'A', items: ['x', 'y'] },
        { _id: 2, category: 'A', items: ['z'] },
        { _id: 3, category: 'B', items: ['w'] },
      ];

      // First run: $group pipeline that produces grouped results
      const groupResults = Modash.aggregate(documents, [
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]);

      expect(groupResults).to.have.lengthOf(2);
      expect(groupResults.find(r => r._id === 'A')).to.have.property(
        'count',
        2
      );
      expect(groupResults.find(r => r._id === 'B')).to.have.property(
        'count',
        1
      );

      // Second run: $unwind pipeline that should NOT return grouped results
      const unwindResults = Modash.aggregate(documents, [
        { $unwind: '$items' },
      ]);

      // Critical test: unwind should return 4 documents (2+1+1), not grouped results
      expect(unwindResults).to.have.lengthOf(4);

      // Verify structure is unwound documents, not group results
      expect(unwindResults[0]).to.have.property('_id');
      expect(unwindResults[0]).to.have.property('category');
      expect(unwindResults[0]).to.have.property('items');
      expect(typeof unwindResults[0].items).to.equal('string'); // unwound item, not array

      // Ensure no grouped shape contamination
      expect(unwindResults[0]).to.not.have.property('count');
      for (const doc of unwindResults) {
        expect(doc).to.not.have.deep.property('_id', null);
        expect(doc).to.not.have.property('count');
      }
    });

    it('should maintain consistent results across repeated back-to-back executions', function () {
      const documents = [
        { _id: 1, status: 'active', tags: ['urgent', 'important'] },
        { _id: 2, status: 'inactive', tags: ['normal'] },
        { _id: 3, status: 'active', tags: ['low'] },
      ];

      const pipelineA = [{ $group: { _id: '$status', total: { $sum: 1 } } }];
      const pipelineB = [{ $unwind: '$tags' }];
      const pipelineC = [{ $match: { status: 'active' } }];

      // Run each pipeline multiple times in alternating pattern
      for (let iteration = 0; iteration < 3; iteration++) {
        const resultA1 = Modash.aggregate(documents, pipelineA);
        const resultB1 = Modash.aggregate(documents, pipelineB);
        const resultC1 = Modash.aggregate(documents, pipelineC);

        const resultA2 = Modash.aggregate(documents, pipelineA);
        const resultB2 = Modash.aggregate(documents, pipelineB);
        const resultC2 = Modash.aggregate(documents, pipelineC);

        // Results should be identical across iterations
        expect(resultA1).to.deep.equal(
          resultA2,
          `Pipeline A should be consistent in iteration ${iteration}`
        );
        expect(resultB1).to.deep.equal(
          resultB2,
          `Pipeline B should be consistent in iteration ${iteration}`
        );
        expect(resultC1).to.deep.equal(
          resultC2,
          `Pipeline C should be consistent in iteration ${iteration}`
        );

        // Verify expected shapes and counts
        expect(resultA1).to.have.lengthOf(2); // 2 status groups
        expect(resultB1).to.have.lengthOf(4); // 2 + 1 + 1 unwound tags
        expect(resultC1).to.have.lengthOf(2); // 2 active documents
      }
    });

    it('should prevent virtual row map contamination across runs', function () {
      const documentsSet1 = [{ _id: 1, categories: ['tech', 'news'] }];

      const documentsSet2 = [{ _id: 2, categories: ['sports'] }];

      // Run $unwind on first dataset
      const result1 = Modash.aggregate(documentsSet1, [
        { $unwind: '$categories' },
      ]);

      expect(result1).to.have.lengthOf(2);
      expect(result1.map(d => d.categories)).to.deep.equal(['tech', 'news']);

      // Run $unwind on second dataset - should not see first dataset's virtual rows
      const result2 = Modash.aggregate(documentsSet2, [
        { $unwind: '$categories' },
      ]);

      expect(result2).to.have.lengthOf(1);
      expect(result2[0].categories).to.equal('sports');
      expect(result2[0]._id).to.equal(2);
    });
  });

  describe('Buffer Pool Reuse Safety', function () {
    it('should handle alternating pipelines with different row count patterns', function () {
      const smallDataset = [{ _id: 1, tags: ['a'] }];

      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        _id: i + 1,
        tags: ['tag1', 'tag2', 'tag3'], // Will expand to 300 documents
      }));

      // Alternate between small and large datasets to test buffer reuse
      for (let i = 0; i < 3; i++) {
        // Large expansion
        const largeResult = Modash.aggregate(largeDataset, [
          { $unwind: '$tags' },
        ]);
        expect(largeResult).to.have.lengthOf(300);

        // Small dataset - should not be contaminated by large buffers
        const smallResult = Modash.aggregate(smallDataset, [
          { $unwind: '$tags' },
        ]);
        expect(smallResult).to.have.lengthOf(1);
        expect(smallResult[0]._id).to.equal(1);
        expect(smallResult[0].tags).to.equal('a');
      }
    });
  });

  describe('Plan Cache Immutability', function () {
    it('should not mutate cached pipeline plans across runs', function () {
      const documents = [
        { _id: 1, value: 10 },
        { _id: 2, value: 20 },
      ];

      const pipeline = [
        { $match: { value: { $gte: 15 } } },
        { $project: { _id: 1, value: 1 } },
      ];

      // Run pipeline multiple times
      const result1 = Modash.aggregate(documents, pipeline);
      const result2 = Modash.aggregate(documents, pipeline);
      const result3 = Modash.aggregate(documents, pipeline);

      // All results should be identical
      expect(result1).to.deep.equal(result2);
      expect(result2).to.deep.equal(result3);

      // Verify expected results
      expect(result1).to.have.lengthOf(1);
      expect(result1[0]._id).to.equal(2);
      expect(result1[0].value).to.equal(20);
    });
  });

  describe('Context State Reset Validation', function () {
    it('should clear all context state between runs', function () {
      const documents = [
        { _id: 1, category: 'A', items: [1, 2] },
        { _id: 2, category: 'B', items: [3] },
      ];

      // Pipeline with $group that stores state in context
      const groupResult = Modash.aggregate(documents, [
        { $group: { _id: '$category', total: { $sum: 1 } } },
      ]);
      expect(groupResult).to.have.lengthOf(2);

      // Pipeline with $project that stores projection spec
      const projectResult = Modash.aggregate(documents, [
        { $project: { _id: 1, category: 1 } },
      ]);
      expect(projectResult).to.have.lengthOf(2);
      expect(projectResult[0]).to.not.have.property('items');

      // Pipeline with $unwind that should not be affected by previous state
      const unwindResult = Modash.aggregate(documents, [{ $unwind: '$items' }]);
      expect(unwindResult).to.have.lengthOf(3); // 2 + 1 unwound items

      // Verify unwind result structure
      for (const doc of unwindResult) {
        expect(doc).to.have.property('_id');
        expect(doc).to.have.property('category');
        expect(doc).to.have.property('items');
        expect(typeof doc.items).to.equal('number');
      }
    });
  });

  describe('DEBUG_IVM Logging Validation', function () {
    it('should log run IDs and state transitions when DEBUG_IVM is enabled', function () {
      if (!process.env.DEBUG_IVM) {
        this.skip(); // Skip if DEBUG_IVM is not enabled
      }

      const documents = [{ _id: 1, value: 'test' }];

      // Capture console output
      const originalLog = console.log;
      const logs = [];
      console.log = (...args) => {
        logs.push(args.join(' '));
        originalLog(...args);
      };

      try {
        Modash.aggregate(documents, [{ $match: { value: 'test' } }]);

        // Check for expected log patterns
        const runIdLogs = logs.filter(
          log => log.includes('[IVM DEBUG]') && log.includes('Starting run')
        );
        expect(runIdLogs).to.have.lengthOf.greaterThan(0);
      } finally {
        console.log = originalLog;
      }
    });
  });
});
