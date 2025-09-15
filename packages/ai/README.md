# @modash/plugin-ai

🤖 AI-powered natural language to MongoDB pipeline conversion for modash.js

Convert natural language queries into MongoDB aggregation pipelines using OpenAI, with automatic schema inference and optimized execution via modash.

## Installation

```bash
npm install @modash/plugin-ai
```

**Requirements:**

- Node.js 18+
- OpenAI API key
- `modash` as a peer dependency

## Quick Start

### Environment Setup

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### CLI Usage

```bash
# Basic natural language query
cat sales.jsonl | npx modash-ai "total revenue by product category"

# Show inferred schema
cat data.jsonl | npx modash-ai --schema-only

# Generate pipeline without executing
npx modash-ai "average rating by genre" --file movies.jsonl --show-pipeline

# Use specific OpenAI model
cat logs.jsonl | npx modash-ai "error count by service" --model gpt-4

# Get detailed explanation
npx modash-ai "top 10 customers by order value" --file orders.jsonl --explain
```

### Programmatic Usage

```typescript
import { aiQuery, getSchema, generatePipeline } from '@modash/plugin-ai';

const data = [
  { name: 'Alice', age: 30, department: 'Engineering', salary: 95000 },
  { name: 'Bob', age: 25, department: 'Marketing', salary: 75000 },
  { name: 'Carol', age: 35, department: 'Engineering', salary: 110000 },
];

// Execute natural language query
const result = await aiQuery(data, 'average salary by department');
console.log(result.results);
// Output: [
//   { _id: 'Engineering', avgSalary: 102500 },
//   { _id: 'Marketing', avgSalary: 75000 }
// ]

// Get schema information
const schema = getSchema(data);
console.log(schema);
// Output: {
//   name: 'string',
//   age: 'integer',
//   department: 'string',
//   salary: 'integer'
// }

// Generate pipeline only
const pipeline = await generatePipeline(
  'count employees by department',
  schema
);
console.log(pipeline.pipeline);
// Output: [
//   { $group: { _id: '$department', count: { $sum: 1 } } }
// ]
```

## CLI Options

```
Usage: modash-ai [query] [options]

Options:
  -f, --file <path>         Read data from file instead of stdin
  --schema-only            Show inferred schema without querying
  --show-pipeline          Print generated pipeline but don't run it
  --limit-sample <n>       Control rows sampled for schema inference
  --model <model>          Override default OpenAI model
  --explain                Include explanation of the generated pipeline
  --pretty                 Pretty-print JSON output
  --api-key <key>          OpenAI API key (or use OPENAI_API_KEY env var)
  -h, --help               Show help message
```

## API Reference

### `aiQuery(documents, query, options)`

Executes a natural language query against documents.

**Parameters:**

- `documents`: Array of documents to query
- `query`: Natural language query string
- `options`: Configuration options

**Returns:** `AIQueryResult` with pipeline, results, schema, and performance metrics

### `getSchema(documents, options)`

Infers schema from documents without executing a query.

**Parameters:**

- `documents`: Array of documents to analyze
- `options`: Schema inference options

**Returns:** Simplified schema object

### `generatePipeline(query, schema, samples, options)`

Generates MongoDB pipeline from natural language without executing.

**Parameters:**

- `query`: Natural language query
- `schema`: Data schema or documents to infer from
- `samples`: Sample documents for context
- `options`: OpenAI configuration

**Returns:** Generated pipeline with metadata

## Natural Language Examples

| Query                                    | Generated Pipeline                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `"sum revenue"`                          | `[{"$group": {"_id": null, "total": {"$sum": "$revenue"}}}]`                                  |
| `"average score by category"`            | `[{"$group": {"_id": "$category", "avg": {"$avg": "$score"}}}]`                               |
| `"top 5 users by points"`                | `[{"$sort": {"points": -1}}, {"$limit": 5}]`                                                  |
| `"count orders where status is shipped"` | `[{"$match": {"status": "shipped"}}, {"$count": "total"}]`                                    |
| `"revenue by month for 2023"`            | `[{"$match": {"year": 2023}}, {"$group": {"_id": "$month", "revenue": {"$sum": "$amount"}}}]` |

## Configuration

### OpenAI Models

Supported models (default: `gpt-4-turbo-preview`):

- `gpt-4-turbo-preview` - Best accuracy, higher cost
- `gpt-4` - Good balance of accuracy and cost
- `gpt-3.5-turbo` - Faster, lower cost, less accurate

### Schema Inference

Options for `getSchema()` and `aiQuery()`:

- `sampleSize`: Number of documents to sample (default: 100)
- `maxDepth`: Maximum depth for nested objects (default: 5)

### Performance

The plugin provides detailed performance metrics:

```typescript
const result = await aiQuery(data, 'query');
console.log(result.performance);
// {
//   schemaInferenceMs: 15,
//   pipelineGenerationMs: 850,
//   executionMs: 5,
//   totalMs: 870
// }
```

## Error Handling

Common errors and solutions:

### Missing API Key

```
❌ Error: OpenAI API key is required
💡 Set OPENAI_API_KEY environment variable or use --api-key option
```

### Invalid Query

```
❌ Error: Unable to generate valid pipeline
💡 Try rephrasing your query or check the schema with --schema-only
```

### API Limits

```
❌ Error: OpenAI API quota exceeded
💡 Check your OpenAI account usage and billing
```

## Advanced Usage

### Custom Model Configuration

```typescript
const result = await aiQuery(data, 'query', {
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  maxTokens: 800,
});
```

### Schema-First Development

```typescript
// First, understand your data
const schema = getSchema(documents);
console.log('Available fields:', Object.keys(schema));

// Then craft specific queries
const result = await aiQuery(documents, 'average price by category');
```

### Batch Processing

```typescript
const queries = ['total sales', 'average order value', 'top selling products'];

const results = await Promise.all(
  queries.map(query => aiQuery(documents, query))
);
```

## Contributing

See [CONTRIBUTING_PLUGINS.md](../CONTRIBUTING_PLUGINS.md) for plugin development guidelines.

## License

MIT
