# GitHub Copilot Instructions for modash.js

**ALWAYS follow these instructions first and only fallback to additional search and context gathering if the information in these instructions is incomplete or found to be in error.**

## Project Overview

**modash.js** is a modern TypeScript-native MongoDB aggregation library that brings MongoDB pipeline syntax to JavaScript arrays. It provides comprehensive type safety, modern ES2022+ features, and a rich set of operators for data processing.

## ⚠️ CRITICAL: Zero Build System - TypeScript Native

**modash.js runs TypeScript DIRECTLY with NO build step required.**

- Do NOT try to compile TypeScript - it runs natively with `tsx`
- Do NOT look for build artifacts or compiled JavaScript files  
- Do NOT run `npm run build` - it just echoes "No build step needed"
- Use `npx tsx` to run TypeScript files directly

## 🚨 MANDATORY Command Timeouts & Build Times

**NEVER CANCEL any build or test commands. Set appropriate timeouts:**

- `npm install`: 5 minutes timeout (measured: ~11 seconds)
- `npm test`: 10 minutes timeout (measured: ~1.4 seconds) - **NEVER CANCEL** 
- `npm run test:performance`: 10 minutes timeout (measured: ~1.4 seconds) - **NEVER CANCEL**
- `npm run test:coverage`: 5 minutes timeout (measured: ~1.0 seconds)
- `npm run lint`: 5 minutes timeout (measured: ~2.3 seconds)
- `npm run format:check`: 5 minutes timeout (measured: ~1.8 seconds)  
- `npm run quality`: 10 minutes timeout (measured: ~5.2 seconds) - **NEVER CANCEL**
- `npm run typecheck`: 5 minutes timeout (measured: ~1.6 seconds)

## Working Effectively

**Bootstrap, build, and test the repository:**

1. **Install dependencies:**
   ```bash
   npm install
   ```
   **Timeout: 5 minutes. Expected: ~11 seconds.**

2. **Run all tests and performance benchmarks:**
   ```bash
   npm test
   ```  
   **Timeout: 10 minutes. Expected: ~1.4 seconds. NEVER CANCEL - includes critical performance tracking.**

3. **Run quality checks:**
   ```bash
   npm run quality
   ```
   **Timeout: 10 minutes. Expected: ~5.2 seconds. NEVER CANCEL - required for CI.**

4. **Individual commands:**
   - `npm run test:units` - Unit tests only (~1 second)
   - `npm run test:performance` - Performance benchmarks (~1.4 seconds) - **NEVER CANCEL**
   - `npm run lint` - ESLint validation (~2.3 seconds)
   - `npm run format:check` - Prettier validation (~1.8 seconds)

## 🎯 Validation Scenarios

**ALWAYS manually validate any changes with these scenarios:**

### Scenario 1: Basic Aggregation Pipeline
```bash
npx tsx -e "
import Modash from './src/index.ts';
const data = [
  { name: 'Alice', age: 30, city: 'Seattle', score: 85 },
  { name: 'Bob', age: 25, city: 'Portland', score: 92 }
];
const result = Modash.aggregate(data, [
  { \$match: { score: { \$gte: 80 } } },
  { \$project: { name: 1, age: 1 } }
]);
console.log('✅ Basic pipeline:', result.length, 'items');
"
```

### Scenario 2: Complex Grouping & Aggregation
```bash
npx tsx -e "
import Modash from './src/index.ts';
const sales = [
  { item: 'laptop', price: 1000, quantity: 2, category: 'electronics' },
  { item: 'mouse', price: 25, quantity: 10, category: 'electronics' }
];
const result = Modash.aggregate(sales, [
  { \$addFields: { revenue: { \$multiply: ['\$price', '\$quantity'] } } },
  { \$group: { _id: '\$category', totalRevenue: { \$sum: '\$revenue' }, count: { \$sum: 1 } } }
]);
console.log('✅ Complex grouping:', JSON.stringify(result, null, 2));
"
```

### Scenario 3: Performance Validation
```bash
npm run test:performance
```
**MANDATORY: Must complete successfully. NEVER CANCEL. Performance tracking is critical.**

## Core Technologies & Architecture

- **Language**: TypeScript (native, no compilation step needed)
- **Module System**: ES Modules (ESM)
- **Runtime**: Node.js 18+
- **Testing**: Mocha with tsx/esm loader
- **Code Quality**: ESLint + Prettier
- **Dependencies**: Zero runtime dependencies (was lodash-es in older versions)

