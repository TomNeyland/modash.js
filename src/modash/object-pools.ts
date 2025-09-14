/**
 * Object pools and memory management for modash.js performance optimization
 *
 * Key optimizations:
 * 1. Object pooling to reduce GC pressure
 * 2. Reusable scratch arrays for batching operations
 * 3. Arena allocation for temporary objects
 * 4. Memory-efficient data structures
 */

import { perfCounters } from '../../benchmarks/operators.js';

/**
 * Generic object pool for reducing allocations
 */
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 1000
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      perfCounters.recordCacheHit();
      return this.pool.pop()!;
    }

    perfCounters.recordCacheMiss();
    perfCounters.recordAllocation();
    return this.createFn();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
    // If pool is full, let the object be GC'd
  }

  size(): number {
    return this.pool.length;
  }

  prewarm(count: number): void {
    for (let i = 0; i < count && this.pool.length < this.maxSize; i++) {
      this.pool.push(this.createFn());
    }
  }
}

/**
 * Specialized pools for common data structures
 */

// Pool for temporary objects during projection
const tempObjectPool = new ObjectPool<Record<string, any>>(
  () => ({}),
  obj => {
    // Clear all properties
    for (const key in obj) {
      delete obj[key];
    }
  }
);

// Pool for arrays used in batching operations
const arrayPools = new Map<number, ObjectPool<any[]>>();

function getArrayPool(size: number): ObjectPool<any[]> {
  // Round up to nearest power of 2 for efficiency
  const poolSize = Math.pow(2, Math.ceil(Math.log2(size)));

  if (!arrayPools.has(poolSize)) {
    arrayPools.set(
      poolSize,
      new ObjectPool<any[]>(
        () => new Array(poolSize),
        arr => {
          arr.length = 0; // Clear array
        }
      )
    );
  }

  return arrayPools.get(poolSize)!;
}

// Pool for Set objects used in grouping operations
const setPool = new ObjectPool<Set<any>>(
  () => new Set(),
  set => set.clear()
);

// Pool for Map objects
const mapPool = new ObjectPool<Map<string, any>>(
  () => new Map(),
  map => map.clear()
);

/**
 * Reusable scratch arrays for batch processing
 */
class ScratchArrayManager {
  private arrays: Map<string, any[]> = new Map();
  private currentSizes: Map<string, number> = new Map();

  getArray(name: string, minSize: number): any[] {
    const currentSize = this.currentSizes.get(name) || 0;

    if (currentSize < minSize) {
      // Need to allocate or resize
      const newSize = Math.max(minSize, currentSize * 1.5);
      this.arrays.set(name, new Array(Math.ceil(newSize)));
      this.currentSizes.set(name, Math.ceil(newSize));
      perfCounters.recordAllocation(newSize * 8); // Rough size estimate
    }

    const array = this.arrays.get(name)!;
    array.length = minSize; // Set effective length
    return array;
  }

  releaseArray(name: string): void {
    const array = this.arrays.get(name);
    if (array) {
      array.length = 0; // Clear but keep allocated space
    }
  }

  clear(): void {
    for (const array of this.arrays.values()) {
      array.length = 0;
    }
  }
}

// Global scratch array manager
const scratchArrays = new ScratchArrayManager();

/**
 * Arena allocator for temporary objects during a single operation
 */
class Arena {
  private objects: any[] = [];
  private arrays: any[][] = [];
  private sets: Set<any>[] = [];
  private maps: Map<any, any>[] = [];

  allocateObject(): Record<string, any> {
    const obj = tempObjectPool.acquire();
    this.objects.push(obj);
    return obj;
  }

  allocateArray(size: number = 0): any[] {
    const pool = getArrayPool(Math.max(16, size));
    const arr = pool.acquire();
    arr.length = size;
    this.arrays.push(arr);
    return arr;
  }

  allocateSet(): Set<any> {
    const set = setPool.acquire();
    this.sets.push(set);
    return set;
  }

  allocateMap(): Map<any, any> {
    const map = mapPool.acquire();
    this.maps.push(map);
    return map;
  }

  clear(): void {
    // Return all objects to their pools
    for (const obj of this.objects) {
      tempObjectPool.release(obj);
    }

    for (const arr of this.arrays) {
      const size = arr.length;
      const pool = getArrayPool(size || 16);
      pool.release(arr);
    }

    for (const set of this.sets) {
      setPool.release(set);
    }

    for (const map of this.maps) {
      mapPool.release(map);
    }

    // Clear tracking arrays
    this.objects.length = 0;
    this.arrays.length = 0;
    this.sets.length = 0;
    this.maps.length = 0;
  }
}

/**
 * Delta batch processing with reusable buffers
 */
