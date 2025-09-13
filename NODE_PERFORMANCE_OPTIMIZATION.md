# Node.js Performance Optimization for modash.js

This document outlines Node.js-specific performance optimizations for modash.js, leveraging server-side capabilities for maximum performance in backend environments.

## Executive Summary

**Current Performance Baseline (10,000 documents):**

- Simple Filter: 1.38ms
- Group & Aggregate: 18.29ms
- Complex Pipeline: 66.27ms

**Target Improvements:**

- 10-20x performance improvement for large datasets
- Sub-millisecond operations for small to medium datasets
- Efficient memory usage for high-concurrency scenarios
- Streaming support for very large datasets

## Node.js-Specific Performance Opportunities

### 1. Worker Threads for CPU-Intensive Operations

**Implementation Strategy:**

```javascript
// modash-worker-pool.js
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import Modash from './src/modash/index.js';

class ModashWorkerPool {
  constructor(poolSize = cpus().length) {
    this.workers = [];
    this.availableWorkers = [];
    this.jobQueue = [];
    this.activeJobs = new Map();

    for (let i = 0; i < poolSize; i++) {
      this.createWorker(i);
    }
  }

  createWorker(id) {
    const worker = new Worker(__filename, {
      workerData: { isWorker: true, workerId: id },
    });

    worker.on('message', result => {
      this.handleWorkerMessage(worker, result);
    });

    worker.on('error', error => {
      console.error(`Worker ${id} error:`, error);
      this.replaceWorker(worker, id);
    });

    this.workers.push(worker);
    this.availableWorkers.push(worker);

    return worker;
  }

  async aggregate(collection, pipeline, options = {}) {
    const jobId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const job = {
        id: jobId,
        collection,
        pipeline,
        options,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      this.scheduleJob(job);
    });
  }

  scheduleJob(job) {
    if (this.availableWorkers.length > 0) {
      this.executeJob(job);
    } else {
      this.jobQueue.push(job);
    }
  }

  executeJob(job) {
    const worker = this.availableWorkers.pop();
    this.activeJobs.set(worker, job);

    worker.postMessage({
      type: 'aggregate',
      jobId: job.id,
      collection: job.collection,
      pipeline: job.pipeline,
      options: job.options,
    });
  }
}

// Worker thread code
if (workerData?.isWorker) {
  parentPort.on('message', async message => {
    const { type, jobId, collection, pipeline, options } = message;

    try {
      let result;

      switch (type) {
        case 'aggregate':
          result = Modash.aggregate(collection, pipeline);
          break;
        case 'bulk-aggregate':
          result = await handleBulkAggregation(collection, pipeline, options);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      parentPort.postMessage({
        jobId,
        result,
        workerId: workerData.workerId,
      });
    } catch (error) {
      parentPort.postMessage({
        jobId,
        error: error.message,
        workerId: workerData.workerId,
      });
    }
  });
}
```

**Benefits:**

- True parallel processing on multi-core systems
- Non-blocking main thread for web servers
- Automatic load balancing across CPU cores
- Isolated memory spaces prevent memory leaks

### 2. Native C++ Bindings for Critical Operations

**Implementation Strategy:**

```cpp
// modash-native.cpp - Native addon using N-API
#include <node_api.h>
#include <vector>
#include <unordered_map>
#include <algorithm>
#include <immintrin.h> // For SIMD operations

// High-performance grouping operation using SIMD
napi_value FastGroupBy(napi_env env, napi_callback_info info) {
    size_t argc = 3;
    napi_value args[3];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    // Extract JavaScript array
    uint32_t length;
    napi_get_array_length(env, args[0], &length);

    // Use vectorized operations for numeric aggregations
    std::vector<double> values(length);
    std::unordered_map<std::string, std::vector<size_t>> groups;

    // Process in SIMD chunks of 8 elements
    const size_t simdWidth = 8;
    const size_t alignedLength = (length / simdWidth) * simdWidth;

    for (size_t i = 0; i < alignedLength; i += simdWidth) {
        __m256d chunk = _mm256_loadu_pd(&values[i]);
        // Vectorized operations here
    }

    // Create result object
    napi_value result;
    napi_create_object(env, &result);

    return result;
}

// Module initialization
napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor desc[] = {
        {"fastGroupBy", nullptr, FastGroupBy, nullptr, nullptr, nullptr, napi_default, nullptr}
    };

    napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
```

