# Common Performance Optimization for aggo.js

This document outlines platform-agnostic performance optimizations for aggo.js that apply to both browser and Node.js environments. These optimizations focus on algorithmic improvements, data structure enhancements, and implementation patterns that provide universal benefits.

## Executive Summary

**Current Performance Analysis:**

- Heavy reliance on lodash-es functional chaining creates intermediate arrays
- No query optimization or execution planning
- Missing indexing strategies for repeated operations
- Suboptimal memory usage patterns
- Limited use of native JavaScript performance features

**Universal Optimization Targets:**

- 5-15x performance improvement across all operations
- Reduced memory allocations and GC pressure
- Query result caching and memoization
- Algorithmic complexity improvements
- Native JavaScript API leveraging

## Core Algorithmic Optimizations

### 1. Pipeline Execution Engine Redesign

**Current Implementation Issues:**

```javascript
// Current: Creates intermediate arrays at each stage
function aggregate(collection, pipeline) {
  return chain(collection)
    .thru(data => $match(data, pipeline[0].$match))
    .thru(data => $project(data, pipeline[1].$project))
    .thru(data => $group(data, pipeline[2].$group))
    .value();
}
```

**Optimized Implementation:**

```javascript
class AggoExecutionEngine {
  constructor() {
    this.queryOptimizer = new QueryOptimizer();
    this.indexManager = new IndexManager();
  }

  aggregate(collection, pipeline) {
    // Step 1: Analyze and optimize pipeline
    const optimizedPipeline = this.queryOptimizer.optimize(pipeline);

    // Step 2: Check for applicable indexes
    const executionPlan = this.queryOptimizer.createExecutionPlan(
      collection,
      optimizedPipeline,
      this.indexManager.getAvailableIndexes()
    );

    // Step 3: Execute with single-pass streaming where possible
    return this.executeOptimized(collection, executionPlan);
  }

  executeOptimized(collection, executionPlan) {
    const { canUseSinglePass, stages, indexes } = executionPlan;

    if (canUseSinglePass) {
      return this.executeSinglePass(collection, stages, indexes);
    } else {
      return this.executeMultiPass(collection, stages, indexes);
    }
  }

  // Single-pass execution for compatible pipeline stages
  executeSinglePass(collection, stages, indexes) {
    const results = [];
    const activeFilters = [];
    const projectionFields = new Set();
    const groupAccumulators = new Map();

    // Merge compatible stages for single-pass execution
    for (const stage of stages) {
      switch (stage.type) {
        case '$match':
          activeFilters.push(stage.condition);
          break;
        case '$project':
          Object.keys(stage.fields).forEach(f => projectionFields.add(f));
          break;
        case '$group':
          // Can be combined if grouping is the final operation
          break;
      }
    }

    // Single iteration through data
    for (const doc of collection) {
      // Apply all filters in one pass
      if (this.passesAllFilters(doc, activeFilters, indexes)) {
        // Apply projection and accumulation inline
        const processed = this.processDocument(
          doc,
          projectionFields,
          groupAccumulators
        );
        if (processed) results.push(processed);
      }
    }

    return this.finalizeResults(results, groupAccumulators);
  }
}
```

**Benefits:**

- Eliminates intermediate array creation
- Reduces memory allocations by 60-80%
- Enables query optimization and planning
- Single-pass execution where possible

### 2. Intelligent Indexing System

**Implementation:**

