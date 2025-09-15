# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**modash.js** is a TypeScript-native MongoDB aggregation library that brings MongoDB pipeline syntax to JavaScript arrays. It provides zero-compilation TypeScript execution, comprehensive type safety, and high-performance data processing.

## ⚠️ CRITICAL: Zero Build System - TypeScript Native

**modash.js runs TypeScript DIRECTLY with NO build step required.**

- Do NOT try to compile TypeScript - it runs natively with `tsx`
- Do NOT look for build artifacts or compiled JavaScript files
- Use `npx tsx` to run TypeScript files directly
- Import from source: `import Modash from './src/index.ts'` for local development

## Essential Development Commands

### Core Testing & Validation

```bash
npm test                   # Complete test suite + performance benchmarks (~1.4s)
npm run test:fast          # Fast core tests only (recommended for iterations)
npm run test:units         # All unit tests (~1s)
npm run test:performance   # Performance benchmarks only (~1.4s) - NEVER CANCEL
npm run test:coverage      # Tests with coverage report
```

### Code Quality

```bash
npm run lint              # ESLint validation (~2.3s)
npm run lint:fix          # Auto-fix ESLint issues
npm run format:check      # Prettier formatting validation (~1.8s)
npm run format            # Apply Prettier formatting
npm run typecheck         # TypeScript type checking (~1.6s) - 72 known errors but runtime works
npm run precommit:check   # Pre-commit validation suite (lint + format + typecheck + fast tests)
```

### Performance & Quality Gates

```bash
npm run quality           # All quality checks combined (~5.2s)
npm test                  # MANDATORY: Includes critical performance tracking - NEVER CANCEL
```

## Architecture & Core Files

### Main Entry Points

- `src/index.ts` - Main exports and TypeScript type definitions
- `src/modash/index.ts` - Core Modash implementation with hot path optimization
- `src/cli.ts` - CLI tool implementation

### Core Implementation

- `src/modash/aggregation.ts` - Pipeline stage implementations ($match, $project, $group, etc.)
- `src/modash/operators.ts` - Expression operators ($add, $concat, $multiply, etc.)
- `src/modash/expressions.ts` - Expression evaluation engine
- `src/modash/hot-path-aggregation.ts` - Performance-optimized aggregation engine
- `src/modash/streaming.ts` - Streaming/incremental data processing

### Key Features

- **Hot Path Optimization**: Performance-optimized aggregation engine for common patterns
- **Streaming Collections**: Real-time incremental data processing with event-driven updates
- **IVM (Incremental View Maintenance)**: Advanced optimization for group operations
- **Text & Regex Search**: Bloom filter-optimized search capabilities
- **CLI Tool**: Command-line interface for processing JSON/JSONL data

### Test Structure

- `tests/` - Comprehensive test suite (80+ tests)
- `tests/debug/` - Debug test runners (\*.mjs files run with `npm run test:debug`)
- `tests/performance/` - Performance-specific tests
- `benchmarks/` - Performance measurement system
- `performance-results/` - Historical performance tracking data

## MongoDB Operator Coverage

### Pipeline Stages

- `$match`, `$project`, `$group`, `$sort`, `$limit`, `$skip`, `$unwind`, `$lookup`, `$addFields`/$set`, `$count`

### Expression Operators (40+ operators)

- **Arithmetic**: `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`, `$abs`, `$ceil`, `$floor`, `$round`, `$sqrt`, `$pow`
- **Array**: `$size`, `$arrayElemAt`, `$slice`, `$concatArrays`, `$in`, `$filter`, `$map`
- **String**: `$concat`, `$substr`, `$toLower`, `$toUpper`, `$split`, `$strLen`, `$trim`
- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$cmp`
- **Boolean**: `$and`, `$or`, `$not`
- **Conditional**: `$cond`, `$ifNull`, `$switch`
- **Date**: `$year`, `$month`, `$dayOfMonth`, `$hour`, `$minute`, `$second`

### Query Operators (in $match)

- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
- **Logical**: `$and`, `$or`, `$nor`, `$not`
- **Element**: `$exists`, `$type`
- **Evaluation**: `$regex`, `$mod`
- **Array**: `$all`, `$elemMatch`, `$size`

## Performance Requirements

⚠️ **CRITICAL**: Performance tracking is mandatory for all changes.

- **ALWAYS** run `npm run test:performance` after code changes
- **NEVER CANCEL** performance tests - they maintain historical data
- Performance results are saved in `performance-results/` as timestamped JSON files
- Tests measure throughput (docs/sec) across multiple dataset sizes (100-10K documents)
- Automatic comparison against baseline and previous runs with trend indicators

## Validation Requirements

**ALL changes MUST pass these validation steps:**

1. **Pre-commit checks**: `npm run precommit:check`
2. **Complete test suite**: `npm test` (includes performance benchmarks)
3. **Code quality**: `npm run quality`
4. **Manual validation**: Run scenario tests with real aggregation pipelines

## Common Development Patterns

### Basic Aggregation Usage

```typescript
import Modash from './src/index.ts';

const result = Modash.aggregate(data, [
  { $match: { score: { $gte: 80 } } },
  { $project: { name: 1, age: 1 } },
  { $sort: { age: -1 } },
]);
```

### Streaming Collections

```typescript
const streaming = Modash.createStreamingCollection(initialData);
streaming.stream(pipeline); // Real-time aggregation
streaming.addBulk(newData); // Incremental updates
```

### Running Single Tests

```bash
npx mocha --import=tsx/esm tests/specific-file.spec.js
```

### Debug Tests

```bash
npm run test:debug  # Runs all debug/*.mjs files
npx tsx tests/debug/test_specific_issue.mjs  # Run individual debug test
```

## Key Constraints

- **TypeScript Native**: No compilation step, direct execution with tsx
- **Zero Dependencies**: Core library has no runtime dependencies
- **Node.js 18+**: Required for modern ES features
- **ESM Only**: Pure ES modules, no CommonJS
- **Performance Critical**: All changes must maintain or improve performance benchmarks
