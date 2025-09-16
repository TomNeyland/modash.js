import { expect } from 'chai';
import Modash from '../src/index';
import { createStreamingCollection } from '../src/aggo/streaming';
import testData from './test-data.js';

describe('Streaming vs Non-Streaming Equivalence Tests', () => {
  // Helper function to exhaustively compare results
  const exhaustivelyCompareResults = (
    collection,
    pipeline,
    description = ''
  ) => {
    const nonStreamingResult = Modash.aggregate(collection, pipeline);

    // Test with streaming collection created from same data
    const streamingCollection = createStreamingCollection(collection);
    const streamingResult = streamingCollection.stream(pipeline);

    // All results should be identical
    expect(streamingResult).to.deep.equal(
      nonStreamingResult,
      `Streaming collection result differs from non-streaming for: ${description}`
    );

    return {
      nonStreaming: nonStreamingResult,
      streaming: streamingResult,
    };
  };

  describe('Core Pipeline Stages Equivalence', () => {
    it('should produce identical results for $match operations', () => {
      const pipelines = [
        [{ $match: { qty: { $gte: 250 } } }],
        [{ $match: { item: 'abc1' } }],
        [
          {
            $match: {
              $and: [{ qty: { $gt: 100 } }, { item: { $regex: 'abc.*' } }],
            },
          },
        ],
        [{ $match: { tags: { $exists: true } } }],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          testData.inventory,
          pipeline,
          `$match test ${index + 1}`
        );
      });
    });

    it('should produce identical results for $project operations', () => {
      const pipelines = [
        [{ $project: { item: 1, qty: 1 } }],
        [
          {
            $project: { _id: 0, item: 1, computed: { $multiply: ['$qty', 2] } },
          },
        ],
        [
          {
            $project: { category: { $concat: ['product-', '$item'] }, qty: 1 },
          },
        ],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          testData.inventory,
          pipeline,
          `$project test ${index + 1}`
        );
      });
    });

    it('should produce identical results for $group operations', () => {
      const pipelines = [
        [{ $group: { _id: '$item', totalQty: { $sum: '$qty' } } }],
        [
          {
            $group: { _id: null, avgQty: { $avg: '$qty' }, count: { $sum: 1 } },
          },
        ],
        [
          {
            $group: {
              _id: '$status',
              items: { $push: '$item' },
              maxQty: { $max: '$qty' },
            },
          },
        ],
      ];

      pipelines.forEach((pipeline, index) => {
        // For $group, we need to sort results since order is not guaranteed
        const results = exhaustivelyCompareResults(
          testData.inventory,
          pipeline,
          `$group test ${index + 1}`
        );

        // Verify the groups are equivalent by sorting them
        const sortById = arr =>
          [...arr].sort((a, b) => {
            if (a._id === null && b._id === null) return 0;
            if (a._id === null) return -1;
            if (b._id === null) return 1;
            return String(a._id).localeCompare(String(b._id));
          });

        expect(sortById(results.streaming)).to.deep.equal(
          sortById(results.nonStreaming)
        );
      });
    });

    it('should produce identical results for $sort operations', () => {
      const pipelines = [
        [{ $sort: { qty: 1 } }],
        [{ $sort: { item: -1, qty: 1 } }],
        [{ $sort: { qty: -1 } }, { $limit: 3 }],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          testData.inventory,
          pipeline,
          `$sort test ${index + 1}`
        );
      });
    });

    it('should produce identical results for $limit and $skip operations', () => {
      const pipelines = [
        [{ $limit: 3 }],
        [{ $skip: 2 }],
        [{ $skip: 1 }, { $limit: 2 }],
        [{ $sort: { qty: -1 } }, { $skip: 1 }, { $limit: 2 }],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          testData.inventory,
          pipeline,
          `limit/skip test ${index + 1}`
        );
      });
    });
  });

  describe('Complex Multi-Stage Pipeline Equivalence', () => {
    it('should produce identical results for complex sales analysis pipeline', () => {
      const complexPipeline = [
        { $match: { date: { $exists: true } } },
        {
          $project: {
            item: 1,
            quantity: 1,
            price: 1,
            totalValue: { $multiply: ['$price', '$quantity'] },
            month: { $month: '$date' },
            year: { $year: '$date' },
          },
        },
        {
          $group: {
            _id: { month: '$month', year: '$year' },
            totalRevenue: { $sum: '$totalValue' },
            avgOrderValue: { $avg: '$totalValue' },
            itemCount: { $sum: 1 },
            items: { $push: '$item' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ];

      exhaustivelyCompareResults(
        testData.sales2,
        complexPipeline,
        'complex sales analysis'
      );
    });

    it('should produce identical results for inventory analysis with mathematical operations', () => {
      const mathPipeline = [
        {
          $project: {
            item: 1,
            qty: 1,
            sqrtQty: { $sqrt: '$qty' },
            roundedQty: { $round: [{ $divide: ['$qty', 10] }, 1] },
            itemUpper: { $toUpper: '$item' },
          },
        },
        { $match: { qty: { $gte: 200 } } },
        { $sort: { sqrtQty: -1 } },
        { $limit: 5 },
      ];

      exhaustivelyCompareResults(
        testData.inventory,
        mathPipeline,
        'inventory with math operations'
      );
    });

    it('should produce identical results for text processing pipeline', () => {
      const textPipeline = [
        {
          $project: {
            item: 1,
            qty: 1,
            itemLength: { $strLen: '$item' },
            itemParts: { $split: ['$item', ''] },
            description: {
              $concat: [
                'Item: ',
                '$item',
                ' (Qty: ',
                { $toString: '$qty' },
                ')',
              ],
            },
          },
        },
        { $match: { itemLength: { $gte: 4 } } },
        { $sort: { description: 1 } },
      ];

      exhaustivelyCompareResults(
        testData.inventory,
        textPipeline,
        'text processing'
      );
    });
  });

  describe('Edge Cases Equivalence', () => {
    it('should handle empty collections identically', () => {
      const pipelines = [
        [{ $match: { nonExistentField: 'value' } }],
        [{ $group: { _id: '$category', count: { $sum: 1 } } }],
        [{ $sort: { qty: 1 } }, { $limit: 10 }],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          [],
          pipeline,
          `empty collection test ${index + 1}`
        );
      });
    });

    it('should handle null and undefined values identically', () => {
      const testDataWithNulls = [
        { _id: 1, value: null, category: 'A' },
        { _id: 2, value: 100, category: null },
        { _id: 3, category: 'B' }, // missing value field
        { _id: 4, value: 0, category: 'A' },
      ];

      const pipelines = [
        [{ $match: { value: { $exists: true } } }],
        [{ $match: { value: null } }],
        [{ $group: { _id: '$category', avgValue: { $avg: '$value' } } }],
        [{ $project: { category: 1, hasValue: { $ne: ['$value', null] } } }],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          testDataWithNulls,
          pipeline,
          `null handling test ${index + 1}`
        );
      });
    });

    it('should handle array operations identically', () => {
      const arrayTestData = [
        { _id: 1, tags: ['red', 'blue', 'green'], scores: [85, 90, 88] },
        { _id: 2, tags: ['blue'], scores: [92] },
        { _id: 3, tags: [], scores: [78, 85, 82, 90] },
        { _id: 4, tags: null, scores: null },
      ];

      const pipelines = [
        [{ $match: { tags: { $size: 3 } } }],
        [
          {
            $project: {
              firstTag: { $arrayElemAt: ['$tags', 0] },
              avgScore: { $avg: '$scores' },
            },
          },
        ],
        [{ $match: { tags: { $all: ['blue'] } } }],
        [{ $project: { tagCount: { $size: { $ifNull: ['$tags', []] } } } }],
      ];

      pipelines.forEach((pipeline, index) => {
        exhaustivelyCompareResults(
          arrayTestData,
          pipeline,
          `array operations test ${index + 1}`
        );
      });
    });
  });

  describe('Performance Consistency', () => {
    it('should maintain consistent performance characteristics between streaming and non-streaming', () => {
      // Generate larger dataset for performance testing
      const largeDataset = [];
      for (let i = 0; i < 1000; i++) {
        largeDataset.push({
          _id: i,
          value: Math.floor(Math.random() * 1000),
          category: `cat_${i % 10}`,
          active: i % 3 === 0,
        });
      }

      const complexPipeline = [
        { $match: { active: true } },
        {
          $group: {
            _id: '$category',
            avgValue: { $avg: '$value' },
            count: { $sum: 1 },
          },
        },
        { $sort: { avgValue: -1 } },
        { $limit: 5 },
      ];

      // Warm and time both approaches (avoid first-run compile/setup cost)
      // Warm array/hot-path
      Modash.aggregate(largeDataset, complexPipeline);
      const startNonStreaming = performance.now();
      const nonStreamingResult = Modash.aggregate(
        largeDataset,
        complexPipeline
      );
      const endNonStreaming = performance.now();

      const streamingCollection = createStreamingCollection(largeDataset);
      // Warm streaming hot-path
      streamingCollection.stream(complexPipeline);
      const startStreaming = performance.now();
      const streamingResult = streamingCollection.stream(complexPipeline);
      const endStreaming = performance.now();
      streamingCollection.destroy();

      const nonStreamingTime = endNonStreaming - startNonStreaming;
      const streamingTime = endStreaming - startStreaming;

      // Results should be identical
      const sortByCategory = arr => {
        const cmpString = (a, b) => {
          const sa = a == null ? '' : String(a);
          const sb = b == null ? '' : String(b);
          return sa.localeCompare(sb);
        };
        return [...arr].sort((a, b) => cmpString(a._id, b._id));
      };
      expect(sortByCategory(streamingResult)).to.deep.equal(
        sortByCategory(nonStreamingResult)
      );
      // Performance should be reasonable (streaming shouldn't be dramatically slower)
      expect(streamingTime).to.be.lessThan(
        nonStreamingTime * 3,
        `Streaming took ${streamingTime}ms vs non-streaming ${nonStreamingTime}ms`
      );

      console.log(
        `      Performance: Non-streaming: ${nonStreamingTime.toFixed(2)}ms, Streaming: ${streamingTime.toFixed(2)}ms`
      );
    });
  });

  describe('Live Update Correctness', () => {
    it('should maintain correctness when adding data to streaming collections', () => {
      const initialData = testData.inventory.slice(0, 3);
      const additionalData = testData.inventory.slice(3);

      const pipeline = [
        { $match: { qty: { $gte: 100 } } },
        {
          $group: {
            _id: '$status',
            totalQty: { $sum: '$qty' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalQty: -1 } },
      ];

      // Get result from complete dataset using traditional aggregation
      const completeResult = Modash.aggregate(testData.inventory, pipeline);

      // Create streaming collection with initial data
      const streamingCollection = createStreamingCollection(initialData);

      // Start streaming
      streamingCollection.stream(pipeline);

      // Add remaining data
      streamingCollection.addBulk(additionalData);

      // Get current streaming result
      const streamingResult = streamingCollection.getStreamingResult(pipeline);

      streamingCollection.destroy();

      // Results should match
      const sortByTotalQty = arr =>
        [...arr].sort((a, b) => (b.totalQty || 0) - (a.totalQty || 0));
      expect(sortByTotalQty(streamingResult)).to.deep.equal(
        sortByTotalQty(completeResult)
      );
    });
  });
});
