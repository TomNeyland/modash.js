# IVM Architecture Fix - Complete Documentation

## Executive Summary

Fixed fundamental architectural issues in the IVM (Incremental View Maintenance) engine that were causing projection operators to fail and documents to leak through filters. The core issue was that operators were returning `Document[]` instead of `RowId[]`, and the engine was not properly tracking which documents were active at each pipeline stage.

## The Problem

### Symptoms
1. Projection operators (`$project`) were not working - documents retained all fields
2. Filtered documents would reappear in later stages
3. Cross-stage field resolution was broken
4. Excessive fallbacks to non-IVM execution

### Root Causes

1. **Wrong Return Type**: Operators returned `Collection<Document>` from `snapshot()` instead of `RowId[]`
2. **No Active ID Tracking**: Engine couldn't track which documents passed through each stage
3. **LiveSet Iteration**: Operators were iterating `store.liveSet` (ALL documents) instead of only active ones
4. **Broken Document Materialization**: Final results pulled from store instead of transformed views
5. **Method Binding Issues**: `getEffectiveDocument` was lost when operators were wrapped for debugging

## The Solution

### 1. Operators Return RowId[]

**Before:**
```typescript
snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
  const result: Document[] = [];
  for (const rowId of store.liveSet) { // WRONG: iterates all docs
    // ...
    result.push(doc); // WRONG: returns documents
  }
  return result;
}
```

**After:**
```typescript
snapshot(store: CrossfilterStore, context: IVMContext): RowId[] {
  const result: RowId[] = [];
  const sourceRowIds = context.upstreamActiveIds || []; // RIGHT: only active docs
  for (const rowId of sourceRowIds) {
    // ...
    result.push(rowId); // RIGHT: returns row IDs
  }
  return result;
}
```

### 2. Engine Manages Active IDs

The engine now owns the flow of active IDs through the pipeline:

```typescript
// In snapshotPipeline
let activeIds: RowId[] = Array.from(this.store.liveSet); // Start with all live docs

for (let i = 0; i < operators.length; i++) {
  const context: IVMContext = {
    // ...
    upstreamActiveIds: activeIds, // Pass active IDs to each stage
    getEffectiveUpstreamDocument: (rowId) => {
      // Get document from immediate upstream (i-1)
      if (i > 0 && operators[i-1].getEffectiveDocument) {
        return operators[i-1].getEffectiveDocument(rowId, ...);
      }
      return store.documents[rowId];
    }
  };

  activeIds = operator.snapshot(store, context); // Get new active IDs
}
```

### 3. Proper Document Materialization

**Transforming Operators** cache their transformed views:

```typescript
class ProjectOperator {
  private cache = new Map<RowId, Document>();

  snapshot(store, context): RowId[] {
    for (const rowId of context.upstreamActiveIds) {
      const doc = context.getEffectiveUpstreamDocument(rowId);
      const projectedDoc = this.compiledExpr(doc, rowId);
      this.cache.set(rowId, projectedDoc); // Cache transformed doc
      result.push(rowId);
    }
    return result;
  }

  // Arrow function to ensure proper 'this' binding
  getEffectiveDocument = (rowId): Document | null => {
    return this.cache.get(rowId) || null;
  };
}
```

**Passthrough Operators** delegate to upstream:

```typescript
class SortOperator {
  getEffectiveDocument = (rowId, store, context): Document | null => {
    // Sort doesn't transform, just reorders
    return context.getEffectiveUpstreamDocument?.(rowId) || store.documents[rowId];
  };
}
```

### 4. Fixed Method Binding

The critical fix was using arrow functions for `getEffectiveDocument`:

```typescript
// Before: Regular method lost 'this' when called through wrapper
getEffectiveDocument(rowId: RowId): Document | null {
  return this.cache.get(rowId); // 'this' could be undefined!
}

// After: Arrow function maintains 'this' binding
getEffectiveDocument = (rowId: RowId): Document | null => {
  return this.cache.get(rowId); // 'this' always bound correctly
};
```

### 5. Fixed Operator Wrapping

The debug wrapper was creating new objects and losing methods:

```typescript
// Before: Created new object, lost methods
function wrapOperator(operator) {
  const wrapped = Object.create(operator); // New object
  wrapped.onAdd = ...; // Only copied some methods
  return wrapped; // Lost getEffectiveDocument!
}

// After: Modify original operator
function wrapOperator(operator) {
  const original = { onAdd: operator.onAdd.bind(operator), ... };
  operator.onAdd = ...; // Modify in place
  return operator; // All methods preserved
}
```

## Operators Fixed

### Transforming Operators (with cache)
- ✅ **ProjectOperator**: Caches projected documents with only requested fields
- ✅ **AddFieldsOperator**: Caches merged documents with new fields added
- ✅ **LookupOperator**: Caches documents with joined data

### Passthrough Operators (delegate upstream)
- ✅ **MatchOperator**: Filters but doesn't transform
- ✅ **SortOperator**: Reorders but doesn't transform
- ✅ **LimitOperator**: Slices but doesn't transform
- ✅ **SkipOperator**: Slices but doesn't transform

### Partially Fixed
- ⚠️ **GroupOperator**: Returns group documents (needs virtual rowId support)
- ⚠️ **UnwindOperator**: Creates child documents (needs virtual rowId support)
- ⚠️ **TopKOperator**: Returns top K rowIds

## Test Coverage

### Invariant Tests (`test_invariants.mjs`)
1. **$project → $limit**: Only projected fields survive
2. **$project → $sort**: Sort operates on projected view
3. **$match → $project → $skip**: Row count matches filter
4. **LiveSet leak test**: Filtered docs never reappear
5. **$addFields → $project**: Proper composition

All tests: ✅ **PASSING**

