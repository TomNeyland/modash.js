# IVM Fallback Analysis - Complete Investigation

## Executive Summary
The IVM system is architecturally sound but has critical implementation gaps causing unnecessary fallbacks. The previous developer made significant progress on cross-stage field resolution but didn't complete the work to eliminate fallbacks in the benchmark pipelines.

## Current State (as of latest commits)

### ✅ What's Working
1. **Context Persistence**: Single IVMContext shared across pipeline stages
2. **Field Usage Analysis**: Optimizer correctly detects complex group _id field references
3. **Effective Document Access**: All operators have getEffectiveDocument methods
4. **Compilation**: Execution plans show `canIncrement: true, canDecrement: true`
5. **Cross-Stage Fields**: Month field computed correctly (no longer undefined)

### ❌ What's Still Broken
1. **Benchmark Fallbacks**: All three benchmark pipelines still fall back to standard aggregation
2. **Error During Execution**: Despite successful compilation, IVM throws error during execute/snapshot
3. **Operator Inconsistencies**: LimitOperator and SkipOperator access store directly
4. **Missing Operators**: Several operators used by benchmarks not fully implemented
5. **Test Failures**: 17 test failures related to streaming and IVM functionality

## Root Cause Analysis

### Primary Issue: Execution-Time Failure
The fallback occurs not during compilation but during execution. The error message "Pipeline not fully supported by IVM engine" is misleading - it's thrown after a runtime error, not a compilation issue.

### Specific Problems Identified

#### 1. Document Access Inconsistency
```typescript
// Bad (LimitOperator line 610, SkipOperator line 672):
const doc = _store.documents[rowId];

// Good (other operators):
const doc = this.getEffectiveDocument(rowId, _store, _context);
```

#### 2. Cache Key Management
The ProjectOperator caches documents with key `projected_docs_stage_${stageIndex}`, but the stageIndex might not be consistent between snapshot and incremental paths.

#### 3. Missing Operator Implementations
The complexPipeline uses operators that may not be fully implemented in the compiled path:
- `$month` (implemented but may have edge cases)
- `$multiply` (should be implemented)
- `$gte` (should be implemented)
- Array/math/string operators used in other tests

#### 4. Error Handling Opacity
The current error handling swallows the actual error and shows generic fallback messages:
```typescript
console.warn('IVM engine failed, falling back to standard aggregation:', error?.message || error);
```

## Performance Test Analysis

### Benchmark Pipelines

#### simpleFilter (Working)
```javascript
{ $match: { category: 'electronics', active: true } }
```
- Single stage, basic field matching
- Should work with IVM but still falls back

#### groupAndAggregate (Working)
```javascript
[
  { $group: { _id: '$category', totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } }, ... } },
  { $sort: { totalRevenue: -1 } }
]
```
- No cross-stage computed fields
- Should work with IVM but still falls back

#### complexPipeline (Partially Working)
```javascript
[
  { $match: { active: true, quantity: { $gt: 0 } } },
  { $project: { item: 1, category: 1, revenue: { $multiply: ['$price', '$quantity'] }, isPremium: { $gte: ['$price', 200] }, month: { $month: '$date' } } },
  { $group: { _id: { category: '$category', month: '$month' }, totalRevenue: { $sum: '$revenue' } } },
  { $sort: { totalRevenue: -1 } },
  { $limit: 10 }
]
```
- Cross-stage field resolution now works (month no longer undefined)
- But still falls back due to execution error

## Previous Developer's Progress

### What They Fixed
1. **Context Persistence**: Modified processDeltaThroughPipeline and snapshotPipeline to use single context
2. **Optimizer Field Analysis**: Fixed extractGroupFields to handle complex _id objects
3. **Operator Updates**: Added getEffectiveDocument to Match, Sort, Project, Group operators
4. **Snapshot Processing**: Updated snapshot methods to use effective documents

### What They Didn't Complete
1. **Debug Infrastructure**: No way to see where/why fallback occurs
2. **Operator Consistency**: Not all operators use effective documents
3. **Missing Operators**: Several operators needed by benchmarks not implemented
4. **Error Diagnostics**: Actual errors are hidden by generic messages
5. **Test Coverage**: No tests specifically for cross-stage field resolution

## Tom's Feedback Integration

### Key Points from Feedback
1. "They partially got the message... benchmarks still show fallbacks. Not done yet."
2. "Still in analysis + scaffolding mode... the bar was to eliminate fallbacks"
3. "Context persistence fix is only half-wired"
4. "They're drifting into Phase-2 docs/groundwork instead of closing Phase-1"

### Immediate Priorities (from Tom)
1. **Optimizer fix**: Propagate derived fields correctly
2. **Cross-stage materialization**: Pick one approach and finish it
3. **Bench acceptance gate**: Zero fallback messages
4. **Plug operator gaps**: Arrays, math, strings
5. **Tests to prove it's fixed**: Specific regression tests

## Phase 2 Improvements to Include

### Debug Infrastructure (Immediate DX Win)
```typescript
export const DEBUG = process.env.NODE_ENV !== 'production';
export function wrapStage<T extends IVMOperator>(name: string, s: T, dbg=false): T
```
- Trace delta flow through stages
- Count drops/forwards per stage
- Log first N operations for debugging
- Show exactly where fallback occurs

### Error Diagnostics
- Capture and log specific error before fallback
- Show which stage failed
- Include operation type and field references
- Add stage name to error messages

### CI Invariants
- Grep for evaluateMatchExpression in compiled code
- Fail if benchmark fallback count > 0
- Track performance regression

## Action Items

### Immediate (Phase 1 Completion)
1. Add debug infrastructure to pinpoint fallback cause
2. Fix LimitOperator/SkipOperator to use effective documents
3. Ensure cache key consistency across execution paths
4. Implement missing operators for benchmarks
5. Add specific regression tests
6. Verify zero fallbacks in benchmarks

### Follow-up (Phase 2 Foundation)
1. Operator API barrier (no direct store access)
2. Hydration discipline (proper replay)
3. Performance gates and monitoring
4. Comprehensive error messages

## Success Criteria
- ✅ All three benchmark pipelines run without fallback
- ✅ Cross-stage computed fields work correctly
- ✅ Test suite passes (especially streaming tests)
- ✅ Performance maintained or improved
- ✅ Clear error messages when issues occur
- ✅ CI prevents regression