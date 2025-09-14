import { expect } from 'chai';
import Modash from '../src/index.js';

/**
 * Phase 3 Optimization & Hardening Tests
 * Tests for extended hot path support, vectorized accumulators, 
 * and $unwind + $group optimizations
 */
describe('Phase 3 - Hot Path Extensions', function() {
  const testData = [
    { _id: 1, name: 'Alice', dept: 'Engineering', salary: 100000, skills: ['JS', 'TS', 'Node'] },
    { _id: 2, name: 'Bob', dept: 'Engineering', salary: 95000, skills: ['Python', 'JS'] },
    { _id: 3, name: 'Charlie', dept: 'Sales', salary: 80000, skills: ['Communication'] },
    { _id: 4, name: 'Diana', dept: 'Sales', salary: 85000, skills: ['Negotiation', 'Communication'] },
    { _id: 5, name: 'Eve', dept: 'Marketing', salary: 75000, skills: ['Design', 'Branding'] }
  ];

  describe('Extended Pipeline Combinations', function() {
    it('should handle $group + $project + $sort pipelines in hot path', function() {
      const result = Modash.aggregate(testData, [
        { $group: { 
          _id: '$dept', 
          avgSalary: { $avg: '$salary' },
          count: { $sum: 1 }
        }},
        { $project: {
          department: '$_id',
          averageSalary: '$avgSalary',
          employeeCount: '$count',
          _id: 0
        }},
        { $sort: { averageSalary: -1 } }
      ]);

      expect(result).to.be.an('array');
      expect(result.length).to.equal(3);
      
      // Results should be sorted by average salary descending
      expect(result[0].department).to.equal('Engineering');
      expect(result[0].averageSalary).to.equal(97500);
      expect(result[0].employeeCount).to.equal(2);
      
      expect(result[1].department).to.equal('Sales');
      expect(result[1].averageSalary).to.equal(82500);
    });

    it('should support complex grouping with compound keys', function() {
      const salesData = [
        { product: 'Laptop', category: 'Electronics', region: 'North', sales: 1000 },
        { product: 'Mouse', category: 'Electronics', region: 'North', sales: 200 },
        { product: 'Laptop', category: 'Electronics', region: 'South', sales: 800 },
        { product: 'Chair', category: 'Furniture', region: 'North', sales: 500 }
      ];

      const result = Modash.aggregate(salesData, [
        { $group: {
          _id: { category: '$category', region: '$region' },
          totalSales: { $sum: '$sales' },
          products: { $push: '$product' }
        }},
        { $sort: { totalSales: -1 } }
      ]);

      expect(result).to.be.an('array');
      expect(result.length).to.equal(3);
      
      // Should group by compound key
      expect(result[0]._id).to.deep.equal({ category: 'Electronics', region: 'North' });
      expect(result[0].totalSales).to.equal(1200);
      expect(result[0].products).to.deep.equal(['Laptop', 'Mouse']);
    });
  });

  describe('Vectorized Accumulators', function() {
    it('should handle $addToSet with vectorized processing', function() {
      const result = Modash.aggregate(testData, [
        { $group: {
          _id: '$dept',
          uniqueSkills: { $addToSet: '$skills' },
          employees: { $addToSet: '$name' }
        }}
      ]);

      expect(result).to.be.an('array');
      
      const engineering = result.find(r => r._id === 'Engineering');
      expect(engineering).to.exist;
      expect(engineering.employees).to.be.an('array');
      expect(engineering.employees.length).to.equal(2);
      expect(engineering.employees).to.include.members(['Alice', 'Bob']);
    });

    it('should handle $push with vectorized processing', function() {
      const result = Modash.aggregate(testData, [
        { $group: {
          _id: '$dept',
          allSalaries: { $push: '$salary' },
          allNames: { $push: '$name' }
        }},
        { $sort: { _id: 1 } }
      ]);

      expect(result).to.be.an('array');
      
      const engineering = result.find(r => r._id === 'Engineering');
      expect(engineering).to.exist;
      expect(engineering.allSalaries).to.deep.equal([100000, 95000]);
      expect(engineering.allNames).to.deep.equal(['Alice', 'Bob']);
    });
  });

  describe('$unwind + $group Optimization', function() {
    it('should optimize $unwind + $group patterns to avoid repeated materialization', function() {
      const result = Modash.aggregate(testData, [
        { $unwind: '$skills' },
        { $group: {
          _id: '$skills',
          count: { $sum: 1 },
          departments: { $addToSet: '$dept' },
          avgSalary: { $avg: '$salary' }
        }},
        { $sort: { count: -1 } }
      ]);

      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      
      // Check that skills are properly unwound and grouped
      const jsSkill = result.find(r => r._id === 'JS');
      expect(jsSkill).to.exist;
      expect(jsSkill.count).to.equal(2); // Alice and Bob both have JS
      expect(jsSkill.departments).to.deep.equal(['Engineering']);
      
      const commSkill = result.find(r => r._id === 'Communication');
      expect(commSkill).to.exist;
      expect(commSkill.count).to.equal(2); // Charlie and Diana
      expect(commSkill.departments).to.deep.equal(['Sales']);
    });

    it('should handle $unwind with intermediate $match and $project', function() {
      const result = Modash.aggregate(testData, [
        { $match: { salary: { $gte: 80000 } } },
        { $unwind: '$skills' },
        { $project: { 
          skill: '$skills',
          dept: '$dept',
          salary: '$salary',
          name: '$name'
        }},
        { $group: {
          _id: '$skill',
          highEarners: { $push: '$name' },
          avgSalary: { $avg: '$salary' }
        }},
        { $sort: { avgSalary: -1 } }
      ]);

      expect(result).to.be.an('array');
      
      // Should only include skills from people earning >= 80000
      const tsSkill = result.find(r => r._id === 'TS');
      expect(tsSkill).to.exist;
      expect(tsSkill.highEarners).to.deep.equal(['Alice']);
      expect(tsSkill.avgSalary).to.equal(100000);
    });
  });

  describe('Performance Validation', function() {
    it('should maintain hot path performance for extended pipelines', function() {
      const largeDataset = [];
      for (let i = 0; i < 1000; i++) {
        largeDataset.push({
          _id: i,
          category: `cat_${i % 10}`,
          value: Math.floor(Math.random() * 1000),
          tags: [`tag_${i % 5}`, `tag_${(i + 1) % 5}`]
        });
      }

      const startTime = performance.now();
      
      const result = Modash.aggregate(largeDataset, [
        { $match: { value: { $gte: 500 } } },
        { $unwind: '$tags' },
        { $group: {
          _id: '$tags',
          count: { $sum: 1 },
          avgValue: { $avg: '$value' },
          categories: { $addToSet: '$category' }
        }},
        { $project: {
          tag: '$_id',
          count: 1,
          avgValue: 1,
          categoryCount: { $size: '$categories' },
          _id: 0
        }},
        { $sort: { count: -1 } }
      ]);

      const duration = performance.now() - startTime;
      
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      expect(duration).to.be.lessThan(100); // Should complete in < 100ms for 1000 docs
      
      // Validate correctness
      expect(result[0]).to.have.property('tag');
      expect(result[0]).to.have.property('count');
      expect(result[0]).to.have.property('avgValue');
      expect(result[0]).to.have.property('categoryCount');
    });
  });

  describe('Regression Prevention', function() {
    it('should not break existing simple pipelines', function() {
      const result = Modash.aggregate(testData, [
        { $match: { dept: 'Engineering' } },
        { $project: { name: 1, salary: 1 } }
      ]);

      expect(result).to.be.an('array');
      expect(result.length).to.equal(2);
      expect(result[0]).to.have.property('name');
      expect(result[0]).to.have.property('salary');
    });

    it('should maintain backward compatibility with existing $group operations', function() {
      const result = Modash.aggregate(testData, [
        { $group: {
          _id: null,
          totalSalary: { $sum: '$salary' },
          avgSalary: { $avg: '$salary' },
          count: { $sum: 1 }
        }}
      ]);

      expect(result).to.be.an('array');
      expect(result.length).to.equal(1);
      expect(result[0]._id).to.be.null;
      expect(result[0].totalSalary).to.equal(435000);
      expect(result[0].avgSalary).to.equal(87000);
      expect(result[0].count).to.equal(5);
    });
  });
});

