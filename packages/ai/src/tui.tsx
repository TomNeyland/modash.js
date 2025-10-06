/**
 * Main TUI integration - Natural Language → Query → Pretty TUI
 * Combines AI planning with reactive TUI rendering
 */

import React from 'react';
import { render } from 'ink';
import { type Document } from 'aggo';
import { Plan, type PlanType } from './specs/Plan.js';
import { TUIPlanner, type TUIPlannergResult } from './planner/tui-planner.js';
import { compileToInk, validateUISpec } from './compiler/index.js';
import { inferSchema, getSampleDocuments, type SchemaInferenceOptions } from './schema-inference.js';
import { type OpenAIOptions } from './openai-client.js';

export interface TUIQueryOptions extends OpenAIOptions, SchemaInferenceOptions {
  /** Include detailed performance metrics */
  includePerformance?: boolean;
  /** Number of sample documents for LLM context */
  sampleDocuments?: number;
  /** Enable streaming mode for large datasets */
  streaming?: boolean;
  /** Custom validation for UI specs */
  validateUI?: boolean;
}

export interface TUIQueryResult {
  /** Generated plan (query + UI spec) */
  plan: PlanType;
  /** Query results */
  results: Document[];
  /** Performance metrics */
  performance?: {
    schemaInferenceMs: number;
    planGenerationMs: number;
    executionMs: number;
    uiValidationMs: number;
    totalMs: number;
  };
  /** UI validation results */
  validation?: {
    valid: boolean;
    errors: string[];
  };
  /** Token usage from OpenAI */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Execute natural language query with TUI rendering
 * This is the main entry point for the AI TUI feature
 */
export async function tuiQuery(
  documents: Document[],
  query: string,
  options: TUIQueryOptions = {}
): Promise<TUIQueryResult> {
  const startTime = Date.now();

  // Step 1: Schema inference
  const schemaStart = Date.now();
  const schema = inferSchema(documents, options);
  const schemaInferenceMs = Date.now() - schemaStart;

  // Step 2: Get sample documents
  const sampleCount = options.sampleDocuments || 3;
  const samples = getSampleDocuments(documents, sampleCount);

  // Step 3: Generate plan (query + UI spec)
  const planStart = Date.now();
  const planner = new TUIPlanner(options);
  const planResult = await planner.generatePlan(query, schema, samples);
  const planGenerationMs = Date.now() - planStart;

  // Step 4: Validate UI spec
  const validationStart = Date.now();
  let validation: { valid: boolean; errors: string[] } | undefined;
  if (options.validateUI !== false) {
    validation = validateUISpec(planResult.plan.uiSpec);
  }
  const uiValidationMs = Date.now() - validationStart;

  // Step 5: Execute query
  const executionStart = Date.now();
  const Aggo = await import('aggo');
  const results = Aggo.default.aggregate(documents, planResult.plan.query.pipeline);
  const executionMs = Date.now() - executionStart;

  const totalMs = Date.now() - startTime;

  return {
    plan: planResult.plan,
    results,
    performance: options.includePerformance ? {
      schemaInferenceMs,
      planGenerationMs,
      executionMs,
      uiValidationMs,
      totalMs
    } : undefined,
    validation,
    usage: planResult.usage
  };
}

/**
 * Render TUI from query results
 * Shows the compiled UI in the terminal
 */
export function renderTUI(
  queryResult: TUIQueryResult,
  options: { onExit?: () => void } = {}
): void {
  const { plan, results } = queryResult;
  
  // Validate UI spec if not already done
  if (!queryResult.validation) {
    const validation = validateUISpec(plan.uiSpec);
    if (!validation.valid) {
      console.error('UI Spec validation failed:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      return;
    }
  }

  // Compile UI spec to Ink component
  const TUIComponent = compileToInk(plan.uiSpec, results);
  
  // Render in terminal
  const { unmount } = render(
    <TUIComponent onExit={() => {
      unmount();
      options.onExit?.();
    }} />
  );
}

/**
 * Complete AI TUI workflow: query → execute → render
 * One-shot function that does everything
 */
export async function aiTUI(
  documents: Document[],
  query: string,
  options: TUIQueryOptions & { onExit?: () => void } = {}
): Promise<void> {
  try {
    // Execute query and get results
    const result = await tuiQuery(documents, query, options);
    
    // Show performance metrics if requested
    if (result.performance) {
      console.error('🚀 AI TUI Performance:');
      console.error(`  Schema inference: ${result.performance.schemaInferenceMs}ms`);
      console.error(`  Plan generation: ${result.performance.planGenerationMs}ms`);
      console.error(`  Query execution: ${result.performance.executionMs}ms`);
      console.error(`  UI validation: ${result.performance.uiValidationMs}ms`);
      console.error(`  Total: ${result.performance.totalMs}ms`);
      console.error('');
    }

    // Show token usage if available
    if (result.usage) {
      console.error('🤖 OpenAI Usage:');
      console.error(`  Prompt tokens: ${result.usage.promptTokens}`);
      console.error(`  Completion tokens: ${result.usage.completionTokens}`);
      console.error(`  Total tokens: ${result.usage.totalTokens}`);
      console.error('');
    }

    // Render TUI
    renderTUI(result, { onExit: options.onExit });
    
  } catch (error) {
    console.error('❌ AI TUI Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Validate plan JSON (utility for testing)
 */
export function validatePlan(planJson: string): { valid: boolean; errors: string[]; plan?: PlanType } {
  try {
    const parsed = JSON.parse(planJson);
    const plan = Plan.parse(parsed);
    const uiValidation = validateUISpec(plan.uiSpec);
    
    return {
      valid: uiValidation.valid,
      errors: uiValidation.errors,
      plan
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Unknown parsing error']
    };
  }
}

// Export types for consumers
export type {
  TUIQueryOptions,
  TUIQueryResult,
  PlanType
};