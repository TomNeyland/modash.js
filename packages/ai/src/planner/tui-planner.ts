/**
 * TUI Planner - Extends OpenAI client to generate query + UI specifications
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';
import { z } from 'zod';
import { Plan, type PlanType } from '../specs/Plan.js';
import { type OpenAIOptions } from '../openai-client.js';
import { type SimplifiedSchema } from '../schema-inference.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load system prompt
const SYSTEM_PROMPT = readFileSync(
  join(__dirname, 'prompt.md'), 
  'utf-8'
);

export interface TUIPlannergResult {
  plan: PlanType;
  rawResponse: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class TUIPlanner {
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAIOptions = {}) {
    this.client = new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
      ...options
    });
    this.model = options.model || 'gpt-4o-mini';
  }

  /**
   * Generate both query and UI specification from natural language
   */
  async generatePlan(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[] = []
  ): Promise<TUIPlannergResult> {
    // Build context for the LLM
    const schemaDescription = this.formatSchema(schema);
    const samplesDescription = this.formatSamples(sampleDocuments);
    
    const userPrompt = `
Natural Language Query: "${query}"

Data Schema:
${schemaDescription}

Sample Documents:
${samplesDescription}

Generate a complete plan with both MongoDB pipeline AND terminal UI specification.
    `.trim();

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for consistent output
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      // Parse and validate the response
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(content);
      } catch (error) {
        throw new Error(`Invalid JSON response: ${error}`);
      }

      // Validate against Zod schema
      const plan = Plan.parse(parsedResponse);

      return {
        plan,
        rawResponse: content,
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        // Provide fallback for invalid schema
        console.warn('Plan validation failed, providing fallback:', error.errors);
        return this.createFallbackPlan(query, error.errors);
      }
      
      throw error;
    }
  }

  /**
   * Create a safe fallback plan when LLM output is invalid
   */
  private createFallbackPlan(query: string, validationErrors: any[]): TUIPlannergResult {
    const fallbackPlan: PlanType = {
      query: {
        pipeline: [{ $match: {} }] // Safe no-op pipeline
      },
      uiSpec: {
        title: `Query: ${query}`,
        layout: {
          type: 'json',
          id: 'fallback',
          from: '$',
          style: 'pretty'
        }
      },
      hints: {
        expectedRows: 100
      }
    };

    return {
      plan: fallbackPlan,
      rawResponse: JSON.stringify(fallbackPlan, null, 2),
      usage: undefined
    };
  }

  /**
   * Format schema for LLM context
   */
  private formatSchema(schema: SimplifiedSchema): string {
    const lines: string[] = [];
    
    if (schema.fields && Object.keys(schema.fields).length > 0) {
      lines.push('Fields:');
      Object.entries(schema.fields).forEach(([field, info]) => {
        lines.push(`  ${field}: ${info.type}${info.required ? ' (required)' : ''}`);
        if (info.examples?.length) {
          lines.push(`    Examples: ${info.examples.slice(0, 3).join(', ')}`);
        }
      });
    }

    if (schema.sampleCount) {
      lines.push(`\nSample Count: ${schema.sampleCount} documents`);
    }

    return lines.join('\n') || 'No schema available';
  }

  /**
   * Format sample documents for LLM context
   */
  private formatSamples(samples: any[]): string {
    if (!samples.length) return 'No samples available';
    
    return samples
      .slice(0, 3) // Limit to first 3 samples
      .map((doc, index) => `${index + 1}. ${JSON.stringify(doc)}`)
      .join('\n');
  }

  /**
   * Test connection to OpenAI
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 1
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience function to create TUI planner
 */
export function createTUIPlanner(options?: OpenAIOptions): TUIPlanner {
  return new TUIPlanner(options);
}