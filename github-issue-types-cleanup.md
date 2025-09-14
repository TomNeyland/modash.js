# 🚧 Types-First Cleanup: Crossfilter Engine & Operators

## 📌 Summary

Refactor the crossfilter engine/operators to enforce **strict type correctness** around `RowId` handling, document storage, and operator materialization. Goal is to **eliminate unsafe casts** and implicit `any` while maintaining current behavior. This is groundwork before feature gaps like `$switch` and `$value` are implemented.

## 📊 Current State Metrics

- **TypeScript errors:** 43
- **TODO(types) comments:** 13
- **TODO(refactor) comments:** 4
- **Test baseline:** 306 passing, 1 pending, 15 failing (feature gaps, not regressions)

---

## ✅ Work Completed

- **Removed legacy streaming**
  - Deleted `src/modash/streaming-old.ts`.

- **RowId model correctness**
  - Introduced `PhysicalRowId = number`, `VirtualRowId = string`, and `RowId = PhysicalRowId | VirtualRowId`.
  - `LiveSet` now strictly iterates over `PhysicalRowId` only.
  - $unwind now uses stable **string virtual IDs** (`unwind:<opId>:<parentId>:<index>`).
  - Virtual docs stored in an **internal map**, not `store.documents`.

- **Safe document access**
  - Added `getPhysicalDocument(store, rowId)` helper.
  - Replaced unsafe `store.documents[rowId]` with helper across engine/operators.
  - Left TODOs wherever virtual IDs might sneak into physical fallbacks.

- **Operator updates**
  - `$unwind` fully refactored to separate physical vs virtual docs.
  - `$lookup` updates restricted to physical IDs; TODO(types) asserts this.

- **General tightening**
  - Fixed several implicit `any` in compiler and regex construction.
  - Adjusted `OrderStatNode` fields to allow `undefined` under `exactOptionalPropertyTypes`.
  - Removed unused `_getEffectiveDocument` helper in operators.

---

## 🔎 Key TODOs (inline in code)

- **Engine fallbacks**:

  > "Only physical rowIds should fall back to store. TODO(types): If virtual RowIds ever reach here, add explicit handlers."

- **Unwind deletions**:

  > "TODO(types): childId for $unwind is numeric; revisit if this changes."

- **$lookup updates**:

  > "TODO(types): rowId here should always be physical; assert/narrow as needed."

- **Zero-alloc engine**:
  > "TODO(refactor): avoid in-place buffer swaps; explore immutable + pooled buffers."

---

## ✅ Actionable Checklist

### Type Safety

- [ ] Remove implicit `any` in crossfilter-compiler.ts (8 instances)
  - [ ] Line 1263: Parameter 'v' implicitly has an 'any' type
  - [ ] Line 1265: Parameters 'sum' and 'val' implicitly have 'any' type
  - [ ] Line 1701: Parameter 'field' implicitly has an 'any' type
  - [ ] Line 779-788: Sort function parameters implicitly have 'any' type
- [ ] Fix `DocumentValue` type assignments (5 instances)
  - [ ] Line 1165: Type 'unknown' is not assignable to type 'DocumentValue'
  - [ ] Line 568, 826: Type 'undefined' is not assignable to type 'DocumentValue'
  - [ ] Line 843, 848: Type 'DocumentValue | undefined' is not assignable
- [ ] Resolve `OrderStatNode` exactOptionalPropertyTypes issues (3 instances)
  - [ ] Line 116, 130, 142 in crossfilter-impl.ts
- [ ] Add null guards for min/max comparisons in crossfilter-impl.ts
  - [ ] Lines 467, 474, 526: Handle possibly null values
- [ ] Assert physical-only RowIds in $lookup updates (line 1232)
- [ ] Fix string type assignment in operators (line 338)

### Virtual/Physical Separation

- [ ] Add explicit handlers for virtual RowIds in engine fallbacks (5 locations)
  - [ ] Line 414: Document materialization fallback
  - [ ] Line 474: Lookup operation fallback
  - [ ] Line 557: Sort operation fallback
  - [ ] Line 664: Match operation fallback
  - [ ] Line 758: Projection fallback
- [ ] Add explicit handlers for virtual RowIds in operator fallbacks (7 locations)
  - [ ] Lines 650, 699: Basic operators
  - [ ] Lines 833, 894: Accumulator operations
  - [ ] Line 1232: $lookup operations
  - [ ] Lines 1667, 1778: Additional operator paths
- [ ] Verify $unwind childId remains numeric-only

### Performance Optimizations (lower priority)

- [ ] Replace deep clone with structuredClone in aggregation.ts (3 locations)
- [ ] Avoid object spread in hot paths (aggregation.ts:469)
- [ ] Explore immutable + pooled buffers in zero-alloc-engine.ts

### Code Cleanup

- [ ] Remove unused variable declarations
  - [ ] generateConditionCode (compiler.ts:719)
  - [ ] fieldPath (compiler.ts:1380)
  - [ ] applyProjection, applySorting, applyMatching (engine.ts:776-838)
  - [ ] accType (impl.ts:750)
  - [ ] \_getEffectiveDocument (operators.ts:160)
  - [ ] compiler property (operators.ts:206)

---

## 📝 Next Steps

1. **Continue type hygiene**
   - Remove remaining implicit `any` in compiler/impl.
   - Add null/undefined guards under `strictNullChecks`.
   - Centralize document materialization paths for virtual vs physical.

2. **Verify no regressions**
   - Keep running `npm run test:units` after each tightening.
   - Current baseline: **306 passing, 1 pending, 15 failing** (all due to feature gaps, not regressions).

3. **Defer features until types are clean**
   - No `$switch`, `$value`, or accumulator changes until type-check passes cleanly.

---

## 🎯 Mantra

**Do it right, not fast.**

- Types come first.
- Virtual/physical split must be watertight.
- Every unsafe cast either gets removed or flagged with a clear TODO.

---

## 🏷️ Suggested Labels

- `refactor`
- `type-safety`
- `technical-debt`
- `do-not-merge` (until types clean)

## 🎯 Milestone

Types-First Cleanup Sprint
