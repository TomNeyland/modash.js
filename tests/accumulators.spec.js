/**
 * Accumulator Tests to Improve Coverage
 * Tests for accumulator functions in accumulators.ts
 */

import { expect } from 'chai';
import Modash from '../src/index.ts';

describe('Accumulator Function Coverage Tests', function () {
  const sampleData = [
    { name: 'Alice', age: 30, score: 85, category: 'A', values: [1, 2, 3] },
    { name: 'Bob', age: 25, score: 92, category: 'B', values: [4, 5] },
    { name: 'Charlie', age: 35, score: 78, category: 'A', values: [6] },
    { name: 'Diana', age: 28, score: 95, category: 'B', values: [7, 8, 9, 10] },
  ];

  describe('$sum Accumulator', function () {
    it('should sum numeric field values', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: null,
            totalAge: { $sum: '$age' },
            totalScore: { $sum: '$score' },
          },
        },
      ]);

      expect(result[0].totalAge).to.equal(118); // 30+25+35+28
      expect(result[0].totalScore).to.equal(350); // 85+92+78+95
    });

    it('should count documents when using $sum: 1', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.count).to.equal(2);
      expect(categoryB.count).to.equal(2);
    });

    it('should handle expressions in $sum', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: null,
            totalBonus: { $sum: { $multiply: ['$score', 0.1] } },
          },
        },
      ]);

      expect(result[0].totalBonus).to.equal(35); // (85+92+78+95) * 0.1
    });

    it('should handle non-numeric values gracefully', function () {
      const dataWithNulls = [
        { value: 10 },
        { value: null },
        { value: 'not a number' },
        { value: 20 },
        {}, // missing value
      ];

      const result = Modash.aggregate(dataWithNulls, [
        {
          $group: {
            _id: null,
            total: { $sum: '$value' },
          },
        },
      ]);

      expect(result[0].total).to.equal(30); // Only 10 + 20
    });
  });

  describe('$avg Accumulator', function () {
    it('should calculate average of numeric field values', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: null,
            avgAge: { $avg: '$age' },
            avgScore: { $avg: '$score' },
          },
        },
      ]);

      expect(result[0].avgAge).to.equal(29.5); // 118/4
      expect(result[0].avgScore).to.equal(87.5); // 350/4
    });

    it('should calculate average by category', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            avgScore: { $avg: '$score' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.avgScore).to.equal(81.5); // (85+78)/2
      expect(categoryB.avgScore).to.equal(93.5); // (92+95)/2
    });

    it('should handle empty collections', function () {
      const result = Modash.aggregate(
        [],
        [
          {
            $group: {
              _id: null,
              avgValue: { $avg: '$value' },
            },
          },
        ]
      );

      expect(result).to.have.length(0); // No groups when collection is empty
    });
  });

  describe('$first Accumulator', function () {
    it('should return first value in each group', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            firstName: { $first: '$name' },
            firstAge: { $first: '$age' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.firstName).to.equal('Alice');
      expect(categoryA.firstAge).to.equal(30);
      expect(categoryB.firstName).to.equal('Bob');
      expect(categoryB.firstAge).to.equal(25);
    });

    it('should handle expressions in $first', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            firstBonus: { $first: { $multiply: ['$score', 0.1] } },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.firstBonus).to.equal(8.5); // Alice's score * 0.1
      expect(categoryB.firstBonus).to.equal(9.2); // Bob's score * 0.1
    });
  });

  describe('$last Accumulator', function () {
    it('should return last value in each group', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            lastName: { $last: '$name' },
            lastAge: { $last: '$age' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.lastName).to.equal('Charlie');
      expect(categoryA.lastAge).to.equal(35);
      expect(categoryB.lastName).to.equal('Diana');
      expect(categoryB.lastAge).to.equal(28);
    });
  });

  describe('$min Accumulator', function () {
    it('should find minimum value in each group', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            minAge: { $min: '$age' },
            minScore: { $min: '$score' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.minAge).to.equal(30); // Alice: 30, Charlie: 35
      expect(categoryA.minScore).to.equal(78); // Alice: 85, Charlie: 78
      expect(categoryB.minAge).to.equal(25); // Bob: 25, Diana: 28
      expect(categoryB.minScore).to.equal(92); // Bob: 92, Diana: 95
    });
  });

  describe('$max Accumulator', function () {
    it('should find maximum value in each group', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            maxAge: { $max: '$age' },
            maxScore: { $max: '$score' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.maxAge).to.equal(35); // Alice: 30, Charlie: 35
      expect(categoryA.maxScore).to.equal(85); // Alice: 85, Charlie: 78
      expect(categoryB.maxAge).to.equal(28); // Bob: 25, Diana: 28
      expect(categoryB.maxScore).to.equal(95); // Bob: 92, Diana: 95
    });
  });

  describe('$push Accumulator', function () {
    it('should collect values into arrays', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            names: { $push: '$name' },
            ages: { $push: '$age' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.names).to.deep.equal(['Alice', 'Charlie']);
      expect(categoryA.ages).to.deep.equal([30, 35]);
      expect(categoryB.names).to.deep.equal(['Bob', 'Diana']);
      expect(categoryB.ages).to.deep.equal([25, 28]);
    });

    it('should handle expressions in $push', function () {
      const result = Modash.aggregate(sampleData, [
        {
          $group: {
            _id: '$category',
            bonuses: { $push: { $multiply: ['$score', 0.1] } },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.bonuses).to.deep.equal([8.5, 7.8]);
      expect(categoryB.bonuses).to.deep.equal([9.2, 9.5]);
    });
  });

  describe('$addToSet Accumulator', function () {
    it('should collect unique values into arrays', function () {
      const dataWithDuplicates = [
        { category: 'A', tag: 'red' },
        { category: 'A', tag: 'blue' },
        { category: 'A', tag: 'red' }, // duplicate
        { category: 'B', tag: 'green' },
        { category: 'B', tag: 'red' },
        { category: 'B', tag: 'green' }, // duplicate
      ];

      const result = Modash.aggregate(dataWithDuplicates, [
        {
          $group: {
            _id: '$category',
            uniqueTags: { $addToSet: '$tag' },
          },
        },
      ]);

      const categoryA = result.find(r => r._id === 'A');
      const categoryB = result.find(r => r._id === 'B');

      expect(categoryA.uniqueTags.sort()).to.deep.equal(['blue', 'red']);
      expect(categoryB.uniqueTags.sort()).to.deep.equal(['green', 'red']);
    });
  });

  describe('Statistical Accumulators', function () {
    const numericData = [
      { group: 'A', value: 10 },
      { group: 'A', value: 20 },
      { group: 'A', value: 30 },
      { group: 'B', value: 5 },
      { group: 'B', value: 15 },
    ];

    it('should calculate $stdDevPop (population standard deviation)', function () {
      const result = Modash.aggregate(numericData, [
        {
          $group: {
            _id: '$group',
            stdDev: { $stdDevPop: '$value' },
          },
        },
      ]);

      const groupA = result.find(r => r._id === 'A');
      const groupB = result.find(r => r._id === 'B');

      // Group A: values [10, 20, 30], mean = 20, stddev = sqrt(((10-20)^2 + (20-20)^2 + (30-20)^2)/3) = sqrt(200/3) ≈ 8.165
      expect(groupA.stdDev).to.be.closeTo(8.165, 0.001);

      // Group B: values [5, 15], mean = 10, stddev = sqrt(((5-10)^2 + (15-10)^2)/2) = sqrt(50/2) = 5
      expect(groupB.stdDev).to.equal(5);
    });

    it('should calculate $stdDevSamp (sample standard deviation)', function () {
      const result = Modash.aggregate(numericData, [
        {
          $group: {
            _id: '$group',
            stdDev: { $stdDevSamp: '$value' },
          },
        },
      ]);

      const groupA = result.find(r => r._id === 'A');
      const groupB = result.find(r => r._id === 'B');

      // Group A: sample stddev = sqrt(200/2) = 10
      expect(groupA.stdDev).to.equal(10);

      // Group B: sample stddev = sqrt(50/1) = sqrt(50) ≈ 7.071
      expect(groupB.stdDev).to.be.closeTo(7.071, 0.001);
    });

    it('should calculate $variancePop (population variance)', function () {
      const result = Modash.aggregate(numericData, [
        {
          $group: {
            _id: '$group',
            variance: { $variancePop: '$value' },
          },
        },
      ]);

      const groupA = result.find(r => r._id === 'A');
      const groupB = result.find(r => r._id === 'B');

      // Group A: variance = 200/3 ≈ 66.667
      expect(groupA.variance).to.be.closeTo(66.667, 0.001);

      // Group B: variance = 50/2 = 25
      expect(groupB.variance).to.equal(25);
    });

    it('should calculate $varianceSamp (sample variance)', function () {
      const result = Modash.aggregate(numericData, [
        {
          $group: {
            _id: '$group',
            variance: { $varianceSamp: '$value' },
          },
        },
      ]);

      const groupA = result.find(r => r._id === 'A');
      const groupB = result.find(r => r._id === 'B');

      // Group A: sample variance = 200/2 = 100
      expect(groupA.variance).to.equal(100);

      // Group B: sample variance = 50/1 = 50
      expect(groupB.variance).to.equal(50);
    });
  });

  describe('Edge Cases', function () {
    it('should handle null and undefined values in accumulators', function () {
      const dataWithNulls = [
        { value: 10 },
        { value: null },
        { value: undefined },
        { value: 20 },
      ];

      const result = Modash.aggregate(dataWithNulls, [
        {
          $group: {
            _id: null,
            sum: { $sum: '$value' },
            avg: { $avg: '$value' },
            min: { $min: '$value' },
            max: { $max: '$value' },
            first: { $first: '$value' },
            last: { $last: '$value' },
            values: { $push: '$value' },
          },
        },
      ]);

      expect(result[0].sum).to.equal(30); // Only numbers are summed
      expect(result[0].values).to.deep.equal([10, null, undefined, 20]); // $push includes all values
    });

    it('should handle single document groups', function () {
      const singleDoc = [{ name: 'Solo', value: 42 }];

      const result = Modash.aggregate(singleDoc, [
        {
          $group: {
            _id: null,
            sum: { $sum: '$value' },
            avg: { $avg: '$value' },
            min: { $min: '$value' },
            max: { $max: '$value' },
            first: { $first: '$name' },
            last: { $last: '$name' },
            stdDevPop: { $stdDevPop: '$value' },
            stdDevSamp: { $stdDevSamp: '$value' },
          },
        },
      ]);

      expect(result[0].sum).to.equal(42);
      expect(result[0].avg).to.equal(42);
      expect(result[0].min).to.equal(42);
      expect(result[0].max).to.equal(42);
      expect(result[0].first).to.equal('Solo');
      expect(result[0].last).to.equal('Solo');
      expect(result[0].stdDevPop).to.equal(0); // No deviation with single value
    });
  });
});
