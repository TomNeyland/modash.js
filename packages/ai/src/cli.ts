#!/usr/bin/env node

/**
 * AI CLI for modash - Natural language query interface
 *
 * Usage:
 *   cat data.jsonl | modash ai "average score by category"
 *   modash ai "sum total where status is active" --file data.jsonl
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { Command } from 'commander';
import {
  aiQuery,
  getSchema,
  generatePipeline,
  validateConfiguration,
  formatSchema,
} from './index.js';
import type { Document } from 'modash';

interface CLIOptions {
  file?: string;
  schemaOnly?: boolean;
  showPipeline?: boolean;
  limitSample?: number;
  model?: string;
  explain?: boolean;
  pretty?: boolean;
  apiKey?: string;
}

const program = new Command();

program
  .name('modash-ai')
  .description('AI-powered natural language queries for JSON data using modash')
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
    'gpt-4-turbo-preview'
  )
  .option('--explain', 'Include explanation of the generated pipeline')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--api-key <key>', 'OpenAI API key (or use OPENAI_API_KEY env var)')
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
  cat sales.jsonl | modash ai "total revenue by product category"
  
  # Show inferred schema
  cat data.jsonl | modash ai --schema-only
  
  # Generate pipeline without executing
  modash ai "average rating by genre" --file movies.jsonl --show-pipeline
  
  # Use specific OpenAI model
  cat logs.jsonl | modash ai "error count by service" --model gpt-4
  
  # Get detailed explanation
  modash ai "top 10 customers by order value" --file orders.jsonl --explain

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

  console.error(`📊 Loaded ${documents.length.toLocaleString()} documents`);

  // Handle schema-only mode (no OpenAI required)
  if (options.schemaOnly) {
    const schema = getSchema(documents, { sampleSize: options.limitSample });
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

  if (!(await validateConfiguration(openaiOptions))) {
    console.error('❌ Error: Unable to connect to OpenAI API');
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

  console.error(`🤖 Processing query: "${query}"`);

  // Handle show-pipeline mode
  if (options.showPipeline) {
    const schema = getSchema(documents, { sampleSize: options.limitSample });
    const result = await generatePipeline(
      query,
      schema,
      documents.slice(0, 3),
      openaiOptions
    );

    console.log('🔧 Generated Pipeline:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(JSON.stringify(result.pipeline, null, 2));

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

  // Execute full AI query
  const startTime = Date.now();
  const result = await aiQuery(documents, query, {
    ...openaiOptions,
    sampleSize: options.limitSample,
    includeExplanation: options.explain,
  });
  const totalTime = Date.now() - startTime;

  // Show performance stats
  if (result.performance) {
    console.error('⚡ Performance:');
    console.error(
      `   Schema inference: ${result.performance.schemaInferenceMs}ms`
    );
    console.error(
      `   Pipeline generation: ${result.performance.pipelineGenerationMs}ms`
    );
    console.error(`   Execution: ${result.performance.executionMs}ms`);
    console.error(`   Total: ${totalTime}ms`);
  }

  if (result.tokensUsed) {
    console.error(
      `💰 Tokens used: ${result.tokensUsed.total} (prompt: ${result.tokensUsed.prompt}, completion: ${result.tokensUsed.completion})`
    );
  }

  // Show explanation if requested
  if (result.explanation) {
    console.error('\n💡 Explanation:');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(result.explanation);
    console.error('');
  }

  // Output results
  console.log(formatOutput(result.results, options.pretty || false));
}

async function readInputDocuments(options: CLIOptions): Promise<Document[]> {
  if (options.file) {
    return readJSONLFromFile(options.file);
  } else {
    // Check if stdin has data
    if (process.stdin.isTTY) {
      console.error(
        '❌ Error: No input data. Use --file or pipe data via stdin.'
      );
      console.error(
        'Example: cat data.jsonl | modash ai "sum revenue by category"'
      );
      process.exit(1);
    }
    return readJSONLFromStdin();
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
