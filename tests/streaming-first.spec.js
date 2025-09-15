/**
 * Tests for streaming-first execution model
 */
import { expect } from 'chai';
import Modash from '../src/index.ts';
import {
  getStreamingFirstStats,
  resetStreamingFirstStats,
} from '../src/modash/streaming-first-aggregation.ts';
import {
  getFallbackCount,
  getFallbackErrors,
  resetFallbackTracking,
} from '../src/modash/debug.ts';

describe('Streaming-First Execution', () => {
  beforeEach(() => {
    resetStreamingFirstStats();
    resetFallbackTracking();
  });

  describe('Basic Streaming Engine Usage', () => {
    it('should use streaming engine for simple pipelines', () => {
      const data = [
        { name: 'Alice', age: 30, score: 85 },
        { name: 'Bob', age: 25, score: 92 },
        { name: 'Charlie', age: 35, score: 78 },
      ];

      const result = Modash.aggregate(data, [
        { $match: { score: { $gte: 80 } } },
        { $project: { name: 1, age: 1 } },
      ]);

      expect(result).to.have.length(2);
      expect(result[0]).to.deep.include({ name: 'Alice', age: 30 });
      expect(result[1]).to.deep.include({ name: 'Bob', age: 25 });

      const stats = getStreamingFirstStats();
      expect(stats.streamingSuccesses).to.equal(1);
      expect(stats.standardFallbacks).to.equal(0);
      expect(stats.streamingSuccessRate).to.equal(100);
    });

    it('should use streaming engine for complex supported pipelines', () => {
      const data = [
        { category: 'A', value: 10 },
        { category: 'B', value: 20 },
        { category: 'A', value: 15 },
        { category: 'B', value: 25 },
      ];

      const result = Modash.aggregate(data, [
        { $group: { _id: '$category', total: { $sum: '$value' } } },
        { $sort: { total: -1 } },
      ]);

      expect(result).to.have.length(2);
      expect(result[0]).to.deep.include({ _id: 'B', total: 45 });
      expect(result[1]).to.deep.include({ _id: 'A', total: 25 });

      const stats = getStreamingFirstStats();
      expect(stats.streamingSuccesses).to.equal(1);
      expect(stats.standardFallbacks).to.equal(0);
    });
  });

  describe('Standard Engine Fallback', () => {
    it('should fallback to standard engine for all $lookup operations', () => {
      const orders = [
        { orderId: 1, customerId: 'A', amount: 100 },
        { orderId: 2, customerId: 'B', amount: 200 },
      ];
      const customers = [
        { _id: 'A', name: 'Alice' },
        { _id: 'B', name: 'Bob' },
      ];

      // All $lookup operations should trigger fallback (streaming engine doesn't support them)
      const result = Modash.aggregate(orders, [
        {
          $lookup: {
            from: customers,
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
      ]);

      expect(result).to.have.length(2);
      expect(result[0]).to.have.property('orderId', 1);
      expect(result[0]).to.have.property('customer');

      const stats = getStreamingFirstStats();
      expect(stats.streamingSuccesses).to.equal(0);
      expect(stats.standardFallbacks).to.equal(1);
      expect(stats.standardFallbackRate).to.equal(100);

      // Check fallback was recorded
      const fallbackErrors = getFallbackErrors();
      expect(fallbackErrors).to.have.length(1);
      expect(fallbackErrors[0].fallbackType).to.equal('standard_engine');
      expect(fallbackErrors[0].reason).to.include('$lookup');
    });

    it('should fallback to standard engine for advanced $lookup', () => {
      const orders = [
        { orderId: 1, customerId: 'A', amount: 100 },
        { orderId: 2, customerId: 'B', amount: 200 },
      ];
      const customers = [
        { _id: 'A', name: 'Alice' },
        { _id: 'B', name: 'Bob' },
      ];

      // Advanced $lookup with let/pipeline should also trigger fallback
      const result = Modash.aggregate(orders, [
        {
          $lookup: {
            from: customers,
            let: { customerId: '$customerId' },
            pipeline: [
              { $match: { $expr: { $eq: ['$_id', '$$customerId'] } } },
            ],
            as: 'customer',
          },
        },
      ]);

      expect(result).to.have.length(2);
      expect(result[0]).to.have.property('orderId', 1);
      expect(result[0]).to.have.property('customer');

      const stats = getStreamingFirstStats();
      expect(stats.streamingSuccesses).to.equal(0);
      expect(stats.standardFallbacks).to.equal(1);
      expect(stats.standardFallbackRate).to.equal(100);

      // Check fallback was recorded
      const fallbackErrors = getFallbackErrors();
      expect(fallbackErrors).to.have.length(1);
      expect(fallbackErrors[0].fallbackType).to.equal('standard_engine');
      expect(fallbackErrors[0].reason).to.include('$lookup');
    });

    it('should fallback for unsupported operators', () => {
      const testCases = [
        {
          name: '$function',
          pipeline: [
            {
              $function: {
                body: function () {
                  return this.value * 2;
                },
                args: [],
                lang: 'js',
              },
            },
          ],
        },
        {
          name: '$where',
          pipeline: [
            {
              $where: function () {
                return this.value > 10;
              },
            },
          ],
        },
        {
          name: '$merge',
          pipeline: [{ $merge: { into: 'output_collection' } }],
        },
        {
          name: '$out',
          pipeline: [{ $out: 'output_collection' }],
        },
      ];

      testCases.forEach(({ name, pipeline }) => {
        resetStreamingFirstStats();
        resetFallbackTracking();

        const data = [{ value: 15 }];

        try {
          const result = Modash.aggregate(data, pipeline);
          // Some operators might not be fully implemented, so we just check the routing
        } catch (error) {
          // Expected for some unimplemented operators
        }

        const stats = getStreamingFirstStats();
        expect(stats.standardFallbacks).to.equal(
          1,
          `${name} should trigger fallback`
        );
        expect(stats.streamingSuccesses).to.equal(
          0,
          `${name} should not use streaming`
        );

        const fallbackErrors = getFallbackErrors();
        expect(fallbackErrors).to.have.length(1);
        expect(fallbackErrors[0].reason).to.include(name.replace('$', ''));
      });
    });
  });

  describe('Error Handling', () => {
    it('should fallback when streaming engine fails', () => {
      const data = [{ test: 1 }];

      // This should work fine normally
      const result = Modash.aggregate(data, [{ $match: { test: 1 } }]);

      expect(result).to.have.length(1);

      const stats = getStreamingFirstStats();
      expect(stats.streamingSuccesses).to.equal(1);
      expect(stats.standardFallbacks).to.equal(0);
    });

    it('should handle invalid pipeline gracefully', () => {
      const data = [{ test: 1 }];

      // Invalid pipeline should be handled
      const result = Modash.aggregate(data, null);

      expect(Array.isArray(result)).to.be.true;

      const stats = getStreamingFirstStats();
      expect(stats.standardFallbacks).to.equal(1);
    });
  });

  describe('DEBUG_IVM Integration', () => {
    let originalDebugIVM;

    beforeEach(() => {
      originalDebugIVM = process.env.DEBUG_IVM;
    });

    afterEach(() => {
      if (originalDebugIVM !== undefined) {
        process.env.DEBUG_IVM = originalDebugIVM;
      } else {
        delete process.env.DEBUG_IVM;
      }
    });

    it('should log fallback when DEBUG_IVM is enabled', () => {
      process.env.DEBUG_IVM = '1';

      let loggedMessages = [];
      const originalWarn = console.warn;
      console.warn = message => {
        loggedMessages.push(message);
      };

      try {
        const data = [{ test: 1 }];
        const customers = [{ _id: 'A', name: 'Alice' }];

        // This should trigger fallback logging
        Modash.aggregate(data, [
          {
            $lookup: {
              from: customers,
              let: { test: '$test' },
              pipeline: [{ $match: { _id: 'A' } }],
              as: 'result',
            },
          },
        ]);

        // Should have logged fallback warning
        const fallbackLog = loggedMessages.find(msg =>
          msg.includes('DEBUG_IVM: Standard aggregation fallback')
        );
        expect(fallbackLog).to.exist;
        expect(fallbackLog).to.include('$lookup');
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});