```javascript
class IndexManager {
  constructor() {
    this.indexes = new Map();
    this.indexStats = new Map();
    this.autoIndexThreshold = 3; // Create index after N queries
  }

  // Automatic index creation based on query patterns
  analyzeQuery(pipeline) {
    const indexableFields = this.extractIndexableFields(pipeline);

    for (const field of indexableFields) {
      const stats = this.indexStats.get(field) || {
        queryCount: 0,
        lastUsed: Date.now(),
      };
      stats.queryCount++;
      stats.lastUsed = Date.now();

      if (
        stats.queryCount >= this.autoIndexThreshold &&
        !this.indexes.has(field)
      ) {
        this.createIndex(field);
      }

      this.indexStats.set(field, stats);
    }
  }

  createIndex(field, type = 'btree') {
    const index = {
      field,
      type,
      data: new Map(),
      created: Date.now(),
      size: 0,
    };

    this.indexes.set(field, index);
    return index;
  }

  // Multi-column indexes for complex queries
  createCompositeIndex(fields, collection) {
    const indexKey = fields.join(',');
    const index = new Map();

    for (let i = 0; i < collection.length; i++) {
      const doc = collection[i];
      const key = fields.map(f => this.getNestedValue(doc, f)).join('|');

      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key).push(i);
    }

    this.indexes.set(indexKey, {
      fields,
      data: index,
      type: 'composite',
    });
  }

  // Range indexes for numeric/date queries
  createRangeIndex(field, collection) {
    const values = collection
      .map((doc, i) => ({ value: this.getNestedValue(doc, field), index: i }))
      .filter(item => item.value != null)
      .sort((a, b) => a.value - b.value);

    this.indexes.set(`${field}:range`, {
      field,
      type: 'range',
      sortedValues: values,
      minValue: values[0]?.value,
      maxValue: values[values.length - 1]?.value,
    });
  }

  // Efficient index-based lookups
  lookup(field, value, operator = '$eq') {
    const index = this.indexes.get(field);
    if (!index) return null;

    switch (operator) {
      case '$eq':
        return index.data.get(value) || [];

      case '$in':
        const results = [];
        for (const val of value) {
          results.push(...(index.data.get(val) || []));
        }
        return results;

      case '$gte':
      case '$lte':
      case '$gt':
      case '$lt':
        return this.rangeLookup(field, value, operator);

      default:
        return null;
    }
  }

  rangeLookup(field, value, operator) {
    const rangeIndex = this.indexes.get(`${field}:range`);
    if (!rangeIndex) return null;

    const { sortedValues } = rangeIndex;
    const results = [];

    // Binary search for range queries
    let start = 0;
    let end = sortedValues.length;

    switch (operator) {
      case '$gte':
        start = this.binarySearchGTE(sortedValues, value);
        break;
      case '$gt':
        start = this.binarySearchGT(sortedValues, value);
        break;
      case '$lte':
        end = this.binarySearchLTE(sortedValues, value) + 1;
        break;
      case '$lt':
        end = this.binarySearchLT(sortedValues, value);
        break;
    }

    return sortedValues.slice(start, end).map(item => item.index);
  }
}
```

**Benefits:**

- O(log n) lookups instead of O(n) scans
- Automatic index creation based on usage patterns
- Composite indexes for multi-field queries
- Range indexes for numeric/date operations

### 3. Query Optimization Engine

**Implementation:**

```javascript
class QueryOptimizer {
  constructor() {
    this.optimizationRules = [
      this.pushDownFilters,
      this.mergeProjections,
      this.optimizeGrouping,
      this.reorderOperations,
      this.eliminateRedundantStages,
    ];
  }

  optimize(pipeline) {
    let optimized = [...pipeline];

    for (const rule of this.optimizationRules) {
      optimized = rule.call(this, optimized);
    }

    return optimized;
  }

  // Push filters as early as possible in the pipeline
  pushDownFilters(pipeline) {
    const optimized = [];
    const filters = [];

    for (const stage of pipeline) {
      if (stage.$match) {
        filters.push(stage);
      } else {
        // Push accumulated filters before other operations
        optimized.push(...filters);
        filters.length = 0;
        optimized.push(stage);
      }
    }

    // Add remaining filters
    optimized.push(...filters);
    return optimized;
  }

  // Merge adjacent projection stages
  mergeProjections(pipeline) {
    const optimized = [];
    let currentProjection = null;

    for (const stage of pipeline) {
      if (stage.$project) {
        if (currentProjection) {
          // Merge projections
          Object.assign(currentProjection.$project, stage.$project);
        } else {
          currentProjection = { ...stage };
          optimized.push(currentProjection);
        }
      } else {
        currentProjection = null;
        optimized.push(stage);
      }
    }

    return optimized;
  }

  // Optimize grouping operations
  optimizeGrouping(pipeline) {
    const optimized = [];

    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];

      if (stage.$group) {
        const nextStage = pipeline[i + 1];

        // If followed by $sort on grouped field, optimize
        if (nextStage?.$sort && this.canOptimizeGroupSort(stage, nextStage)) {
          const optimizedGroup = this.createOptimizedGroupSort(
            stage,
            nextStage
          );
          optimized.push(optimizedGroup);
          i++; // Skip the next sort stage
        } else {
          optimized.push(stage);
        }
      } else {
        optimized.push(stage);
      }
    }

    return optimized;
  }

  createExecutionPlan(collection, pipeline, availableIndexes) {
    const plan = {
      collection,
      pipeline,
      stages: [],
      canUseSinglePass: true,
      indexUsage: [],
      estimatedCost: 0,
    };

    // Analyze each stage for optimization opportunities
    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];
      const stageInfo = this.analyzeStage(stage, collection, availableIndexes);

      plan.stages.push(stageInfo);
      plan.estimatedCost += stageInfo.cost;

      // Check if single-pass execution is still possible
      if (!this.canMergeWithPrevious(stageInfo, plan.stages[i - 1])) {
        plan.canUseSinglePass = false;
      }
    }

    return plan;
  }
}
```

