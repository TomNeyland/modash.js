# Operator Fixes Needed

## Changes for all operators:
1. `snapshot()` must return `RowId[]` not `Collection<Document>`
2. Use `context.upstreamActiveIds` instead of iterating `store.liveSet`
3. Remove all tempState active_rowids_stage_* code
4. Implement `getEffectiveDocument()` for operators that transform documents

## Operators to fix:
- [x] MatchOperator - DONE
- [ ] ProjectOperator - needs cache and getEffectiveDocument
- [ ] GroupOperator - returns group rowIds
- [ ] SortOperator - sorts and returns same rowIds
- [ ] LimitOperator - returns first N rowIds
- [ ] SkipOperator - returns rowIds after skipping
- [ ] UnwindOperator - returns child rowIds
- [ ] AddFieldsOperator - needs cache and getEffectiveDocument
- [ ] TopKOperator - returns top K rowIds
- [ ] LookupOperator - needs updating