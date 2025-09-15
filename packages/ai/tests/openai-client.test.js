/**
 * Tests for OpenAI client functionality
 * Note: These tests don't make actual API calls to avoid requiring API keys during CI
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { OpenAIClient } from '../src/openai-client.js';

describe('OpenAI Client', () => {
  describe('constructor', () => {
    it('should throw error when no API key is provided', () => {
      // Clear environment variable for this test
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      expect(() => {
        new OpenAIClient();
      }).to.throw('OpenAI API key is required');

      // Restore environment variable
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    });

    it('should accept API key via options', () => {
      expect(() => {
        new OpenAIClient({ apiKey: 'test-key' });
      }).to.not.throw();
    });

    it('should use default model when not specified', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });
      expect(client.model).to.equal('gpt-4-turbo-preview');
    });

    it('should accept custom model', () => {
      const client = new OpenAIClient({
        apiKey: 'test-key',
        model: 'gpt-3.5-turbo',
      });
      expect(client.model).to.equal('gpt-3.5-turbo');
    });
  });

  describe('buildPrompt', () => {
    it('should create a well-formed prompt', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });
      const schema = { name: 'string', age: 'number' };
      const samples = [{ name: 'Alice', age: 30 }];

      const prompt = client.buildPrompt('sum age', schema, samples, false);

      expect(prompt).to.include('sum age');
      expect(prompt).to.include('"name": "string"');
      expect(prompt).to.include('"age": "number"');
      expect(prompt).to.include('Alice');
      expect(prompt).to.include('MongoDB aggregation pipeline');
    });

    it('should include explanation request when specified', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });
      const prompt = client.buildPrompt('test query', {}, [], true);

      expect(prompt).to.include('explanation');
    });
  });

  describe('parseResponse', () => {
    it('should parse valid response', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });
      const response = JSON.stringify({
        pipeline: [{ $match: { active: true } }],
        explanation: 'Filters active records',
      });

      const result = client.parseResponse(response);

      expect(result.pipeline).to.deep.equal([{ $match: { active: true } }]);
      expect(result.explanation).to.equal('Filters active records');
    });

    it('should throw error for invalid JSON', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });

      expect(() => {
        client.parseResponse('invalid json');
      }).to.throw('Invalid JSON response');
    });

    it('should throw error for missing pipeline', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });
      const response = JSON.stringify({ explanation: 'test' });

      expect(() => {
        client.parseResponse(response);
      }).to.throw('Response must contain a "pipeline" array');
    });

    it('should validate pipeline structure', () => {
      const client = new OpenAIClient({ apiKey: 'test-key' });

      // Test invalid stage
      const invalidStage = JSON.stringify({
        pipeline: [{ invalidStage: true }],
      });

      expect(() => {
        client.parseResponse(invalidStage);
      }).to.throw(
        'Each pipeline stage must have exactly one operator starting with $'
      );

      // Test non-object stage
      const nonObjectStage = JSON.stringify({
        pipeline: ['invalid'],
      });

      expect(() => {
        client.parseResponse(nonObjectStage);
      }).to.throw('Each pipeline stage must be an object');
    });
  });
});