export interface DeltaBatch {
  additions: any[];
  removals: number[]; // Row IDs to remove
  size: number;
}

class DeltaBatchProcessor {
  private batchPool: ObjectPool<DeltaBatch>;
  private maxBatchSize: number;

  constructor(maxBatchSize: number = 512) {
    this.maxBatchSize = maxBatchSize;
    this.batchPool = new ObjectPool<DeltaBatch>(
      () => ({
        additions: [],
        removals: [],
        size: 0,
      }),
      batch => {
        batch.additions.length = 0;
        batch.removals.length = 0;
        batch.size = 0;
      }
    );
  }

  createBatch(): DeltaBatch {
    return this.batchPool.acquire();
  }

  releaseBatch(batch: DeltaBatch): void {
    this.batchPool.release(batch);
  }

  processInBatches<T>(items: T[], processor: (batch: T[]) => void): void {
    const batchArray = scratchArrays.getArray(
      'processBatch',
      this.maxBatchSize
    );

    for (let i = 0; i < items.length; i += this.maxBatchSize) {
      const batchSize = Math.min(this.maxBatchSize, items.length - i);

      // Fill batch array
      for (let j = 0; j < batchSize; j++) {
        batchArray[j] = items[i + j];
      }
      batchArray.length = batchSize;

      processor(batchArray);
      perfCounters.recordAdd(); // Count batch processed
    }

    scratchArrays.releaseArray('processBatch');
  }
}

/**
 * Memory-efficient string deduplication
 */
class StringDeduplicator {
  private stringCache = new Map<string, string>();
  private maxCacheSize: number;

  constructor(maxCacheSize: number = 10000) {
    this.maxCacheSize = maxCacheSize;
  }

  deduplicate(str: string): string {
    if (this.stringCache.has(str)) {
      perfCounters.recordCacheHit();
      return this.stringCache.get(str)!;
    }

    perfCounters.recordCacheMiss();

    if (this.stringCache.size >= this.maxCacheSize) {
      // Clear half the cache when full (simple LRU approximation)
      const entries = Array.from(this.stringCache.entries());
      this.stringCache.clear();

      // Keep the second half (more recently used)
      for (let i = Math.floor(entries.length / 2); i < entries.length; i++) {
        const [key, value] = entries[i]!;
        this.stringCache.set(key, value);
      }
    }

    this.stringCache.set(str, str);
    return str;
  }

  size(): number {
    return this.stringCache.size;
  }
}

// Global instances
export const globalArena = new Arena();
export const deltaBatcher = new DeltaBatchProcessor();
export const stringDedup = new StringDeduplicator();

// Exported functions for pool management
export function acquireTempObject(): Record<string, any> {
  return tempObjectPool.acquire();
}

export function releaseTempObject(obj: Record<string, any>): void {
  tempObjectPool.release(obj);
}

export function acquireTempArray(size: number = 16): any[] {
  const pool = getArrayPool(size);
  const arr = pool.acquire();
  arr.length = size;
  return arr;
}

export function releaseTempArray(arr: any[]): void {
  const size = arr.length || 16;
  const pool = getArrayPool(size);
  pool.release(arr);
}

export function acquireTempSet(): Set<any> {
  return setPool.acquire();
}

export function releaseTempSet(set: Set<any>): void {
  setPool.release(set);
}

export function acquireTempMap(): Map<string, any> {
  return mapPool.acquire();
}

export function releaseTempMap(map: Map<string, any>): void {
  mapPool.release(map);
}

export function getScratchArray(name: string, size: number): any[] {
  return scratchArrays.getArray(name, size);
}

export function releaseScratchArray(name: string): void {
  scratchArrays.releaseArray(name);
}

/**
 * Prewarm pools for better initial performance
 */
export function prewarmPools(): void {
  tempObjectPool.prewarm(100);
  setPool.prewarm(50);
  mapPool.prewarm(50);

  // Prewarm common array sizes
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    getArrayPool(size).prewarm(20);
  }
}

/**
 * Get memory usage statistics
 */
export function getPoolStats(): Record<string, any> {
  const arrayPoolStats: Record<string, number> = {};
  for (const [size, pool] of arrayPools.entries()) {
    arrayPoolStats[`array_${size}`] = pool.size();
  }

  return {
    tempObjects: tempObjectPool.size(),
    sets: setPool.size(),
    maps: mapPool.size(),
    stringCache: stringDedup.size(),
    arrayPools: arrayPoolStats,
  };
}

/**
 * Clear all pools (for testing or memory cleanup)
 */
export function clearAllPools(): void {
  globalArena.clear();
  scratchArrays.clear();
  // Note: Don't clear the main pools as they should persist across operations
}

// Initialize pools
prewarmPools();
