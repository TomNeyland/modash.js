# IVM Pipeline Fix - Complete Context Dump

## Current Problem Summary

The IVM (Incremental View Maintenance) engine for MongoDB-like aggregation pipelines has a fundamental architectural flaw where operators are leaking filtered documents back into results. The root cause is that operators return `Document[]` instead of `RowId[]` from `snapshot()`, and many operators iterate through `store.liveSet` (ALL documents) instead of only processing documents that passed through previous stages.

### Specific Bug Example

```javascript
// Test case that's failing:
const testData = [
  { _id: 1, name: 'Alice', tags: ['developer'] },
  { _id: 2, name: 'Bob', tags: ['designer'] },
  { _id: 3, name: 'Charlie', tags: ['lead'] },
  { _id: 4, name: 'David', skills: null }, // No tags field
];

const pipeline = [
  { $match: { tags: { $exists: true } } }, // Should filter out David
  { $addFields: { avgScore: { $avg: '$scores' } } },
  { $sort: { avgScore: -1 } },
  { $project: { name: 1, avgScore: 1 } },
];

// ACTUAL: Returns 4 documents (David incorrectly included)
// EXPECTED: Returns 3 documents (David filtered out)
```

## Root Causes Identified

### 1. Wrong Return Type from snapshot()

- **Current**: `snapshot()` returns `Collection<Document>`
- **Required**: `snapshot()` must return `RowId[]`
- **Impact**: Engine can't track which documents are active at each stage

### 2. Operators Iterate Wrong Set

- **Current**: Operators iterate `store.liveSet` (ALL documents in store)
- **Required**: Operators must iterate `upstreamActiveIds` (only docs from previous stage)
- **Impact**: Filtered documents reappear in later stages

### 3. No Central Active ID Management

- **Current**: Operators try to manage active IDs via `tempState` with keys like `active_rowids_stage_0`
- **Required**: Engine must own and pass `upstreamActiveIds` to each stage
- **Impact**: Fragile, racy, and error-prone coordination

## Architecture Requirements

### Correct Data Flow

```
Engine:
  seedActiveIds = Array.from(store.liveSet)

  for each operator:
    context.upstreamActiveIds = currentActiveIds
    currentActiveIds = operator.snapshot(store, context)  // Returns RowId[]

  return finalActiveIds
```

### Operator Contract

```typescript
interface IVMOperator {
  // MUST return RowId[], not Document[]
  snapshot(store: CrossfilterStore, context: IVMContext): RowId[];

  // Optional: provide transformed document
  getEffectiveDocument?(
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null;
}

interface IVMContext {
  // Engine provides this - operators MUST use it
  upstreamActiveIds: RowId[];

  // ... other fields
}
```

## Current State of Codebase

### Files Modified So Far

1. **`/src/aggo/crossfilter-operators.ts`**
   - Added `AddFieldsOperator` class (lines 1204-1348) with merge semantics
   - Modified `ProjectOperator.snapshot()` to check for previous stage active IDs (lines 559-567)
   - Modified `MatchOperator.snapshot()` to store active IDs (lines 87-94)
   - Modified `SortOperator.snapshot()` to handle grouped results (lines 384-419)
   - Fixed `UnwindOperator` duplicate processing issue

2. **`/src/aggo/crossfilter-engine.ts`**
   - Changed `$addFields` to use `AddFieldsOperator` instead of `ProjectOperator` (lines 106-111)
   - Removed duplicate processing in `snapshotPipeline` (lines 449-451)
   - Added debug logging throughout

3. **`/src/aggo/crossfilter-compiler.ts`**
   - Fixed projection pruning to not remove fields before `$limit`/`$skip` (lines 1608-1611)

4. **`/src/aggo/debug.ts`**
   - Added `wrapOperatorSnapshot` for fallback detection (lines 92-144)
   - Added fallback tracking functions

### Test Results Progress

- **Started**: 144 passing, 24 failing
- **Current**: 154 passing, 14 failing
- **Improved**: 10 tests fixed

### Remaining Failing Tests (14)

1. Content trends by tags and publication timeline
2. Salary distribution and performance by department
3. Skill gaps and training needs across teams
4. Comprehensive account activity summary
5. Spending patterns by category and anomaly detection
6. Environmental conditions with alerts
7. Complex pipeline with sorting and new operators
8. Streaming vs non-streaming performance characteristics
9. Result consistency across complex add/remove scenarios
10. Initial aggregation results
11. Live updates from event sources with streaming pipelines
12. Work transparently with regular arrays
13. Work transparently with streaming collections
14. Automatically enable streaming capabilities when needed

## TODO List - Detailed Implementation Plan

### ✅ Completed

1. **Fixed ProjectOperator document caching** - Projection fields now preserved through pipeline
2. **Made $limit/$skip work with projected documents** - Added active rowId tracking
3. **Added fallback detection wrapper** - `wrapOperatorSnapshot` detects incorrect results
4. **Fixed SortOperator for grouped results** - Correctly sorts group results from $group
5. **Fixed UnwindOperator duplicate processing** - Prevented double processing
6. **Fixed $addFields operator** - Created new operator with merge semantics instead of replace

### 🔄 In Progress

**Change snapshot() to return RowId[] instead of Document[]**

