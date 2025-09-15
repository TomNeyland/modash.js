/**
 * Tests for schema inference functionality
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  inferSchema,
  getSampleDocuments,
  documentToExample,
} from '../src/schema-inference.js';

describe('Schema Inference', () => {
  describe('inferSchema', () => {
    it('should infer basic types correctly', () => {
      const documents = [
        { name: 'Alice', age: 30, active: true, score: 85.5 },
        { name: 'Bob', age: 25, active: false, score: 92.0 },
        { name: 'Carol', age: 35, active: true, score: 78.2 },
      ];

      const schema = inferSchema(documents);

      expect(schema).to.deep.equal({
        name: 'string',
        age: 'integer',
        active: 'boolean',
        score: 'number',
      });
    });

    it('should handle nested objects', () => {
      const documents = [
        { name: 'Alice', address: { city: 'Seattle', zip: 98101 } },
        { name: 'Bob', address: { city: 'Portland', zip: 97201 } },
      ];

      const schema = inferSchema(documents);

      expect(schema).to.deep.equal({
        name: 'string',
        address: {
          city: 'string',
          zip: 'integer',
        },
      });
    });

    it('should handle arrays', () => {
      const documents = [
        { name: 'Alice', scores: [85, 90, 88] },
        { name: 'Bob', scores: [92, 87] },
        { name: 'Carol', scores: [] },
      ];

      const schema = inferSchema(documents);

      expect(schema).to.deep.equal({
        name: 'string',
        scores: 'array',
      });
    });

    it('should handle mixed types with union', () => {
      const documents = [
        { id: '123', value: 'text' },
        { id: 456, value: 42 },
        { id: '789', value: 'more text' },
      ];

      const schema = inferSchema(documents);

      expect(schema.id).to.equal('union<string|integer>');
      expect(schema.value).to.equal('union<string|integer>');
    });

    it('should handle empty input', () => {
      const schema = inferSchema([]);
      expect(schema).to.deep.equal({});
    });

    it('should respect sample limit', () => {
      const documents = Array.from({ length: 1000 }, (_, i) => ({ id: i }));

      // Should not analyze all 1000 documents with default sample size
      const schema = inferSchema(documents, { sampleSize: 50 });

      expect(schema).to.deep.equal({ id: 'integer' });
    });
  });

  describe('getSampleDocuments', () => {
    it('should return fewer documents when count exceeds array length', () => {
      const documents = [{ a: 1 }, { b: 2 }];
      const samples = getSampleDocuments(documents, 5);

      expect(samples).to.have.length(2);
      expect(samples).to.deep.equal(documents);
    });

    it('should distribute samples evenly', () => {
      const documents = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      const samples = getSampleDocuments(documents, 3);

      expect(samples).to.have.length(3);
      expect(samples[0].id).to.equal(0);
      expect(samples[1].id).to.be.approximately(3, 1);
      expect(samples[2].id).to.be.approximately(6, 1);
    });
  });

  describe('documentToExample', () => {
    it('should create compact representation', () => {
      const doc = {
        name: 'Alice',
        scores: [85, 90, 88, 92],
        address: { city: 'Seattle', state: 'WA' },
      };

      const example = documentToExample(doc);
      const parsed = JSON.parse(example);

      expect(parsed).to.deep.equal({
        name: 'Alice',
        scores: [85, '...'],
        address: '{...}',
      });
    });

    it('should handle primitive values', () => {
      expect(documentToExample(42)).to.equal('42');
      expect(documentToExample('hello')).to.equal('"hello"');
      expect(documentToExample(null)).to.equal('null');
    });
  });
});