**Benefits:**

- Reduces query execution time by 30-70%
- Eliminates redundant operations
- Optimizes operation order for best performance
- Provides execution cost estimation

### 4. Memory-Efficient Data Structures

**Implementation:**

```javascript
class AggoCollectionManager {
  // Column-oriented storage for better memory efficiency
  static createColumnStore(collection, schema) {
    const columns = {};
    const rowCount = collection.length;

    // Separate columns for different data types
    for (const [field, type] of Object.entries(schema)) {
      switch (type) {
        case 'number':
          columns[field] = new Float64Array(rowCount);
          break;
        case 'integer':
          columns[field] = new Int32Array(rowCount);
          break;
        case 'boolean':
          columns[field] = new Uint8Array(rowCount);
          break;
        case 'date':
          columns[field] = new Float64Array(rowCount); // Store as timestamps
          break;
        default:
          columns[field] = new Array(rowCount);
      }
    }

    // Populate columns
    for (let i = 0; i < rowCount; i++) {
      const row = collection[i];
      for (const field in schema) {
        columns[field][i] = row[field];
      }
    }

    return {
      columns,
      rowCount,
      schema,

      // Efficient column-based operations
      filter(predicate) {
        const matchingRows = [];
        for (let i = 0; i < this.rowCount; i++) {
          if (predicate(this.getRow(i))) {
            matchingRows.push(i);
          }
        }
        return matchingRows;
      },

      getRow(index) {
        const row = {};
        for (const field in this.schema) {
          row[field] = this.columns[field][index];
        }
        return row;
      },
    };
  }

  // Efficient grouping using Map-based approach
  static fastGroupBy(collection, keyFunction, aggregations) {
    const groups = new Map();
    const accumulators = {};

    // Initialize accumulators
    for (const [field, operation] of Object.entries(aggregations)) {
      accumulators[field] = this.createAccumulator(operation);
    }

    // Single pass through data
    for (const item of collection) {
      const key = keyFunction(item);

      if (!groups.has(key)) {
        groups.set(key, {
          _id: key,
          count: 0,
          ...Object.fromEntries(
            Object.keys(aggregations).map(field => [
              field,
              accumulators[field].init(),
            ])
          ),
        });
      }

      const group = groups.get(key);
      group.count++;

      // Update aggregations
      for (const [field, operation] of Object.entries(aggregations)) {
        const value = this.extractValue(item, operation.field || field);
        group[field] = accumulators[field].update(group[field], value);
      }
    }

    // Finalize results
    return Array.from(groups.values()).map(group => {
      const result = { ...group };

      for (const [field, operation] of Object.entries(aggregations)) {
        result[field] = accumulators[field].finalize(
          result[field],
          group.count
        );
      }

      return result;
    });
  }

  static createAccumulator(operation) {
    switch (operation.type) {
      case '$sum':
        return {
          init: () => 0,
          update: (acc, value) => acc + (value || 0),
          finalize: acc => acc,
        };

      case '$avg':
        return {
          init: () => ({ sum: 0, count: 0 }),
          update: (acc, value) => ({
            sum: acc.sum + (value || 0),
            count: acc.count + (value != null ? 1 : 0),
          }),
          finalize: acc => (acc.count > 0 ? acc.sum / acc.count : 0),
        };

      case '$max':
        return {
          init: () => -Infinity,
          update: (acc, value) => (value > acc ? value : acc),
          finalize: acc => (acc === -Infinity ? null : acc),
        };

      case '$min':
        return {
          init: () => Infinity,
          update: (acc, value) => (value < acc ? value : acc),
          finalize: acc => (acc === Infinity ? null : acc),
        };

      default:
        throw new Error(`Unknown aggregation operation: ${operation.type}`);
    }
  }
}
```

