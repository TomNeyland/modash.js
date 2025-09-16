/**
 * Phase 3.5: Text & Regex Prefiltering Tests
 *
 * Tests for Bloom filter-based text search and regex acceleration
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import Aggo from '../src/index';
import {
  $text,
  getTextSearchStats,
  resetTextSearchStats,
  configureTextSearch,
  clearTextSearchIndex,
} from '../src/aggo/text-search';
import {
  enhancedRegexMatch,
  getRegexSearchStats,
  resetRegexSearchStats,
  analyzeRegexPattern,
  configureRegexSearch,
  clearRegexSearchIndex,
} from '../src/aggo/regex-search';
import {
  BloomFilter,
  extractTokens,
  extractTrigrams,
  extractLiteralsFromRegex,
} from '../src/aggo/bloom-filter';

describe('Phase 3.5: Text & Regex Prefiltering', () => {
  // Test data
  const documents = [
    {
      _id: 1,
      title: 'JavaScript Programming Guide',
      content: 'Learn modern JavaScript features including async await',
    },
    {
      _id: 2,
      title: 'Python Data Science',
      content: 'Data analysis with pandas and numpy libraries',
    },
    {
      _id: 3,
      title: 'Web Development',
      content: 'HTML CSS JavaScript for modern web applications',
    },
    {
      _id: 4,
      title: 'Machine Learning Basics',
      content: 'Introduction to ML algorithms and data processing',
    },
    {
      _id: 5,
      title: 'Database Design',
      content: 'SQL and NoSQL database design patterns',
    },
  ];

  beforeEach(() => {
    resetTextSearchStats();
    resetRegexSearchStats();
    clearTextSearchIndex();
    clearRegexSearchIndex();
  });

  describe('Bloom Filter Infrastructure', () => {
    it('should create Bloom filter with correct parameters', () => {
      const filter = new BloomFilter(256, 3);
      const stats = filter.getStats();

      expect(stats.sizeInBytes).to.equal(256);
      expect(stats.sizeInBits).to.equal(256 * 8);
      expect(stats.hashCount).to.equal(3);
      expect(stats.addedCount).to.equal(0);
    });

    it('should add and test items correctly', () => {
      const filter = new BloomFilter(256, 3);

      filter.add('javascript');
      filter.add('programming');

      expect(filter.test('javascript')).to.be.true;
      expect(filter.test('programming')).to.be.true;
      expect(filter.test('nonexistent')).to.be.false; // This could be false positive
    });

    it('should extract tokens correctly', () => {
      const tokens = extractTokens('JavaScript Programming Guide 123');
      expect(tokens).to.include('javascript');
      expect(tokens).to.include('programming');
      expect(tokens).to.include('guide');
      expect(tokens).to.include('123'); // Numbers are valid tokens
      expect(tokens).to.not.include('x'); // Single characters should be filtered
    });

    it('should extract trigrams correctly', () => {
      const trigrams = extractTrigrams('javascript');
      expect(trigrams).to.include('jav');
      expect(trigrams).to.include('ava');
      expect(trigrams).to.include('vas');
      expect(trigrams).to.include('asc');
      expect(trigrams.length).to.equal(8); // 'javascript' has 8 trigrams
    });

    it('should extract literals from regex patterns', () => {
      const literals = extractLiteralsFromRegex('test.*pattern[0-9]+end');
      expect(literals).to.include('test');
      expect(literals).to.include('pattern');
      expect(literals).to.include('end');
      expect(literals).to.not.include('.*');
      expect(literals).to.not.include('[0-9]');
    });
  });

  describe('$text Operator', () => {
    it('should perform basic text search', () => {
      const results = $text(documents, 'javascript programming');

      expect(results).to.have.length.greaterThan(0);
      expect(results.some(doc => doc._id === 1)).to.be.true; // Should find the JS doc
    });

    it('should handle empty queries gracefully', () => {
      const results = $text(documents, '');
      expect(results).to.have.length(0);
    });

    it('should handle single token queries', () => {
      const results = $text(documents, 'javascript');
      expect(results).to.have.length.greaterThan(0);
      expect(results.some(doc => doc._id === 1 || doc._id === 3)).to.be.true;
    });

    it('should collect statistics', () => {
      $text(documents, 'javascript programming');
      $text(documents, 'data science');

      const stats = getTextSearchStats();
      expect(stats.totalQueries).to.equal(2);
    });

    it('should support configuration changes', () => {
      configureTextSearch({ minQueryTokens: 1 });

      const results = $text(documents, 'javascript'); // Single token
      expect(results).to.have.length.greaterThan(0);
    });
  });

  describe('Enhanced $regex Operator', () => {
    it('should perform enhanced regex matching', () => {
      const results = enhancedRegexMatch(
        documents,
        'title',
        'JavaScript.*Guide'
      );

      expect(results).to.have.length(1);
      expect(results[0]._id).to.equal(1);
    });

    it('should handle case-insensitive regex', () => {
      const results = enhancedRegexMatch(
        documents,
        'title',
        'javascript.*guide',
        'i'
      );

      expect(results).to.have.length(1);
      expect(results[0]._id).to.equal(1);
    });

    it('should collect statistics for regex operations', () => {
      enhancedRegexMatch(documents, 'title', 'JavaScript.*Guide');
      enhancedRegexMatch(documents, 'content', 'data.*analysis');

      const stats = getRegexSearchStats();
      expect(stats.totalQueries).to.equal(2);
    });

    it('should analyze regex patterns correctly', () => {
      const analysis = analyzeRegexPattern('test.*pattern[0-9]+end');

      expect(analysis.literals).to.include('test');
      expect(analysis.literals).to.include('pattern');
      expect(analysis.literals).to.include('end');
      expect(analysis.suitableForBloom).to.be.true;
    });

    it('should detect unsuitable patterns', () => {
      const analysis = analyzeRegexPattern('.*'); // No literals
      expect(analysis.suitableForBloom).to.be.false;
    });

    it('should handle invalid regex patterns gracefully', () => {
      const results = enhancedRegexMatch(documents, 'title', '[invalid'); // Malformed regex
      expect(results).to.have.length(0);
    });
  });

  describe('Integration with $match operator', () => {
    it('should work with $text in aggregation pipeline', () => {
      const results = Aggo.aggregate(documents, [
        { $match: { $text: 'javascript programming' } },
      ]);

      expect(results).to.have.length.greaterThan(0);
      expect(results.some(doc => doc._id === 1)).to.be.true;
    });

    it('should work with $regex in aggregation pipeline', () => {
      const results = Aggo.aggregate(documents, [
        { $match: { title: { $regex: 'JavaScript.*Guide' } } },
      ]);

      expect(results).to.have.length(1);
      expect(results[0]._id).to.equal(1);
    });

    it('should combine $text with other operators', () => {
      const results = Aggo.aggregate(documents, [
        {
          $match: {
            $text: 'javascript',
            _id: { $lte: 3 },
          },
        },
      ]);

      expect(results).to.have.length.greaterThan(0);
      expect(results.every(doc => doc._id <= 3)).to.be.true;
    });

    it('should handle complex regex patterns', () => {
      const results = Aggo.aggregate(documents, [
        {
          $match: {
            content: { $regex: 'modern.*applications|algorithms.*processing' },
          },
        },
      ]);

      expect(results).to.have.length.greaterThan(0);
    });
  });

  describe('Performance and Correctness', () => {
    // Generate larger test dataset
    const largeDataset = [];
    for (let i = 0; i < 1000; i++) {
      largeDataset.push({
        _id: i,
        title: `Document ${i}`,
        content:
          i % 2 === 0
            ? `JavaScript programming tutorial number ${i}`
            : `Python data science guide number ${i}`,
        category: i % 3 === 0 ? 'programming' : 'data',
      });
    }

    it('should maintain correctness with large datasets', () => {
      const textResults = $text(largeDataset, 'javascript programming');
      const regexResults = enhancedRegexMatch(
        largeDataset,
        'content',
        'JavaScript.*tutorial'
      );

      expect(textResults.length).to.be.greaterThan(0);
      expect(regexResults.length).to.be.greaterThan(0);

      // Verify all results actually contain the search terms
      expect(
        textResults.every(
          doc =>
            doc.content.toLowerCase().includes('javascript') &&
            doc.content.toLowerCase().includes('programming')
        )
      ).to.be.true;
    });

    it('should show performance improvements with prefiltering', () => {
      const stats = getTextSearchStats();
      const initialQueries = stats.totalQueries;

      $text(largeDataset, 'javascript programming tutorial');

      const newStats = getTextSearchStats();
      expect(newStats.totalQueries).to.equal(initialQueries + 1);

      // If prefiltering was used, we should see some candidates reduction
      if (newStats.prefilterHits > 0) {
        expect(newStats.candidatesAfterFilter).to.be.lessThan(
          newStats.candidatesBeforeFilter
        );
      }
    });

    it('should handle zero false negatives', () => {
      // Test that Bloom filter prefiltering never misses actual matches
      const fullResults = enhancedRegexMatch(
        largeDataset,
        'content',
        'JavaScript.*programming',
        '',
        { enableBloomFilter: false }
      ); // Disable bloom filter
      const bloomResults = enhancedRegexMatch(
        largeDataset,
        'content',
        'JavaScript.*programming',
        '',
        { enableBloomFilter: true }
      ); // Enable bloom filter

      // Bloom filter results should contain at least all the actual matches
      expect(bloomResults.length).to.be.at.least(fullResults.length);

      // All full results should be in bloom results (no false negatives)
      const fullIds = new Set(fullResults.map(doc => doc._id));
      const bloomIds = new Set(bloomResults.map(doc => doc._id));

      fullIds.forEach(id => {
        expect(bloomIds.has(id)).to.be.true;
      });
    });
  });

  describe('Statistics and Observability', () => {
    it('should track text search performance metrics', () => {
      resetTextSearchStats();

      $text(documents, 'javascript programming');
      $text(documents, 'data analysis');

      const stats = getTextSearchStats();
      expect(stats.totalQueries).to.equal(2);
      expect(stats.totalPrefilterTime).to.be.a('number');
      expect(stats.totalVerificationTime).to.be.a('number');
    });

    it('should track regex search performance metrics', () => {
      resetRegexSearchStats();

      enhancedRegexMatch(documents, 'title', 'JavaScript.*Guide');
      enhancedRegexMatch(documents, 'content', 'data.*science');

      const stats = getRegexSearchStats();
      expect(stats.totalQueries).to.equal(2);
      expect(stats.totalPrefilterTime).to.be.a('number');
      expect(stats.totalVerificationTime).to.be.a('number');
    });

    it('should track false positive rates', () => {
      // Use a large enough dataset to potentially see false positives
      const stats = getTextSearchStats();
      expect(stats.falsePositiveRate).to.be.a('number');
      expect(stats.falsePositiveRate).to.be.at.least(0);
      expect(stats.falsePositiveRate).to.be.at.most(1);
    });
  });
});
