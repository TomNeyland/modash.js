#!/usr/bin/env node

/**
 * AI CLI for aggo - Natural language query interface
 *
 * Usage:
 *   cat data.jsonl | aggo ai "average score by category"
 *   aggo ai "sum total where status is active" --file data.jsonl
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import {
  getSchema,
  generatePipeline,
  validateConfiguration,
  formatSchema,
} from './index.js';
import { SPINNER_PHASES, withSpinner, createPhaseSpinner } from './spinner.js';
import { TerminalUIRenderer } from './terminal-ui-renderer.js';
type Document = Record<string, any>;

interface CLIOptions {
  file?: string;
  schemaOnly?: boolean;
  showPipeline?: boolean;
  limitSample?: number;
  model?: string;
  explain?: boolean;
  pretty?: boolean;
  apiKey?: string;
  noUi?: boolean;
  rawOutput?: boolean;
}

const program = new Command();

program
  .name('aggo-ai')
  .description('AI-powered natural language queries for JSON data using aggo')
  .version('0.1.0')
  .argument('[query]', 'Natural language query')
  .option('-f, --file <path>', 'Read data from file instead of stdin')
  .option('--schema-only', 'Show inferred schema without querying')
  .option('--show-pipeline', "Print generated pipeline but don't run it")
  .option(
    '--limit-sample <n>',
    'Control rows sampled for schema inference',
    parseInt
  )
  .option(
    '--model <model>',
    'Override default OpenAI model',
    'gpt-5-nano'
  )
  .option('--explain', 'Include explanation of the generated pipeline')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--api-key <key>', 'OpenAI API key (or use OPENAI_API_KEY env var)')
  .option('--no-ui', 'Disable automatic UI generation (use raw JSON output)')
  .option('--raw-output', 'Output raw JSON without terminal UI formatting')
  .action(async (query: string | undefined, options: CLIOptions) => {
    try {
      await runAICommand(query, options);
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
  # Basic natural language query
  cat sales.jsonl | aggo ai "total revenue by product category"
  
  # Show inferred schema
  cat data.jsonl | aggo ai --schema-only
  
  # Generate pipeline without executing
  aggo ai "average rating by genre" --file movies.jsonl --show-pipeline
  
  # Use specific OpenAI model
  cat logs.jsonl | aggo ai "error count by service" --model gpt-4
  
  # Get detailed explanation with beautiful UI
  aggo ai "top 10 customers by order value" --file orders.jsonl --explain

  # Disable automatic UI for raw JSON output
  cat data.jsonl | aggo ai "sum revenue by category" --no-ui --pretty

  # Show just the pipeline without execution
  aggo ai "average rating by genre" --file movies.jsonl --show-pipeline

Environment Variables:
  OPENAI_API_KEY    OpenAI API key for pipeline generation (required)

Note: This command requires an OpenAI API key to convert natural language
queries into MongoDB aggregation pipelines.
`
);

async function runAICommand(
  query: string | undefined,
  options: CLIOptions
): Promise<void> {
  // Read input documents first
  const documents = await readInputDocuments(options);

  if (documents.length === 0) {
    console.error('⚠️  No documents found in input');
    return;
  }

  // Handle schema-only mode (no OpenAI required)
  if (options.schemaOnly) {
    const schema = await withSpinner(
      () =>
        Promise.resolve(
          getSchema(documents, { sampleSize: options.limitSample })
        ),
      SPINNER_PHASES.SCHEMA_INFERENCE,
      { successMessage: '✅ Schema analysis completed' }
    );
    console.log('📋 Inferred Schema:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(formatSchema(schema));
    return;
  }

  // Validate OpenAI configuration for modes that need it
  const openaiOptions = {
    apiKey: options.apiKey,
    model: options.model,
  };

  // Test OpenAI connection with spinner
  // Test OpenAI connection silently
  const isConfigValid = await validateConfiguration(openaiOptions);

  if (!isConfigValid) {
    console.error('❌ OpenAI connection failed');
    console.error(
      '💡 Hint: Check your OPENAI_API_KEY environment variable or --api-key option'
    );
    process.exit(1);
  }

  // Validate query is provided for non-schema modes
  if (!query) {
    console.error('❌ Error: Query is required');
    console.error(
      '💡 Use --schema-only to see the data schema, or provide a natural language query'
    );
    process.exit(1);
  }


  // Handle show-pipeline mode
  if (options.showPipeline) {
    // Schema inference with spinner
    const schema = await withSpinner(
      () =>
        Promise.resolve(
          getSchema(documents, { sampleSize: options.limitSample })
        ),
      SPINNER_PHASES.SCHEMA_INFERENCE,
      { successMessage: '' }
    );

    // Pipeline generation with spinner
    const result = await withSpinner(
      () =>
        generatePipeline(query, schema, documents.slice(0, 3), {
          ...openaiOptions,
          generateUI: !options.noUi,
        }),
      SPINNER_PHASES.OPENAI_GENERATION,
      { successMessage: '' }
    );

    console.log('🔧 Generated Pipeline:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(JSON.stringify(result.pipeline, null, 2));

    if (result.uiInstructions && !options.noUi) {
      console.log('\n🎨 UI Instructions:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(JSON.stringify(result.uiInstructions, null, 2));
      
      if (result.uiReasoning) {
        console.log('\n🧠 UI Design Reasoning:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(result.uiReasoning);
      }
    }

    if (result.explanation) {
      console.log('\n💡 Explanation:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(result.explanation);
    }

    if (result.tokensUsed) {
      console.error(
        `\n📊 Tokens used: ${result.tokensUsed.total} (prompt: ${result.tokensUsed.prompt}, completion: ${result.tokensUsed.completion})`
      );
    }

    return;
  }

  // Execute full AI query with enhanced UI
  const startTime = Date.now();
  const result = await executeAIQueryWithUI(documents, query, {
    ...openaiOptions,
    sampleSize: options.limitSample,
    includeExplanation: options.explain,
    generateUI: !options.noUi,
    rawOutput: options.rawOutput,
  });
  const totalTime = Date.now() - startTime;

  // Don't show stats unless explicitly requested

  // Show explanation if requested and not using UI
  if (result.explanation && (options.rawOutput || options.noUi)) {
    console.error('\n💡 Explanation:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(result.explanation);
    console.error('');
  }

  // Output results
  if (options.rawOutput || options.noUi || !result.uiInstructions) {
    // Use traditional JSON output
    console.log(formatOutput(result.results, options.pretty || false));
  } else {
    // Use beautiful terminal UI
    const renderer = new TerminalUIRenderer(result.uiInstructions);
    await renderer.render(result.results);
    
    // Show UI reasoning if available and explain was requested
    if (result.uiReasoning && options.explain) {
      console.error(chalk.gray('\n🎨 UI Design Reasoning:'));
      console.error(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.error(chalk.gray(result.uiReasoning));
    }
  }
}

/**
 * Execute AI query with enhanced UI experience
 */
