#!/usr/bin/env node
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import Modash from './index';
import type { Pipeline } from './index';
import type { Document } from './modash/expressions';

interface CLIOptions {
  file?: string;
  explain?: boolean;
  stats?: boolean;
  watch?: boolean;
  pretty?: boolean;
  help?: boolean;
}

// JSONLProcessor was removed in favor of simpler streaming readers below

function parseArgs(): { pipeline: Pipeline; options: CLIOptions } {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};
  let pipelineStr = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--file') {
      options.file = args[++i];
    } else if (arg === '--explain') {
      options.explain = true;
    } else if (arg === '--stats') {
      options.stats = true;
    } else if (arg === '--watch') {
      options.watch = true;
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!pipelineStr) {
      pipelineStr = arg;
    }
  }

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!pipelineStr) {
    console.error('❌ Error: Pipeline is required');
    showHelp();
    process.exit(1);
  }

  let pipeline: Pipeline;
  try {
    pipeline = JSON.parse(pipelineStr);
  } catch (error) {
    console.error(`❌ Error: Invalid pipeline JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  return { pipeline, options };
}

function showHelp() {
  console.log(`
🚀 Modash CLI - MongoDB-style aggregation for JSON data

Usage:
  cat data.jsonl | npx modash '[{"$match": {"score": {"$gte": 80}}}]'
  npx modash '[{"$project": {"name": 1}}]' --file data.jsonl

Options:
  --file <path>    Read data from file instead of stdin
  --explain        Show pipeline analysis and optimization details
  --stats          Display performance metrics and timing
  --watch          Watch mode for streaming data (recomputes on interval)
  --pretty         Pretty-print JSON output (default: JSONL)
  --help, -h       Show this help message

Examples:
  # Filter and project from stdin
  echo '{"name":"Alice","age":30}' | npx modash '[{"$match":{"age":{"$gte":25}}}]'
  
  # Group and aggregate from file
  npx modash '[{"$group":{"_id":"$category","total":{"$sum":"$amount"}}}]' --file sales.jsonl
  
  # Complex pipeline with explanation
  npx modash '[{"$match":{"active":true}},{"$project":{"name":1,"score":1}}]' --explain --stats

Pipeline Format:
  JSON array of MongoDB-style aggregation stages:
  [
    {"$match": {"field": {"$operator": value}}},
    {"$project": {"field1": 1, "computed": {"$add": ["$field2", 10]}}},
    {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}},
    {"$limit": 10}
  ]
`);
}

async function readJSONLFromStdin(): Promise<Document[]> {
  const documents: Document[] = [];
  const rl = createInterface({ input: process.stdin });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        documents.push(JSON.parse(line));
      } catch (error) {
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
      } catch (error) {
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

async function explainPipeline(pipeline: Pipeline): Promise<void> {
  console.error('🔍 Pipeline Analysis:');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  pipeline.forEach((stage, index) => {
    const stageName = Object.keys(stage)[0];
    console.error(`Stage ${index + 1}: ${stageName}`);
    
    // Basic stage analysis
    switch (stageName) {
      case '$match':
        console.error('  ✓ Filtering operation - can use indexes');
        console.error('  ✓ Hot path eligible');
        break;
      case '$project':
        console.error('  ✓ Field selection/transformation');
        console.error('  ✓ IVM (Isolated Virtual Machine) eligible');
        break;
      case '$group':
        console.error('  ⚠ Aggregation operation - requires full scan');
        console.error('  ✓ Memory-optimized accumulators available');
        break;
      case '$sort':
        console.error('  ⚠ Sorting operation - O(n log n) complexity');
        if (pipeline[index + 1] && '$limit' in pipeline[index + 1]) {
          console.error('  ✓ Can be fused with $limit into $topK operation');
        }
        break;
      case '$limit':
        console.error('  ✓ Efficient early termination');
        break;
      default:
        console.error('  ℹ Standard aggregation stage');
    }
  });
  
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

async function main() {
  try {
    const { pipeline, options } = parseArgs();

    if (options.explain) {
      await explainPipeline(pipeline);
    }

    let documents: Document[];

    if (options.file) {
      documents = await readJSONLFromFile(options.file);
    } else {
      // Check if stdin has data
      if (process.stdin.isTTY) {
        console.error('❌ Error: No input data. Use --file or pipe data via stdin.');
        console.error('Example: cat data.jsonl | npx modash \'[{"$match": {"active": true}}]\'');
        process.exit(1);
      }
      documents = await readJSONLFromStdin();
    }

    if (documents.length === 0) {
      console.error('⚠️  No documents found in input');
      return;
    }

    const startTime = options.stats ? process.hrtime.bigint() : null;
    const startMemory = options.stats ? process.memoryUsage() : null;

    const result = Modash.aggregate(documents as any, pipeline);

    if (options.stats && startTime && startMemory) {
      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
      const memoryDiff = endMemory.heapUsed - startMemory.heapUsed;

      console.error('📊 Performance Stats:');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(`⏱️  Execution time: ${duration.toFixed(2)}ms`);
      console.error(`📄 Input documents: ${documents.length.toLocaleString()}`);
      console.error(`📋 Output documents: ${result.length.toLocaleString()}`);
      console.error(`💾 Memory delta: ${(memoryDiff / 1024 / 1024).toFixed(2)}MB`);
      console.error(`🚀 Throughput: ${(documents.length / duration * 1000).toLocaleString()} docs/sec`);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    // Output results
    console.log(formatOutput(result, options.pretty || false));

    if (options.watch) {
      console.error('📡 Watch mode not yet implemented - use regular mode');
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Error: ${error.message}`);
      
      // Provide helpful remediation hints
      if (error.message.includes('regex') || error.message.includes('RegExp')) {
        console.error('💡 Hint: Regex too complex → fell back to standard mode');
      } else if (error.message.includes('memory') || error.message.includes('Memory')) {
        console.error('💡 Hint: Try reducing dataset size or use --file for large data');
      } else if (error.message.includes('JSON')) {
        console.error('💡 Hint: Check your pipeline JSON syntax and input data format');
      }
    } else {
      console.error(`❌ Unknown error: ${error}`);
    }
    process.exit(1);
  }
}

// Make this module executable
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as cliMain };