## Project Structure

```
src/
├── index.ts              # Main exports and type definitions
└── modash/
    ├── index.ts          # Core Modash implementation
    ├── aggregation.ts    # Pipeline stage implementations
    ├── operators.ts      # Expression operators ($add, $concat, etc.)
    ├── accumulators.ts   # Group aggregation operators ($sum, $avg, etc.)
    ├── expressions.ts    # Expression evaluation engine
    ├── count.ts          # Count operation
    ├── util.ts           # Utility functions
    ├── types.ts          # TypeScript type definitions
    ├── errors.ts         # Error handling
    └── performance-optimized-engine.ts  # Performance optimization
tests/                    # Comprehensive test suite (82+ tests)
benchmarks/               # Performance measurement system
performance-results/      # Historical performance tracking data
examples/                 # Usage examples (may have import issues)
```

## 🔥 CRITICAL: Performance Tracking System

**modash.js includes a comprehensive performance tracking system that MUST be utilized for ALL changes.**

### Performance Requirements
- **MANDATORY**: Run `npm run test:performance` after ANY code changes
- **NEVER CANCEL**: Performance tests must complete - they track historical data
- **Timeout: 10 minutes** - Performance tests include multiple dataset sizes (100, 500, 1K, 2.5K, 5K, 10K documents)
- Performance regressions will cause PR rejections

### Performance Data
- Results saved in `performance-results/` directory as timestamped JSON files
- Automatic comparison against baseline and previous runs
- Trend indicators (📈/📉) show performance improvements/regressions
- Statistical analysis with multiple iterations and standard deviation

### Usage Commands
```bash
npm run test:performance   # Performance benchmarks only - NEVER CANCEL
npm test                   # Includes performance tests automatically - NEVER CANCEL
```

## ⚠️ CRITICAL VALIDATION REQUIREMENTS

**ALL changes MUST pass these validation steps before work is considered complete:**

### Quality Gates (ALL MUST PASS)
```bash
npm run format:check    # MUST pass - Prettier formatting validation
npm run lint           # MUST pass - ESLint validation (no errors allowed)
npm test              # MUST pass - All 82+ tests + performance benchmarks
npm run quality       # MUST pass - Combined quality checks
```

### Manual Validation Steps
1. **Run scenario validation commands** (see Validation Scenarios above)
2. **Verify library functionality** with real aggregation pipelines
3. **Performance benchmarks must complete** - check for regressions
4. **No TypeScript import errors** when using `npx tsx`

### Pre-Submission Checklist
- [ ] All existing tests pass (`npm test`) - NEVER CANCEL
- [ ] No linting errors (`npm run lint`)
- [ ] Code is properly formatted (`npm run format:check`)
- [ ] Performance benchmarks complete successfully - NEVER CANCEL
- [ ] Manual scenario validation completed
- [ ] No performance regressions detected

## TypeScript Configuration Notes

- **TypeScript Strict Checking**: `npm run typecheck` currently has 72 type errors but this is expected
- **Runtime Execution**: TypeScript code runs perfectly with `tsx` despite strict checking issues
- **Direct Execution**: Use `npx tsx filename.ts` to run TypeScript files directly
- **Import Style**: `import Modash from './src/index.ts'` for local development

## Core API Patterns

### Main Entry Point
```typescript
import Modash from 'modash';  // Production usage
// OR for local development:
import Modash from './src/index.ts';
```

### Primary Methods
- `Modash.aggregate(collection, pipeline)` - Main aggregation method
- `Modash.count(collection)` - Count documents
- `Modash.$match(collection, query)` - Filter documents
- `Modash.$project(collection, projection)` - Project fields
- `Modash.$group(collection, groupSpec)` - Group and aggregate

### Supported Pipeline Stages
- `$match`: Document filtering with query operators
- `$project`: Field selection and transformation  
- `$group`: Aggregation with accumulators
- `$sort`: Document ordering
- `$limit`/`$skip`: Pagination
- `$unwind`: Array deconstruction
- `$lookup`: Collection joins
- `$addFields`/`$set`: Field addition

## MongoDB Operator Coverage

### Query Operators (in $match)
- Comparison: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
- Logical: `$and`, `$or`, `$nor`, `$not`
- Element: `$exists`, `$type`
- Evaluation: `$regex`, `$mod`
- Array: `$all`, `$elemMatch`, `$size`