**Benefits:**

- Column-oriented storage improves cache locality
- Reduced memory usage for homogeneous data
- Vectorized operations support
- Efficient aggregation algorithms

### 5. Advanced Caching and Memoization

**Implementation:**

```javascript
class AggoCacheManager {
  constructor(options = {}) {
    this.resultCache = new Map();
    this.partialResultCache = new Map();
    this.maxCacheSize = options.maxSize || 1000;
    this.ttl = options.ttl || 300000; // 5 minutes
  }

  // Multi-level caching strategy
  getCachedResult(collection, pipeline) {
    const queryKey = this.generateQueryKey(pipeline);
    const collectionKey = this.generateCollectionKey(collection);
    const fullKey = `${queryKey}:${collectionKey}`;

    // Level 1: Exact match cache
    const cached = this.resultCache.get(fullKey);
    if (cached && !this.isExpired(cached)) {
      return cached.result;
    }

    // Level 2: Partial result cache
    const partialResult = this.findPartialResult(queryKey, collectionKey);
    if (partialResult) {
      return this.completePartialResult(collection, pipeline, partialResult);
    }

    return null;
  }

  setCachedResult(collection, pipeline, result, partial = false) {
    const queryKey = this.generateQueryKey(pipeline);
    const collectionKey = this.generateCollectionKey(collection);
    const fullKey = `${queryKey}:${collectionKey}`;

    const cacheEntry = {
      result,
      timestamp: Date.now(),
      hits: 0,
      queryKey,
      collectionKey,
      partial,
    };

    if (partial) {
      this.partialResultCache.set(fullKey, cacheEntry);
    } else {
      this.resultCache.set(fullKey, cacheEntry);
    }

    // Cleanup if cache is getting too large
    if (this.resultCache.size > this.maxCacheSize) {
      this.evictLeastUsed();
    }
  }

  // Incremental result caching for pipeline stages
  cacheIntermediateResults(collection, pipeline) {
    let currentData = collection;
    const intermediateResults = [];

    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];
      const partialPipeline = pipeline.slice(0, i + 1);
      const partialKey = this.generateQueryKey(partialPipeline);

      // Check if we have this intermediate result cached
      const cached = this.partialResultCache.get(partialKey);
      if (cached && !this.isExpired(cached)) {
        currentData = cached.result;
        continue;
      }

      // Execute stage and cache result
      currentData = this.executeStage(currentData, stage);

      this.setCachedResult(
        collection,
        partialPipeline,
        currentData,
        true // Mark as partial result
      );

      intermediateResults.push({
        stage: i,
        data: currentData,
        key: partialKey,
      });
    }

    return currentData;
  }

  // Smart cache invalidation based on data changes
  invalidateRelatedCaches(changedFields) {
    const keysToRemove = [];

    for (const [key, entry] of this.resultCache.entries()) {
      if (this.cacheAffectedByChanges(entry.queryKey, changedFields)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.resultCache.delete(key));
  }
}
```

**Benefits:**