async function executeAIQueryWithUI(
  documents: Document[],
  query: string,
  options: any
) {
  // Phase 1: Schema Inference
  const schemaSpinner = createPhaseSpinner('SCHEMA_INFERENCE');
  schemaSpinner.start(SPINNER_PHASES.SCHEMA_INFERENCE);

  let schema;
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    schemaSpinner.nextPhrase();

    schema = getSchema(documents, { sampleSize: options.sampleSize });

    await new Promise(resolve => setTimeout(resolve, 100));
    schemaSpinner.stop('');  // Clear the spinner without message
  } catch (error) {
    schemaSpinner.stop('❌ Schema analysis failed', 'red');
    throw error;
  }

  // Phase 2: Pipeline and UI Generation
  const samples = documents.slice(0, 3);
  const pipelineSpinner = createPhaseSpinner('OPENAI_GENERATION');
  pipelineSpinner.start(SPINNER_PHASES.OPENAI_GENERATION);

  let generationResult;
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    pipelineSpinner.nextPhrase();

    // Dynamic import to avoid circular dependency
    const { OpenAIClient } = await import('./openai-client.js');
    const client = new OpenAIClient(options);

    await new Promise(resolve => setTimeout(resolve, 200));
    pipelineSpinner.nextPhrase();

    generationResult = await client.generatePipeline(query, schema, samples, {
      includeExplanation: options.includeExplanation,
      generateUI: options.generateUI,
    });

    pipelineSpinner.stop('');  // Clear the spinner without message
  } catch (error) {
    pipelineSpinner.stop('❌ Generation failed', 'red');
    throw error;
  }

  // Phase 3: Execution
  const executionResult = await withSpinner(
    async () => {
      // Convert documents to JSONL format
      const jsonlData = documents.map(doc => JSON.stringify(doc)).join('\n');

      // Execute aggo CLI with the pipeline
      const pipelineStr = JSON.stringify(generationResult.pipeline);

      try {
        // Run aggo CLI and pass data via stdin
        // Use node to run the aggo CLI script
        const output = execSync(`node ../aggo/dist/cli.js '${pipelineStr}'`, {
          input: jsonlData,
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large results
        });

        // Parse the JSONL output back to array
        const results = output
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));

        return results;
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Aggo execution failed: ${error.message}`);
        }
        throw error;
      }
    },
    SPINNER_PHASES.EXECUTION,
    { successMessage: '' }  // Clear spinner without message
  );

  return {
    ...generationResult,
    schema,
    samples,
    results: executionResult,
    performance: {
      schemaInferenceMs: 0, // These will be calculated by the calling function
      pipelineGenerationMs: 0,
      executionMs: 0,
    },
  };
}

async function readInputDocuments(options: CLIOptions): Promise<Document[]> {
  if (options.file) {
    return withSpinner(
      () => readJSONLFromFile(options.file!),
      'Loading data',
      { successMessage: '' }
    );
  } else {
    // Check if stdin has data
    if (process.stdin.isTTY) {
      console.error(
        '❌ Error: No input data. Use --file or pipe data via stdin.'
      );
      console.error(
        'Example: cat data.jsonl | aggo ai "sum revenue by category"'
      );
      process.exit(1);
    }
    return withSpinner(() => readJSONLFromStdin(), 'Reading data', {
      successMessage: '',
    });
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

// Handle uncaught errors gracefully
process.on('uncaughtException', error => {
  if (error.message.includes('OPENAI_API_KEY')) {
    console.error('❌ Error: OpenAI API key is required');
    console.error(
      '💡 Set OPENAI_API_KEY environment variable or use --api-key option'
    );
  } else if (error.message.includes('quota')) {
    console.error('❌ Error: OpenAI API quota exceeded');
    console.error('💡 Check your OpenAI account usage and billing');
  } else if (
    error.message.includes('network') ||
    error.message.includes('fetch')
  ) {
    console.error('❌ Error: Network connection failed');
    console.error('💡 Check your internet connection and try again');
  } else {
    console.error(`❌ Unexpected error: ${error.message}`);
  }
  process.exit(1);
});

program.parse();
