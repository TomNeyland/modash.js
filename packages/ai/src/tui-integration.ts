/**
 * TUI Integration - Main entry point for AI + TUI functionality
 */

import type { Document } from 'aggo';
import { OpenAIClient, type OpenAIOptions, type TUIGenerationOptions } from './openai-client.js';
import { SimpleTUIManager } from './simple-tui.js';
import { getTerminalCapabilities, createFallbackTable } from './tui-utils.js';
import { NL2QueryAndUI, type AggUIType } from './schemas.js';
import { inferSchema, getSampleDocuments, type SchemaInferenceOptions } from './schema-inference.js';

export interface AITUIOptions extends OpenAIOptions, SchemaInferenceOptions {
  /** Enable TUI rendering */
  enableTUI?: boolean;
  /** Enable streaming updates */
  streaming?: boolean;
  /** Force fallback to table view */
  forceFallback?: boolean;
  /** Include explanation in output */
  includeExplanation?: boolean;
}

export interface AITUIResult {
  /** Generated pipeline */
  pipeline: any[];
  /** Query execution results */
  results: Document[];
  /** TUI presentation specification */
  presentationSpec?: AggUIType;
  /** Intent description */
  intent?: string;
  /** Explanation (if requested) */
  explanation?: string;
  /** Performance metrics */
  performance?: {
    schemaInferenceMs: number;
    pipelineGenerationMs: number;
    executionMs: number;
    totalMs: number;
  };
  /** Token usage */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Main AI TUI query function
 */
export async function aiTUIQuery(
  documents: Document[],
  query: string,
  options: AITUIOptions = {}
): Promise<AITUIResult> {
  const startTime = Date.now();

  // Step 1: Schema inference
  const schemaStart = Date.now();
  const schema = inferSchema(documents, options);
  const schemaInferenceMs = Date.now() - schemaStart;

  // Step 2: Get sample documents
  const sampleCount = 3;
  const samples = getSampleDocuments(documents, sampleCount);

  // Step 3: Generate pipeline + TUI spec with OpenAI
  const pipelineStart = Date.now();
  const client = new OpenAIClient(options);
  
  const tuiOptions: TUIGenerationOptions = {
    includeTUI: options.enableTUI !== false,
    includeExplanation: options.includeExplanation,
  };
  
  const generationResult = await client.generatePipeline(query, schema, samples, tuiOptions);
  const pipelineGenerationMs = Date.now() - pipelineStart;

  // Step 4: Execute pipeline
  const executionStart = Date.now();
  const Aggo = await import('aggo');
  const results = Aggo.default.aggregate(documents, generationResult.pipeline);
  const executionMs = Date.now() - executionStart;

  const totalMs = Date.now() - startTime;

  return {
    pipeline: generationResult.pipeline,
    results,
    presentationSpec: generationResult.presentationSpec,
    intent: generationResult.intent,
    explanation: generationResult.explanation,
    performance: {
      schemaInferenceMs,
      pipelineGenerationMs,
      executionMs,
      totalMs,
    },
    tokensUsed: generationResult.tokensUsed,
  };
}

/**
 * Render AI TUI query results
 */
export async function renderAITUI(
  documents: Document[],
  query: string,
  options: AITUIOptions = {}
): Promise<void> {
  try {
    // Execute AI query
    const result = await aiTUIQuery(documents, query, options);
    
    // Check terminal capabilities
    const capabilities = getTerminalCapabilities();
    
    // Decide on rendering approach
    const shouldUseTUI = 
      !options.forceFallback &&
      options.enableTUI !== false &&
      result.presentationSpec &&
      capabilities.hasColor &&
      !capabilities.isSmall;

    if (shouldUseTUI) {
      // Use TUI rendering
      console.error('🖥️  Launching Terminal UI...\n');
      const tuiManager = new SimpleTUIManager();
      
      // Prepare result data in expected format
      const tuiData = {
        rows: result.results,
        meta: {
          count: result.results.length,
          executionTime: result.performance?.executionMs,
          pipeline: result.pipeline,
        },
      };
      
      await tuiManager.renderTUI(tuiData, result.presentationSpec!, options.streaming);
      
      // Show performance stats in stderr so they don't interfere with TUI
      if (result.performance) {
        console.error(`⚡ Performance: ${result.performance.totalMs}ms total`);
      }
      if (result.tokensUsed) {
        console.error(`💰 Tokens: ${result.tokensUsed.total} (${result.tokensUsed.prompt}+${result.tokensUsed.completion})`);
      }
      
    } else {
      // Fallback to table/JSON output
      console.error('📊 Terminal UI not supported, using table view:\n');
      
      if (result.presentationSpec?.ux?.smallScreenFallback === 'json' || !Array.isArray(result.results)) {
        console.log(JSON.stringify(result.results, null, 2));
      } else {
        // Use table fallback
        const tableOutput = await createFallbackTable(result.results);
        console.log(tableOutput);
      }
      
      // Show stats
      if (result.performance) {
        console.error(`\n⚡ Performance: ${result.performance.totalMs}ms total`);
      }
      if (result.explanation) {
        console.error(`\n💡 ${result.explanation}`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Provide helpful hints
    if (error instanceof Error) {
      if (error.message.includes('OPENAI_API_KEY')) {
        console.error('💡 Hint: Set OPENAI_API_KEY environment variable');
      } else if (error.message.includes('quota')) {
        console.error('💡 Hint: Check your OpenAI account usage and billing');
      } else if (error.message.includes('network')) {
        console.error('💡 Hint: Check your internet connection');
      }
    }
    
    process.exit(1);
  }
}

/**
 * Validate TUI configuration
 */
export function validateTUIConfig(options: AITUIOptions): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check for required API key
  if (!options.apiKey && !process.env.OPENAI_API_KEY) {
    return { valid: false, warnings: ['OpenAI API key is required'] };
  }
  
  // Check terminal capabilities
  const capabilities = getTerminalCapabilities();
  
  if (!capabilities.hasColor) {
    warnings.push('Terminal does not support colors - TUI may not display properly');
  }
  
  if (!capabilities.hasUnicode) {
    warnings.push('Terminal does not support Unicode - some TUI elements may not render correctly');
  }
  
  if (capabilities.isSmall) {
    warnings.push('Terminal size is small - consider using --fallback mode for better readability');
  }
  
  return { valid: true, warnings };
}

/**
 * Get available TUI themes based on terminal capabilities
 */
export function getAvailableThemes(): string[] {
  const capabilities = getTerminalCapabilities();
  
  const themes = ['auto'];
  
  if (capabilities.hasColor) {
    themes.push('dark', 'light');
  }
  
  return themes;
}

/**
 * Create default presentation spec for common query types
 */
export function createDefaultPresentationSpec(
  queryType: 'table' | 'chart' | 'metric' | 'summary',
  data: any[]
): AggUIType {
  const baseSpec: AggUIType = {
    layout: {
      direction: 'row',
      children: [],
    },
    ux: {
      keys: { q: 'quit', escape: 'quit' },
      theme: 'auto',
      smallScreenFallback: 'table',
    },
  };

  switch (queryType) {
    case 'table':
      baseSpec.layout.children = [
        {
          id: 'main-table',
          kind: 'table',
          title: 'Query Results',
          bind: { path: '$.rows' },
          width: '100%',
          height: '100%',
        },
      ];
      break;

    case 'chart':
      // Auto-detect x/y fields for charts
      const fields = data.length > 0 ? Object.keys(data[0]) : [];
      const xField = fields.find(f => ['name', 'category', 'date', 'time'].some(k => f.toLowerCase().includes(k))) || fields[0];
      const yField = fields.find(f => ['count', 'total', 'sum', 'avg', 'value', 'amount'].some(k => f.toLowerCase().includes(k))) || fields[1];

      baseSpec.layout.children = [
        {
          id: 'chart',
          kind: 'chart.bar',
          title: 'Chart View',
          bind: { path: '$.rows', x: xField, y: yField },
          width: '100%',
          height: '100%',
        },
      ];
      break;

    case 'metric':
      baseSpec.layout.children = [
        {
          id: 'metric',
          kind: 'metric',
          title: 'Result',
          bind: { path: '$.rows[0]' },
          width: '100%',
          height: '100%',
        },
      ];
      break;

    default:
      // Default to table
      baseSpec.layout.children = [
        {
          id: 'default-table',
          kind: 'table',
          title: 'Results',
          bind: { path: '$.rows' },
          width: '100%',
          height: '100%',
        },
      ];
  }

  return baseSpec;
}