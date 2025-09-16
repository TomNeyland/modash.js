// Native implementation of mapValues
const mapValues = (obj, mapFn) => {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = mapFn(value, key);
  }
  return result;
};

import { expect } from 'chai';
import Aggo from '../src/index';
import testData from './test-data.js';
import { $project } from '../src/aggo/aggregation';

let _db;

beforeEach(() => {
  // Create a simple wrapper for test data
  const createCollection = data => ({
    aggregate: pipeline => Aggo.aggregate(data, pipeline),
    value: () => data,
  });

  _db = mapValues(testData, data => createCollection(data));
});

describe('Aggo Boolean Operator', () => {
  describe('$and', () => {
    it('should apply a boolean AND to its arguments', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        result: {
          $and: [{ $gt: ['$qty', 100] }, { $lt: ['$qty', 250] }],
        },
      });

      expect(projection).to.have.lengthOf(5);
      expect(projection[1].result).to.equal(true); // qty: 200, between 100-250
    });
  });

  describe('$or', () => {
    it('should apply a boolean OR to its arguments', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        result: {
          $or: [{ $gt: ['$qty', 250] }, { $lt: ['$qty', 200] }],
        },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$not', () => {
    it('should apply a boolean NOT to its arguments', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        result: {
          $not: [{ $gt: ['$qty', 250] }],
        },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });
});

describe('Aggo Set Operator', () => {
  describe('$setEquals', () => {
    it('should compare sets', () => {
      const projection = $project(testData.experiments, {
        result: { $setEquals: ['$A', '$B'] },
      });

      expect(projection).to.have.lengthOf(9);
      expect(projection[0].result).to.equal(true);
    });
  });

  describe('$setIntersection', () => {
    it('should intersect sets', () => {
      const projection = $project(testData.experiments, {
        result: { $setIntersection: ['$A', '$B'] },
      });

      expect(projection).to.have.lengthOf(9);
    });
  });

  describe('$setUnion', () => {
    it('should union sets', () => {
      const projection = $project(testData.experiments, {
        result: { $setUnion: ['$A', '$B'] },
      });

      expect(projection).to.have.lengthOf(9);
    });
  });

  describe('$setDifference', () => {
    it('should difference sets', () => {
      const projection = $project(testData.experiments, {
        result: { $setDifference: ['$B', '$A'] },
      });

      expect(projection).to.have.lengthOf(9);
    });
  });

  describe('$setIsSubset', () => {
    it('should detect subsets', () => {
      const projection = $project(testData.experiments, {
        result: { $setIsSubset: ['$A', '$B'] },
      });

      expect(projection).to.have.lengthOf(9);
    });
  });

  describe('$anyElementTrue', () => {
    it('should OR the elements of an array', () => {
      const projection = $project(testData.survey, {
        result: { $anyElementTrue: ['$responses'] },
      });

      expect(projection).to.have.lengthOf(10);
    });
  });

  describe('$allElementsTrue', () => {
    it('should AND the elements of an array', () => {
      const projection = $project(testData.survey, {
        result: { $allElementsTrue: ['$responses'] },
      });

      expect(projection).to.have.lengthOf(10);
    });
  });
});

describe('Aggo Comparison Operator', () => {
  describe('$cmp', () => {
    it("should return -1, 0, 1 based on mongodb's comparison rules", () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        cmpTo250: { $cmp: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$eq', () => {
    it('should return compare two values for equality', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        qtyEq250: { $eq: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$gt', () => {
    it('should check if the first argument is greater than the second argument', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        qtyGt250: { $gt: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$gte', () => {
    it('should check if the first argument is greater than or equal to the second argument', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        qtyGte250: { $gte: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$lt', () => {
    it('should check if the first argument is less than the second argument', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        qtyLt250: { $lt: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$lte', () => {
    it('should check if the first argument is less than or equal to the second argument', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        qtyLte250: { $lte: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });

  describe('$ne', () => {
    it('should check if the first argument is less than or equal to the second argument', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        qty: 1,
        qtyNe250: { $ne: ['$qty', 250] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });
});

describe('Aggo Arithmetic Operator', () => {
  describe('$add', () => {
    it('should add all of its arguments', () => {
      const projection = $project(testData.sales, {
        item: 1,
        total: { $add: ['$price', '$fee'] },
      });

      expect(projection).to.have.lengthOf(3);
    });

    it('should return an offset date when adding numbers and dates', () => {
      const projection = $project(testData.sales, {
        item: 1,
        billing_date: { $add: ['$date', 3 * 24 * 60 * 60 * 1000] },
      });

      expect(projection).to.have.lengthOf(3);
    });
  });

  describe('$subtract', () => {
    it('should subtract its second argument from its first argument', () => {
      const projection = $project(testData.sales, {
        item: 1,
        total: { $subtract: [{ $add: ['$price', '$fee'] }, '$discount'] },
      });

      expect(projection).to.have.lengthOf(3);
    });

    it('should return an timedelta in miliseconds when subtracting two dates', () => {
      const projection = $project(testData.sales, {
        item: 1,
        dateDifference: {
          $subtract: [new Date('2014-03-01T08:00:00Z'), '$date'],
        },
      });

      expect(projection).to.have.lengthOf(3);
    });

    it('should subtact miliseconds from a date', () => {
      const projection = $project(testData.sales, {
        item: 1,
        dateDifference: { $subtract: ['$date', 5 * 60 * 1000] },
      });

      expect(projection).to.have.lengthOf(3);
    });
  });

  describe('$multiply', () => {
    it('should multiply all of its arguments', () => {
      const projection = $project(testData.sales, {
        item: 1,
        total: { $multiply: ['$price', '$quantity'] },
      });

      expect(projection).to.have.lengthOf(3);
    });
  });

  describe('$divide', () => {
    it('should divide its first argument by its second argument', () => {
      const projection = $project(testData.planning, {
        name: 1,
        workdays: { $divide: ['$hours', 8] },
      });

      expect(projection).to.have.lengthOf(2);
    });
  });

  describe('$mod', () => {
    it('should divide its first argument by its second argument and return the remainder', () => {
      const projection = $project(testData.planning, {
        name: 1,
        remainder: { $mod: ['$hours', '$tasks'] },
      });

      expect(projection).to.have.lengthOf(2);
    });
  });
});

describe('Aggo String Operator', () => {
  describe('$concat', () => {
    it('should concatenate strings and return the concatenated string.', () => {
      const projection = $project(testData.inventory, {
        item: 1,
        itemDescription: { $concat: ['$item', ' - ', '$description'] },
      });

      expect(projection).to.have.lengthOf(5);
    });
  });
});
