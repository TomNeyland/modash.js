// Native implementation of mapValues
const mapValues = (obj, mapFn) => {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = mapFn(value, key);
  }
  return result;
};

import Modash from '../src/index.ts';
import { createStreamingCollection, aggregateStreaming } from '../src/modash/streaming.js';
import testData from './test-data.js';
import { expect } from 'chai';

let db;

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

beforeEach(() => {
  // Modern approach: create a simple wrapper instead of using _.mixin
  const createCollection = data => ({
    aggregate: pipeline => Modash.aggregate(data, pipeline),
    value: () => data,
    first: () => data[0],
  });

  db = mapValues(testData, data => createCollection(data));
});

describe('Modash Aggregation', () => {
  describe('$group', () => {
    const groupingConfig = {
      _id: {
        month: {
          $month: '$date',
        },
        day: {
          $dayOfMonth: '$date',
        },
        year: {
          $year: '$date',
        },
      },
      totalPrice: {
        $sum: {
          $multiply: ['$price', '$quantity'],
        },
      },
      averageQuantity: {
        $avg: '$quantity',
      },
      count: {
        $sum: 1,
      },
    };
    const nullGroupingConfig = { ...groupingConfig, _id: null };
    const distinctConfig = { _id: '$item' };
    const titleByAuthorConfig = {
      _id: '$author',
      books: {
        $push: '$title',
      },
    };

    it('should group the documents by the month, day, and year and calculate the total price and the average quantity as well as counts the documents per each group', () => {
      const pipeline = [{ $group: groupingConfig }];
      const expectedResult = [
        {
          _id: {
            month: 3,
            day: 1,
            year: 2014,
          },
          totalPrice: 40,
          averageQuantity: 1.5,
          count: 2,
        },
        {
          _id: {
            month: 3,
            day: 15,
            year: 2014,
          },
          totalPrice: 50,
          averageQuantity: 10,
          count: 1,
        },
        {
          _id: {
            month: 4,
            day: 4,
            year: 2014,
          },
          totalPrice: 200,
          averageQuantity: 15,
          count: 2,
        },
      ];

      // Test traditional aggregation
      const grouping = db.sales2.aggregate(pipeline);
      expect(grouping).to.deep.equal(expectedResult);

      // Test streaming vs non-streaming results are identical
      const results = compareStreamingResults(db.sales2.value(), pipeline, 'group by date fields');
      expect(results.streaming).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingArray).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingCollection).to.deep.equal(results.nonStreaming);
      expect(results.streaming).to.deep.equal(expectedResult);
    });

    it('should calculate the total price and the average quantity as well as counts for all documents in the collection', () => {
      const pipeline = [{ $group: nullGroupingConfig }];
      const expectedResult = [
        {
          _id: null,
          totalPrice: 290,
          averageQuantity: 8.6,
          count: 5,
        },
      ];

      // Test traditional aggregation
      const nullGrouping = db.sales2.aggregate(pipeline);
      expect(nullGrouping).to.deep.equal(expectedResult);

      // Test streaming vs non-streaming results are identical
      const results = compareStreamingResults(db.sales2.value(), pipeline, 'null grouping');
      expect(results.streaming).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingArray).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingCollection).to.deep.equal(results.nonStreaming);
      expect(results.streaming).to.deep.equal(expectedResult);
    });

    it('should group the documents by the item to retrieve the distinct item values', () => {
      const pipeline = [{ $group: distinctConfig }];
      const expectedResult = [
        {
          _id: 'abc',
        },
        {
          _id: 'jkl',
        },
        {
          _id: 'xyz',
        },
      ];

      // Test traditional aggregation
      const distinctGrouping = db.sales2.aggregate(pipeline);
      expect(distinctGrouping).to.deep.equal(expectedResult);

      // Test streaming vs non-streaming results are identical
      const results = compareStreamingResults(db.sales2.value(), pipeline, 'distinct values');
      expect(results.streaming).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingArray).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingCollection).to.deep.equal(results.nonStreaming);
      expect(results.streaming).to.deep.equal(expectedResult);
    });

    it('should pivot the data in the books collection to have titles grouped by authors', () => {
      const pipeline = [{ $group: titleByAuthorConfig }];
      
      // Test traditional aggregation
      const pivotGrouping = db.books2.aggregate(pipeline).reverse();
      const expectedResult = [
        {
          _id: 'Homer',
          books: ['The Odyssey', 'Iliad'],
        },
        {
          _id: 'Dante',
          books: ['The Banquet', 'Divine Comedy', 'Eclogues'],
        },
      ];
      expect(pivotGrouping).to.deep.equal(expectedResult);

      // Test streaming vs non-streaming results are identical (without reverse, since order may vary)
      const results = compareStreamingResults(db.books2.value(), pipeline, 'books by author');
      
      // For this test, we'll compare sorted versions since $group order is not guaranteed
      const sortByAuthor = (arr) => [...arr].sort((a, b) => a._id.localeCompare(b._id));
      expect(sortByAuthor(results.streaming)).to.deep.equal(sortByAuthor(results.nonStreaming));
      expect(sortByAuthor(results.aggregateStreamingArray)).to.deep.equal(sortByAuthor(results.nonStreaming));
      expect(sortByAuthor(results.aggregateStreamingCollection)).to.deep.equal(sortByAuthor(results.nonStreaming));
    });

    it('should use the $$ROOT system variable to group the documents by authors.', () => {
      const pipeline = [
        {
          $group: {
            _id: '$author',
            books: {
              $push: '$$ROOT',
            },
          },
        },
      ];

      // Test traditional aggregation
      const pivotGrouping = db.books2.aggregate(pipeline).reverse();
      const expectedResult = [
        {
          _id: 'Homer',
          books: [
            {
              _id: 7000,
              title: 'The Odyssey',
              author: 'Homer',
              copies: 10,
            },
            {
              _id: 7020,
              title: 'Iliad',
              author: 'Homer',
              copies: 10,
            },
          ],
        },
        {
          _id: 'Dante',
          books: [
            {
              _id: 8751,
              title: 'The Banquet',
              author: 'Dante',
              copies: 2,
            },
            {
              _id: 8752,
              title: 'Divine Comedy',
              author: 'Dante',
              copies: 1,
            },
            {
              _id: 8645,
              title: 'Eclogues',
              author: 'Dante',
              copies: 2,
            },
          ],
        },
      ];
      expect(pivotGrouping).to.deep.equal(expectedResult);

      // Test streaming vs non-streaming results are identical (compare sorted versions)
      const results = compareStreamingResults(db.books2.value(), pipeline, '$$ROOT grouping');
      
      // Sort by author ID for consistent comparison (since $group order is not guaranteed)
      const sortByAuthor = (arr) => [...arr].sort((a, b) => a._id.localeCompare(b._id));
      expect(sortByAuthor(results.streaming)).to.deep.equal(sortByAuthor(results.nonStreaming));
      expect(sortByAuthor(results.aggregateStreamingArray)).to.deep.equal(sortByAuthor(results.nonStreaming));
      expect(sortByAuthor(results.aggregateStreamingCollection)).to.deep.equal(sortByAuthor(results.nonStreaming));
    });
  });

  describe('$project', () => {
    it('should include specific fields in output documents', () => {
      const pipeline = [{
        $project: {
          title: 1,
          author: 1,
        },
      }];

      // Test traditional aggregation
      const projection = db.BOOKS.aggregate(pipeline);
      const expectedFirstResult = {
        _id: 1,
        title: 'abc123',
        author: {
          last: 'zzz',
          first: 'aaa',
        },
      };
      expect(projection[0]).to.deep.equal(expectedFirstResult);

      // Test streaming vs non-streaming results are identical
      const results = compareStreamingResults(db.BOOKS.value(), pipeline, '$project with inclusion');
      expect(results.streaming).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingArray).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingCollection).to.deep.equal(results.nonStreaming);
      expect(results.streaming[0]).to.deep.equal(expectedFirstResult);
    });

    it('should suppress _id field in the output documents', () => {
      const pipeline = [{
        $project: {
          _id: 0,
          title: 1,
          author: 1,
        },
      }];

      // Test traditional aggregation
      const projection = db.BOOKS.aggregate(pipeline);
      const expectedFirstResult = {
        title: 'abc123',
        author: {
          last: 'zzz',
          first: 'aaa',
        },
      };
      expect(projection[0]).to.deep.equal(expectedFirstResult);

      // Test streaming vs non-streaming results are identical
      const results = compareStreamingResults(db.BOOKS.value(), pipeline, '$project with _id suppression');
      expect(results.streaming).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingArray).to.deep.equal(results.nonStreaming);
      expect(results.aggregateStreamingCollection).to.deep.equal(results.nonStreaming);
      expect(results.streaming[0]).to.deep.equal(expectedFirstResult);
    });

    it('should include specific fields from embedded documents using dot notation', () => {
      const projection = db.BOOKMARKS.aggregate({
        $project: {
          'stop.title': 1,
        },
      });

      expect(projection).to.deep.equal([
        {
          _id: 1,
          stop: {
            title: 'book1',
          },
        },
        {
          _id: 2,
          stop: [
            {
              title: 'book2',
            },
            {
              title: 'book3',
            },
          ],
        },
      ]);
    });

    it('should include specific fields from embedded documents using object notation', () => {
      const projection = db.BOOKMARKS.aggregate({
        $project: {
          stop: {
            title: 1,
          },
        },
      });

      expect(projection).to.deep.equal([
        {
          _id: 1,
          stop: {
            title: 'book1',
          },
        },
        {
          _id: 2,
          stop: [
            {
              title: 'book2',
            },
            {
              title: 'book3',
            },
          ],
        },
      ]);
    });

    it('should include computed fields', () => {
      const projection = db.BOOKS.aggregate({
        $project: {
          title: 1,
          isbn: {
            prefix: {
              $substr: ['$isbn', 0, 3],
            },
            group: {
              $substr: ['$isbn', 3, 2],
            },
            publisher: {
              $substr: ['$isbn', 5, 4],
            },
            title: {
              $substr: ['$isbn', 9, 3],
            },
            checkDigit: {
              $substr: ['$isbn', 12, 1],
            },
          },
          lastName: '$author.last',
          copiesSold: '$copies',
        },
      });

      expect(projection[0]).to.deep.equal({
        _id: 1,
        title: 'abc123',
        isbn: {
          prefix: '000',
          group: '11',
          publisher: '2222',
          title: '333',
          checkDigit: '4',
        },
        lastName: 'zzz',
        copiesSold: 5,
      });
    });
  });
});