```javascript
// modash-native-bindings.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let nativeModule = null;

try {
  nativeModule = require('./build/Release/modash-native');
} catch (error) {
  console.warn(
    'Native module not available, falling back to JavaScript implementation'
  );
}

export class ModashNative {
  static isAvailable() {
    return nativeModule !== null;
  }

  static fastGroupBy(collection, keyFields, aggregations) {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }

    return nativeModule.fastGroupBy(collection, keyFields, aggregations);
  }

  // Vectorized mathematical operations
  static fastMath(operation, values) {
    if (!nativeModule) {
      return ModashNative.fallbackMath(operation, values);
    }

    return nativeModule.fastMath(operation, values);
  }
}
```

**Benefits:**

- Near-native performance for compute-intensive operations
- SIMD vectorization for mathematical operations
- Optimized memory layout and access patterns
- Reduced garbage collection pressure

### 3. Streaming Data Processing

**Implementation Strategy:**

```javascript
import { Readable, Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';

class ModashStream {
  // Transform stream for aggregation pipelines
  static createAggregationStream(pipelineStages, options = {}) {
    const { batchSize = 1000, highWaterMark = 16 } = options;
    let buffer = [];
    let stageIndex = 0;

    return new Transform({
      objectMode: true,
      highWaterMark,

      transform(chunk, encoding, callback) {
        buffer.push(chunk);

        if (buffer.length >= batchSize) {
          this.processBatch(buffer, pipelineStages, callback);
          buffer = [];
        } else {
          callback();
        }
      },

      flush(callback) {
        if (buffer.length > 0) {
          this.processBatch(buffer, pipelineStages, callback);
        } else {
          callback();
        }
      },

      processBatch(batch, stages, callback) {
        try {
          const result = Modash.aggregate(batch, stages);
          result.forEach(doc => this.push(doc));
          callback();
        } catch (error) {
          callback(error);
        }
      },
    });
  }

  // Streaming join operations
  static createLookupStream(foreignCollection, joinConfig) {
    // Build index for foreign collection
    const index = new Map();

    for (const doc of foreignCollection) {
      const key = doc[joinConfig.foreignField];
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key).push(doc);
    }

    return new Transform({
      objectMode: true,

      transform(chunk, encoding, callback) {
        const localValue = chunk[joinConfig.localField];
        const matches = index.get(localValue) || [];

        const result = {
          ...chunk,
          [joinConfig.as]: matches,
        };

        callback(null, result);
      },
    });
  }
}

// Usage example
async function processLargeDataset(inputStream, outputStream, pipeline) {
  await pipeline(
    inputStream,
    ModashStream.createAggregationStream(pipeline, { batchSize: 5000 }),
    outputStream
  );
}
```

**Benefits:**

- Memory-efficient processing of large datasets
- Backpressure handling for flow control
- Composable with other Node.js streams
- Real-time processing capabilities

### 4. Memory-Mapped Files for Large Datasets

**Implementation Strategy:**

```javascript
import { createRequire } from 'module';
import fs from 'fs/promises';
const require = createRequire(import.meta.url);

class ModashMappedFile {
  constructor(filePath) {
    this.filePath = filePath;
    this.mapping = null;
    this.schema = null;
    this.recordCount = 0;
  }

  async initialize(schema) {
    this.schema = schema;

    // Memory map the file for zero-copy access
    const stats = await fs.stat(this.filePath);
    const fd = await fs.open(this.filePath, 'r');

    // Use mmap for direct memory access (requires native addon)
    try {
      const mmap = require('mmap-io');
      this.mapping = mmap.map(
        fd.fd,
        0,
        stats.size,
        mmap.PROT_READ,
        mmap.MAP_SHARED
      );
      this.recordCount = this.calculateRecordCount(stats.size, schema);
    } catch (error) {
      console.warn('Memory mapping not available, using regular file I/O');
      await fd.close();
      return false;
    }

    return true;
  }

  // Zero-copy iteration over records
  *iterateRecords() {
    if (!this.mapping) {
      throw new Error('File not memory mapped');
    }

    const recordSize = this.schema.recordSize;

    for (let offset = 0; offset < this.mapping.length; offset += recordSize) {
      yield this.deserializeRecord(offset);
    }
  }

  // Efficient filtering using memory-mapped data
  filter(predicate, limit = Infinity) {
    const results = [];
    let count = 0;

    for (const record of this.iterateRecords()) {
      if (count >= limit) break;

      if (predicate(record)) {
        results.push(record);
        count++;
      }
    }

    return results;
  }
}
```

**Benefits:**

- Zero-copy file access
- Operating system-level caching
- Efficient random access patterns
- Reduced memory usage for large files

