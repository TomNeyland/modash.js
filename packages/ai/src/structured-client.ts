/**
 * Structured OpenAI Client - Generates MongoDB Pipeline + UIDSL responses
 * 
 * Uses OpenAI's structured output to return both pipeline (q) and UI DSL (ui)
 * Implements the Plan schema with Zod validation
 */

import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Plan, type PlanType, type StructuredPlan } from './plan.zod.js';
import type { SimplifiedSchema } from './schema-inference.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface StructuredOpenAIOptions {
  /** OpenAI API key */
  apiKey?: string;
  /** Model to use for generation */
  model?: string;
  /** Temperature for response generation */
  temperature?: number;
}

export interface StructuredGenerationResult {
  /** Complete structured plan */
  plan: StructuredPlan;
  /** Raw pipeline JSON string */
  pipelineJson: string;
  /** UIDSL string */
  uidsl: string;
  /** Token usage information */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export class StructuredOpenAIClient {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private systemPrompt: string;

  constructor(options: StructuredOpenAIOptions = {}) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey option.'
      );
    }

    this.client = new OpenAI({ apiKey });
    this.model = options.model || 'gpt-4o-2024-08-06'; // Use model that supports structured output
    this.temperature = options.temperature || 0.1;
    
    // Load system prompt from file
    this.systemPrompt = readFileSync(
      join(__dirname, 'prompt', 'system.md'),
      'utf-8'
    );
  }

  /**
   * Generate structured plan with MongoDB pipeline and UIDSL
   */
  async generateStructuredPlan(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[] = []
  ): Promise<StructuredGenerationResult> {
    const userPrompt = this.buildUserPrompt(query, schema, sampleDocuments);

    try {
      const completion = await this.client.beta.chat.completions.parse({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: this.temperature,
        response_format: zodResponseFormat(Plan, 'plan'),
      });

      const message = completion.choices[0]?.message;
      if (!message?.parsed) {
        throw new Error('No parsed response from OpenAI');
      }

      const plan = message.parsed as StructuredPlan;
      
      // Extract components
      const pipelineJson = plan.q;
      const uidsl = plan.ui;

      return {
        plan,
        pipelineJson,
        uidsl,
        tokensUsed: {
          prompt: completion.usage?.prompt_tokens || 0,
          completion: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate structured plan: ${error.message}`);
      }
      throw new Error('Unknown error occurred while generating structured plan');
    }
  }

  /**
   * Build user prompt with query context
   */
  private buildUserPrompt(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[]
  ): string {
    const schemaStr = JSON.stringify(schema, null, 2);
    const samplesStr = sampleDocuments.length > 0
      ? sampleDocuments.slice(0, 3).map(doc => JSON.stringify(doc)).join('\n')
      : 'No sample documents available';

    return `Natural Language Query: "${query}"

Data Schema:
${schemaStr}

Sample Documents:
${samplesStr}

Generate a MongoDB aggregation pipeline and appropriate UIDSL for visualizing the results.`;
  }

  /**
   * Test connection to OpenAI API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a simple plan for testing (without full schema context)
   */
  async generateSimplePlan(query: string): Promise<StructuredGenerationResult> {
    const simpleSchema = { _id: 'string', name: 'string', value: 'number' };
    const sampleDoc = { _id: '1', name: 'Sample', value: 100 };
    
    return this.generateStructuredPlan(query, simpleSchema, [sampleDoc]);
  }
}