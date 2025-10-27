/**
 * @aggo/plugin-ai - AI-powered natural language to MongoDB pipeline conversion
 *
 * Converts natural language queries into MongoDB aggregation pipelines using OpenAI,
 * with automatic schema inference and optimized execution via aggo.
 * Enhanced with Terminal UI (TUI) capabilities for beautiful data visualization.
 */

import { type Document } from 'aggo';
import {
  inferSchema,
  getSampleDocuments,
  documentToExample,
  type SchemaInferenceOptions,
  type SimplifiedSchema,
} from './schema-inference.js';

// Re-export utility functions
export { getSampleDocuments, documentToExample } from './schema-inference.js';
import {
  OpenAIClient,
  type OpenAIOptions,
  type PipelineGenerationResult,
} from './openai-client.js';

// Re-export types for convenience
export type {
  SimplifiedSchema,
  SchemaInferenceOptions,
} from './schema-inference.js';
export type {
  OpenAIOptions,
  PipelineGenerationResult,
} from './openai-client.js';
export type { Pipeline, Document } from 'aggo';

// Export new TUI types and functions
export type {
  QueryPlanType,
  AggUIType,
  NL2QueryAndUIType,
  Widget,
  WidgetKind,
  LayoutDirection,
} from './schemas.js';

export type {
  AITUIOptions,
  AITUIResult,
} from './tui-integration.js';

export {
  aiTUIQuery,
  renderAITUI,
  validateTUIConfig,
  getAvailableThemes,
  createDefaultPresentationSpec,
} from './tui-integration.js';

export { SimpleTUIManager } from './simple-tui.js';

export {
  evaluateJSONPath,
  formatValue,
  applyColorRules,
  getTerminalCapabilities,
  createFallbackTable,
} from './tui-utils.js';

export interface AIQueryOptions extends OpenAIOptions, SchemaInferenceOptions {
  /** Include explanation of the generated pipeline */
  includeExplanation?: boolean;
  /** Number of sample documents to include in LLM context */
  sampleDocuments?: number;
}

export interface AIQueryResult extends PipelineGenerationResult {
  /** Inferred schema from the input data */
  schema: SimplifiedSchema;
  /** Sample documents used for context */
  samples: any[];
  /** Aggregation results */
  results: Document[];
  /** Performance metrics */
  performance?: {
    schemaInferenceMs: number;
    pipelineGenerationMs: number;
    executionMs: number;
    totalMs: number;
  };
}

/**
 * Main AI query function - converts natural language to MongoDB pipeline and executes it
 *
 * @param documents - Input documents to query
 * @param query - Natural language query
 * @param options - Configuration options
 * @returns Query results with generated pipeline and execution data
 *
 * @example
 * ```typescript
 * import { aiQuery } from '@aggo/plugin-ai';
 *
 * const data = [
 *   { name: 'Alice', age: 30, department: 'Engineering' },
 *   { name: 'Bob', age: 25, department: 'Marketing' },
 *   { name: 'Carol', age: 35, department: 'Engineering' }
 * ];
 *
 * const result = await aiQuery(data, 'average age by department');
 * console.log(result.results);
 * console.log(result.explanation);
 * ```
 */
export async function aiQuery(
  documents: Document[],
  query: string,
  options: AIQueryOptions = {}
): Promise<AIQueryResult> {
  const startTime = Date.now();

  // Step 1: Schema inference
  const schemaStart = Date.now();
  const schema = inferSchema(documents, options);
  const schemaInferenceMs = Date.now() - schemaStart;

  // Step 2: Get sample documents
  const sampleCount = options.sampleDocuments || 3;
  const samples = getSampleDocuments(documents, sampleCount);

  // Step 3: Generate pipeline with OpenAI
  const pipelineStart = Date.now();
  const client = new OpenAIClient(options);
  const generationResult = await client.generatePipeline(
    query,
    schema,
    samples,
    { includeExplanation: options.includeExplanation }
  );
  const pipelineGenerationMs = Date.now() - pipelineStart;

  // Step 4: Execute pipeline
  const executionStart = Date.now();
  // Dynamic import to avoid circular dependency
  const Aggo = await import('aggo');
  const results = Aggo.default.aggregate(
    documents,
    generationResult.pipeline
  );
  const executionMs = Date.now() - executionStart;

  const totalMs = Date.now() - startTime;

  return {
    ...generationResult,
    schema,
    samples,
    results,
    performance: {
      schemaInferenceMs,
      pipelineGenerationMs,
      executionMs,
      totalMs,
    },
  };
}

/**
 * Infers and returns the schema of input documents without executing a query
 *
 * @param documents - Input documents to analyze
 * @param options - Schema inference options
 * @returns Simplified schema object
 *
 * @example
 * ```typescript
 * import { getSchema } from '@aggo/plugin-ai';
 *
 * const schema = getSchema(documents);
 * console.log(JSON.stringify(schema, null, 2));
 * ```
 */
export function getSchema(
  documents: Document[],
  options: SchemaInferenceOptions = {}
): SimplifiedSchema {
  return inferSchema(documents, options);
}

/**
 * Generates a MongoDB pipeline from natural language without executing it
 *
 * @param query - Natural language query
 * @param schema - Data schema (or documents to infer from)
 * @param sampleDocuments - Sample documents for context
 * @param options - OpenAI options
 * @returns Generated pipeline and metadata
 *
 * @example
 * ```typescript
 * import { generatePipeline, getSchema } from '@aggo/plugin-ai';
 *
 * const schema = getSchema(documents);
 * const result = await generatePipeline('top 5 users by score', schema);
 * console.log(result.pipeline);
 * ```
 */
export async function generatePipeline(
  query: string,
  schema: SimplifiedSchema | Document[],
  sampleDocuments: Document[] = [],
  options: OpenAIOptions = {}
): Promise<PipelineGenerationResult> {
  const actualSchema = Array.isArray(schema) ? inferSchema(schema) : schema;
  const samples = Array.isArray(schema)
    ? getSampleDocuments(schema, 3)
    : sampleDocuments;

  const client = new OpenAIClient(options);
  return client.generatePipeline(query, actualSchema, samples);
}

/**
 * Explains a natural language query by generating the pipeline and showing the mapping
 *
 * @param query - Natural language query
 * @param schema - Data schema (or documents to infer from)
 * @param sampleDocuments - Sample documents for context
 * @param options - OpenAI options
 * @returns Pipeline with detailed explanation
 */
export async function explainQuery(
  query: string,
  schema: SimplifiedSchema | Document[],
  sampleDocuments: Document[] = [],
  options: OpenAIOptions = {}
): Promise<PipelineGenerationResult> {
  return generatePipeline(query, schema, sampleDocuments, {
    ...options,
    includeExplanation: true,
  } as any);
}

/**
 * Validates that the AI plugin is properly configured
 *
 * @param options - OpenAI options to test
 * @returns True if configuration is valid
 */
export async function validateConfiguration(
  options: OpenAIOptions = {}
): Promise<boolean> {
  try {
    const client = new OpenAIClient(options);
    return await client.testConnection();
  } catch {
    return false;
  }
}

/**
 * Utility function to format schema for display
 *
 * @param schema - Schema object to format
 * @returns Formatted string representation
 */
export function formatSchema(schema: SimplifiedSchema): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * Utility function to format sample documents for display
 *
 * @param documents - Documents to format
 * @param limit - Maximum number of documents to show
 * @returns Formatted string representation
 */
export function formatSamples(
  documents: Document[],
  limit: number = 3
): string {
  const samples = documents.slice(0, limit);
  return samples.map(doc => documentToExample(doc)).join('\n');
}
