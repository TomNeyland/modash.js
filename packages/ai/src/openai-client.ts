/**
 * OpenAI client for converting natural language queries to MongoDB aggregation pipelines
 * Now with structured output and automatic UI generation
 */

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
type Pipeline = Array<Record<string, any>>;
import type { SimplifiedSchema } from './schema-inference.js';
import { StructuredOutputSchema, type StructuredOutput } from './ui-schemas.js';

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
  /** UI instructions for terminal presentation */
  uiInstructions?: StructuredOutput['ui'];
  /** Reasoning behind UI choices */
  uiReasoning?: string;
  /** Tokens used in the request */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
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
    this.model = options.model || 'gpt-5-nano';
    this.maxTokens = options.maxTokens || 1000;
    this.temperature = options.temperature || 0.1; // Low temperature for consistent results
  }

  /**
   * Generates a MongoDB aggregation pipeline from natural language with automatic UI
   *
   * @param query - Natural language query
   * @param schema - Simplified schema of the data
   * @param sampleDocuments - Sample documents for context
   * @param options - Additional options
   * @returns Generated pipeline and metadata with UI instructions
   */
  async generatePipeline(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[] = [],
    options: { includeExplanation?: boolean; generateUI?: boolean } = {}
  ): Promise<PipelineGenerationResult> {
    // Default to generating UI unless explicitly disabled
    const shouldGenerateUI = options.generateUI !== false;
    
    const prompt = this.buildPrompt(
      query,
      schema,
      sampleDocuments,
      options.includeExplanation,
      shouldGenerateUI
    );

    try {
      if (shouldGenerateUI) {
        // Use new responses.parse API
        const completion = await this.client.responses.parse({
          model: this.model,
          input: [
            {
              role: 'system',
              content: this.getSystemPromptWithUI(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          text: {
            format: zodTextFormat(StructuredOutputSchema, 'structured_query_response'),
          },
        });

        const parsedResponse = completion.output_parsed;
        if (!parsedResponse) {
          throw new Error('No structured response from OpenAI');
        }


        try {
          const pipelineArray = JSON.parse(parsedResponse.pipeline);
          return {
            pipeline: pipelineArray,
            explanation: parsedResponse.explanation,
            uiInstructions: parsedResponse.ui,
            uiReasoning: parsedResponse.reasoning,
            tokensUsed: {
              prompt: 0, // New API may not provide token counts
              completion: 0,
              total: 0,
            },
          };
        } catch (parseError) {
          throw new Error(`Failed to parse pipeline JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\nPipeline string was: ${parsedResponse.pipeline}`);
        }
      } else {
        // Use new API for non-UI pipeline generation
        const PipelineSchema = z.object({
          pipeline: z.string().describe('MongoDB aggregation pipeline as JSON string'),
          explanation: z.string().nullable(),
        });

        const completion = await this.client.responses.parse({
          model: this.model,
          input: [
            {
              role: 'system',
              content: this.getSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          text: {
            format: zodTextFormat(PipelineSchema, 'pipeline_response'),
          },
        });

        const parsedResponse = completion.output_parsed;
        if (!parsedResponse) {
          throw new Error('No response from OpenAI');
        }

        return {
          pipeline: JSON.parse(parsedResponse.pipeline),
          explanation: parsedResponse.explanation,
          tokensUsed: {
            prompt: 0,
            completion: 0,
            total: 0,
          },
        };
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate pipeline: ${error.message}`);
      }
      throw new Error('Unknown error occurred while generating pipeline');
    }
  }

  /**
   * Builds the prompt for the OpenAI API (exposed for testing)
   */
  buildPrompt(
    query: string,
    schema: SimplifiedSchema,
    sampleDocuments: any[],
    includeExplanation: boolean = false,
    generateUI: boolean = true
  ): string {
    const schemaStr = JSON.stringify(schema, null, 2);
    const samplesStr =
      sampleDocuments.length > 0
        ? sampleDocuments.map(doc => JSON.stringify(doc)).join('\n')
        : 'No sample documents provided';

    if (generateUI) {
      return `Convert this natural language query into a MongoDB aggregation pipeline AND design the perfect terminal UI for displaying the results:

QUERY: "${query}"

DATA SCHEMA:
${schemaStr}

SAMPLE DOCUMENTS:
${samplesStr}

Your response must include:
1. A MongoDB aggregation pipeline AS A JSON STRING (e.g., '[{"$match":{"status":"active"}},{"$group":{"_id":"$category","total":{"$sum":1}}}]')
2. Terminal UI instructions that present the data beautifully

Consider the data structure and query type to choose the best visualization:
- Use "table" layout for structured comparisons and detailed data
- Use "cards" layout for highlighting individual records or profiles  
- Use "list" layout for simple ordered results
- Use "grid" layout for compact overviews of many items
- Use "chart" layout for numerical trends or comparisons

Choose colors, formatting, and styling that enhance readability and highlight important insights.
${includeExplanation ? 'Include explanations for both the pipeline logic and UI design choices.' : ''}

Make the UI adaptive to the data - if it's financial data, use currency formatting; if it's about rankings, highlight top performers; if it's time-series, consider showing trends.`;
    } else {
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
  }

  /**
   * Gets the system prompt for the OpenAI API with UI generation capabilities
   */
  private getSystemPromptWithUI(): string {
    return `You are an expert MongoDB aggregation pipeline generator AND terminal UI designer. Your task is to:
1. Convert natural language queries into valid MongoDB aggregation pipelines
2. Design beautiful, adaptive terminal UI presentations for the query results

For the MongoDB pipeline:
- Always return a valid JSON STRING containing the pipeline array
- The pipeline field must be a string that can be parsed as JSON, not a direct array
- Use proper MongoDB aggregation operators
- Field references must use "$fieldName" format
- Group operations should use appropriate accumulators
- Match operations should use proper query operators
- Sort operations use 1 for ascending, -1 for descending
- Be precise with field names from the provided schema
- Optimize pipeline stages for performance when possible

For the terminal UI design:
- Choose the layout that best fits the data and query type
- Use appropriate colors and styling for readability
- Format data properly (currency, numbers, dates, percentages)
- Highlight important information with colors and styling
- Include helpful summaries when aggregating data
- Consider the user's likely intent and present insights accordingly
- Make the display visually appealing and informative

Layout guidelines:
- TABLE: Best for comparing multiple fields across records, detailed data analysis
- CARDS: Great for highlighting individual items, profiles, or when you want to emphasize each record
- LIST: Perfect for simple ordered results, rankings, or when space is limited
- GRID: Ideal for compact overviews of many items, dashboard-style displays
- CHART: Use for numerical comparisons, trends, or when visualization adds value

Color guidelines:
- Use cyan/blue for headers and structure
- Use white for main data values
- Use yellow for highlights and important metrics
- Use green for positive values/summaries
- Use red sparingly for warnings or negative values
- Maintain good contrast and readability

Always respond with a valid structured output that includes both the pipeline (as a JSON string) and UI instructions.`;
  }

  /**
   * Gets the system prompt for the OpenAI API (legacy format)
   */
  private getSystemPrompt(): string {
    return `You are an expert MongoDB aggregation pipeline generator. Your task is to convert natural language queries into valid MongoDB aggregation pipelines.

Key guidelines:
- Always return the pipeline as a JSON STRING that can be parsed
- The pipeline field must contain a stringified array like '[{"$match":{"field":"value"}}]'
- Use proper MongoDB aggregation syntax
- Field references must use "$fieldName" format
- Group operations should use appropriate accumulators
- Match operations should use proper query operators
- Sort operations use 1 for ascending, -1 for descending
- Be precise with field names from the provided schema
- Handle edge cases gracefully
- Optimize pipeline stages for performance when possible

Common patterns (remember to return as JSON STRING):
- "sum X where Y": '[{"$match": {...}}, {"$group": {"_id": null, "total": {"$sum": "$X"}}}]'
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
      const TestSchema = z.object({
        response: z.string(),
      });

      await this.client.responses.parse({
        model: this.model,
        input: [{ role: 'user', content: 'Hello' }],
        text: {
          format: zodTextFormat(TestSchema, 'test'),
        },
      });
      return true;
    } catch (error) {
      // Log the actual error for debugging
      if (error instanceof Error) {
        console.error(`❌ OpenAI connection test failed: ${error.message}`);
        if (error.message.includes('model')) {
          console.error(`💡 Model '${this.model}' may not be available. Try using a valid model like 'gpt-5-nano'`);
        }
      }
      return false;
    }
  }
}
