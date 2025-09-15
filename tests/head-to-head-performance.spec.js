/**
 * Tests for Head-to-Head Performance Benchmark Suite
 * Validates that the benchmark infrastructure works correctly
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  benchmarkPipeline,
  generateDashboardData,
  runHeadToHeadComparison,
} from '../benchmarks/head-to-head-modes.js';

describe('Head-to-Head Performance Benchmark Suite', () => {
  describe('Test Data Generation', () => {
    it('should generate test data with expected properties', () => {
      const data = generateDashboardData(100);

      expect(data).to.have.length(100);
      expect(data[0]).to.have.property('id');
      expect(data[0]).to.have.property('category');
      expect(data[0]).to.have.property('region');
      expect(data[0]).to.have.property('amount');
      expect(data[0]).to.have.property('active');

      // Verify data variety
      const categories = new Set(data.map(d => d.category));
      expect(categories.size).to.be.greaterThan(1);

      const regions = new Set(data.map(d => d.region));
      expect(regions.size).to.be.greaterThan(1);
    });
  });

  describe('Benchmark Pipeline Function', () => {
    it('should return valid benchmark results', () => {
      const data = generateDashboardData(50);
      const pipeline = [
        { $match: { active: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ];

      const result = benchmarkPipeline(data, pipeline, 'test-pipeline', 1);

      expect(result).to.have.property('name', 'test-pipeline');
      expect(result).to.have.property('stream');
      expect(result).to.have.property('toggle');
      expect(result).to.have.property('speedup');
      expect(result).to.have.property('winner');
      expect(result).to.have.property('resultCount');

      expect(result.stream).to.have.property('avg');
      expect(result.stream).to.have.property('min');
      expect(result.stream).to.have.property('throughput');

      expect(result.toggle).to.have.property('avg');
      expect(result.toggle).to.have.property('min');
      expect(result.toggle).to.have.property('throughput');

      expect(result.speedup).to.be.a('number');
      expect(['stream', 'toggle']).to.include(result.winner);
      expect(result.resultCount).to.be.a('number');
    });

    it('should validate that both modes produce identical results', () => {
      const data = generateDashboardData(20);
      const pipeline = [
        { $match: { amount: { $gte: 500 } } },
        { $project: { category: 1, amount: 1 } },
        { $sort: { amount: -1 } },
      ];

      // This should not throw an error if results are identical
      const result = benchmarkPipeline(data, pipeline, 'identical-test', 1);
      expect(result.resultCount).to.be.greaterThan(0);
    });
  });

  describe('Performance Characteristics', () => {
    it('should measure performance for toggle-optimized use cases', () => {
      const data = generateDashboardData(100);

      // Test dimensional filtering (crossfilter-style)
      const dimensionalPipeline = [
        { $match: { active: true } },
        { $match: { category: { $in: ['sales', 'marketing'] } } },
        { $project: { category: 1, region: 1, amount: 1 } },
      ];

      const result = benchmarkPipeline(
        data,
        dimensionalPipeline,
        'dimensional-test',
        1
      );
      expect(result.stream.avg).to.be.greaterThan(0);
      expect(result.toggle.avg).to.be.greaterThan(0);
    });

    it('should measure performance for aggregation-heavy workloads', () => {
      const data = generateDashboardData(100);

      // Test refcounted aggregation (crossfilter group.reduceSum style)
      const aggregationPipeline = [
        { $match: { active: true } },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            avgScore: { $avg: '$score' },
            count: { $sum: 1 },
          },
        },
      ];

      const result = benchmarkPipeline(
        data,
        aggregationPipeline,
        'aggregation-test',
        1
      );
      expect(result.resultCount).to.be.greaterThan(0);
      expect(result.stream.throughput).to.be.greaterThan(0);
      expect(result.toggle.throughput).to.be.greaterThan(0);
    });
  });

  describe('Benchmark Infrastructure Validation', () => {
    it('should handle edge cases gracefully', () => {
      const data = generateDashboardData(10);

      // Test with empty result pipeline
      const emptyPipeline = [
        { $match: { nonExistentField: 'impossible-value' } },
      ];

      const result = benchmarkPipeline(
        data,
        emptyPipeline,
        'empty-result-test',
        1
      );
      expect(result.resultCount).to.equal(0);
      expect(result.stream.avg).to.be.greaterThan(0); // Should still measure time
      expect(result.toggle.avg).to.be.greaterThan(0);
    });

    it('should produce consistent measurements across iterations', () => {
      const data = generateDashboardData(50);
      const pipeline = [
        { $match: { active: true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ];

      const result1 = benchmarkPipeline(
        data,
        pipeline,
        'consistency-test-1',
        2
      );
      const result2 = benchmarkPipeline(
        data,
        pipeline,
        'consistency-test-2',
        2
      );

      // Results should be identical
      expect(result1.resultCount).to.equal(result2.resultCount);

      // Performance should be in similar range (within 100% variance is reasonable for CI environments)
      const streamVariance =
        Math.abs(result1.stream.avg - result2.stream.avg) /
        Math.max(result1.stream.avg, result2.stream.avg);
      const toggleVariance =
        Math.abs(result1.toggle.avg - result2.toggle.avg) /
        Math.max(result1.toggle.avg, result2.toggle.avg);

      expect(streamVariance).to.be.lessThan(1.0); // Less than 100% variance (CI can be variable)
      expect(toggleVariance).to.be.lessThan(1.0);
    });
  });

  describe('Real-world Use Case Patterns', () => {
    it('should test crossfilter-style dimension filtering', () => {
      const data = generateDashboardData(200);

      // Simulate multiple filter dimensions like dc.js charts
      const crossfilterPattern = [
        { $match: { active: true } }, // Dimension 1: active status
        { $match: { region: { $in: ['north', 'south'] } } }, // Dimension 2: region filter
        { $match: { amount: { $gte: 1000 } } }, // Dimension 3: amount threshold
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ];

      const result = benchmarkPipeline(
        data,
        crossfilterPattern,
        'crossfilter-pattern',
        1
      );
      expect(result.resultCount).to.be.greaterThan(0);
    });

    it('should test dashboard analytics aggregation patterns', () => {
      const data = generateDashboardData(300);

      // Simulate business intelligence dashboard aggregation
      const dashboardPattern = [
        { $match: { status: 'active' } },
        {
          $addFields: {
            efficiency: { $divide: ['$amount', '$count'] },
          },
        },
        {
          $group: {
            _id: { region: '$region', category: '$category' },
            avgEfficiency: { $avg: '$efficiency' },
            totalRevenue: { $sum: '$amount' },
            recordCount: { $sum: 1 },
            maxAmount: { $max: '$amount' },
            minAmount: { $min: '$amount' },
          },
        },
        { $match: { recordCount: { $gte: 2 } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 },
      ];

      const result = benchmarkPipeline(
        data,
        dashboardPattern,
        'dashboard-pattern',
        1
      );
      expect(result.resultCount).to.be.greaterThan(0);
      expect(result.resultCount).to.be.lessThanOrEqual(20); // Limited results
    });
  });

  describe('Performance Analysis Validation', () => {
    it('should identify when toggle mode provides advantages', () => {
      const data = generateDashboardData(100);

      // Test a case where toggle mode should excel: membership filtering + aggregation
      const toggleFriendlyPipeline = [
        { $match: { active: true, featured: true } },
        { $match: { category: { $in: ['sales', 'marketing'] } } },
        {
          $group: {
            _id: '$region',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalAmount: -1 } },
      ];

      const result = benchmarkPipeline(
        data,
        toggleFriendlyPipeline,
        'toggle-friendly',
        1
      );

      // The benchmark should complete successfully regardless of which mode wins
      expect(result.winner).to.be.oneOf(['stream', 'toggle']);
      expect(result.speedup).to.be.a('number');
      expect(result.speedup).to.be.greaterThan(0);
    });

    it('should measure throughput correctly', () => {
      const dataSize = 100;
      const data = generateDashboardData(dataSize);

      const pipeline = [
        { $match: { active: true } },
        { $project: { category: 1, amount: 1 } },
      ];

      const result = benchmarkPipeline(data, pipeline, 'throughput-test', 1);

      // Throughput should be docs/sec, so should be reasonable given our dataset size and timing
      expect(result.stream.throughput).to.be.greaterThan(1000); // At least 1K docs/sec
      expect(result.toggle.throughput).to.be.greaterThan(1000);

      // Throughput calculation should be consistent with timing (allow larger variance for CI)
      const expectedStreamThroughput = Math.round(
        dataSize / (result.stream.avg / 1000)
      );
      const expectedToggleThroughput = Math.round(
        dataSize / (result.toggle.avg / 1000)
      );

      expect(
        Math.abs(result.stream.throughput - expectedStreamThroughput)
      ).to.be.lessThan(2000);
      expect(
        Math.abs(result.toggle.throughput - expectedToggleThroughput)
      ).to.be.lessThan(2000);
    });
  });
});
