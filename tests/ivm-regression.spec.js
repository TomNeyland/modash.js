/**
 * Regression tests for IVM fallback issues
 * These tests ensure that the fixes for cross-stage field resolution
 * and operator support remain working.
 */

import { expect } from 'chai';
import Aggo from '../src/aggo/index.js';
import { getFallbackCount, resetFallbackTracking } from '../src/aggo/debug.js';

describe('IVM Regression Tests', () => {
  beforeEach(() => {
    resetFallbackTracking();
  });

  describe('Cross-stage field resolution', () => {
    it('should handle $project creating fields used by $group', () => {
      const data = [
        {
          _id: 1,
          category: 'electronics',
          price: 100,
          date: new Date(2023, 4, 15),
        },
        {
          _id: 2,
          category: 'electronics',
          price: 200,
          date: new Date(2023, 3, 10),
        },
        {
          _id: 3,
          category: 'furniture',
          price: 300,
          date: new Date(2023, 4, 20),
        },
      ];

      const pipeline = [
        {
          $project: {
            category: 1,
            month: { $month: '$date' },
            revenue: { $multiply: ['$price', 2] },
          },
        },
        {
          $group: {
            _id: { category: '$category', month: '$month' },
            totalRevenue: { $sum: '$revenue' },
          },
        },
      ];

      const result = Aggo.aggregate(data, pipeline);

      // Verify no fallbacks occurred
      expect(getFallbackCount()).to.equal(0);

      // Verify results are correct
      expect(result).to.have.lengthOf(3);

      // Find the result for electronics in May (month 5)
      const electronicsMap = result.find(
        r => r._id.category === 'electronics' && r._id.month === 5
      );
      expect(electronicsMap).to.exist;
      expect(electronicsMap.totalRevenue).to.equal(200); // 100 * 2

      // Find the result for electronics in April (month 4)
      const electronicsApr = result.find(
        r => r._id.category === 'electronics' && r._id.month === 4
      );
      expect(electronicsApr).to.exist;
      expect(electronicsApr.totalRevenue).to.equal(400); // 200 * 2
    });

    it('should handle complex nested field references across stages', () => {
      const data = [
        { _id: 1, user: { name: 'Alice', age: 30 }, score: 95 },
        { _id: 2, user: { name: 'Bob', age: 30 }, score: 85 },
        { _id: 3, user: { name: 'Charlie', age: 25 }, score: 90 },
      ];

      const pipeline = [
        {
          $project: {
            userName: '$user.name',
            userAge: '$user.age',
            adjustedScore: { $add: ['$score', 5] },
          },
        },
        {
          $group: {
            _id: '$userAge',
            avgScore: { $avg: '$adjustedScore' },
            users: { $push: '$userName' },
          },
        },
      ];

      const result = Aggo.aggregate(data, pipeline);

      expect(getFallbackCount()).to.equal(0);
      expect(result).to.have.lengthOf(2);

      const age30Group = result.find(r => r._id === 30);
      expect(age30Group).to.exist;
      expect(age30Group.avgScore).to.equal(95); // (100 + 90) / 2
      expect(age30Group.users).to.have.members(['Alice', 'Bob']);
    });

    it('should preserve terminal $project fields', () => {
      const data = [
        { _id: 1, a: 1, b: 2, c: 3, d: 4 },
        { _id: 2, a: 5, b: 6, c: 7, d: 8 },
      ];

      const pipeline = [
        { $match: { a: { $gte: 1 } } },
        {
          $project: {
            sum: { $add: ['$a', '$b'] },
            product: { $multiply: ['$c', '$d'] },
            literal: 'test',
          },
        },
      ];

      const result = Aggo.aggregate(data, pipeline);

      expect(getFallbackCount()).to.equal(0);
      expect(result).to.have.lengthOf(2);

      expect(result[0]).to.deep.equal({
        _id: 1,
        sum: 3,
        product: 12,
        literal: 'test',
      });

      expect(result[1]).to.deep.equal({
        _id: 2,
        sum: 11,
        product: 56,
        literal: 'test',
      });
    });
  });

  describe('Array operator edge cases', () => {
    it('should return null for $arrayElemAt out of bounds', () => {
      const data = [
        { _id: 1, arr: [1, 2, 3] },
        { _id: 2, arr: [4, 5] },
        { _id: 3, arr: [] },
      ];

      const pipeline = [
        {
          $project: {
            first: { $arrayElemAt: ['$arr', 0] },
            last: { $arrayElemAt: ['$arr', -1] },
            outOfBounds: { $arrayElemAt: ['$arr', 10] },
            negativeOOB: { $arrayElemAt: ['$arr', -10] },
          },
        },
      ];

      const result = Aggo.aggregate(data, pipeline);

      expect(getFallbackCount()).to.equal(0);

      expect(result[0]).to.deep.include({
        first: 1,
        last: 3,
        outOfBounds: null,
        negativeOOB: null,
      });

      expect(result[1]).to.deep.include({
        first: 4,
        last: 5,
        outOfBounds: null,
        negativeOOB: null,
      });

      expect(result[2]).to.deep.include({
        first: null,
        last: null,
        outOfBounds: null,
        negativeOOB: null,
      });
    });
  });

  describe('Operator support verification', () => {
    it('should handle $sort + $limit fusion to $topK without fallback', () => {
      const data = Array.from({ length: 100 }, (_, i) => ({
        _id: i,
        value: Math.floor(Math.random() * 100),
      }));

      const pipeline = [{ $sort: { value: -1 } }, { $limit: 10 }];

      const result = Aggo.aggregate(data, pipeline);

      expect(getFallbackCount()).to.equal(0);
      expect(result).to.have.lengthOf(10);

      // Verify sorting
      for (let i = 1; i < result.length; i++) {
        expect(result[i].value).to.be.at.most(result[i - 1].value);
      }
    });

    it('should handle all benchmark pipelines without fallback', () => {
      const data = Array.from({ length: 50 }, (_, i) => ({
        _id: i,
        item: ['laptop', 'mouse', 'keyboard'][i % 3],
        category: ['electronics', 'furniture'][i % 2],
        price: 50 + i * 10,
        quantity: (i % 5) + 1,
        active: i % 3 !== 0,
        date: new Date(2023, i % 12, (i % 28) + 1),
      }));

      // Test simpleFilter
      const simpleResult = Aggo.aggregate(data, [
        { $match: { category: 'electronics', active: true } },
      ]);
      expect(getFallbackCount()).to.equal(0);
      expect(simpleResult.length).to.be.greaterThan(0);

      resetFallbackTracking();

      // Test groupAndAggregate
      const groupResult = Aggo.aggregate(data, [
        {
          $group: {
            _id: '$category',
            totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
            avgPrice: { $avg: '$price' },
            itemCount: { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
      ]);
      expect(getFallbackCount()).to.equal(0);
      expect(groupResult).to.have.lengthOf(2);

      resetFallbackTracking();

      // Test complexPipeline
      const complexResult = Aggo.aggregate(data, [
        { $match: { active: true, quantity: { $gt: 0 } } },
        {
          $project: {
            item: 1,
            category: 1,
            revenue: { $multiply: ['$price', '$quantity'] },
            isPremium: { $gte: ['$price', 200] },
            month: { $month: '$date' },
          },
        },
        {
          $group: {
            _id: { category: '$category', month: '$month' },
            totalRevenue: { $sum: '$revenue' },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
      ]);
      expect(getFallbackCount()).to.equal(0);
      expect(complexResult.length).to.be.at.most(10);
    });
  });

  describe('Effective document access', () => {
    it('should use projected documents in $limit operator', () => {
      const data = [
        { _id: 1, name: 'Alice', score: 95 },
        { _id: 2, name: 'Bob', score: 85 },
        { _id: 3, name: 'Charlie', score: 90 },
      ];

      const pipeline = [
        {
          $project: {
            displayName: { $toUpper: '$name' },
            passed: { $gte: ['$score', 90] },
          },
        },
        { $limit: 2 },
      ];

      const result = Aggo.aggregate(data, pipeline);

      expect(getFallbackCount()).to.equal(0);
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.deep.include({
        displayName: 'ALICE',
        passed: true,
      });
      expect(result[1]).to.deep.include({
        displayName: 'BOB',
        passed: false,
      });
    });

    it('should use projected documents in $skip operator', () => {
      const data = [
        { _id: 1, name: 'Alice', score: 95 },
        { _id: 2, name: 'Bob', score: 85 },
        { _id: 3, name: 'Charlie', score: 90 },
      ];

      const pipeline = [
        {
          $project: {
            displayName: { $toLower: '$name' },
            grade: { $cond: [{ $gte: ['$score', 90] }, 'A', 'B'] },
          },
        },
        { $skip: 1 },
      ];

      const result = Aggo.aggregate(data, pipeline);

      expect(getFallbackCount()).to.equal(0);
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.deep.include({
        displayName: 'bob',
        grade: 'B',
      });
      expect(result[1]).to.deep.include({
        displayName: 'charlie',
        grade: 'A',
      });
    });
  });
});
