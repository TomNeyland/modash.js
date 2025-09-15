# Head-to-Head Performance Analysis: Stream vs Toggle Modes

## Overview

This document analyzes the performance characteristics of modash.js's two execution modes through comprehensive head-to-head benchmarking:

- **Stream Mode**: Traditional sequential processing optimized for general-purpose aggregation pipelines
- **Toggle Mode**: Crossfilter/DC.js-inspired optimizations for fixed datasets with membership filtering and analytics

## Benchmark Methodology

### Warmup Phase

- 3 warmup iterations per test case to eliminate JIT compilation effects
- Both modes executed in alternating pattern to ensure fair comparison

### Measurement Phase

- 10 benchmark iterations per mode per test case
- High-precision timing using `process.hrtime.bigint()`
- Results validation to ensure identical outputs between modes
- Throughput calculation as documents processed per second

### Test Cases

#### Toggle-Optimized Use Cases

These represent scenarios where toggle mode's crossfilter-style optimizations should provide advantages:

1. **Dimensional Filtering**: Multi-dimensional membership operations typical in dashboard analytics
2. **Refcounted Aggregation**: Group operations similar to crossfilter's `group.reduceSum()`
3. **Order Statistics**: Sorting and ranking operations with maintained order statistics
4. **Membership Filtering**: Complex boolean membership queries across multiple dimensions
5. **Multi-Stage Aggregation**: Combined filtering, computation, and aggregation workflows
6. **Dashboard Aggregation**: Multi-dimensional analytics with filtering and sorting

#### Stream-Optimized Use Cases

Control cases that should favor traditional streaming processing:

1. **Large Scan**: Simple projection operations across entire datasets
2. **Complex Expression**: Computation-heavy expression evaluation

## Performance Analysis Results

### Current Findings (Latest Run)

```
📈 Toggle Mode Optimization Effectiveness:
  Toggle wins in toggle-optimized use cases: 13/36 (36%)
  Average speedup when toggle wins: 1.27x

🌊 Stream Mode Baseline Performance:
  Stream wins in stream-optimized use cases: 6/12 (50%)
  Average speedup when stream wins: 1.04x

🎯 Specialization Assessment: Toggle mode specializations need IMPROVEMENT
```

### Scaling Analysis

Performance varies significantly by dataset size:

| Dataset Size | Toggle Win Rate | Comments                                   |
| ------------ | --------------- | ------------------------------------------ |
| 100 docs     | 50% (3/6)       | Small dataset overhead affects toggle mode |
| 500 docs     | 50% (3/6)       | Mixed results, some optimizations showing  |
| 1,000 docs   | 33% (2/6)       | Toggle mode struggling at medium scale     |
| 2,500 docs   | 17% (1/6)       | Overhead dominates at this scale           |
| 5,000 docs   | 50% (3/6)       | Optimizations start showing benefits       |
| 10,000 docs  | 17% (1/6)       | Unexpected regression at large scale       |

### Key Observations

#### Toggle Mode Strengths

- **Refcounted Aggregation**: Shows consistent 1.5-2x speedups in group operations
- **Dashboard Aggregation**: Strong performance in complex multi-dimensional analytics
- **Membership Filtering**: Effective for boolean membership queries

#### Toggle Mode Challenges

- **Order Statistics**: Consistently 2-3x slower, indicating sorting optimizations need work
- **Multi-Stage Operations**: Overhead accumulates across pipeline stages
- **Scaling Issues**: Performance degrades unexpectedly at 2,500+ and 10,000+ document scales

## Optimization Opportunities

### Immediate Improvements Needed

1. **Sort Operation Optimization**
   - Current toggle mode is 2-3x slower for `$sort` operations
   - Order-statistic trees not effectively implemented
   - Consider B-tree or skip-list optimizations

2. **Pipeline Stage Overhead**
   - Multi-stage pipelines show cumulative overhead in toggle mode
   - Need better stage-to-stage data flow optimization
   - Consider pipeline fusion opportunities

3. **Large Dataset Performance**
   - Unexpected regression at 10,000+ documents
   - May indicate memory allocation or GC pressure issues
   - Consider streaming within toggle mode for large operations

### Architectural Insights

#### When Toggle Mode Excels

- Single-stage or simple two-stage aggregations
- Group operations with maintained statistics
- Membership filtering with boolean dimensions
- Small to medium datasets (100-5,000 documents)

#### When Stream Mode Dominates

- Complex multi-stage pipelines
- Sort-heavy operations
- Very large datasets
- Expression-heavy computations

## Benchmarking Infrastructure

### Running the Benchmark

```bash
# Run full head-to-head analysis
npm run test:head-to-head

# Run validation tests for benchmark infrastructure
npm test tests/head-to-head-performance.spec.js
```

### Interpreting Results

The benchmark outputs use these symbols:

- 🏆 Clear winner (>10% performance advantage)
- 🔄 Close match (within 10% performance)
- ⚠️ Moderate difference (10-50% performance gap)
- ❌ Significant regression (>2x slower)

### Benchmark Reliability

- Results validation ensures identical outputs between modes
- Warmup phase eliminates JIT compilation artifacts
- Multiple iterations reduce timing noise
- Throughput calculations provide scale-independent metrics

## Conclusions

### Current State Assessment

The toggle mode optimizations show **partial effectiveness** with a 36% win rate in optimized use cases. While this demonstrates that the specializations are working in some scenarios, there's significant room for improvement.

### Priority Improvements

1. **Fix Sort Performance**: Address the 2-3x regression in order statistics
2. **Optimize Pipeline Overhead**: Reduce cumulative overhead in multi-stage operations
3. **Improve Large Dataset Handling**: Investigate scaling issues beyond 10,000 documents

### Strategic Recommendations

- **Continue Development**: The foundation is solid with proven wins in aggregation scenarios
- **Focus on Sort Operations**: This is the biggest performance gap currently
- **Consider Hybrid Approaches**: Use toggle mode for specific stages where it excels
- **Expand Test Coverage**: Add more real-world use cases to validate optimizations

The head-to-head analysis provides a solid foundation for measuring and improving the effectiveness of toggle mode's crossfilter-inspired optimizations.