describe('Phase 3 - Streaming Performance Optimization', function() {
  it('should handle high-throughput delta operations', function(done) {
    const streamingCollection = Modash.createStreamingCollection([]);
    
    // Set up aggregation pipeline
    const pipeline = [
      { $group: { 
        _id: '$category', 
        count: { $sum: 1 },
        avgValue: { $avg: '$value' }
      }}
    ];

    let updateCount = 0;
    
    streamingCollection.on('update', (results) => {
      updateCount++;
      
      if (updateCount >= 5) {
        expect(results).to.be.an('array');
        expect(results.length).to.be.greaterThan(0);
        
        // Verify aggregation correctness
        const totalDocs = updateCount * 10; // 10 docs per batch
        const totalCount = results.reduce((sum, r) => sum + r.count, 0);
        expect(totalCount).to.equal(totalDocs);
        
        done();
      }
    });

    // Set up pipeline
    streamingCollection.aggregate(pipeline);

    // Simulate high-throughput data
    for (let batch = 0; batch < 5; batch++) {
      setTimeout(() => {
        const batchData = [];
        for (let i = 0; i < 10; i++) {
          batchData.push({
            _id: batch * 10 + i,
            category: `cat_${i % 3}`,
            value: Math.random() * 100
          });
        }
        streamingCollection.add(batchData);
      }, batch * 10); // Rapid batches
    }
  });
});