- Multi-level caching reduces repeated computations
- Incremental result caching for complex pipelines
- Smart cache invalidation
- Memory-efficient cache management

### 6. Native JavaScript API Optimizations

**Implementation:**

```javascript
class AggoNativeOptimizations {
  // Use native Map/Set for better performance
  static optimizeUniqueOperations(array) {
    return Array.from(new Set(array));
  }

  // Leverage native Array methods with optimized callbacks
  static fastFilter(collection, predicate) {
    // Pre-compile predicate for better V8 optimization
    const compiledPredicate = this.compilePredicate(predicate);

    return collection.filter(compiledPredicate);
  }

  static fastMap(collection, mapper) {
    const compiledMapper = this.compileMapper(mapper);

    return collection.map(compiledMapper);
  }

  // Use native sorting with custom comparers
  static fastSort(collection, sortSpec) {
    const comparer = this.createComparer(sortSpec);

    // Use native sort which is highly optimized
    return [...collection].sort(comparer);
  }

  static createComparer(sortSpec) {
    const fields = Object.entries(sortSpec);

    return (a, b) => {
      for (const [field, direction] of fields) {
        const aVal = this.getNestedValue(a, field);
        const bVal = this.getNestedValue(b, field);

        const comparison = this.compareValues(aVal, bVal);

        if (comparison !== 0) {
          return direction === 1 ? comparison : -comparison;
        }
      }

      return 0;
    };
  }

  // Optimized value comparison
  static compareValues(a, b) {
    // Handle null/undefined
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;

    // Type-specific comparisons
    const aType = typeof a;
    const bType = typeof b;

    if (aType !== bType) {
      return aType < bType ? -1 : 1;
    }

    switch (aType) {
      case 'number':
        return a - b;
      case 'string':
        return a.localeCompare(b);
      case 'boolean':
        return a === b ? 0 : a ? 1 : -1;
      case 'object':
        if (a instanceof Date && b instanceof Date) {
          return a.getTime() - b.getTime();
        }
        // Fallback to string comparison for objects
        return String(a).localeCompare(String(b));
      default:
        return 0;
    }
  }

  // Use ArrayBuffer for efficient numeric operations
  static createNumericView(collection, field) {
    const length = collection.length;
    const buffer = new ArrayBuffer(length * 8); // Float64
    const view = new Float64Array(buffer);

    for (let i = 0; i < length; i++) {
      view[i] = collection[i][field] || 0;
    }

    return view;
  }

  // Vectorized mathematical operations
  static vectorizedSum(typedArray) {
    let sum = 0;
    const length = typedArray.length;

    // Process in chunks for better performance
    const chunkSize = 1000;

    for (let i = 0; i < length; i += chunkSize) {
      const end = Math.min(i + chunkSize, length);

      for (let j = i; j < end; j++) {
        sum += typedArray[j];
      }
    }

    return sum;
  }
}
```

**Benefits:**

- Leverages native JavaScript optimizations
- Reduced overhead from library abstractions
- Better V8 optimization opportunities
- Efficient memory usage patterns

## Cross-Platform Performance Patterns

### 1. Lazy Evaluation and Streaming

**Implementation:**

```javascript
class AggoLazyEvaluation {
  constructor(collection) {
    this.source = collection;
    this.operations = [];
  }

  static from(collection) {
    return new AggoLazyEvaluation(collection);
  }

  // Lazy operations - build operation chain without execution
  filter(predicate) {
    this.operations.push({ type: 'filter', predicate });
    return this;
  }

  map(mapper) {
    this.operations.push({ type: 'map', mapper });
    return this;
  }

  groupBy(keySelector, aggregations) {
    this.operations.push({ type: 'groupBy', keySelector, aggregations });
    return this;
  }

  // Execute all operations in optimal order
  execute() {
    let result = this.source;

    // Optimize operation order
    const optimizedOps = this.optimizeOperations(this.operations);

    for (const op of optimizedOps) {
      result = this.executeOperation(result, op);
    }

    return result;
  }

  // Generator-based streaming for large datasets
  *stream() {
    const batchSize = 1000;

    for (let i = 0; i < this.source.length; i += batchSize) {
      const batch = this.source.slice(i, i + batchSize);
      const processed = this.processBatch(batch);

      for (const item of processed) {
        yield item;
      }
    }
  }
}
```