### Expression Operators (40+ operators)
- Arithmetic: `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`, `$abs`, `$ceil`, `$floor`, `$round`, `$sqrt`, `$pow`
- Array: `$arrayElemAt`, `$concatArrays`, `$filter`, `$in`, `$indexOfArray`, `$map`, `$reverseArray`, `$size`, `$slice`
- Boolean: `$and`, `$or`, `$not`
- Comparison: `$cmp`, `$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$ne`
- Conditional: `$cond`, `$ifNull`, `$switch`
- Date: `$dayOfMonth`, `$dayOfWeek`, `$dayOfYear`, `$hour`, `$minute`, `$month`, `$second`, `$week`, `$year`
- String: `$concat`, `$ltrim`, `$rtrim`, `$split`, `$strLen`, `$substr`, `$toLower`, `$toUpper`, `$trim`
- Set: `$allElementsTrue`, `$anyElementTrue`, `$setDifference`, `$setEquals`, `$setIntersection`, `$setIsSubset`, `$setUnion`

### Accumulator Operators (in $group)
- `$sum`, `$avg`, `$min`, `$max`, `$first`, `$last`, `$push`, `$addToSet`

## Common Tasks & Workflows

### Adding New Operators
1. Add operator logic to `src/modash/operators.ts`
2. Update type definitions in `src/index.ts`
3. Add comprehensive tests in `tests/`
4. **MANDATORY**: Run full validation suite including performance tests
5. Update documentation if needed

### Adding Pipeline Stages  
1. Implement in `src/modash/aggregation.ts`
2. Add to pipeline processor
3. Update type definitions
4. Add tests and examples
5. **MANDATORY**: Run performance benchmarks

### Debugging & Development
- Use `npm run test:watch` for test-driven development
- Console.log intermediate pipeline results for debugging
- Check MongoDB docs for expected operator behavior
- Run single test files: `npx mocha --import=tsx/esm tests/specific-file.spec.js`

## Key Files to Understand

1. **src/index.ts**: Main exports and TypeScript type definitions
2. **src/modash/index.ts**: Core `aggregate()` implementation  
3. **src/modash/aggregation.ts**: Pipeline stage handlers ($match, $project, $group, etc.)
4. **src/modash/operators.ts**: Expression operators ($add, $concat, $multiply, etc.)
5. **src/modash/expressions.ts**: Expression evaluation engine
6. **benchmarks/performance-measurement.js**: Performance tracking system
7. **tests/**: Comprehensive test suite with 82+ tests

## Common Commands Reference

Quick reference of validated commands with exact timings:

```bash
# Dependencies & Setup
npm install                 # ~11s - Install all dependencies

# Testing & Validation (NEVER CANCEL)
npm test                   # ~1.4s - All tests + performance benchmarks
npm run test:units         # ~1s   - Unit tests only  
npm run test:performance   # ~1.4s - Performance benchmarks only
npm run test:coverage      # ~1s   - Tests with coverage report
npm run test:watch         # Continuous testing mode

# Code Quality
npm run lint              # ~2.3s - ESLint validation
npm run lint:fix          # ~2.3s - Auto-fix ESLint issues
npm run format            # ~1.8s - Apply Prettier formatting
npm run format:check      # ~1.8s - Check Prettier formatting
npm run quality           # ~5.2s - All quality checks combined

# TypeScript
npm run typecheck         # ~1.6s - TypeScript strict checking (72 known errors)
npx tsx file.ts          # Direct TypeScript execution

# Performance & Analysis
npm run test:performance  # Critical performance tracking - NEVER CANCEL
```

## Troubleshooting

### Known Issues
- **TypeScript strict checking**: `npm run typecheck` has 72 type errors but runtime execution works perfectly
- **Examples directory**: Import paths may be incorrect in example files
- **Performance tracking**: Never cancel performance tests - they maintain historical data

### Solutions
- **For TypeScript execution**: Always use `npx tsx` not `node`
- **For imports**: Use `import Modash from './src/index.ts'` for local development
- **For performance**: Always wait for benchmarks to complete, never cancel

---

**Remember: ALWAYS run the complete validation suite (`npm run quality` + `npm run test:performance`) before considering any work complete. Performance tracking is CRITICAL and must never be cancelled.**