- Update IVMOperator interface in `/src/aggo/crossfilter-ivm.ts`
- Change return type from `Collection<Document>` to `RowId[]`
- Update all operator implementations

### 📋 Pending Tasks

#### 1. Make engine own upstreamActiveIds flow

**File**: `/src/aggo/crossfilter-engine.ts`

- Modify `snapshotPipeline()` method:
  - Initialize `activeIds: RowId[] = Array.from(store.liveSet)`
  - Pass `context.upstreamActiveIds = activeIds` to each stage
  - Update `activeIds = operator.snapshot(store, context)`
- Remove the current "needsCaching" logic
- Ensure context flows properly through all stages

#### 2. Fix all operators to use upstreamActiveIds

**File**: `/src/aggo/crossfilter-operators.ts`

Each operator needs updating:

**MatchOperator**:

```typescript
snapshot(store, context): RowId[] {
  const result: RowId[] = [];
  for (const rowId of context.upstreamActiveIds) {
    const doc = this.getEffectiveDocument(rowId, store, context);
    if (doc && this.compiledExpr(doc, rowId)) {
      result.push(rowId);
    }
  }
  return result;
}
```

**ProjectOperator**:

```typescript
snapshot(store, context): RowId[] {
  const result: RowId[] = [];
  for (const rowId of context.upstreamActiveIds) {
    const doc = this.getEffectiveDocument(rowId, store, context);
    const projected = this.compiledExpr(doc, rowId);
    this.cache.set(rowId, projected);
    result.push(rowId);
  }
  return result;
}
```

**AddFieldsOperator**:

```typescript
snapshot(store, context): RowId[] {
  const result: RowId[] = [];
  for (const rowId of context.upstreamActiveIds) {
    const doc = this.getEffectiveDocument(rowId, store, context);
    const merged = { ...doc, ...this.compiledExpr(doc, rowId) };
    this.cache.set(rowId, merged);
    result.push(rowId);
  }
  return result;
}
```

**GroupOperator**:

- Must return group rowIds, not document rowIds
- Needs special handling for virtual group IDs

**SortOperator**:

```typescript
snapshot(store, context): RowId[] {
  const docs = context.upstreamActiveIds.map(id => ({
    id,
    doc: this.getEffectiveDocument(id, store, context)
  }));
  docs.sort((a, b) => this.compareDocuments(a.doc, b.doc));
  return docs.map(d => d.id);
}
```

**LimitOperator**:

```typescript
snapshot(store, context): RowId[] {
  return context.upstreamActiveIds.slice(0, this.limitValue);
}
```

**SkipOperator**:

```typescript
snapshot(store, context): RowId[] {
  return context.upstreamActiveIds.slice(this.skipValue);
}
```

**UnwindOperator**:

- Return child virtual rowIds created from upstream documents

#### 3. Remove tempState active_rowids pattern

- Remove all `active_rowids_stage_*` key usage
- Remove all `tempState.set/get` for active rowIds
- Clean up debug logging related to this pattern

#### 4. Add runtime guards and tests

**Guards to add**:

- Assert operators never access `store.liveSet` in snapshot()
- Assert returned rowIds are subset of upstreamActiveIds (except fan-out ops)
- Add CI check to grep for `store.liveSet` in snapshot methods

**Tests to add**:

```javascript
// Test 1: Match + Project
[{ $match: { hasTag: true } }, { $project: { name: 1 } }][
  // Test 2: Match + AddFields + Limit
  ({ $match: { age: { $gte: 30 } } },
  { $addFields: { firstTag: { $arrayElemAt: ['$tags', 0] } } },
  { $limit: 2 })
][
  // Test 3: Group → Sort → Limit
  ({ $group: { _id: '$dept', c: { $sum: 1 } } },
  { $sort: { c: -1 } },
  { $limit: 1 })
];
```

## Final Materialization Strategy

After all operators return `RowId[]`, the engine needs to materialize final documents:

```typescript
// In engine.execute()
const finalActiveIds = this.snapshotPipeline(operators, plan);
const results: Document[] = [];

for (const rowId of finalActiveIds) {
  const doc = this.materializeDocument(
    rowId,
    operators[operators.length - 1],
    context
  );
  if (doc) results.push(doc);
}

return results;
```

## Success Criteria

1. **All 14 failing tests pass**
2. **No fallbacks in benchmark pipelines**
3. **No operators access `store.liveSet` in snapshot()**
4. **Engine owns active ID flow completely**
5. **Operators return `RowId[]` not `Document[]`**
6. **David doesn't appear in results after being filtered by $match**

## Key Insights from User Feedback

1. "The fix you're trying (operators writing/reading tempState keyed sets) is the wrong abstraction"
2. "The engine must pass the upstream active rowIds into every stage"
3. "No operator should ever walk store.liveSet in snapshot()"
4. "Operators never return Document[] from snapshot(). Only RowId[]"
5. "Make the engine the owner of upstreamActiveIds"

## Next Immediate Actions

1. Update IVMOperator interface to return `RowId[]`
2. Update IVMContext to include `upstreamActiveIds: RowId[]`
3. Rewrite `snapshotPipeline` in engine to manage active IDs
4. Update each operator's snapshot method one by one
5. Test after each operator fix to ensure no regressions
6. Remove all tempState active_rowids code
7. Add runtime assertions and tests
