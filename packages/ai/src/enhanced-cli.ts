#!/usr/bin/env node

/**
 * Enhanced AI CLI with structured output and TUI support
 * 
 * Usage:
 *   cat data.jsonl | aggo ai "top 10 users by score" --tui
 *   aggo ai "revenue by category" --file data.jsonl --structured
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { Command } from 'commander';
import {
  getSchema,
  formatSchema,
} from './index.js';
import { StructuredOpenAIClient } from './structured-client.js';
import { renderTUIApp } from './tui-app.js';
import { executePipelineString, attemptJsonFix } from './engine/run_pipeline.js';
import { SPINNER_PHASES, withSpinner, createPhaseSpinner } from './spinner.js';
import type { Document } from 'aggo';

interface EnhancedCLIOptions {
  file?: string;
  schemaOnly?: boolean;
  showPipeline?: boolean;
  structured?: boolean;
  tui?: boolean;
  limitSample?: number;
  model?: string;
  explain?: boolean;
  pretty?: boolean;
  apiKey?: string;
  streaming?: boolean;
  emitMs?: number;
  maxDocs?: number;
}

const program = new Command();

program
  .name('aggo-ai-enhanced')
  .description('Enhanced AI-powered natural language queries with TUI support')
  .version('0.2.0')
  .argument('[query]', 'Natural language query')
  .option('-f, --file <path>', 'Read data from file instead of stdin')
  .option('--schema-only', 'Show inferred schema without querying')
  .option('--show-pipeline', "Print generated pipeline but don't run it")
  .option('--structured', 'Use structured output mode (pipeline + UIDSL)')
  .option('--tui', 'Launch interactive TUI (implies --structured)')
  .option('--streaming', 'Enable streaming mode for live updates')
  .option('--emit-ms <ms>', 'Streaming update interval in milliseconds', parseInt)
  .option('--max-docs <n>', 'Maximum documents to process', parseInt)
  .option(
    '--limit-sample <n>',
    'Control rows sampled for schema inference',
    parseInt
  )
  .option(
    '--model <model>',
    'Override default OpenAI model',
    'gpt-4o-2024-08-06'
  )
  .option('--explain', 'Include explanation of the generated pipeline')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--api-key <key>', 'OpenAI API key (or use OPENAI_API_KEY env var)')
  .action(async (query: string | undefined, options: EnhancedCLIOptions) => {
    try {
      await runEnhancedCommand(query, options);
    } catch (error) {
      console.error(
        `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  });

// Add help examples
program.addHelpText(
  'after',
  `
Examples:
  # Basic natural language query with TUI
  cat sales.jsonl | aggo-ai-enhanced "revenue by category" --tui
  
  # Structured output mode
  cat data.jsonl | aggo-ai-enhanced "top 10 users by score" --structured
  
  # Streaming dashboard
  tail -f logs.jsonl | aggo-ai-enhanced "error count by service" --tui --streaming
  
  # Show schema only
  cat data.jsonl | aggo-ai-enhanced --schema-only
  
  # Generate pipeline without execution
  aggo-ai-enhanced "average rating by genre" --file movies.jsonl --show-pipeline

Environment Variables:
  OPENAI_API_KEY    OpenAI API key for pipeline generation (required)

Note: TUI mode provides an interactive terminal interface with tables, charts,
and real-time updates. Use --structured for JSON output with both pipeline
and UI DSL.
`
);

async function runEnhancedCommand(
  query: string | undefined,
  options: EnhancedCLIOptions
): Promise<void> {
  // Read input documents first
  let documents: Document[];

  if (options.file) {
    documents = await readJSONLFromFile(options.file);
  } else {
    // Check if stdin has data
    if (process.stdin.isTTY) {
      console.error(
        '❌ Error: No input data. Use --file or pipe data via stdin.'
      );
      console.error(
        'Example: cat data.jsonl | aggo-ai-enhanced "your query" --tui'
      );
      process.exit(1);
    }
    documents = await readJSONLFromStdin();
  }

  if (documents.length === 0) {
    console.error('⚠️  No documents found in input');
    return;
  }

  console.error(`📄 Loaded ${documents.length.toLocaleString()} documents`);

  // Schema inference
  const schema = getSchema(documents, { 
    sampleSize: options.limitSample || 100 
  });

  if (options.schemaOnly) {
    console.log(formatSchema(schema));
    return;
  }

  if (!query) {
    console.error('❌ Error: Query is required when not using --schema-only');
    process.exit(1);
  }

  // Determine mode
  const useStructured = options.structured || options.tui;
  const useStreaming = options.streaming;

  if (useStructured) {
    await runStructuredMode(query, documents, schema, options);
  } else {
    // Legacy mode - use original client
    console.error('💡 Hint: Try --tui for interactive terminal interface!');
    await runLegacyMode(query, documents, schema, options);
  }
}

async function runStructuredMode(
  query: string,
  documents: Document[],
  schema: any,
  options: EnhancedCLIOptions
) {
  const client = new StructuredOpenAIClient({
    apiKey: options.apiKey,
    model: options.model,
    temperature: 0.1
  });

  console.error('🤖 Generating structured plan...');

  // Generate structured plan with spinner
  const result = await withSpinner(
    () => client.generateStructuredPlan(query, schema, documents.slice(0, 3)),
    SPINNER_PHASES.GENERATING
  );

  const { plan, pipelineJson, uidsl } = result;

  // Add windowing configuration if streaming enabled
  if (options.streaming) {
    plan.w = {
      mode: 'u',
      emitMs: options.emitMs || 1000,
      maxDocs: options.maxDocs
    };
  }

  console.error(`📊 Generated pipeline: ${pipelineJson.slice(0, 100)}...`);
  console.error(`🎨 Generated UI: ${uidsl}`);

  if (options.showPipeline) {
    console.log('Pipeline JSON:');
    console.log(JSON.stringify(JSON.parse(pipelineJson), null, 2));
    console.log('\nUIDSL:');
    console.log(uidsl);
    return;
  }

  if (options.tui) {
    // Launch TUI
    console.error('🚀 Launching TUI...');
    
    // Clear screen and hide cursor
    process.stdout.write('\x1b[2J\x1b[0;0H\x1b[?25l');
    
    try {
      renderTUIApp(plan, documents);
    } finally {
      // Restore cursor
      process.stdout.write('\x1b[?25h');
    }
  } else {
    // Structured JSON output
    console.log(JSON.stringify({
      plan,
      schema,
      query,
      tokensUsed: result.tokensUsed,
      inputDocuments: documents.length
    }, null, options.pretty ? 2 : undefined));
  }
}

async function runLegacyMode(
  query: string,
  documents: Document[],
  schema: any,
  options: EnhancedCLIOptions
) {
  // Import legacy functions
  const { generatePipeline } = await import('./index.js');
  
  console.error('🤖 Generating MongoDB pipeline...');

  const result = await withSpinner(
    () => generatePipeline(query, schema, documents.slice(0, 3)),
    SPINNER_PHASES.GENERATING
  );

  if (options.showPipeline) {
    console.log(JSON.stringify(result.pipeline, null, 2));
    if (result.explanation) {
      console.error('\nExplanation:', result.explanation);
    }
    return;
  }

  // Execute pipeline
  console.error('⚡ Executing pipeline...');
  
  const execResult = await executePipelineString(
    JSON.stringify(result.pipeline),
    documents
  );

  if (!execResult.success) {
    console.error(`❌ Pipeline execution failed: ${execResult.error?.message}`);
    
    // Try to fix common JSON issues
    if (execResult.error?.type === 'parse') {
      console.error('🔧 Attempting to fix JSON...');
      const fixed = attemptJsonFix(JSON.stringify(result.pipeline));
      
      const retryResult = await executePipelineString(fixed, documents);
      if (retryResult.success && retryResult.results) {
        console.log(formatOutput(retryResult.results, options.pretty || false));
        return;
      }
    }
    
    process.exit(1);
  }

  // Output results
  console.log(formatOutput(execResult.results || [], options.pretty || false));

  if (execResult.performance) {
    const perf = execResult.performance;
    console.error('📊 Performance:');
    console.error(`⏱️  Total: ${perf.totalMs}ms (parse: ${perf.parseMs}ms, exec: ${perf.executionMs}ms)`);
    console.error(`📄 ${perf.inputCount} → ${perf.outputCount} documents`);
  }
}

async function readJSONLFromStdin(): Promise<Document[]> {
  const documents: Document[] = [];
  const rl = createInterface({ input: process.stdin });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        documents.push(JSON.parse(line));
      } catch (_error) {
        console.error(`⚠️  Invalid JSON line: ${line}`);
      }
    }
  }

  return documents;
}

async function readJSONLFromFile(filepath: string): Promise<Document[]> {
  const documents: Document[] = [];
  const fileStream = createReadStream(filepath, { encoding: 'utf8' });
  const rl = createInterface({ input: fileStream });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        documents.push(JSON.parse(line));
      } catch (_error) {
        console.error(`⚠️  Invalid JSON line: ${line}`);
      }
    }
  }

  return documents;
}

function formatOutput(result: ReadonlyArray<unknown>, pretty: boolean): string {
  if (pretty) {
    return JSON.stringify(result, null, 2);
  } else {
    return result.map(doc => JSON.stringify(doc)).join('\n');
  }
}

// Make this module executable
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { program as enhancedProgram };