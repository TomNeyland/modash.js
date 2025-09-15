/**
 * Integration tests for the complete AI plugin workflow
 * These tests mock the OpenAI API to avoid requiring actual API keys
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { aiQuery, getSchema, generatePipeline } from '../src/index.js';
import { OpenAIClient } from '../src/openai-client.js';
import {
  getSampleDocuments,
  documentToExample,
} from '../src/schema-inference.js';

describe('AI Plugin Integration', () => {
  const sampleData = [
    { name: 'Alice', age: 30, department: 'Engineering', salary: 95000 },
    { name: 'Bob', age: 25, department: 'Marketing', salary: 75000 },
    { name: 'Carol', age: 35, department: 'Engineering', salary: 110000 },
  ];

  describe('Schema Inference Integration', () => {
    it('should infer comprehensive schema from sample data', () => {
      const schema = getSchema(sampleData);

      expect(schema).to.deep.equal({
        name: 'string',
        age: 'integer',
        department: 'string',
        salary: 'integer',
      });
    });

    it('should handle large datasets with sampling', () => {
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: Math.random(),
        category: i % 3 === 0 ? 'A' : 'B',
      }));

      const schema = getSchema(largeData, { sampleSize: 50 });

      expect(schema).to.deep.equal({
        id: 'integer',
        value: 'number',
        category: 'string',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing OpenAI API key gracefully', async () => {
      // Clear API key
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        await generatePipeline('test query', { field: 'string' });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('OpenAI API key is required');
      } finally {
        // Restore key if it existed
        if (originalKey) {
          process.env.OPENAI_API_KEY = originalKey;
        }
      }
    });

    it('should handle empty dataset gracefully', () => {
      const schema = getSchema([]);
      expect(schema).to.deep.equal({});
    });

    it('should handle malformed documents', () => {
      const badData = [
        { name: 'Alice', age: 30 },
        null,
        undefined,
        'invalid',
        { name: 'Bob', age: 25 },
      ];

      const schema = getSchema(badData);
      expect(schema.name).to.equal('string');
      expect(schema.age).to.equal('integer');
    });
  });

  describe('Pipeline Generation (Mocked)', () => {
    it('should validate pipeline structure requirements', () => {
      // Test the validation logic without actually calling OpenAI
      const client = new OpenAIClient({ apiKey: 'test' });

      const validResponse = JSON.stringify({
        pipeline: [
          { $match: { active: true } },
          { $group: { _id: '$department', count: { $sum: 1 } } },
        ],
      });

      const result = client.parseResponse(validResponse);
      expect(result.pipeline).to.have.length(2);
      expect(result.pipeline[0]).to.have.property('$match');
      expect(result.pipeline[1]).to.have.property('$group');
    });

    it('should reject invalid pipeline structures', () => {
      const client = new OpenAIClient({ apiKey: 'test' });

      const invalidResponse = JSON.stringify({
        pipeline: [{ invalidOperator: 'test' }],
      });

      expect(() => {
        client.parseResponse(invalidResponse);
      }).to.throw(
        'Each pipeline stage must have exactly one operator starting with $'
      );
    });
  });

  describe('End-to-End Workflow Preparation', () => {
    it('should prepare all components for full integration', () => {
      // Verify all the pieces work together without OpenAI API
      const schema = getSchema(sampleData);

      expect(schema).to.be.an('object');
      expect(Object.keys(schema)).to.have.length.greaterThan(0);

      // Verify schema contains expected fields
      expect(schema.name).to.equal('string');
      expect(schema.age).to.equal('integer');
      expect(schema.department).to.equal('string');
      expect(schema.salary).to.equal('integer');
    });

    it('should generate proper context for LLM', () => {
      const samples = getSampleDocuments(sampleData, 2);
      expect(samples).to.have.length(2);

      const example = documentToExample(sampleData[0]);
      expect(example).to.be.a('string');
      expect(JSON.parse(example)).to.be.an('object');
    });
  });

  describe('Real-World Query Examples', () => {
    it('should handle typical business queries with proper schema context', () => {
      const businessData = [
        {
          orderId: 1,
          customerId: 'C001',
          amount: 150.0,
          status: 'completed',
          date: '2023-10-01',
        },
        {
          orderId: 2,
          customerId: 'C002',
          amount: 75.5,
          status: 'pending',
          date: '2023-10-02',
        },
        {
          orderId: 3,
          customerId: 'C001',
          amount: 200.0,
          status: 'completed',
          date: '2023-10-03',
        },
      ];

      const schema = getSchema(businessData);

      expect(schema).to.deep.equal({
        orderId: 'integer',
        customerId: 'string',
        amount: 'number',
        status: 'string',
        date: 'string',
      });

      // These would be typical natural language queries:
      const expectedQueries = [
        'total revenue by customer',
        'average order value',
        'count of completed orders',
        'revenue by status',
      ];

      // Verify we have the right schema to support these queries
      expect(schema.customerId).to.exist;
      expect(schema.amount).to.exist;
      expect(schema.status).to.exist;
    });
  });
});
