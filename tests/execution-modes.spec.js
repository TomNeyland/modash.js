/**
 * Tests for both execution modes: streaming and toggle
 * Feature implementation: Support Both Execution Modes (Streaming + Membership-Toggle)
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import Modash from '../src/index.ts';

describe('Execution Modes - Stream vs Toggle', () => {
  const sampleData = [
    { category: 'electronics', price: 1000, quantity: 2, brand: 'TechCorp' },
    { category: 'electronics', price: 500, quantity: 1, brand: 'GadgetCo' },
    { category: 'books', price: 25, quantity: 10, brand: 'BookStore' },
    { category: 'books', price: 35, quantity: 5, brand: 'ReadMore' },
    { category: 'clothing', price: 80, quantity: 3, brand: 'FashionPlus' },
  ];

  describe('Basic Mode Support', () => {
    it('should accept mode parameter in options', () => {
      const pipeline = [
        { $match: { category: 'electronics' } },
        { $project: { category: 1, price: 1 } }
      ];

      // Stream mode (default)
      const streamResult = Modash.aggregate(sampleData, pipeline, { mode: 'stream' });
      expect(streamResult).to.be.an('array');
      expect(streamResult).to.have.length(2);

      // Toggle mode
      const toggleResult = Modash.aggregate(sampleData, pipeline, { mode: 'toggle' });
      expect(toggleResult).to.be.an('array');
      expect(toggleResult).to.have.length(2);
    });

    it('should default to stream mode when no options provided', () => {
      const pipeline = [{ $match: { category: 'books' } }];
      
      const defaultResult = Modash.aggregate(sampleData, pipeline);
      const explicitStreamResult = Modash.aggregate(sampleData, pipeline, { mode: 'stream' });
      
      expect(defaultResult).to.deep.equal(explicitStreamResult);
    });

    it('should handle undefined options gracefully', () => {
      const pipeline = [{ $match: { category: 'books' } }];
      
      const result = Modash.aggregate(sampleData, pipeline, undefined);
      expect(result).to.be.an('array');
      expect(result).to.have.length(2);
    });
  });

  describe('Mode Equivalence - Both modes should produce identical results', () => {
    const testPipelines = [
      // Simple match
      [{ $match: { category: 'electronics' } }],
      
      // Match + project
      [
        { $match: { price: { $gte: 50 } } },
        { $project: { category: 1, price: 1, _id: 0 } }
      ],
      
      // Group aggregation
      [
        { $group: { 
          _id: '$category', 
          totalPrice: { $sum: '$price' },
          avgQuantity: { $avg: '$quantity' },
          count: { $sum: 1 }
        }}
      ],
      
      // Complex pipeline
      [
        { $match: { price: { $gt: 30 } } },
        { $addFields: { revenue: { $multiply: ['$price', '$quantity'] } } },
        { $group: { 
          _id: '$category', 
          totalRevenue: { $sum: '$revenue' },
          itemCount: { $sum: 1 }
        }},
        { $sort: { totalRevenue: -1 } }
      ],
      
      // Sort and limit
      [
        { $sort: { price: -1 } },
        { $limit: 3 }
      ]
    ];

    testPipelines.forEach((pipeline, index) => {
      it(`should produce identical results for pipeline ${index + 1}`, () => {
        const streamResult = Modash.aggregate(sampleData, pipeline, { mode: 'stream' });
        const toggleResult = Modash.aggregate(sampleData, pipeline, { mode: 'toggle' });
        
        expect(streamResult).to.deep.equal(toggleResult, 
          `Pipeline ${index + 1} should produce identical results in both modes`);
      });
    });
  });

  describe('Complex Aggregation Scenarios', () => {
    it('should handle grouping with multiple accumulators in both modes', () => {
      const pipeline = [
        { $group: { 
          _id: '$category',
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          avgPrice: { $avg: '$price' },
          totalQuantity: { $sum: '$quantity' },
          brands: { $addToSet: '$brand' }
        }},
        { $sort: { avgPrice: -1 } }
      ];

      const streamResult = Modash.aggregate(sampleData, pipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(sampleData, pipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal(toggleResult);
      expect(streamResult).to.have.length(3); // 3 categories
      
      // Verify structure
      streamResult.forEach(result => {
        expect(result).to.have.all.keys(['_id', 'minPrice', 'maxPrice', 'avgPrice', 'totalQuantity', 'brands']);
        expect(result.brands).to.be.an('array');
      });
    });

    it('should handle $unwind operations in both modes', () => {
      const dataWithArrays = [
        { name: 'product1', tags: ['electronics', 'gadget'] },
        { name: 'product2', tags: ['book', 'education'] },
        { name: 'product3', tags: ['clothing', 'fashion', 'accessories'] }
      ];
      
      const pipeline = [
        { $unwind: '$tags' },
        { $group: { _id: '$tags', products: { $push: '$name' } } },
        { $sort: { _id: 1 } }
      ];

      const streamResult = Modash.aggregate(dataWithArrays, pipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dataWithArrays, pipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal(toggleResult);
    });
  });

  describe('Performance Characteristics', () => {
    it('should complete execution in both modes within reasonable time', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        category: ['electronics', 'books', 'clothing'][i % 3],
        price: Math.floor(Math.random() * 1000) + 10,
        quantity: Math.floor(Math.random() * 10) + 1
      }));

      const pipeline = [
        { $match: { price: { $gte: 100 } } },
        { $group: { 
          _id: '$category', 
          totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
          count: { $sum: 1 }
        }},
        { $sort: { totalRevenue: -1 } }
      ];

      const streamStart = Date.now();
      const streamResult = Modash.aggregate(largeDataset, pipeline, { mode: 'stream' });
      const streamTime = Date.now() - streamStart;

      const toggleStart = Date.now();
      const toggleResult = Modash.aggregate(largeDataset, pipeline, { mode: 'toggle' });
      const toggleTime = Date.now() - toggleStart;

      expect(streamResult).to.deep.equal(toggleResult);
      expect(streamTime).to.be.lessThan(1000); // Should complete within 1 second
      expect(toggleTime).to.be.lessThan(1000); // Should complete within 1 second
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty collections in both modes', () => {
      const pipeline = [{ $group: { _id: null, count: { $sum: 1 } } }];
      
      const streamResult = Modash.aggregate([], pipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate([], pipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal(toggleResult);
      expect(streamResult).to.deep.equal([]);
    });

    it('should handle invalid mode gracefully', () => {
      const pipeline = [{ $match: { category: 'electronics' } }];
      
      // Should not throw an error, should default to stream mode
      expect(() => {
        Modash.aggregate(sampleData, pipeline, { mode: 'invalid' });
      }).to.not.throw();
    });

    it('should handle null/undefined collection in both modes', () => {
      const pipeline = [{ $match: { category: 'electronics' } }];
      
      const streamResult = Modash.aggregate(null, pipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(null, pipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal(toggleResult);
      expect(streamResult).to.deep.equal([]);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain existing API compatibility', () => {
      const pipeline = [{ $match: { category: 'electronics' } }];
      
      // Old API (without options)
      const oldResult = Modash.aggregate(sampleData, pipeline);
      
      // New API with explicit stream mode
      const newResult = Modash.aggregate(sampleData, pipeline, { mode: 'stream' });
      
      expect(oldResult).to.deep.equal(newResult);
    });
  });

  describe('Usage Examples - Real-world scenarios', () => {
    it('should demonstrate streaming mode for real-time event feeds', () => {
      // Simulating real-time sales events
      const salesEvents = [
        { timestamp: new Date('2024-01-01T10:00:00Z'), product: 'laptop', amount: 1000, customer: 'alice' },
        { timestamp: new Date('2024-01-01T10:05:00Z'), product: 'mouse', amount: 25, customer: 'bob' },
        { timestamp: new Date('2024-01-01T10:10:00Z'), product: 'laptop', amount: 1200, customer: 'charlie' },
      ];

      const pipeline = [
        { $match: { amount: { $gte: 500 } } },
        { $group: { 
          _id: '$product', 
          totalRevenue: { $sum: '$amount' },
          customerCount: { $sum: 1 }
        }},
        { $sort: { totalRevenue: -1 } }
      ];

      // Stream mode - optimized for incremental updates as new events arrive
      const streamResult = Modash.aggregate(salesEvents, pipeline, { mode: 'stream' });
      
      expect(streamResult).to.deep.equal([
        { _id: 'laptop', totalRevenue: 2200, customerCount: 2 }
      ]);
    });

    it('should demonstrate toggle mode for analytics dashboard filtering', () => {
      // Simulating a fixed dataset with dashboard filtering (crossfilter style)
      const products = [
        { category: 'electronics', brand: 'TechCorp', price: 1000, rating: 4.5, inStock: true },
        { category: 'electronics', brand: 'GadgetCo', price: 800, rating: 4.2, inStock: false },
        { category: 'books', brand: 'BookStore', price: 25, rating: 4.8, inStock: true },
        { category: 'books', brand: 'ReadMore', price: 30, rating: 4.1, inStock: true },
        { category: 'clothing', brand: 'FashionPlus', price: 75, rating: 3.9, inStock: true },
      ];

      // Filter by price range (simulating slider interaction)
      const priceFilterPipeline = [
        { $match: { price: { $gte: 50, $lte: 1000 }, inStock: true } },
        { $group: { 
          _id: '$category', 
          avgPrice: { $avg: '$price' },
          avgRating: { $avg: '$rating' },
          count: { $sum: 1 }
        }},
        { $sort: { avgPrice: -1 } }
      ];

      // Toggle mode - optimized for membership changes in fixed dataset
      const toggleResult = Modash.aggregate(products, priceFilterPipeline, { mode: 'toggle' });
      
      expect(toggleResult).to.have.length(2); // electronics and clothing categories
      expect(toggleResult[0]._id).to.equal('electronics');
      expect(toggleResult[0].count).to.equal(1); // Only TechCorp in stock
    });

    it('should show identical results for crossfilter-style operations in both modes', () => {
      const dataset = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        category: ['A', 'B', 'C'][i % 3],
        value: Math.floor(Math.random() * 100),
        active: i % 2 === 0
      }));

      // Simulating crossfilter dimension filtering
      const crossfilterPipeline = [
        { $match: { active: true, value: { $gte: 20 } } },
        { $group: { 
          _id: '$category', 
          avgValue: { $avg: '$value' },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ];

      const streamResult = Modash.aggregate(dataset, crossfilterPipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dataset, crossfilterPipeline, { mode: 'toggle' });
      
      expect(streamResult).to.deep.equal(toggleResult);
      expect(streamResult.every(r => r.count > 0)).to.be.true;
    });
  });

  describe('Crossfilter/DC.js Style Optimizations for Toggle Mode', () => {
    const dashboardData = [
      { date: '2023-01-01', category: 'sales', region: 'north', amount: 1000, count: 10 },
      { date: '2023-01-02', category: 'sales', region: 'south', amount: 1500, count: 15 },
      { date: '2023-01-03', category: 'marketing', region: 'north', amount: 800, count: 8 },
      { date: '2023-01-04', category: 'marketing', region: 'south', amount: 1200, count: 12 },
      { date: '2023-01-05', category: 'sales', region: 'east', amount: 2000, count: 20 },
      { date: '2023-01-06', category: 'support', region: 'west', amount: 600, count: 6 },
      { date: '2023-01-07', category: 'support', region: 'north', amount: 700, count: 7 },
      { date: '2023-01-08', category: 'marketing', region: 'east', amount: 1800, count: 18 }
    ];

    it('should optimize dimension-based filtering like crossfilter', () => {
      // Simulate crossfilter dimension filtering pattern
      const filterPipeline = [
        { $match: { category: { $in: ['sales', 'marketing'] } } },
        { $match: { region: 'north' } },
        { $project: { category: 1, amount: 1, region: 1 } }
      ];

      const streamResult = Modash.aggregate(dashboardData, filterPipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dashboardData, filterPipeline, { mode: 'toggle' });
      
      expect(toggleResult).to.deep.equal(streamResult);
      expect(toggleResult.every(r => ['sales', 'marketing'].includes(r.category))).to.be.true;
      expect(toggleResult.every(r => r.region === 'north')).to.be.true;
    });

    it('should optimize refcounted aggregates like crossfilter', () => {
      // Simulate crossfilter group.reduceSum() pattern
      const groupPipeline = [
        { 
          $group: { 
            _id: '$category', 
            totalAmount: { $sum: '$amount' },
            totalCount: { $sum: '$count' },
            avgAmount: { $avg: '$amount' },
            minAmount: { $min: '$amount' },
            maxAmount: { $max: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ];

      const streamResult = Modash.aggregate(dashboardData, groupPipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dashboardData, groupPipeline, { mode: 'toggle' });
      
      expect(toggleResult).to.deep.equal(streamResult);
      
      // Verify crossfilter-style aggregations work correctly
      const salesGroup = toggleResult.find(g => g._id === 'sales');
      expect(salesGroup.totalAmount).to.equal(4500); // 1000 + 1500 + 2000
      expect(salesGroup.totalCount).to.equal(45); // 10 + 15 + 20
    });

    it('should optimize multi-dimensional filtering for dashboard analytics', () => {
      // Simulate dc.js chart filtering pattern
      const multiDimPipeline = [
        { $match: { amount: { $gte: 1000 } } },
        { $match: { region: { $in: ['north', 'south'] } } },
        { 
          $group: { 
            _id: { category: '$category', region: '$region' },
            totalAmount: { $sum: '$amount' },
            recordCount: { $sum: 1 }
          }
        },
        { $sort: { '_id.category': 1, '_id.region': 1 } }
      ];

      const streamResult = Modash.aggregate(dashboardData, multiDimPipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dashboardData, multiDimPipeline, { mode: 'toggle' });
      
      expect(toggleResult).to.deep.equal(streamResult);
      expect(toggleResult.length).to.be.greaterThan(0);
    });

    it('should optimize sorted operations for ranking dashboards', () => {
      // Simulate dc.js ordinal chart pattern
      const sortPipeline = [
        { $match: { amount: { $gte: 800 } } },
        { $sort: { amount: -1, category: 1 } },
        { $limit: 5 },
        { $project: { category: 1, amount: 1, rank: '$$ROOT' } }
      ];

      const streamResult = Modash.aggregate(dashboardData, sortPipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dashboardData, sortPipeline, { mode: 'toggle' });
      
      expect(toggleResult).to.deep.equal(streamResult);
      expect(toggleResult.length).to.equal(5);
      
      // Verify sorting is correct (highest amounts first)
      for (let i = 0; i < toggleResult.length - 1; i++) {
        expect(toggleResult[i].amount).to.be.at.least(toggleResult[i + 1].amount);
      }
    });

    it('should handle complex crossfilter-style pipelines efficiently', () => {
      // Simulate complex dc.js dashboard with multiple charts
      const complexPipeline = [
        { $match: { amount: { $gte: 700 } } },
        { 
          $addFields: { 
            amountTier: {
              $switch: {
                branches: [
                  { case: { $lt: ['$amount', 1000] }, then: 'low' },
                  { case: { $lt: ['$amount', 1500] }, then: 'medium' },
                  { case: { $gte: ['$amount', 1500] }, then: 'high' }
                ],
                default: 'unknown'
              }
            }
          }
        },
        { 
          $group: { 
            _id: { region: '$region', tier: '$amountTier' },
            totalAmount: { $sum: '$amount' },
            averageAmount: { $avg: '$amount' },
            countRecords: { $sum: 1 }
          }
        },
        { $match: { countRecords: { $gte: 1 } } },
        { $sort: { '_id.region': 1, totalAmount: -1 } }
      ];

      const streamResult = Modash.aggregate(dashboardData, complexPipeline, { mode: 'stream' });
      const toggleResult = Modash.aggregate(dashboardData, complexPipeline, { mode: 'toggle' });
      
      expect(toggleResult).to.deep.equal(streamResult);
      expect(toggleResult.length).to.be.greaterThan(0);
      
      // Verify all results have the expected structure
      toggleResult.forEach(result => {
        expect(result._id).to.have.property('region');
        expect(result._id).to.have.property('tier');
        expect(result).to.have.property('totalAmount');
        expect(result).to.have.property('averageAmount');
        expect(result).to.have.property('countRecords');
        expect(['low', 'medium', 'high'].includes(result._id.tier)).to.be.true;
      });
    });

    it('should maintain identical results between stream and toggle modes', () => {
      // Test data consistency across execution modes
      const testPipelines = [
        [{ $match: { category: 'sales' } }],
        [{ $group: { _id: '$region', total: { $sum: '$amount' } } }],
        [{ $sort: { amount: -1 } }, { $limit: 3 }],
        [
          { $match: { amount: { $gte: 1000 } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]
      ];

      testPipelines.forEach((pipeline, index) => {
        const streamResult = Modash.aggregate(dashboardData, pipeline, { mode: 'stream' });
        const toggleResult = Modash.aggregate(dashboardData, pipeline, { mode: 'toggle' });
        
        expect(toggleResult).to.deep.equal(streamResult, 
          `Pipeline ${index} should produce identical results in both modes`);
      });
    });
  });
});