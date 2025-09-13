import { expect } from 'chai';
import Modash from '../src/index.ts';
import { createStreamingCollection, aggregateStreaming } from '../src/modash/streaming.js';

// Helper function to compare streaming vs non-streaming results
const compareStreamingResults = (collection, pipeline, description = '') => {
  const nonStreamingResult = Modash.aggregate(collection, pipeline);
  
  // Test with streaming collection created from same data
  const streamingCollection = createStreamingCollection(collection);
  const streamingResult = streamingCollection.stream(pipeline);
  
  // Also test with aggregateStreaming function
  const aggregateStreamingResult = aggregateStreaming(collection, pipeline);
  const aggregateStreamingCollectionResult = aggregateStreaming(streamingCollection, pipeline);
  
  // Clean up
  streamingCollection.destroy();
  
  return {
    nonStreaming: nonStreamingResult,
    streaming: streamingResult,
    aggregateStreamingArray: aggregateStreamingResult,
    aggregateStreamingCollection: aggregateStreamingCollectionResult
  };
};

describe('Enhanced MongoDB Operators', () => {
  const testData = [
    {
      _id: 1,
      name: 'Alice',
      age: 30,
      tags: ['developer', 'senior'],
      scores: [85, 90, 88],
    },
    { _id: 2, name: 'Bob', age: 25, tags: ['designer'], scores: [92, 87] },
    {
      _id: 3,
      name: 'Charlie',
      age: 35,
      tags: ['developer', 'lead'],
      scores: [78, 85, 82, 90],
    },
    { _id: 4, name: 'David', age: 28, skills: null, scores: [88] },
  ];

  const departments = [
    { _id: 'dev', name: 'Development', managerId: 1 },
    { _id: 'design', name: 'Design', managerId: 2 },
  ];

  describe('Enhanced $match operators', () => {
    it('should handle $exists operator', () => {
      const result = Modash.aggregate(testData, [
        { $match: { tags: { $exists: true } } },
      ]);
      expect(result).to.have.length(3);
      expect(result.map(r => r._id)).to.deep.equal([1, 2, 3]);
    });

    it('should handle $regex operator', () => {
      const result = Modash.aggregate(testData, [
        { $match: { name: { $regex: 'A.*' } } },
      ]);
      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('Alice');
    });

    it('should handle $all operator for arrays', () => {
      const result = Modash.aggregate(testData, [
        { $match: { tags: { $all: ['developer'] } } },
      ]);
      expect(result).to.have.length(2);
      expect(result.map(r => r.name)).to.deep.equal(['Alice', 'Charlie']);
    });

    it('should handle $size operator for arrays', () => {
      const result = Modash.aggregate(testData, [
        { $match: { scores: { $size: 3 } } },
      ]);
      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('Alice');
    });

    it('should handle logical $and operator', () => {
      const result = Modash.aggregate(testData, [
        {
          $match: {
            $and: [{ age: { $gte: 30 } }, { tags: { $exists: true } }],
          },
        },
      ]);
      expect(result).to.have.length(2);
      expect(result.map(r => r.name)).to.deep.equal(['Alice', 'Charlie']);
    });

    it('should handle logical $or operator', () => {
      const result = Modash.aggregate(testData, [
        { $match: { $or: [{ age: { $lt: 26 } }, { name: 'Alice' }] } },
      ]);
      expect(result).to.have.length(2);
      expect(result.map(r => r.name)).to.deep.equal(['Alice', 'Bob']);
    });
  });

  describe('$lookup operator', () => {
    it('should perform left outer join', () => {
      const users = [
        { _id: 1, name: 'Alice', deptId: 'dev' },
        { _id: 2, name: 'Bob', deptId: 'design' },
        { _id: 3, name: 'Charlie', deptId: 'dev' },
        { _id: 4, name: 'David', deptId: 'hr' },
      ];

      const result = Modash.aggregate(users, [
        {
          $lookup: {
            from: departments,
            localField: 'deptId',
            foreignField: '_id',
            as: 'department',
          },
        },
      ]);

      expect(result).to.have.length(4);
      expect(result[0].department).to.have.length(1);
      expect(result[0].department[0].name).to.equal('Development');
      expect(result[3].department).to.have.length(0); // No match for 'hr'
    });
  });

  describe('$addFields operator', () => {
    it('should add computed fields', () => {
      const pipeline = [
        {
          $addFields: {
            averageScore: { $avg: '$scores' },
            isExperienced: { $gte: ['$age', 30] },
          },
        },
      ];

      // Test traditional aggregation
      const result = Modash.aggregate(testData, pipeline);
      expect(result).to.have.length(4);
      expect(result[0].averageScore).to.be.closeTo(87.67, 0.1);
      expect(result[0].isExperienced).to.be.true;
      expect(result[1].isExperienced).to.be.false;

      // Test streaming vs non-streaming results are identical
      const results = compareStreamingResults(testData, pipeline, '$addFields with computed fields');
      expect(results.streaming).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingArray).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingCollection).to.deep.equal(results.nonStreaming);
      expect(results.streaming).to.have.length(4);
      expect(results.streaming[0].averageScore).to.be.closeTo(87.67, 0.1);
      expect(results.streaming[0].isExperienced).to.be.true;
    });
  });

  describe('Enhanced Array Operators', () => {
    describe('$arrayElemAt', () => {
      it('should get element at positive index', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              firstScore: { $arrayElemAt: ['$scores', 0] },
              secondTag: { $arrayElemAt: ['$tags', 1] },
            },
          },
        ]);

        expect(result[0].firstScore).to.equal(85);
        expect(result[0].secondTag).to.equal('senior');
        expect(result[1].secondTag).to.be.null;
      });

      it('should get element at negative index', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              lastScore: { $arrayElemAt: ['$scores', -1] },
            },
          },
        ]);

        expect(result[0].lastScore).to.equal(88);
        expect(result[1].lastScore).to.equal(87);
      });
    });

    describe('$slice', () => {
      it('should slice array from beginning', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              topTwoScores: { $slice: ['$scores', 2] },
            },
          },
        ]);

        expect(result[0].topTwoScores).to.deep.equal([85, 90]);
        expect(result[2].topTwoScores).to.deep.equal([78, 85]);
      });

      it('should slice array with start position', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              middleScores: { $slice: ['$scores', 1, 2] },
            },
          },
        ]);

        expect(result[0].middleScores).to.deep.equal([90, 88]);
        expect(result[2].middleScores).to.deep.equal([85, 82]);
      });
    });

    describe('$concatArrays', () => {
      it('should concatenate arrays', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              combined: { $concatArrays: [['prefix'], '$tags', ['suffix']] },
            },
          },
        ]);

        expect(result[0].combined).to.deep.equal([
          'prefix',
          'developer',
          'senior',
          'suffix',
        ]);
        expect(result[1].combined).to.deep.equal([
          'prefix',
          'designer',
          'suffix',
        ]);
      });
    });

    describe('$in', () => {
      it('should check if value is in array', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              isDeveloper: { $in: ['developer', '$tags'] },
            },
          },
        ]);

        expect(result[0].isDeveloper).to.be.true;
        expect(result[1].isDeveloper).to.be.false;
        expect(result[2].isDeveloper).to.be.true;
      });
    });
  });

  describe('Enhanced Math Operators', () => {
    describe('$abs, $ceil, $floor, $round', () => {
      it('should perform math operations', () => {
        const mathData = [{ value: -3.7, pi: 3.14159 }];

        const result = Modash.aggregate(mathData, [
          {
            $project: {
              absolute: { $abs: '$value' },
              ceiling: { $ceil: '$value' },
              floored: { $floor: '$pi' },
              rounded: { $round: ['$pi', 2] },
            },
          },
        ]);

        expect(result[0].absolute).to.equal(3.7);
        expect(result[0].ceiling).to.equal(-3);
        expect(result[0].floored).to.equal(3);
        expect(result[0].rounded).to.equal(3.14);
      });
    });

    describe('$sqrt, $pow', () => {
      it('should perform advanced math operations', () => {
        const mathData = [{ base: 4, exponent: 3 }];

        const result = Modash.aggregate(mathData, [
          {
            $project: {
              squareRoot: { $sqrt: '$base' },
              power: { $pow: ['$base', '$exponent'] },
            },
          },
        ]);

        expect(result[0].squareRoot).to.equal(2);
        expect(result[0].power).to.equal(64);
      });
    });
  });

  describe('Enhanced String Operators', () => {
    describe('$split', () => {
      it('should split strings', () => {
        const stringData = [{ fullName: 'John-Doe-Smith' }];

        const result = Modash.aggregate(stringData, [
          {
            $project: {
              nameParts: { $split: ['$fullName', '-'] },
            },
          },
        ]);

        expect(result[0].nameParts).to.deep.equal(['John', 'Doe', 'Smith']);
      });
    });

    describe('$strLen', () => {
      it('should calculate string length', () => {
        const result = Modash.aggregate(testData, [
          {
            $project: {
              name: 1,
              nameLength: { $strLen: '$name' },
            },
          },
        ]);

        expect(result[0].nameLength).to.equal(5);
        expect(result[2].nameLength).to.equal(7);
      });
    });

    describe('$trim', () => {
      it('should trim whitespace', () => {
        const stringData = [{ text: '  hello world  ' }];

        const result = Modash.aggregate(stringData, [
          {
            $project: {
              trimmed: { $trim: '$text' },
            },
          },
        ]);

        expect(result[0].trimmed).to.equal('hello world');
      });
    });
  });

  describe('Complex Pipeline with New Operators', () => {
    it('should handle complex pipeline with sorting and new operators', () => {
      const result = Modash.aggregate(testData, [
        { $match: { tags: { $exists: true } } },
        {
          $addFields: {
            avgScore: { $avg: '$scores' },
            firstTag: { $arrayElemAt: ['$tags', 0] },
          },
        },
        { $sort: { avgScore: -1 } },
        {
          $project: {
            name: 1,
            avgScore: { $round: ['$avgScore', 1] },
            firstTag: 1,
            isTopPerformer: { $gte: ['$avgScore', 85] },
          },
        },
      ]);

      expect(result).to.have.length(3);
      expect(result[0].name).to.equal('Bob'); // Highest avg score
      expect(result[0].avgScore).to.equal(89.5);
      expect(result[0].isTopPerformer).to.be.true;
      expect(result[2].isTopPerformer).to.be.false; // Charlie with lowest avg
    });
  });
});