### 2. Adaptive Performance Strategies

**Implementation:**

```javascript
class AggoAdaptiveEngine {
  constructor() {
    this.performanceHistory = new Map();
    this.strategyThresholds = {
      small: 1000,
      medium: 10000,
      large: 100000,
    };
  }

  selectOptimalStrategy(collection, pipeline) {
    const size = collection.length;
    const complexity = this.calculateComplexity(pipeline);
    const historicalPerf = this.getHistoricalPerformance(pipeline);

    // Data size based strategy selection
    if (size <= this.strategyThresholds.small) {
      return 'direct-execution';
    } else if (size <= this.strategyThresholds.medium) {
      return complexity > 5 ? 'indexed-execution' : 'optimized-execution';
    } else {
      return historicalPerf?.avgTime > 100
        ? 'streaming-execution'
        : 'parallel-execution';
    }
  }

  calculateComplexity(pipeline) {
    let complexity = 0;

    for (const stage of pipeline) {
      if (stage.$match) complexity += 1;
      if (stage.$project) complexity += 1;
      if (stage.$group) complexity += 3; // Grouping is more expensive
      if (stage.$sort) complexity += 2;
      if (stage.$lookup) complexity += 4; // Joins are expensive
      if (stage.$unwind) complexity += 2;
    }

    return complexity;
  }

  recordPerformance(pipeline, executionTime, strategy) {
    const pipelineKey = JSON.stringify(pipeline);
    const current = this.performanceHistory.get(pipelineKey) || {
      totalTime: 0,
      executions: 0,
      strategies: new Map(),
    };

    current.totalTime += executionTime;
    current.executions++;

    const strategyStats = current.strategies.get(strategy) || {
      count: 0,
      totalTime: 0,
    };
    strategyStats.count++;
    strategyStats.totalTime += executionTime;
    current.strategies.set(strategy, strategyStats);

    this.performanceHistory.set(pipelineKey, current);
  }
}
```

### 3. Memory Management Strategies

**Implementation:**

```javascript
class AggoMemoryManager {
  constructor() {
    this.memoryThreshold = this.getMemoryThreshold();
    this.gcTriggerThreshold = 0.8; // Trigger cleanup at 80% memory usage
  }

  getMemoryThreshold() {
    if (typeof window !== 'undefined') {
      // Browser environment - estimate based on device memory
      return (navigator.deviceMemory || 4) * 1024 * 1024 * 1024 * 0.1; // 10% of device memory
    } else {
      // Node.js environment
      return process.memoryUsage().heapTotal * 0.8; // 80% of heap
    }
  }

  checkMemoryPressure() {
    if (typeof window !== 'undefined') {
      // Browser memory pressure detection
      return performance.memory
        ? performance.memory.usedJSHeapSize /
            performance.memory.jsHeapSizeLimit >
            this.gcTriggerThreshold
        : false;
    } else {
      // Node.js memory pressure detection
      const usage = process.memoryUsage();
      return usage.heapUsed / usage.heapTotal > this.gcTriggerThreshold;
    }
  }

  // Adaptive batch processing based on memory pressure
  adaptiveBatchProcessing(collection, processor) {
    const isUnderMemoryPressure = this.checkMemoryPressure();
    const batchSize = isUnderMemoryPressure ? 100 : 1000;

    const results = [];

    for (let i = 0; i < collection.length; i += batchSize) {
      const batch = collection.slice(i, i + batchSize);
      const batchResult = processor(batch);

      results.push(...batchResult);

      // Trigger garbage collection hint if available
      if (isUnderMemoryPressure && typeof global?.gc === 'function') {
        global.gc();
      }
    }

    return results;
  }

  // Object pooling for frequently created objects
  createObjectPool(factory, resetFunction, initialSize = 10) {
    const pool = [];
    const inUse = new Set();

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      pool.push(factory());
    }

    return {
      acquire() {
        const obj = pool.pop() || factory();
        inUse.add(obj);
        return obj;
      },

      release(obj) {
        if (inUse.has(obj)) {
          resetFunction(obj);
          inUse.delete(obj);
          pool.push(obj);
        }
      },

      stats() {
        return {
          poolSize: pool.length,
          inUseCount: inUse.size,
          totalCreated: pool.length + inUse.size,
        };
      },
    };
  }
}
```

