# IVM Implementation TODO List

## Critical Path - Eliminate Fallbacks

### 1. Debug Infrastructure

- [ ] Add DEBUG environment variable flag
- [ ] Create wrapStage function to trace delta flow
- [ ] Add operation counters (adds, removes, drops, forwards)
- [ ] Log specific error messages before fallback
- [ ] Add stage name to all error messages
- [ ] Create pipeline execution visualizer for debugging

### 2. Fix Operator Consistency

- [ ] Add getEffectiveDocument to LimitOperator
- [ ] Add getEffectiveDocument to SkipOperator
- [ ] Update LimitOperator.snapshot to use effective documents
- [ ] Update SkipOperator.snapshot to use effective documents
- [ ] Verify all operators consistently use effective documents

### 3. Fix Cache Key Management

- [ ] Ensure stageIndex is set correctly in processDeltaThroughPipeline
- [ ] Verify stageIndex consistency in snapshotPipeline
- [ ] Add cache key validation in getEffectiveDocument
- [ ] Test cache retrieval across snapshot and incremental paths

### 4. Implement Missing Operators

- [ ] Implement $slice (2-arg form) in compiled path
- [ ] Implement $slice (3-arg form) in compiled path
- [ ] Implement $round in compiled path
- [ ] Implement $ceil in compiled path
- [ ] Implement $sqrt in compiled path
- [ ] Implement $abs in compiled path
- [ ] Implement $split in compiled path
- [ ] Implement $strLen in compiled path
- [ ] Implement $trim in compiled path
- [ ] Fix $arrayElemAt to return null (not undefined) for OOB
- [ ] Implement $concatArrays in compiled path
- [ ] Implement nested projection spec support

### 5. Fix Projection Pruning

- [ ] Verify terminal projection is never pruned
- [ ] Ensure optimizer clones pipeline before modification
- [ ] Validate projected fields propagate through optimizer
- [ ] Test field usage analysis with complex expressions

### 6. Add Regression Tests

- [ ] Test cross-stage field: $project(month) → $group(by month)
- [ ] Test terminal projection preservation
- [ ] Test $arrayElemAt OOB returns null
- [ ] Test nested projection spec
- [ ] Test benchmark pipeline equivalence
- [ ] Add fallback counter assertion (must be 0)

### 7. Fix Streaming Tests

- [ ] Fix streaming aggregation initial results test
- [ ] Fix complex aggregation pipeline test
- [ ] Fix event source pipeline test
- [ ] Fix live updates test
- [ ] Fix transparent streaming tests
- [ ] Fix record removal tests

### 8. Benchmark Verification

- [ ] Verify simpleFilter produces zero fallbacks
- [ ] Verify groupAndAggregate produces zero fallbacks
- [ ] Verify complexPipeline produces zero fallbacks
- [ ] Ensure results match standard aggregation exactly
- [ ] Verify performance is maintained

## Phase 2 Foundation

### 9. Operator API Barrier

- [ ] Remove direct store access from operators
- [ ] Implement upstream delta consumption pattern
- [ ] Add hydrate method to all operators
- [ ] Enforce API contracts at compile time

### 10. CI/CD Improvements

- [ ] Add grep check for evaluateMatchExpression in compiled code
- [ ] Add benchmark fallback count check (fail if > 0)
- [ ] Add performance regression gates
- [ ] Add allocation tracking
- [ ] Create automated test for operator coverage

### 11. Documentation

- [ ] Document IVM architecture decisions
- [ ] Create operator implementation guide
- [ ] Document debugging procedures
- [ ] Add performance tuning guide

## Testing Checklist

### Unit Tests

- [ ] Each operator has comprehensive tests
- [ ] Cross-stage field resolution tests
- [ ] Projection pruning tests
- [ ] Cache key management tests
- [ ] Error handling tests

### Integration Tests

- [ ] Full pipeline execution tests
- [ ] Streaming with IVM tests
- [ ] Incremental update tests
- [ ] Record removal tests
- [ ] Performance benchmark tests

### Regression Prevention

- [ ] All fixed issues have specific tests
- [ ] CI catches compilation fallbacks
- [ ] Performance gates prevent regression
- [ ] Error messages are helpful

## Success Metrics

- [ ] Zero fallback messages in benchmarks
- [ ] All tests passing
- [ ] Cross-stage fields working
- [ ] Performance maintained or improved
- [ ] Clear error diagnostics
- [ ] CI preventing regressions
