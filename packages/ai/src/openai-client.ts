/**
 * OpenAI client for converting natural language queries to MongoDB aggregation pipelines
 * Enhanced with structured outputs for TUI presentation specs
 */

import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { Pipeline } from 'aggo';
import type { SimplifiedSchema } from './schema-inference.js';
import { NL2QueryAndUI, type NL2QueryAndUIType } from './schemas.js';

export interface OpenAIOptions {
  /** OpenAI API key */
  apiKey?: string;
  /** Model to use for pipeline generation */
  model?: string;
  /** Maximum tokens for the response */
  maxTokens?: number;
  /** Temperature for response generation */
  temperature?: number;
}

export interface PipelineGenerationResult {
  /** Generated MongoDB aggregation pipeline */
  pipeline: Pipeline;
  /** Explanation of the generated pipeline (if requested) */
  explanation?: string;
  /** TUI presentation specification */
  presentationSpec?: any;
  /** Intent description */
  intent?: string;
  /** Tokens used in the request */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface TUIGenerationOptions {
  /** Include TUI presentation spec */
  includeTUI?: boolean;
  /** Include explanation of the generated pipeline */
  includeExplanation?: boolean;
}

export class OpenAIClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(options: OpenAIOptions = {}) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey option.'
      );
    }

    this.client = new OpenAI({ apiKey });
    this.model = options.model || 'gpt-4-turbo-preview';
    this.maxTokens = options.maxTokens || 1000;
    this.temperature = options.temperature || 0.1; // Low temperature for consistent results
  }

  /**
   * Generates a MongoDB aggregation pipeline from natural language
   *
   * @param query - Natural language query
   * @param schema - Simplified schema of the data
   * @param sampleDocuments - Sample documents for context
   * @param options - Additional options
   * @returns Generated pipeline and metadata
   */
  async generatePipeline(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[] = [],
    options: TUIGenerationOptions = {}
  ): Promise<PipelineGenerationResult> {
    // Use structured outputs if TUI is requested
    if (options.includeTUI) {
      return this.generateStructuredOutput(query, schema, sampleDocuments, options);
    }

    // Fallback to legacy generation
    return this.generateLegacyPipeline(query, schema, sampleDocuments, options);
  }

  /**
   * Generates structured output with both pipeline and TUI specification
   */
  private async generateStructuredOutput(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[] = [],
    options: TUIGenerationOptions = {}
  ): Promise<PipelineGenerationResult> {
    const prompt = this.buildStructuredPrompt(query, schema, sampleDocuments, options.includeExplanation);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getStructuredSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens * 2, // More tokens for structured output
        temperature: this.temperature,
        response_format: zodResponseFormat(NL2QueryAndUI, 'spec'),
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const result: NL2QueryAndUIType = JSON.parse(response);

      return {
        pipeline: result.query_plan.pipeline || [],
        explanation: result.presentation_spec.layout.children.find(c => c.kind === 'json')?.title, // Temporary explanation handling
        presentationSpec: result.presentation_spec,
        intent: result.intent,
        tokensUsed: {
          prompt: completion.usage?.prompt_tokens || 0,
          completion: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      // Fallback to legacy if structured output fails
      console.warn('Structured output failed, falling back to legacy mode:', error);
      return this.generateLegacyPipeline(query, schema, sampleDocuments, options);
    }
  }

  /**
   * Legacy pipeline generation (original method)
   */
  private async generateLegacyPipeline(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[] = [],
    options: TUIGenerationOptions = {}
  ): Promise<PipelineGenerationResult> {
    const prompt = this.buildPrompt(
      query,
      schema,
      sampleDocuments,
      options.includeExplanation
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' },
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const result = this.parseResponse(response);

      return {
        pipeline: result.pipeline,
        explanation: result.explanation,
        tokensUsed: {
          prompt: completion.usage?.prompt_tokens || 0,
          completion: completion.usage?.completion_tokens || 0,
          total: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate pipeline: ${error.message}`);
      }
      throw new Error('Unknown error occurred while generating pipeline');
    }
  }

  /**
   * Builds the structured prompt for TUI generation
   */
  buildStructuredPrompt(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[],
    includeExplanation: boolean = false
  ): string {
    const schemaStr = JSON.stringify(schema, null, 2);
    const samplesStr =
      sampleDocuments.length > 0
        ? sampleDocuments.map(doc => JSON.stringify(doc)).join('\n')
        : 'No sample documents provided';

    return `Convert this natural language query into both a MongoDB aggregation pipeline AND a Terminal UI specification:

QUERY: "${query}"

DATA SCHEMA:
${schemaStr}

SAMPLE DOCUMENTS:
${samplesStr}

Your response must be valid JSON matching the NL2QueryAndUI schema with these fields:
- intent: Brief description of what the query does (e.g., "top_products_by_revenue")
- query_plan: MongoDB aggregation pipeline specification
- presentation_spec: Terminal UI layout specification

Guidelines for presentation_spec:
- Use "table" for relational data (most common)
- Use "chart.bar" or "chart.line" for visualizations when appropriate
- Use "metric" for single values or KPIs
- Set appropriate titles and data bindings
- Keep layout simple (≤3 panels unless specifically requested)
- Use JSONPath "$.rows" to bind to pipeline results

Example query result structure after pipeline execution:
{
  "rows": [...], // Main query results
  "meta": {...}, // Metadata like count, execution time
  "series": {...} // Time series data if applicable
}

Choose the best widget types based on the data and query intent.`;
  }

  /**
   * Gets the structured system prompt for TUI generation
   */
  private getStructuredSystemPrompt(): string {
    return `You are an expert MongoDB aggregation pipeline generator with Terminal UI expertise. 

Your task is to convert natural language queries into:
1. Valid MongoDB aggregation pipelines
2. Beautiful Terminal UI presentation specifications

Key guidelines for pipelines:
- Always return valid MongoDB aggregation syntax
- Use proper field references with "$fieldName" format
- Use appropriate operators and accumulators
- Optimize for performance when possible

Key guidelines for TUI specs:
- Choose widget types based on data structure and user intent
- Use "table" for most relational data
- Use "chart.bar" for categorical comparisons
- Use "chart.line" for time series or trends  
- Use "metric" for single KPIs or summary values
- Set clear titles and proper data bindings
- Keep layouts simple and readable
- Use row/column layout as needed

Data binding patterns:
- "$.rows" - main query results (most common)
- "$.meta.count" - result count
- "$.series.*" - time series data

Always return valid JSON matching the NL2QueryAndUI schema structure.`;
  }

  /**
   * Builds the prompt for the OpenAI API (exposed for testing)
   */
  buildPrompt(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[],
    includeExplanation: boolean = false
  ): string {
    const schemaStr = JSON.stringify(schema, null, 2);
    const samplesStr =
      sampleDocuments.length > 0
        ? sampleDocuments.map(doc => JSON.stringify(doc)).join('\n')
        : 'No sample documents provided';

    return `Convert this natural language query into a MongoDB aggregation pipeline:

QUERY: "${query}"

DATA SCHEMA:
${schemaStr}

SAMPLE DOCUMENTS:
${samplesStr}

Requirements:
- Return ONLY a valid JSON object with a "pipeline" field containing the MongoDB aggregation pipeline array
- The pipeline must be executable against the provided schema
- Use standard MongoDB aggregation operators ($match, $group, $project, $sort, $limit, etc.)
- Handle field references correctly (use "$fieldName" syntax)
- For grouping operations, use appropriate accumulator operators ($sum, $avg, $count, etc.)
${includeExplanation ? '- Include an "explanation" field describing the pipeline logic' : ''}

Example response format:
{
  "pipeline": [
    { "$match": { "status": "active" } },
    { "$group": { "_id": "$category", "total": { "$sum": "$amount" } } }
  ]
  ${includeExplanation ? ',\n  "explanation": "This pipeline filters for active records and groups by category, summing the amount field."' : ''}
}`;
  }

  /**
   * Gets the system prompt for the OpenAI API
   */
  private getSystemPrompt(): string {
    return `You are an expert MongoDB aggregation pipeline generator. Your task is to convert natural language queries into valid MongoDB aggregation pipelines.

Key guidelines:
- Always return valid JSON with a "pipeline" field
- Use proper MongoDB aggregation syntax
- Field references must use "$fieldName" format
- Group operations should use appropriate accumulators
- Match operations should use proper query operators
- Sort operations use 1 for ascending, -1 for descending
- Be precise with field names from the provided schema
- Handle edge cases gracefully
- Optimize pipeline stages for performance when possible

Common patterns:
- "sum X where Y": [{"$match": {...}}, {"$group": {"_id": null, "total": {"$sum": "$X"}}}]
- "average X by Y": [{"$group": {"_id": "$Y", "avg": {"$avg": "$X"}}}]
- "count records where X": [{"$match": {...}}, {"$count": "total"}]
- "top N by X": [{"$sort": {"X": -1}}, {"$limit": N}]`;
  }

  /**
   * Parses the OpenAI response and validates the pipeline (exposed for testing)
   */
  parseResponse(response: string): {
    pipeline: Pipeline;
    explanation?: string;
  } {
    try {
      const parsed = JSON.parse(response);

      if (!parsed.pipeline || !Array.isArray(parsed.pipeline)) {
        throw new Error('Response must contain a "pipeline" array');
      }

      // Basic validation of pipeline structure
      for (const stage of parsed.pipeline) {
        if (!stage || typeof stage !== 'object') {
          throw new Error('Each pipeline stage must be an object');
        }

        const stageKeys = Object.keys(stage);
        if (stageKeys.length !== 1 || !stageKeys[0].startsWith('$')) {
          throw new Error(
            'Each pipeline stage must have exactly one operator starting with $'
          );
        }
      }

      return {
        pipeline: parsed.pipeline,
        explanation: parsed.explanation,
      };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON response from OpenAI: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Tests the OpenAI connection and API key
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
}