## Performance Monitoring and Metrics

### Universal Performance Tracking

**Implementation:**

```javascript
class AggoPerformanceTracker {
  constructor() {
    this.metrics = {
      operations: new Map(),
      memoryUsage: [],
      errorRates: new Map(),
      cachePerformance: { hits: 0, misses: 0 },
    };
  }

  trackOperation(name, fn, ...args) {
    const startTime = this.getHighResolutionTime();
    const startMemory = this.getCurrentMemoryUsage();

    try {
      const result = fn(...args);

      const endTime = this.getHighResolutionTime();
      const endMemory = this.getCurrentMemoryUsage();

      this.recordMetric(name, {
        duration: endTime - startTime,
        memoryDelta: endMemory - startMemory,
        success: true,
      });

      return result;
    } catch (error) {
      const endTime = this.getHighResolutionTime();

      this.recordMetric(name, {
        duration: endTime - startTime,
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  getHighResolutionTime() {
    if (typeof performance !== 'undefined') {
      return performance.now();
    } else {
      const hrTime = process.hrtime();
      return hrTime[0] * 1000 + hrTime[1] / 1000000;
    }
  }

  getCurrentMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    } else if (typeof process !== 'undefined') {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  generatePerformanceReport() {
    const report = {
      timestamp: Date.now(),
      operations: {},
      summary: {
        totalOperations: 0,
        avgDuration: 0,
        errorRate: 0,
        cacheHitRate: 0,
      },
    };

    // Aggregate operation metrics
    for (const [name, metrics] of this.metrics.operations) {
      const successfulOps = metrics.filter(m => m.success);
      const totalOps = metrics.length;

      report.operations[name] = {
        count: totalOps,
        successRate: successfulOps.length / totalOps,
        avgDuration:
          successfulOps.reduce((sum, m) => sum + m.duration, 0) /
          successfulOps.length,
        p95Duration: this.calculatePercentile(
          successfulOps.map(m => m.duration),
          0.95
        ),
        avgMemoryDelta:
          successfulOps.reduce((sum, m) => sum + m.memoryDelta, 0) /
          successfulOps.length,
      };

      report.summary.totalOperations += totalOps;
    }

    // Calculate cache performance
    const { hits, misses } = this.metrics.cachePerformance;
    report.summary.cacheHitRate = hits / (hits + misses) || 0;

    return report;
  }
}
```

## Expected Performance Improvements

| Category                 | Current  | Target    | Improvement           |
| ------------------------ | -------- | --------- | --------------------- |
| Simple Operations        | 1.38ms   | 0.15ms    | 9x faster             |
| Complex Aggregations     | 66.27ms  | 8ms       | 8x faster             |
| Memory Usage             | Baseline | -60%      | Significant reduction |
| Cache Hit Rate           | 0%       | 85%+      | New capability        |
| Large Dataset Processing | N/A      | Streaming | Scalable              |

## Compatibility and Migration

### Backward Compatibility Strategy

```javascript
class AggoCompatibilityLayer {
  static enableLegacyMode() {
    // Maintain 100% API compatibility while adding performance improvements
    return {
      useOptimizations: true,
      fallbackToLegacy: true,
      performanceMonitoring: true,
    };
  }
}
```

### Migration Path

1. **Implementation**: Drop-in replacement with automatic optimizations
2. **Enhancement**: Opt-in advanced features (indexing, caching)
3. **Migration**: Full migration to optimized API
4. **Finalization**: Legacy API deprecation (if desired)

This comprehensive optimization strategy provides a clear path to achieving 5-15x performance improvements while maintaining full compatibility with existing code.