### Benchmark Tests (`test_ivm_benchmarks.mjs`)
- `simpleFilter`: 0 fallbacks ✅
- `filterAndProject`: 0 fallbacks ✅
- `complexPipeline`: 0 fallbacks ✅
- `projectSortLimit`: 0 fallbacks ✅
- `groupAndAggregate`: Expected fallback (group needs more work)

## Runtime Assertions (DEBUG mode)

```typescript
// Verify snapshot returns RowId[]
if (DEBUG_IVM && !Array.isArray(activeIds)) {
  throw new Error(`[INVARIANT VIOLATION] ${operator.type}.snapshot() must return RowId[]`);
}

// Verify transforming operators have getEffectiveDocument
const transformingOps = ['$project', '$addFields', '$group', '$unwind', '$lookup'];
if (transformingOps.includes(operator.type) && !operator.getEffectiveDocument) {
  throw new Error(`[INVARIANT VIOLATION] ${operator.type} must implement getEffectiveDocument`);
}
```

## CI Checks

### LiveSet Usage Check (`check_liveset_usage.sh`)
- Greps for `store.liveSet` usage in snapshot methods
- Ensures operators only process `upstreamActiveIds`
- Runs invariant tests automatically

## Performance Impact

### Improvements
- **Reduced iteration**: Operators only process active documents, not entire store
- **Better caching**: Transformed documents cached and reused
- **Memory efficiency**: RowId arrays use less memory than Document arrays

### Metrics
- Simple pipelines: ~0-2ms for 100 documents
- Complex pipelines: ~1-2ms for 100 documents
- Zero fallbacks for supported operations

## Architecture Patterns

### Operator Types

1. **Filter Operators** (reduce rowIds)
   - Input: N rowIds → Output: M rowIds (M ≤ N)
   - Example: `$match`

2. **Transform Operators** (same rowIds, different docs)
   - Input: N rowIds → Output: N rowIds (with cached transforms)
   - Examples: `$project`, `$addFields`

3. **Reorder Operators** (same rowIds, different order)
   - Input: N rowIds → Output: N rowIds (reordered)
   - Example: `$sort`

4. **Slice Operators** (subset of rowIds)
   - Input: N rowIds → Output: M rowIds (M ≤ N, same order)
   - Examples: `$limit`, `$skip`

5. **Fan-out Operators** (create new rowIds)
   - Input: N rowIds → Output: M rowIds (M can be > N)
   - Examples: `$unwind`, `$group`

### Context Flow

Each operator receives an `IVMContext` with:
- `upstreamActiveIds`: RowIds that passed through previous stage
- `getEffectiveUpstreamDocument`: Function to get transformed doc from upstream
- `stageIndex`: Current position in pipeline
- `tempState`: Shared state map (being phased out)

## Known Issues & Future Work

### Issues to Address
1. **GroupOperator**: Needs to return virtual rowIds for groups
2. **UnwindOperator**: Needs proper parent-child rowId mapping
3. **Aggregation functions**: Many still not implemented ($stdDev, $percentile, etc.)

### Future Improvements
1. **Virtual RowIds**: Support for group/unwind operations
2. **Incremental aggregations**: True incremental updates for groups
3. **Query optimization**: Reorder stages for better performance
4. **Index support**: Automatic index creation for common queries

## Migration Guide

### For New Operators

1. **Implement snapshot() correctly**:
   ```typescript
   snapshot(store: CrossfilterStore, context: IVMContext): RowId[] {
     const result: RowId[] = [];
     const sourceRowIds = context.upstreamActiveIds || [];

     // Process only active documents
     for (const rowId of sourceRowIds) {
       const doc = context.getEffectiveUpstreamDocument?.(rowId) || store.documents[rowId];
       // ... process doc ...
       result.push(rowId);
     }

     return result; // MUST return RowId[]
   }
   ```

2. **For transforming operators, implement getEffectiveDocument**:
   ```typescript
   private cache = new Map<RowId, Document>();

   getEffectiveDocument = (rowId: RowId): Document | null => {
     return this.cache.get(rowId) || null;
   };
   ```

3. **For passthrough operators, delegate upstream**:
   ```typescript
   getEffectiveDocument = (rowId, store, context): Document | null => {
     return context.getEffectiveUpstreamDocument?.(rowId) || store.documents[rowId];
   };
   ```

### Testing New Operators

1. Add to invariant tests
2. Add to benchmark suite
3. Verify zero fallbacks for supported operations
4. Check with DEBUG_IVM=true for assertion violations

## Debugging Tips

### Enable Debug Mode
```bash
export DEBUG_IVM=true
npm test
```

### Check for Fallbacks
```typescript
import { getFallbackCount, resetFallbackTracking } from './src/modash/debug.ts';

resetFallbackTracking();
const result = engine.execute(pipeline);
const fallbacks = getFallbackCount();
console.log(`Fallbacks: ${fallbacks}`);
```

### Trace Operator Execution
- Each operator logs with `[OperatorType#ID]` format
- Instance IDs help track if same operator is used throughout
- Check cache sizes to verify documents are being cached

## Conclusion

The IVM engine now has a solid architectural foundation:
- ✅ Correct data flow (RowId[] through pipeline)
- ✅ Proper document transformation and caching
- ✅ No liveSet leaks
- ✅ Zero fallbacks for supported operations
- ✅ Comprehensive test coverage
- ✅ Runtime invariant checking

This foundation enables us to:
1. Add more operators with confidence
2. Implement advanced features (virtual rowIds, incremental aggregation)
3. Optimize performance further
4. Maintain correctness guarantees

The key insight was that **operators must return RowId[], not Document[]**, and the **engine must own the flow of active IDs** through the pipeline. With this architecture in place, the IVM engine can correctly handle complex MongoDB-like aggregation pipelines with true incremental processing.