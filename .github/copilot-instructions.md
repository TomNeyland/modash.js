# GitHub Copilot Instructions for modash.js

## Project Overview

**modash.js** is a modern TypeScript-native MongoDB aggregation library that brings MongoDB pipeline syntax to JavaScript arrays. It provides comprehensive type safety, modern ES2022+ features, and a rich set of operators for data processing.

## Core Technologies & Architecture

- **Language**: TypeScript (native, no compilation step needed)
- **Module System**: ES Modules (ESM)
- **Runtime**: Node.js 18+
- **Testing**: Mocha with tsx/esm loader
- **Code Quality**: ESLint + Prettier
- **Dependencies**: lodash-es (only runtime dependency)

## Key Design Principles

1. **TypeScript-First**: Full type safety with comprehensive type definitions
2. **MongoDB Compatibility**: Faithful implementation of MongoDB aggregation syntax
3. **Zero Build Step**: Direct TypeScript execution via tsx
4. **Modern JavaScript**: ES2022+ features, native modules
5. **Functional Programming**: Immutable operations, no side effects

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
    └── util.ts           # Utility functions
tests/                    # Comprehensive test suite (82+ tests)
examples/                 # Usage examples
```

## Core API Patterns

### Main Entry Point
```typescript
import Modash from 'modash';
// Primary method: Modash.aggregate(collection, pipeline)
```

### Type System
- `Document`: Base document interface with string keys
- `Collection<T>`: Array of typed documents
- `Pipeline`: Array of pipeline stages
- `Expression`: MongoDB-style expressions with full typing

### Pipeline Stages
- `$match`: Document filtering with query operators
- `$project`: Field selection and transformation
- `$group`: Aggregation with accumulators
- `$sort`: Document ordering
- `$limit`/`$skip`: Pagination
- `$unwind`: Array deconstruction
- `$lookup`: Collection joins
- `$addFields`/`$set`: Field addition

## Development Workflow

### Testing
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage
```

### Code Quality
```bash
npm run lint               # ESLint check
npm run lint:fix          # Auto-fix issues
npm run format            # Prettier formatting
npm run format:check      # Check formatting
npm run quality           # Run all checks
```

### Key Files to Understand

1. **src/index.ts**: Type definitions and main exports
2. **src/modash/index.ts**: Core aggregate() implementation
3. **src/modash/aggregation.ts**: Pipeline stage handlers
4. **src/modash/operators.ts**: Expression operators
5. **src/modash/expressions.ts**: Expression evaluation logic

## Coding Guidelines

### TypeScript Standards
- Use strict type checking
- Prefer interfaces over types for objects
- Use generics for reusable components
- Export types from main index.ts

### MongoDB Compatibility
- Follow MongoDB operator semantics exactly
- Support all documented MongoDB behavior
- Handle edge cases as MongoDB does
- Use `$` prefixed operator names

### Testing Requirements
- Test files in `tests/` directory
- Use Mocha with chai assertions
- Cover edge cases and error conditions
- Follow existing test patterns
- Test both positive and negative cases

### Performance Considerations
- Avoid unnecessary array copies
- Use efficient lodash-es functions
- Minimize object creation in hot paths
- Consider memory usage for large datasets

## Common Tasks

### Adding New Operators
1. Add operator logic to `src/modash/operators.ts`
2. Update type definitions in `src/index.ts`
3. Add comprehensive tests
4. Update documentation if needed

### Adding Pipeline Stages
1. Implement in `src/modash/aggregation.ts`
2. Add to pipeline processor
3. Update type definitions
4. Add tests and examples

### Debugging Tips
- Use `npm run test:watch` for TDD
- Console.log intermediate pipeline results
- Check MongoDB docs for expected behavior
- Run single test files: `npx mocha --import=tsx/esm tests/specific-file.spec.js`

## MongoDB Aggregation Reference

The library implements a comprehensive subset of MongoDB aggregation:

### Query Operators (in $match)
- Comparison: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
- Logical: `$and`, `$or`, `$nor`, `$not`
- Element: `$exists`, `$type`
- Evaluation: `$regex`, `$mod`
- Array: `$all`, `$elemMatch`, `$size`

### Expression Operators
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

## Best Practices for Contributors

1. **Follow MongoDB semantics exactly** - When in doubt, test against MongoDB
2. **Maintain type safety** - All operations should be properly typed
3. **Write comprehensive tests** - Cover edge cases and error conditions
4. **Document complex logic** - Add JSDoc comments for non-obvious code
5. **Performance matters** - Consider efficiency for large datasets
6. **Maintain immutability** - Never modify input collections or documents

## Useful Resources

- [MongoDB Aggregation Pipeline Documentation](https://docs.mongodb.com/manual/aggregation/)
- [MongoDB Operator Reference](https://docs.mongodb.com/manual/reference/operator/aggregation/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Lodash Documentation](https://lodash.com/docs/)

---

*This file helps GitHub Copilot understand the project structure and provide better code suggestions when working on modash.js*