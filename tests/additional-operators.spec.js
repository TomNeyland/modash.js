/**
 * Additional Operator Tests to Improve Coverage
 * Tests for operators with low coverage in operators.ts
 */

import { expect } from 'chai';
import Aggo from '../src/index.ts';

describe('Additional Operator Coverage Tests', function () {
  describe('Set Operators', function () {
    it('should test $setEquals operator', function () {
      const data = [
        {
          arr1: [1, 2, 3],
          arr2: [3, 2, 1],
          arr3: [1, 2, 4],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            equals12: { $setEquals: ['$arr1', '$arr2'] },
            equals13: { $setEquals: ['$arr1', '$arr3'] },
          },
        },
      ]);

      expect(result[0].equals12).to.be.true;
      expect(result[0].equals13).to.be.false;
    });

    it('should test $setIntersection operator', function () {
      const data = [
        {
          arr1: [1, 2, 3, 4],
          arr2: [3, 4, 5, 6],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            intersection: { $setIntersection: ['$arr1', '$arr2'] },
          },
        },
      ]);

      expect(result[0].intersection).to.deep.equal([3, 4]);
    });

    it('should test $setUnion operator', function () {
      const data = [
        {
          arr1: [1, 2, 3],
          arr2: [3, 4, 5],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            union: { $setUnion: ['$arr1', '$arr2'] },
          },
        },
      ]);

      expect(result[0].union).to.deep.equal([1, 2, 3, 4, 5]);
    });

    it('should test $setDifference operator', function () {
      const data = [
        {
          arr1: [1, 2, 3, 4],
          arr2: [3, 4],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            difference: { $setDifference: ['$arr1', '$arr2'] },
          },
        },
      ]);

      expect(result[0].difference).to.deep.equal([1, 2]);
    });

    it('should test $setIsSubset operator', function () {
      const data = [
        {
          arr1: [1, 2],
          arr2: [1, 2, 3, 4],
          arr3: [1, 5],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            subset1: { $setIsSubset: ['$arr1', '$arr2'] },
            subset2: { $setIsSubset: ['$arr3', '$arr2'] },
          },
        },
      ]);

      expect(result[0].subset1).to.be.true;
      expect(result[0].subset2).to.be.false;
    });
  });

  describe('Boolean Array Operators', function () {
    it('should test $anyElementTrue operator', function () {
      const data = [
        {
          boolArray1: [false, true, false],
          boolArray2: [false, false, false],
          boolArray3: [true, true, true],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            any1: { $anyElementTrue: '$boolArray1' },
            any2: { $anyElementTrue: '$boolArray2' },
            any3: { $anyElementTrue: '$boolArray3' },
          },
        },
      ]);

      expect(result[0].any1).to.be.true;
      expect(result[0].any2).to.be.false;
      expect(result[0].any3).to.be.true;
    });

    it('should test $allElementsTrue operator', function () {
      const data = [
        {
          boolArray1: [false, true, false],
          boolArray2: [false, false, false],
          boolArray3: [true, true, true],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            all1: { $allElementsTrue: '$boolArray1' },
            all2: { $allElementsTrue: '$boolArray2' },
            all3: { $allElementsTrue: '$boolArray3' },
          },
        },
      ]);

      expect(result[0].all1).to.be.false;
      expect(result[0].all2).to.be.false;
      expect(result[0].all3).to.be.true;
    });
  });

  describe('Comparison Operators', function () {
    it('should test $cmp operator', function () {
      const data = [{ a: 5, b: 3, c: 5, d: 7 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            cmp1: { $cmp: ['$a', '$b'] }, // 5 vs 3 = 1
            cmp2: { $cmp: ['$a', '$c'] }, // 5 vs 5 = 0
            cmp3: { $cmp: ['$b', '$d'] }, // 3 vs 7 = -1
          },
        },
      ]);

      expect(result[0].cmp1).to.equal(1);
      expect(result[0].cmp2).to.equal(0);
      expect(result[0].cmp3).to.equal(-1);
    });

    it('should test comparison operators ($eq, $gt, $gte, $lt, $lte, $ne)', function () {
      const data = [{ a: 5, b: 3, c: 5 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            eq: { $eq: ['$a', '$c'] },
            ne: { $ne: ['$a', '$b'] },
            gt: { $gt: ['$a', '$b'] },
            gte: { $gte: ['$a', '$c'] },
            lt: { $lt: ['$b', '$a'] },
            lte: { $lte: ['$b', '$a'] },
          },
        },
      ]);

      expect(result[0].eq).to.be.true;
      expect(result[0].ne).to.be.true;
      expect(result[0].gt).to.be.true;
      expect(result[0].gte).to.be.true;
      expect(result[0].lt).to.be.true;
      expect(result[0].lte).to.be.true;
    });
  });

  describe('Arithmetic Operators', function () {
    it('should test $add operator with numbers', function () {
      const data = [{ a: 5, b: 3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            sum: { $add: ['$a', '$b', 2] },
          },
        },
      ]);

      expect(result[0].sum).to.equal(10);
    });

    it('should test $subtract operator', function () {
      const data = [{ a: 10, b: 3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            diff: { $subtract: ['$a', '$b'] },
          },
        },
      ]);

      expect(result[0].diff).to.equal(7);
    });

    it('should test $multiply operator', function () {
      const data = [{ a: 5, b: 3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            product: { $multiply: ['$a', '$b', 2] },
          },
        },
      ]);

      expect(result[0].product).to.equal(30);
    });

    it('should test $divide operator', function () {
      const data = [{ a: 15, b: 3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            quotient: { $divide: ['$a', '$b'] },
          },
        },
      ]);

      expect(result[0].quotient).to.equal(5);
    });

    it('should test $mod operator', function () {
      const data = [{ a: 17, b: 5 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            remainder: { $mod: ['$a', '$b'] },
          },
        },
      ]);

      expect(result[0].remainder).to.equal(2);
    });
  });

  describe('Math Operators', function () {
    it('should test $abs operator', function () {
      const data = [{ negative: -5, positive: 3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            absNeg: { $abs: '$negative' },
            absPos: { $abs: '$positive' },
          },
        },
      ]);

      expect(result[0].absNeg).to.equal(5);
      expect(result[0].absPos).to.equal(3);
    });

    it('should test $ceil operator', function () {
      const data = [{ value: 3.2 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            ceiling: { $ceil: '$value' },
          },
        },
      ]);

      expect(result[0].ceiling).to.equal(4);
    });

    it('should test $floor operator', function () {
      const data = [{ value: 3.8 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            floor: { $floor: '$value' },
          },
        },
      ]);

      expect(result[0].floor).to.equal(3);
    });

    it('should test $round operator', function () {
      const data = [{ value1: 3.2, value2: 3.8 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            round1: { $round: '$value1' },
            round2: { $round: '$value2' },
          },
        },
      ]);

      expect(result[0].round1).to.equal(3);
      expect(result[0].round2).to.equal(4);
    });

    it('should test $sqrt operator', function () {
      const data = [{ value: 16 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            squareRoot: { $sqrt: '$value' },
          },
        },
      ]);

      expect(result[0].squareRoot).to.equal(4);
    });

    it('should test $pow operator', function () {
      const data = [{ base: 2, exp: 3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            power: { $pow: ['$base', '$exp'] },
          },
        },
      ]);

      expect(result[0].power).to.equal(8);
    });
  });

  describe('Boolean Logic Operators', function () {
    it('should test $and operator', function () {
      const data = [
        {
          a: true,
          b: false,
          c: true,
          d: 1,
          e: 0,
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            and1: { $and: ['$a', '$c'] },
            and2: { $and: ['$a', '$b'] },
            and3: { $and: ['$d', '$e'] },
          },
        },
      ]);

      expect(result[0].and1).to.be.true;
      expect(result[0].and2).to.be.false;
      expect(result[0].and3).to.be.false;
    });

    it('should test $or operator', function () {
      const data = [
        {
          a: true,
          b: false,
          c: false,
          d: 1,
          e: 0,
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            or1: { $or: ['$a', '$b'] },
            or2: { $or: ['$b', '$c'] },
            or3: { $or: ['$d', '$e'] },
          },
        },
      ]);

      expect(result[0].or1).to.be.true;
      expect(result[0].or2).to.be.false;
      expect(result[0].or3).to.be.true;
    });

    it('should test $not operator', function () {
      const data = [
        {
          a: true,
          b: false,
          c: 0,
          d: 1,
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            not1: { $not: ['$a'] },
            not2: { $not: ['$b'] },
            not3: { $not: ['$c'] },
            not4: { $not: ['$d'] },
          },
        },
      ]);

      expect(result[0].not1).to.be.false;
      expect(result[0].not2).to.be.true;
      expect(result[0].not3).to.be.true;
      expect(result[0].not4).to.be.false;
    });
  });

  describe('String Operators', function () {
    it('should test $concat operator', function () {
      const data = [{ first: 'Hello', second: 'World' }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            greeting: { $concat: ['$first', ' ', '$second', '!'] },
          },
        },
      ]);

      expect(result[0].greeting).to.equal('Hello World!');
    });

    it('should test $toLower and $toUpper operators', function () {
      const data = [{ text: 'Hello World' }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            lower: { $toLower: '$text' },
            upper: { $toUpper: '$text' },
          },
        },
      ]);

      expect(result[0].lower).to.equal('hello world');
      expect(result[0].upper).to.equal('HELLO WORLD');
    });

    it('should test $substr operator', function () {
      const data = [{ text: 'Hello World' }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            substring: { $substr: ['$text', 0, 5] },
          },
        },
      ]);

      expect(result[0].substring).to.equal('Hello');
    });

    it('should test $strLen operator', function () {
      const data = [{ text: 'Hello World' }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            length: { $strLen: '$text' },
          },
        },
      ]);

      expect(result[0].length).to.equal(11);
    });

    it('should test $split operator', function () {
      const data = [{ text: 'Hello,World,Test' }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            parts: { $split: ['$text', ','] },
          },
        },
      ]);

      expect(result[0].parts).to.deep.equal(['Hello', 'World', 'Test']);
    });

    it('should test trim operators', function () {
      const data = [{ text: '  Hello World  ' }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            trimmed: { $trim: '$text' },
            ltrimmed: { $ltrim: '$text' },
            rtrimmed: { $rtrim: '$text' },
          },
        },
      ]);

      expect(result[0].trimmed).to.equal('Hello World');
      expect(result[0].ltrimmed).to.equal('Hello World  ');
      expect(result[0].rtrimmed).to.equal('  Hello World');
    });
  });

  describe('Array Operators', function () {
    it('should test $size operator', function () {
      const data = [{ arr1: [1, 2, 3], arr2: [] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            size1: { $size: '$arr1' },
            size2: { $size: '$arr2' },
          },
        },
      ]);

      expect(result[0].size1).to.equal(3);
      expect(result[0].size2).to.equal(0);
    });

    it('should test $arrayElemAt operator', function () {
      const data = [{ arr: ['a', 'b', 'c', 'd'] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            first: { $arrayElemAt: ['$arr', 0] },
            last: { $arrayElemAt: ['$arr', -1] },
            second: { $arrayElemAt: ['$arr', 1] },
          },
        },
      ]);

      expect(result[0].first).to.equal('a');
      expect(result[0].last).to.equal('d');
      expect(result[0].second).to.equal('b');
    });

    it('should test $concatArrays operator', function () {
      const data = [{ arr1: [1, 2], arr2: [3, 4], arr3: [5] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            combined: { $concatArrays: ['$arr1', '$arr2', '$arr3'] },
          },
        },
      ]);

      expect(result[0].combined).to.deep.equal([1, 2, 3, 4, 5]);
    });

    it('should test $slice operator', function () {
      const data = [{ arr: [1, 2, 3, 4, 5] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            slice1: { $slice: ['$arr', 2] },
            slice2: { $slice: ['$arr', 1, 3] },
          },
        },
      ]);

      expect(result[0].slice1).to.deep.equal([1, 2]);
      expect(result[0].slice2).to.deep.equal([2, 3, 4]);
    });

    it('should test $reverseArray operator', function () {
      const data = [{ arr: [1, 2, 3, 4, 5] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            reversed: { $reverseArray: '$arr' },
          },
        },
      ]);

      expect(result[0].reversed).to.deep.equal([5, 4, 3, 2, 1]);
    });

    it('should test $in operator for array membership', function () {
      const data = [{ item: 'b', arr: ['a', 'b', 'c'] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            found: { $in: ['$item', '$arr'] },
            notFound: { $in: ['z', '$arr'] },
          },
        },
      ]);

      expect(result[0].found).to.be.true;
      expect(result[0].notFound).to.be.false;
    });

    it('should test $indexOfArray operator', function () {
      const data = [{ arr: ['a', 'b', 'c', 'b'] }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            index1: { $indexOfArray: ['$arr', 'b'] },
            index2: { $indexOfArray: ['$arr', 'z'] },
          },
        },
      ]);

      expect(result[0].index1).to.equal(1); // First occurrence
      expect(result[0].index2).to.equal(-1); // Not found
    });
  });

  describe('Type Checking Operators', function () {
    it('should test $type operator', function () {
      const data = [
        {
          num: 42,
          str: 'hello',
          arr: [1, 2, 3],
          obj: { a: 1 },
          nullVal: null,
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            numType: { $type: '$num' },
            strType: { $type: '$str' },
            arrType: { $type: '$arr' },
            objType: { $type: '$obj' },
            nullType: { $type: '$nullVal' },
          },
        },
      ]);

      expect(result[0].numType).to.equal('number');
      expect(result[0].strType).to.equal('string');
      expect(result[0].arrType).to.equal('array');
      expect(result[0].objType).to.equal('object');
      expect(result[0].nullType).to.equal('null');
    });

    it('should test $isNumber and $isArray operators', function () {
      const data = [
        {
          num: 42,
          str: 'hello',
          arr: [1, 2, 3],
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            numIsNumber: { $isNumber: '$num' },
            strIsNumber: { $isNumber: '$str' },
            arrIsArray: { $isArray: '$arr' },
            numIsArray: { $isArray: '$num' },
          },
        },
      ]);

      expect(result[0].numIsNumber).to.be.true;
      expect(result[0].strIsNumber).to.be.false;
      expect(result[0].arrIsArray).to.be.true;
      expect(result[0].numIsArray).to.be.false;
    });
  });

  describe('Date Operators', function () {
    it('should test date extraction operators', function () {
      const testDate = new Date('2023-07-15T14:30:25.123Z');
      const data = [{ date: testDate }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            dayOfMonth: { $dayOfMonth: '$date' },
            dayOfYear: { $dayOfYear: '$date' },
            dayOfWeek: { $dayOfWeek: '$date' },
            hour: { $hour: '$date' },
            minute: { $minute: '$date' },
            second: { $second: '$date' },
          },
        },
      ]);

      expect(result[0].year).to.equal(2023);
      expect(result[0].month).to.equal(7);
      expect(result[0].dayOfMonth).to.equal(15);
      expect(result[0].hour).to.equal(14);
      expect(result[0].minute).to.equal(30);
      expect(result[0].second).to.equal(25);
    });
  });

  describe('Advanced Conditional Operators', function () {
    it('should test $coalesce operator', function () {
      const data = [
        {
          first: null,
          second: undefined,
          third: 'valid',
          fourth: 'backup',
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            result: { $coalesce: ['$first', '$second', '$third', '$fourth'] },
          },
        },
      ]);

      expect(result[0].result).to.equal('valid');
    });
  });

  describe('Object Operators', function () {
    it('should test $mergeObjects operator', function () {
      const data = [
        {
          obj1: { a: 1, b: 2 },
          obj2: { b: 3, c: 4 },
          obj3: { d: 5 },
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            merged: { $mergeObjects: ['$obj1', '$obj2', '$obj3'] },
          },
        },
      ]);

      expect(result[0].merged).to.deep.equal({ a: 1, b: 3, c: 4, d: 5 });
    });
  });

  describe('Additional Math and String Operators', function () {
    it('should test $trunc operator', function () {
      const data = [{ value1: 3.7, value2: -2.3 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            trunc1: { $trunc: '$value1' },
            trunc2: { $trunc: '$value2' },
          },
        },
      ]);

      expect(result[0].trunc1).to.equal(3);
      expect(result[0].trunc2).to.equal(-2);
    });

    it('should test $toString operator', function () {
      const data = [
        {
          num: 42,
          bool: true,
          nullVal: null,
          undefinedVal: undefined,
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            strNum: { $toString: '$num' },
            strBool: { $toString: '$bool' },
            strNull: { $toString: '$nullVal' },
            strUndef: { $toString: '$undefinedVal' },
          },
        },
      ]);

      expect(result[0].strNum).to.equal('42');
      expect(result[0].strBool).to.equal('true');
      expect(result[0].strNull).to.equal('');
      expect(result[0].strUndef).to.equal('');
    });
  });

  describe('Conditional Operators', function () {
    it('should test $cond operator', function () {
      const data = [{ age: 18, score: 85 }];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            adult: {
              $cond: {
                if: { $gte: ['$age', 18] },
                then: 'Adult',
                else: 'Minor',
              },
            },
            grade: {
              $cond: {
                if: { $gte: ['$score', 90] },
                then: 'A',
                else: 'B',
              },
            },
          },
        },
      ]);

      expect(result[0].adult).to.equal('Adult');
      expect(result[0].grade).to.equal('B');
    });

    it('should test $ifNull operator', function () {
      const data = [
        {
          name: 'Alice',
          nickname: null,
          age: 25,
          title: undefined,
        },
      ];

      const result = Aggo.aggregate(data, [
        {
          $project: {
            displayName: { $ifNull: ['$nickname', '$name'] },
            displayTitle: { $ifNull: ['$title', 'No Title'] },
          },
        },
      ]);

      expect(result[0].displayName).to.equal('Alice');
      expect(result[0].displayTitle).to.equal('No Title');
    });
  });
});