### 5. Cluster Mode for Horizontal Scaling

**Implementation Strategy:**

```javascript
import cluster from 'cluster';
import { cpus } from 'os';

class ModashCluster {
  constructor() {
    this.workers = new Map();
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async initialize(workerCount = cpus().length) {
    if (cluster.isPrimary) {
      console.log(`Starting Modash cluster with ${workerCount} workers`);

      for (let i = 0; i < workerCount; i++) {
        this.createWorker();
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        this.createWorker(); // Replace dead worker
      });

      return this.createMasterInterface();
    } else {
      // Worker process
      return this.createWorkerInterface();
    }
  }

  createWorker() {
    const worker = cluster.fork();

    worker.on('message', message => {
      this.handleWorkerResponse(message);
    });

    this.workers.set(worker.id, {
      worker,
      busy: false,
      requests: 0,
    });

    return worker;
  }

  // Master process interface
  createMasterInterface() {
    return {
      aggregate: (collection, pipeline) => {
        return this.distributeWork('aggregate', { collection, pipeline });
      },

      bulkAggregate: jobs => {
        return Promise.all(
          jobs.map(job => this.distributeWork('aggregate', job))
        );
      },
    };
  }

  distributeWork(type, data) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;

      this.pendingRequests.set(requestId, { resolve, reject });

      // Find least busy worker
      const worker = this.selectWorker();

      worker.worker.send({
        type,
        requestId,
        data,
      });

      worker.busy = true;
      worker.requests++;
    });
  }

  selectWorker() {
    // Round-robin with load balancing
    let leastBusy = null;
    let minRequests = Infinity;

    for (const workerInfo of this.workers.values()) {
      if (!workerInfo.busy) {
        return workerInfo;
      }

      if (workerInfo.requests < minRequests) {
        minRequests = workerInfo.requests;
        leastBusy = workerInfo;
      }
    }

    return leastBusy;
  }
}
```

**Benefits:**

- Horizontal scaling across CPU cores
- Fault tolerance with automatic worker replacement
- Load balancing for optimal resource utilization
- Simplified deployment and monitoring

### 6. V8 Engine Optimizations

**Implementation Strategy:**

```javascript
class ModashV8Optimizations {
  // Optimize object shapes for V8's hidden classes
  static createOptimizedDocument(data) {
    // Always initialize properties in the same order
    const doc = {
      _id: null,
      category: null,
      price: null,
      quantity: null,
      date: null,
      active: null,
    };

    // Set actual values
    Object.assign(doc, data);
    return doc;
  }

  // Use typed arrays for numeric operations
  static createTypedCollection(collection, numericFields) {
    const length = collection.length;
    const typedData = {};

    for (const field of numericFields) {
      typedData[field] = new Float64Array(length);

      for (let i = 0; i < length; i++) {
        typedData[field][i] = collection[i][field] || 0;
      }
    }

    return typedData;
  }

  // Optimize hot paths for V8 optimization
  static optimizeForV8(fn) {
    // Force V8 to optimize the function
    for (let i = 0; i < 1000; i++) {
      fn({
        _id: i,
        category: 'test',
        price: 100,
        quantity: 1,
        active: true,
      });
    }
  }

  // Memory-efficient string interning
  static createStringInterner() {
    const internMap = new Map();

    return function intern(str) {
      if (internMap.has(str)) {
        return internMap.get(str);
      }

      internMap.set(str, str);
      return str;
    };
  }
}
```

**Benefits:**

- Optimized V8 hidden class usage
- Reduced garbage collection pressure
- Better JIT compilation
- Efficient string handling

## Node.js-Specific APIs Integration

### 1. Process Performance Hooks

```javascript
import { PerformanceObserver, performance } from 'perf_hooks';

class ModashNodeMetrics {
  constructor() {
    this.observer = new PerformanceObserver(list => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.name.startsWith('modash-')) {
          this.recordMetric(entry);
        }
      });
    });

    this.observer.observe({ entryTypes: ['measure', 'function'] });
  }

  measureOperation(name, fn) {
    const marker = `modash-${name}`;
    performance.mark(`${marker}-start`);

    const result = fn();

    performance.mark(`${marker}-end`);
    performance.measure(marker, `${marker}-start`, `${marker}-end`);

    return result;
  }
}
```

### 2. AsyncLocalStorage for Context Tracking

