import { expect } from 'chai';
import Modash from '../src/index';
import { $project } from '../src/modash/aggregation';

describe('Phase 7: Advanced Expression & Accumulator Support', () => {
  const testData = [
    {
      name: 'Alice',
      age: 30,
      score: 85,
      status: 'active',
      tags: ['admin', 'user'],
    },
    { name: 'Bob', age: 25, score: 92, status: 'inactive', tags: ['user'] },
    {
      name: 'Charlie',
      age: 35,
      score: null,
      status: 'active',
      tags: ['admin', 'manager'],
    },
    {
      name: 'Diana',
      age: 28,
      score: 78,
      status: null,
      tags: ['user', 'guest'],
    },
  ];

  describe('$switch operator', () => {
    it('should evaluate branches and return first truthy case', () => {
      const result = $project(testData, {
        name: 1,
        category: {
          $switch: {
            branches: [
              { case: { $gte: ['$age', 35] }, then: 'senior' },
              { case: { $gte: ['$age', 30] }, then: 'mid-level' },
              { case: { $gte: ['$age', 25] }, then: 'junior' },
            ],
            default: 'entry-level',
          },
        },
      });

      expect(result).to.have.lengthOf(4);
      expect(result[0].category).to.equal('mid-level'); // Alice: age 30
      expect(result[1].category).to.equal('junior'); // Bob: age 25
      expect(result[2].category).to.equal('senior'); // Charlie: age 35
      expect(result[3].category).to.equal('junior'); // Diana: age 28
    });

    it('should return default value when no cases match', () => {
      const result = $project(testData, {
        name: 1,
        category: {
          $switch: {
            branches: [{ case: { $gt: ['$age', 100] }, then: 'immortal' }],
            default: 'mortal',
          },
        },
      });

      expect(result.every(doc => doc.category === 'mortal')).to.be.true;
    });

    it('should return null when no cases match and no default', () => {
      const result = $project(testData, {
        name: 1,
        category: {
          $switch: {
            branches: [{ case: { $gt: ['$age', 100] }, then: 'immortal' }],
          },
        },
      });

      expect(result.every(doc => doc.category === null)).to.be.true;
    });
  });

  describe('$coalesce operator', () => {
    it('should return first non-null value', () => {
      const result = $project(testData, {
        name: 1,
        validScore: {
          $coalesce: ['$score', '$age', 0],
        },
      });

      expect(result[0].validScore).to.equal(85); // Alice has score
      expect(result[1].validScore).to.equal(92); // Bob has score
      expect(result[2].validScore).to.equal(35); // Charlie: score is null, use age
      expect(result[3].validScore).to.equal(78); // Diana has score
    });

    it('should handle all null values', () => {
      const result = $project([{ a: null, b: null }], {
        result: {
          $coalesce: ['$a', '$b', '$c'],
        },
      });

      expect(result[0].result).to.be.null;
    });
  });

  describe('Type checking operators', () => {
    describe('$type', () => {
      it('should return correct type for various values', () => {
        const result = $project(
          [
            { val: 'hello' },
            { val: 42 },
            { val: true },
            { val: null },
            { val: [1, 2, 3] },
            { val: { nested: true } },
            { val: new Date() },
          ],
          {
            val: 1,
            type: { $type: '$val' },
          }
        );

        expect(result[0].type).to.equal('string');
        expect(result[1].type).to.equal('number');
        expect(result[2].type).to.equal('bool');
        expect(result[3].type).to.equal('null');
        expect(result[4].type).to.equal('array');
        expect(result[5].type).to.equal('object');
        expect(result[6].type).to.equal('date');
      });
    });

    describe('$isNumber', () => {
      it('should identify numeric values', () => {
        const result = $project(
          [{ val: 42 }, { val: 'hello' }, { val: null }, { val: NaN }],
          {
            val: 1,
            isNum: { $isNumber: '$val' },
          }
        );

        expect(result[0].isNum).to.be.true;
        expect(result[1].isNum).to.be.false;
        expect(result[2].isNum).to.be.false;
        expect(result[3].isNum).to.be.false; // NaN should be false
      });
    });

    describe('$isArray', () => {
      it('should identify array values', () => {
        const result = $project(testData, {
          name: 1,
          tagsIsArray: { $isArray: '$tags' },
          nameIsArray: { $isArray: '$name' },
        });

        expect(result.every(doc => doc.tagsIsArray === true)).to.be.true;
        expect(result.every(doc => doc.nameIsArray === false)).to.be.true;
      });
    });
  });

  describe('$mergeObjects operator', () => {
    it('should merge multiple objects', () => {
      const result = $project(
        [
          {
            obj1: { a: 1, b: 2 },
            obj2: { b: 3, c: 4 },
            obj3: { c: 5, d: 6 },
          },
        ],
        {
          merged: {
            $mergeObjects: ['$obj1', '$obj2', '$obj3'],
          },
        }
      );

      expect(result[0].merged).to.deep.equal({ a: 1, b: 3, c: 5, d: 6 });
    });

    it('should handle non-object values gracefully', () => {
      const result = $project(
        [
          {
            obj1: { a: 1 },
            notObj: 'string',
            obj2: { b: 2 },
          },
        ],
        {
          merged: {
            $mergeObjects: ['$obj1', '$notObj', '$obj2'],
          },
        }
      );

      expect(result[0].merged).to.deep.equal({ a: 1, b: 2 });
    });
  });

  describe('Additional math operators', () => {
    describe('$trunc', () => {
      it('should truncate decimal numbers', () => {
        const result = $project([{ val: 3.7 }, { val: -2.9 }, { val: 0.5 }], {
          val: 1,
          truncated: { $trunc: '$val' },
        });

        expect(result[0].truncated).to.equal(3);
        expect(result[1].truncated).to.equal(-2);
        expect(result[2].truncated).to.equal(0);
      });
    });
  });

  describe('System variables', () => {
    describe('$$NOW', () => {
      it('should provide current timestamp', () => {
        const before = new Date();

        const result = $project([{ id: 1 }], {
          id: 1,
          timestamp: '$$NOW',
        });

        const after = new Date();
        const resultTime = new Date(result[0].timestamp);

        expect(resultTime).to.be.at.least(before);
        expect(resultTime).to.be.at.most(after);
      });
    });

    describe('$$ROOT', () => {
      it('should reference the root document', () => {
        const result = $project(testData.slice(0, 1), {
          name: 1,
          originalDoc: '$$ROOT',
        });

        expect(result[0].originalDoc).to.deep.equal(testData[0]);
      });
    });
  });

  describe('$reduce operator with $$value and $$this', () => {
    it('should accumulate array values using $$value and $$this', () => {
      const result = $project([{ numbers: [1, 2, 3, 4, 5] }], {
        sum: {
          $reduce: {
            input: '$numbers',
            initialValue: 0,
            in: { $add: ['$$value', '$$this'] },
          },
        },
        concatenated: {
          $reduce: {
            input: '$numbers',
            initialValue: '',
            in: { $concat: ['$$value', { $toString: '$$this' }] },
          },
        },
      });

      expect(result[0].sum).to.equal(15); // 0+1+2+3+4+5 = 15
      expect(result[0].concatenated).to.equal('12345');
    });

    it('should handle complex accumulation scenarios', () => {
      const result = $project(
        [
          {
            items: [
              { price: 10, qty: 2 },
              { price: 20, qty: 1 },
              { price: 5, qty: 3 },
            ],
          },
        ],
        {
          totalValue: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: {
                $add: [
                  '$$value',
                  { $multiply: ['$$this.price', '$$this.qty'] },
                ],
              },
            },
          },
        }
      );

      expect(result[0].totalValue).to.equal(55); // (10*2) + (20*1) + (5*3) = 20+20+15 = 55
    });

    it('should handle empty arrays', () => {
      const result = $project([{ numbers: [] }], {
        sum: {
          $reduce: {
            input: '$numbers',
            initialValue: 42,
            in: { $add: ['$$value', '$$this'] },
          },
        },
      });

      expect(result[0].sum).to.equal(42); // Should return initial value for empty arrays
    });
  });

  describe('Complex nested expressions', () => {
    it('should handle complex combinations of new operators', () => {
      const result = $project(testData, {
        name: 1,
        analysis: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [{ $isNumber: '$score' }, { $gte: ['$score', 90] }],
                },
                then: {
                  $mergeObjects: [
                    { level: 'excellent' },
                    { scoreType: { $type: '$score' } },
                    { timestamp: '$$NOW' },
                  ],
                },
              },
              {
                case: { $isNumber: '$score' },
                then: {
                  level: 'average',
                  actualScore: { $coalesce: ['$score', 0] },
                },
              },
            ],
            default: {
              level: 'unknown',
              fallbackAge: { $trunc: '$age' },
            },
          },
        },
      });

      // Bob should get excellent (score 92)
      expect(result[1].analysis.level).to.equal('excellent');
      expect(result[1].analysis.scoreType).to.equal('number');
      expect(result[1].analysis.timestamp).to.be.instanceOf(Date);

      // Alice should get average (score 85)
      expect(result[0].analysis.level).to.equal('average');
      expect(result[0].analysis.actualScore).to.equal(85);

      // Charlie should get unknown (score is null)
      expect(result[2].analysis.level).to.equal('unknown');
      expect(result[2].analysis.fallbackAge).to.equal(35);
    });
  });
});
