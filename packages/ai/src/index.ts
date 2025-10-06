/**
 * @aggo/plugin-ai - AI-powered natural language to MongoDB pipeline conversion
 *
 * Converts natural language queries into MongoDB aggregation pipelines using OpenAI,
 * with automatic schema inference and optimized execution via aggo.
 * 
 * NEW: AI TUI 3 - Also generates rich terminal UIs that adapt to query results!
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

// NEW: Export TUI functionality
export {
  tuiQuery,
  renderTUI,
  aiTUI,
  validatePlan,
  type TUIQueryOptions,
  type TUIQueryResult,
  type PlanType
} from './tui.js';

// Export TUI planning functionality
export {
  TUIPlanner,
  createTUIPlanner,
  type TUIPlannergResult
} from './planner/tui-planner.js';

// Export schemas and specs
export {
  Plan,
  UISpec,
  QuerySpec,
  type PlanType as PlanSchema,
  type UISpecType,
  type QuerySpecType,
  type ComponentType,
  type JsonPathType
} from './specs/Plan.js';

// Export compiler functionality
export {
  compileToInk,
  validateUISpec,
  TUIApp,
  ComponentRenderer
} from './compiler/index.js';

// Export theme system
export {
  Theme,
  createTheme,
  defaultTheme,
  type ThemeConfig
} from './runtime/theme.js';

// Export data binding utilities
export {
  evaluateJSONPath,
  extractArrayItems,
  interpolateTemplate,
  isValidJSONPath,
  cachedEvaluateJSONPath,
  type JSONPathExpression
} from './runtime/data-binding.js';

export interface AIQueryOptions extends OpenAIOptions, SchemaInferenceOptions {
  /** Include explanation of the generated pipeline */
  includeExplanation?: boolean;
  /** Number of sample documents to include in LLM context */
  sampleDocuments?: number;
}

// ORIGINAL AI FUNCTIONS (backwards compatibility)
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

export function getSchema(
  documents: Document[],
  options: SchemaInferenceOptions = {}
): SimplifiedSchema {
  return inferSchema(documents, options);
}

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

export function formatSchema(schema: SimplifiedSchema): string {
  return JSON.stringify(schema, null, 2);
}

export function formatSamples(
  documents: Document[],
  limit: number = 3
): string {
  const samples = documents.slice(0, limit);
  return samples.map(doc => documentToExample(doc)).join('\n');
}
