# IVM Fallback Analysis & Phase Two Roadmap

## Root Cause of IVM Fallbacks

**Problem**: IVM system falls back to standard aggregation more than necessary due to architectural limitations in document transformation between stages.

### Specific Issue: Document State Management

1. **ProjectOperator Problem**: The `ProjectOperator` compiles expressions correctly but doesn't update documents in the store:
   ```typescript
   onAdd(_delta: Delta, _store: CrossfilterStore, _context: IVMContext): Delta[] {
     // ❌ Just passes delta through without transforming document
     return [_delta];
   }
   ```

2. **GroupOperator Problem**: The `GroupOperator` tries to access computed fields from original documents:
   ```typescript
   const doc = _store.documents[_delta.rowId]; // ❌ Gets original doc, not projected
   const groupKey = this.compiledGroup.getGroupKey(doc, _delta.rowId); // ❌ Fails for computed fields
   ```

3. **Result**: Field references like `'$month'` fail because the computed field doesn't exist in the original document, causing unnecessary fallbacks.

### Test Case That Demonstrates the Issue

```javascript
// This works (no pipeline stages):
{ $project: { month: { $month: '$date' } } }

// This fails (field resolution across stages):
[
  { $project: { month: { $month: '$date' }, category: 1 } },
  { $group: { _id: { category: '$category', month: '$month' } } } // ❌ '$month' not found
]
```

## Phase Two Implementation Plan

Based on @TomNeyland's architectural guidance, the solution requires implementing proper document state management with the following Phase Two improvements:

### 1. Operator API Barrier ✨ High Priority
- **Problem**: Stages directly access the document store
- **Solution**: Stages should only consume upstream deltas and hydrate from upstream actives
- **Implementation**: Update operators to work with transformed document streams rather than accessing store directly

### 2. Hydration Discipline ✨ High Priority  
- **Problem**: No proper stage-by-stage document transformation
- **Solution**: Replay stage-by-stage with proper document state propagation
- **Implementation**: Each stage maintains its own view of document transformations

### 3. Document Transformation Pipeline ✨ Critical Fix
```typescript
// Current (broken):
ProjectOperator.onAdd() -> passes delta without transforming store
GroupOperator.onAdd() -> accesses original doc from store

// Target (Phase Two):
ProjectOperator.onAdd() -> transforms document in staging area
GroupOperator.onAdd() -> accesses transformed doc from previous stage
```

### 4. Debug Infrastructure
- Add DEBUG flags for tracing document transformations
- Pipeline compilation introspection
- Stage-by-stage field availability tracking

### 5. CI/Performance Invariants
- Performance gates to catch IVM fallback regressions
- Allocation tracking for document transformation overhead
- Automated testing of cross-stage field resolution

## Immediate Workaround Options

1. **Enhanced Field Resolution**: Update operators to check for computed fields in context
2. **Document Staging**: Add intermediate document transformation tracking
3. **Better Error Messages**: Add specific diagnostics for field resolution failures

## Long-term Architecture (Phase Two Vision)

The Phase Two plan addresses the fundamental architectural issues:
- Proper document state management between stages
- Clean operator contracts (no direct store access)
- Comprehensive debugging and introspection
- Performance monitoring and regression prevention
- Better error diagnostics

This analysis confirms that reducing IVM fallbacks requires the architectural improvements outlined in the Phase Two guidance.