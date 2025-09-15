# Streaming-First Execution Architecture

This document describes the streaming-first execution architecture implemented to address issue #64.

## Overview

modash.js now uses a **streaming-first execution architecture** that defaults to the high-performance IVM/streaming engine for all operations, with explicit fallback only for truly unsupported operators.

## Architecture Components

### 1. Streaming Engine (Default)
- **File**: `zero-alloc-engine.ts`, `hot-path-aggregation.ts`
- **Usage**: All supported pipeline operations
- **Features**: 
  - Zero-allocation hot paths
  - RowID-based processing with late materialization
  - Operator fusion optimizations
  - Incremental view maintenance (IVM)

### 2. Compatibility Shim (Fallback)
- **File**: `compatibility-shim.ts`
- **Usage**: Only for truly unsupported operators
- **Operators**: `$function`, `$where`, `$merge`, `$out`, advanced `$lookup`

### 3. Standard Engine (Deprecated)
- **File**: `aggregation.ts`
- **Status**: Deprecated, only used via compatibility shim
- **Future**: Will be removed in a future version

## Execution Flow

```
Input Pipeline
      ↓
transparentAggregate()
      ↓
streamingFirstAggregate()
      ↓
requiresCompatibilityShim()?
      ↓                    ↓
     No                   Yes
      ↓                    ↓
hotPathAggregate()  minimalStandardEngine()
      ↓                    ↓
Streaming Engine    Standard Engine (via shim)
```

## Supported Operations (Streaming Engine)

The following operations use the streaming engine by default:

- ✅ `$match` (simple conditions)
- ✅ `$project` (field selection and simple computed fields)
- ✅ `$group` (with supported accumulators)
- ✅ `$sort` (simple field-based sorting)
- ✅ `$limit` / `$skip` (always supported)
- ✅ `$unwind` (simple array deconstruction)
- ✅ `$addFields` / `$set` (simple field additions)
- ✅ Simple `$lookup` (localField/foreignField only)

## Unsupported Operations (Compatibility Shim)

The following operations require the compatibility shim:

- ❌ `$function` - Arbitrary JavaScript execution
- ❌ `$where` - Arbitrary JavaScript conditions  
- ❌ `$merge` - Side-effect stage
- ❌ `$out` - Side-effect stage
- ❌ Advanced `$lookup` - With `pipeline` or `let` parameters

## Performance Benefits

1. **Single Code Path**: Most operations use the same high-performance streaming engine
2. **Zero Allocations**: Hot paths avoid object creation in steady state
3. **Late Materialization**: Process row IDs only, materialize documents at the end
4. **Operator Fusion**: Multiple stages combined into single operations where possible
5. **Consistent Performance**: Predictable performance characteristics across operations

## Debugging and Monitoring

### Environment Variables

- `DEBUG_IVM=1` - Enable detailed streaming engine logging
- `HOT_PATH_STREAMING=1` - Force enable hot path streaming
- `DISABLE_HOT_PATH_STREAMING=1` - Force disable hot path streaming

### Fallback Tracking

```javascript
import { generateFallbackAnalysis, printFallbackAnalysis } from 'modash/debug';

// Run your aggregations...

// Print comprehensive fallback analysis
printFallbackAnalysis();

// Get programmatic access to fallback data
const analysis = generateFallbackAnalysis();
console.log(`Total fallbacks: ${analysis.totalFallbacks}`);
```

### CI Regression Gates

The following CI gates ensure the architecture works correctly:

```bash
npm run ci:streaming-first-gates
```

This runs tests to ensure:
- Supported operations use streaming engine (0 fallbacks)
- Unsupported operations trigger fallback (1+ fallbacks)
- Performance is maintained
- No regressions occur

## Migration Guide

### For Library Users

**No changes required!** The streaming-first architecture is fully backward compatible.

### For Contributors

1. **New operators should target the streaming engine first**
2. **Only add to compatibility shim if fundamentally incompatible with streaming**
3. **Run CI gates to ensure no regressions**: `npm run ci:streaming-first-gates`
4. **Use DEBUG_IVM=1 to debug streaming engine issues**

## Testing

### Comprehensive Tests

```bash
# Run streaming-first integration tests
npx tsx tests/debug/streaming-first-integration.mjs

# Run compatibility shim validation
npx tsx tests/debug/compatibility-shim-validation.mjs

# Run CI regression gates
npm run ci:streaming-first-gates
```

### Performance Testing

```bash
npm run test:performance
```

Performance benchmarks automatically track streaming engine effectiveness.

## Future Roadmap

1. **Phase 4**: Expand streaming engine support for complex expressions
2. **Phase 5**: Add streaming support for more complex `$lookup` operations  
3. **Phase 6**: Remove standard engine completely, pure streaming architecture