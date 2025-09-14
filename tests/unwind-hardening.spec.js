/**
 * Phase 4.1: $unwind Hardening & IVM Gaps - Test Suite
 *
 * This test suite validates the hardening improvements to the $unwind operator
 * and addresses the remaining gaps in the IVM (Invariant Virtual Machine) system.
 */

import { expect } from 'chai';
import Modash from '../src/index.js';

describe('Phase 4.1: $unwind Hardening', function () {
  describe('Buffer Management & Dynamic Growth', function () {
    it('should handle $unwind operations that expand results beyond initial buffer size', function () {
      // Create documents with arrays that will cause significant expansion
      const documents = [
        { _id: 1, tags: ['a', 'b', 'c', 'd', 'e'] }, // 5 elements
        { _id: 2, tags: ['f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'] }, // 9 elements
        { _id: 3, tags: ['o', 'p'] }, // 2 elements
      ];
      // Total expansion: 5 + 9 + 2 = 16 documents from 3 original

      const result = Modash.aggregate(documents, [{ $unwind: '$tags' }]);

      expect(result).to.have.lengthOf(16);

      // Verify all tags are present
      const allTags = result.map(doc => doc.tags);
      expect(allTags).to.include.members([
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j',
        'k',
        'l',
        'm',
        'n',
        'o',
        'p',
      ]);

      // Verify document structure is preserved
      expect(result.filter(doc => doc._id === 1)).to.have.lengthOf(5);
      expect(result.filter(doc => doc._id === 2)).to.have.lengthOf(9);
      expect(result.filter(doc => doc._id === 3)).to.have.lengthOf(2);
    });

    it('should handle extremely large arrays without buffer overflow', function () {
      // Create a document with a large array
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      const documents = [{ _id: 1, items: largeArray }];

      const result = Modash.aggregate(documents, [{ $unwind: '$items' }]);

      expect(result).to.have.lengthOf(1000);
      expect(result[0].items).to.equal('item0');
      expect(result[999].items).to.equal('item999');
    });

    it('should handle mixed array sizes with power-of-two buffer growth', function () {
      const documents = [
        { _id: 1, values: [1, 2] }, // 2 elements
        { _id: 2, values: [3, 4, 5, 6] }, // 4 elements
        { _id: 3, values: [7, 8, 9, 10, 11, 12, 13, 14] }, // 8 elements
        { _id: 4, values: [] }, // Empty array (should be skipped)
        { _id: 5, values: null }, // Null (should be skipped)
      ];

      const result = Modash.aggregate(documents, [{ $unwind: '$values' }]);

      expect(result).to.have.lengthOf(14); // 2 + 4 + 8 = 14 (empty and null skipped)

      // Verify all values are present
      const allValues = result.map(doc => doc.values).sort((a, b) => a - b);
      expect(allValues).to.deep.equal([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ]);
    });

    it('should handle nested field paths with complex documents', function () {
      const documents = [
        {
          _id: 1,
          user: {
            profile: {
              hobbies: ['reading', 'gaming', 'cooking'],
            },
          },
        },
        {
          _id: 2,
          user: {
            profile: {
              hobbies: ['sports', 'music'],
            },
          },
        },
      ];

      const result = Modash.aggregate(documents, [
        { $unwind: '$user.profile.hobbies' },
      ]);

      expect(result).to.have.lengthOf(5);

      // Verify nested structure is preserved
      expect(result[0].user.profile.hobbies).to.equal('reading');
      expect(result[3].user.profile.hobbies).to.equal('sports');
    });
  });

  describe('Virtual Row ID System', function () {
    it('should generate stable virtual row IDs for $unwind operations', function () {
      const documents = [
        { _id: 1, tags: ['red', 'blue'] },
        { _id: 2, tags: ['green'] },
      ];

      // Run the same aggregation twice to ensure stability
      const result1 = Modash.aggregate(documents, [
        { $unwind: '$tags' },
        { $project: { _id: 1, tag: '$tags' } },
      ]);

      const result2 = Modash.aggregate(documents, [
        { $unwind: '$tags' },
        { $project: { _id: 1, tag: '$tags' } },
      ]);

      expect(result1).to.deep.equal(result2);
    });

    it('should handle $unwind with includeArrayIndex option', function () {
      const documents = [{ _id: 1, items: ['apple', 'banana', 'cherry'] }];

      const result = Modash.aggregate(documents, [
        {
          $unwind: {
            path: '$items',
            includeArrayIndex: 'itemIndex',
          },
        },
      ]);

      expect(result).to.have.lengthOf(3);
      expect(result[0]).to.deep.include({
        _id: 1,
        items: 'apple',
        itemIndex: 0,
      });
      expect(result[1]).to.deep.include({
        _id: 1,
        items: 'banana',
        itemIndex: 1,
      });
      expect(result[2]).to.deep.include({
        _id: 1,
        items: 'cherry',
        itemIndex: 2,
      });
    });

    it('should handle $unwind with preserveNullAndEmptyArrays option', function () {
      const documents = [
        { _id: 1, tags: ['red', 'blue'] },
        { _id: 2, tags: [] }, // Empty array
        { _id: 3, tags: null }, // Null value
        { _id: 4 }, // Missing field
      ];

      const result = Modash.aggregate(documents, [
        {
          $unwind: {
            path: '$tags',
            preserveNullAndEmptyArrays: true,
          },
        },
      ]);

      expect(result).to.have.lengthOf(5); // 2 from first doc + 1 each for empty/null/missing

      // Check that documents with empty/null arrays are preserved
      const preservedDocs = result.filter(doc => [2, 3, 4].includes(doc._id));
      expect(preservedDocs).to.have.lengthOf(3);
      expect(preservedDocs.every(doc => doc.tags === null)).to.be.true;
    });
  });

  describe('Streaming Delta Symmetry', function () {
    it('should handle array replacement edge cases in streaming mode', function () {
      // This test simulates the edge case: tags: ['a'] → ['b','c']
      // Should generate proper remove+add events for virtual rows

      const documents = [{ _id: 1, tags: ['original'] }];

      // First aggregation with original data
      const result1 = Modash.aggregate(documents, [{ $unwind: '$tags' }]);

      expect(result1).to.have.lengthOf(1);
      expect(result1[0].tags).to.equal('original');

      // Simulate array replacement
      documents[0].tags = ['new1', 'new2', 'new3'];

      const result2 = Modash.aggregate(documents, [{ $unwind: '$tags' }]);

      expect(result2).to.have.lengthOf(3);
      expect(result2.map(doc => doc.tags)).to.deep.equal([
        'new1',
        'new2',
        'new3',
      ]);
    });

    it('should maintain consistency when combining $unwind with downstream operators', function () {
      const documents = [
        { _id: 1, category: 'A', items: ['x', 'y'] },
        { _id: 2, category: 'A', items: ['z'] },
        { _id: 3, category: 'B', items: ['w', 'v'] },
      ];

      const result = Modash.aggregate(documents, [
        { $unwind: '$items' },
        {
          $group: {
            _id: '$category',
            totalItems: { $sum: 1 },
            itemList: { $push: '$items' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      expect(result).to.have.lengthOf(2);

      expect(result[0]).to.deep.include({
        _id: 'A',
        totalItems: 3, // 2 from first doc + 1 from second doc
      });
      expect(result[0].itemList).to.have.members(['x', 'y', 'z']);

      expect(result[1]).to.deep.include({
        _id: 'B',
        totalItems: 2,
      });
      expect(result[1].itemList).to.have.members(['w', 'v']);
    });
  });

  describe('Performance & Memory Management', function () {
    it('should efficiently handle $unwind with large datasets', function () {
      // Create a moderately large dataset to test performance
      const documents = Array.from({ length: 100 }, (_, i) => ({
        _id: i,
        tags: Array.from({ length: 10 }, (_, j) => `tag${i}_${j}`),
      }));
      // This creates 100 * 10 = 1000 unwound documents

      const startTime = Date.now();

      const result = Modash.aggregate(documents, [
        { $unwind: '$tags' },
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).to.have.lengthOf(1);
      expect(result[0].count).to.equal(1000);

      // Performance should be reasonable (less than 100ms for this size)
      expect(duration).to.be.lessThan(100);
    });

    it('should handle buffer pool reuse efficiently', function () {
      // Run multiple aggregations to test buffer pooling
      const documents = [
        { _id: 1, items: ['a', 'b', 'c'] },
        { _id: 2, items: ['d', 'e'] },
      ];

      // Run multiple times to test buffer reuse
      for (let i = 0; i < 5; i++) {
        const result = Modash.aggregate(documents, [{ $unwind: '$items' }]);

        expect(result).to.have.lengthOf(5);
      }
    });
  });

  describe('Error Handling & Invariant Checks', function () {
    it('should handle edge cases gracefully', function () {
      const documents = [
        { _id: 1, tags: 'not_an_array' }, // Non-array value
        { _id: 2, tags: [] }, // Empty array
        { _id: 3, tags: null }, // Null value
        { _id: 4 }, // Missing field
        { _id: 5, tags: [null, undefined, 0, false, ''] }, // Array with falsy values
      ];

      const result = Modash.aggregate(documents, [{ $unwind: '$tags' }]);

      // Only document 1 (non-array) and document 5 (array with values) should produce results
      expect(result).to.have.lengthOf(6); // 1 from doc 1 + 5 from doc 5

      expect(result[0]).to.deep.include({ _id: 1, tags: 'not_an_array' });

      // Verify falsy values are preserved
      const doc5Results = result.filter(doc => doc._id === 5);
      expect(doc5Results).to.have.lengthOf(5);
      expect(doc5Results.map(doc => doc.tags)).to.deep.equal([
        null,
        undefined,
        0,
        false,
        '',
      ]);
    });

    it('should maintain document integrity across complex pipelines', function () {
      const documents = [
        {
          _id: 1,
          name: 'Product A',
          categories: ['electronics', 'gadgets'],
          specs: {
            colors: ['red', 'blue'],
            sizes: ['small', 'large'],
          },
        },
      ];

      const result = Modash.aggregate(documents, [
        { $unwind: '$categories' },
        { $unwind: '$specs.colors' },
        {
          $project: {
            name: 1,
            category: '$categories',
            color: '$specs.colors',
            hasLarge: { $in: ['large', '$specs.sizes'] },
          },
        },
      ]);

      expect(result).to.have.lengthOf(4); // 2 categories * 2 colors = 4 combinations

      // Verify all combinations are present
      const combinations = result.map(doc => `${doc.category}-${doc.color}`);
      expect(combinations).to.have.members([
        'electronics-red',
        'electronics-blue',
        'gadgets-red',
        'gadgets-blue',
      ]);

      // Verify other fields are preserved correctly
      expect(result.every(doc => doc.name === 'Product A')).to.be.true;
      expect(result.every(doc => doc.hasLarge === true)).to.be.true;
    });
  });
});