```javascript
import { AsyncLocalStorage } from 'async_hooks';

const modashContext = new AsyncLocalStorage();

class ModashContextManager {
  static run(context, fn) {
    return modashContext.run(context, fn);
  }

  static getContext() {
    return modashContext.getStore();
  }

  static trackAggregation(pipeline, collection) {
    const context = {
      operationId: crypto.randomUUID(),
      pipeline,
      collectionSize: collection.length,
      startTime: process.hrtime.bigint(),
    };

    return ModashContextManager.run(context, () => {
      return Modash.aggregate(collection, pipeline);
    });
  }
}
```

### 3. Diagnostic Report Integration

```javascript
import { writeHeapSnapshot, getHeapSnapshot } from 'v8';

class ModashDiagnostics {
  static async capturePerformanceSnapshot() {
    const filename = `modash-heap-${Date.now()}.heapsnapshot`;
    writeHeapSnapshot(filename);

    return {
      filename,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: Date.now(),
    };
  }

  static monitorMemoryLeaks() {
    let baseline = null;

    return setInterval(() => {
      const current = process.memoryUsage();

      if (baseline) {
        const growth = current.heapUsed - baseline.heapUsed;

        if (growth > 50 * 1024 * 1024) {
          // 50MB growth
          console.warn('Potential memory leak detected:', {
            growth: `${Math.round(growth / 1024 / 1024)}MB`,
            current: `${Math.round(current.heapUsed / 1024 / 1024)}MB`,
          });
        }
      }

      baseline = current;
    }, 30000); // Check every 30 seconds
  }
}
```

## Caching Strategies

### 1. LRU Cache with TTL

```javascript
import { LRUCache } from 'lru-cache';

class ModashCache {
  constructor(options = {}) {
    this.cache = new LRUCache({
      max: options.maxItems || 1000,
      ttl: options.ttl || 1000 * 60 * 60, // 1 hour
      updateAgeOnGet: true,
      allowStale: false,
    });
  }

  generateKey(collection, pipeline) {
    // Generate deterministic key based on collection hash and pipeline
    const collectionHash = this.hashCollection(collection);
    const pipelineHash = JSON.stringify(pipeline);
    return `${collectionHash}:${pipelineHash}`;
  }

  get(collection, pipeline) {
    const key = this.generateKey(collection, pipeline);
    return this.cache.get(key);
  }

  set(collection, pipeline, result) {
    const key = this.generateKey(collection, pipeline);
    this.cache.set(key, result);
  }
}
```

### 2. Redis Integration for Distributed Caching

```javascript
import Redis from 'ioredis';

class ModashRedisCache {
  constructor(redisUrl) {
    this.redis = new Redis(redisUrl);
    this.keyPrefix = 'modash:';
    this.defaultTTL = 3600; // 1 hour
  }

  async getCachedResult(collection, pipeline) {
    const key = this.generateCacheKey(collection, pipeline);
    const cached = await this.redis.get(key);

    return cached ? JSON.parse(cached) : null;
  }

  async setCachedResult(collection, pipeline, result) {
    const key = this.generateCacheKey(collection, pipeline);
    await this.redis.setex(key, this.defaultTTL, JSON.stringify(result));
  }

  async invalidatePattern(pattern) {
    const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

## Performance Metrics & Monitoring

### Key Performance Indicators

1. **Throughput**: Operations per second
2. **Latency**: P50, P95, P99 response times
3. **Memory Usage**: Heap usage and GC frequency
4. **CPU Utilization**: Per-core usage across workers
5. **Cache Performance**: Hit/miss ratios and effectiveness

### Monitoring Implementation

```javascript
class ModashNodeMonitoring {
  constructor() {
    this.metrics = {
      operations: 0,
      totalLatency: 0,
      errorCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    // Export metrics for Prometheus
    this.setupPrometheusMetrics();
  }

  recordOperation(latency, cacheHit = false) {
    this.metrics.operations++;
    this.metrics.totalLatency += latency;

    if (cacheHit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      avgLatency: this.metrics.totalLatency / this.metrics.operations,
      cacheHitRate:
        this.metrics.cacheHits /
        (this.metrics.cacheHits + this.metrics.cacheMisses),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }
}
```

## Expected Performance Improvements

| Operation             | Current (10k docs) | Target | Improvement    |
| --------------------- | ------------------ | ------ | -------------- |
| Simple Filter         | 1.38ms             | 0.1ms  | 14x faster     |
| Group & Aggregate     | 18.29ms            | 2ms    | 9x faster      |
| Complex Pipeline      | 66.27ms            | 5ms    | 13x faster     |
| Streaming (per batch) | N/A                | 0.5ms  | New capability |
