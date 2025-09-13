/**
 * Object Pooling System for modash.js
 * Reduces garbage collection pressure by reusing objects
 */

import type { Document } from './expressions.js';

interface PoolStats {
  created: number;
  reused: number;
  active: number;
  peak: number;
}

interface ObjectPool<T> {
  acquire(): T;
  release(obj: T): void;
  clear(): void;
  stats(): PoolStats;
}

/**
 * Generic object pool implementation
 */
class GenericObjectPool<T> implements ObjectPool<T> {
  private pool: T[] = [];
  private inUse = new Set<T>();
  private factory: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;
  private stats: PoolStats = {
    created: 0,
    reused: 0,
    active: 0,
    peak: 0
  };

  constructor(
    factory: () => T,
    resetFn: (obj: T) => void,
    initialSize = 10,
    maxSize = 1000
  ) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxSize = maxSize;

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
      this.stats.created++;
    }
  }

  acquire(): T {
    let obj = this.pool.pop();
    
    if (!obj) {
      obj = this.factory();
      this.stats.created++;
    } else {
      this.stats.reused++;
    }

    this.inUse.add(obj);
    this.stats.active = this.inUse.size;
    this.stats.peak = Math.max(this.stats.peak, this.stats.active);

    return obj;
  }

  release(obj: T): void {
    if (this.inUse.has(obj)) {
      this.resetFn(obj);
      this.inUse.delete(obj);
      this.stats.active = this.inUse.size;

      // Only return to pool if under max size
      if (this.pool.length < this.maxSize) {
        this.pool.push(obj);
      }
    }
  }

  clear(): void {
    this.pool.length = 0;
    this.inUse.clear();
    this.stats = {
      created: 0,
      reused: 0,
      active: 0,
      peak: 0
    };
  }

  stats(): PoolStats {
    return { ...this.stats };
  }
}

/**
 * Document object pool for modash operations
 */
export class DocumentPool {
  private documentPool: ObjectPool<Document>;
  private arrayPool: ObjectPool<any[]>;
  private mapPool: ObjectPool<Map<any, any>>;
  private setPool: ObjectPool<Set<any>>;

  constructor() {
    // Document pool
    this.documentPool = new GenericObjectPool(
      () => ({}),
      (obj: Document) => {
        // Clear all properties
        for (const key in obj) {
          delete obj[key];
        }
      },
      50,
      500
    );

    // Array pool  
    this.arrayPool = new GenericObjectPool(
      () => [],
      (arr: any[]) => {
        arr.length = 0;
      },
      20,
      200
    );

    // Map pool
    this.mapPool = new GenericObjectPool(
      () => new Map(),
      (map: Map<any, any>) => {
        map.clear();
      },
      10,
      100
    );

    // Set pool
    this.setPool = new GenericObjectPool(
      () => new Set(),
      (set: Set<any>) => {
        set.clear();
      },
      10,
      100
    );
  }

  /**
   * Get a clean document object
   */
  acquireDocument(): Document {
    return this.documentPool.acquire();
  }

  /**
   * Return a document object to the pool
   */
  releaseDocument(doc: Document): void {
    this.documentPool.release(doc);
  }

  /**
   * Get a clean array
   */
  acquireArray<T = any>(): T[] {
    return this.arrayPool.acquire() as T[];
  }

  /**
   * Return an array to the pool
   */
  releaseArray(arr: any[]): void {
    this.arrayPool.release(arr);
  }

  /**
   * Get a clean Map
   */
  acquireMap<K = any, V = any>(): Map<K, V> {
    return this.mapPool.acquire() as Map<K, V>;
  }

  /**
   * Return a Map to the pool
   */
  releaseMap(map: Map<any, any>): void {
    this.mapPool.release(map);
  }

  /**
   * Get a clean Set
   */
  acquireSet<T = any>(): Set<T> {
    return this.setPool.acquire() as Set<T>;
  }

  /**
   * Return a Set to the pool
   */
  releaseSet(set: Set<any>): void {
    this.setPool.release(set);
  }

  /**
   * Get comprehensive pool statistics
   */
  getStats(): {
    documents: PoolStats;
    arrays: PoolStats;
    maps: PoolStats;
    sets: PoolStats;
    totalCreated: number;
    totalReused: number;
    totalActive: number;
  } {
    const docStats = this.documentPool.stats();
    const arrayStats = this.arrayPool.stats();
    const mapStats = this.mapPool.stats();
    const setStats = this.setPool.stats();

    return {
      documents: docStats,
      arrays: arrayStats,
      maps: mapStats,
      sets: setStats,
      totalCreated: docStats.created + arrayStats.created + mapStats.created + setStats.created,
      totalReused: docStats.reused + arrayStats.reused + mapStats.reused + setStats.reused,
      totalActive: docStats.active + arrayStats.active + mapStats.active + setStats.active
    };
  }

  /**
   * Clear all pools
   */
  clear(): void {
    this.documentPool.clear();
    this.arrayPool.clear();
    this.mapPool.clear();
    this.setPool.clear();
  }
}

/**
 * Global document pool instance
 */
export const globalDocumentPool = new DocumentPool();

/**
 * Auto-management utilities for pools
 */
export class PooledOperation<T> {
  private pool: DocumentPool;
  private acquiredObjects: Array<{
    type: 'document' | 'array' | 'map' | 'set';
    object: any;
  }> = [];

  constructor(pool: DocumentPool = globalDocumentPool) {
    this.pool = pool;
  }

  /**
   * Acquire objects with automatic cleanup
   */
  withDocument<R>(fn: (doc: Document) => R): R {
    const doc = this.pool.acquireDocument();
    this.acquiredObjects.push({ type: 'document', object: doc });
    
    try {
      return fn(doc);
    } finally {
      // Cleanup happens in dispose()
    }
  }

  withArray<T, R>(fn: (arr: T[]) => R): R {
    const arr = this.pool.acquireArray<T>();
    this.acquiredObjects.push({ type: 'array', object: arr });
    
    try {
      return fn(arr);
    } finally {
      // Cleanup happens in dispose()
    }
  }

  withMap<K, V, R>(fn: (map: Map<K, V>) => R): R {
    const map = this.pool.acquireMap<K, V>();
    this.acquiredObjects.push({ type: 'map', object: map });
    
    try {
      return fn(map);
    } finally {
      // Cleanup happens in dispose()
    }
  }

  withSet<T, R>(fn: (set: Set<T>) => R): R {
    const set = this.pool.acquireSet<T>();
    this.acquiredObjects.push({ type: 'set', object: set });
    
    try {
      return fn(set);
    } finally {
      // Cleanup happens in dispose()
    }
  }

  /**
   * Clean up all acquired objects
   */
  dispose(): void {
    for (const { type, object } of this.acquiredObjects) {
      switch (type) {
        case 'document':
          this.pool.releaseDocument(object);
          break;
        case 'array':
          this.pool.releaseArray(object);
          break;
        case 'map':
          this.pool.releaseMap(object);
          break;
        case 'set':
          this.pool.releaseSet(object);
          break;
      }
    }
    this.acquiredObjects.length = 0;
  }
}

/**
 * RAII-style pooled operation helper
 */
export async function withPooledOperation<T>(
  fn: (pooled: PooledOperation<any>) => T | Promise<T>
): Promise<T> {
  const pooled = new PooledOperation();
  try {
    return await fn(pooled);
  } finally {
    pooled.dispose();
  }
}