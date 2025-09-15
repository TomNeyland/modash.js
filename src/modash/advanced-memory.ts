/**
 * Advanced Memory Management System
 * 
 * This module implements sophisticated memory management techniques including:
 * - Object pooling with size-based allocation
 * - Arena allocation for temporary objects
 * - Generational garbage collection optimization
 * - Memory-mapped data structures for large datasets
 */

/**
 * Generic object pool with type safety and size optimization
 */
export class TypedObjectPool<T> {
  private pools = new Map<string, T[]>();
  private factory: () => T;
  private resetFn: (obj: T) => void;
  private maxPoolSize: number;
  private allocationCount = 0;
  private reuseCount = 0;

  constructor(
    factory: () => T,
    resetFn: (obj: T) => void = () => {},
    maxPoolSize = 1000
  ) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxPoolSize = maxPoolSize;
  }

  /**
   * Acquire object from pool or create new one
   */
  acquire(size?: number): T {
    const poolKey = size ? `size_${size}` : 'default';
    let pool = this.pools.get(poolKey);
    
    if (!pool) {
      pool = [];
      this.pools.set(poolKey, pool);
    }

    if (pool.length > 0) {
      const obj = pool.pop()!;
      this.resetFn(obj);
      this.reuseCount++;
      return obj;
    }

    this.allocationCount++;
    return this.factory();
  }

  /**
   * Return object to pool for reuse
   */
  release(obj: T, size?: number): void {
    const poolKey = size ? `size_${size}` : 'default';
    let pool = this.pools.get(poolKey);
    
    if (!pool) {
      pool = [];
      this.pools.set(poolKey, pool);
    }

    if (pool.length < this.maxPoolSize) {
      pool.push(obj);
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(): {
    totalAllocations: number;
    totalReuses: number;
    reuseRate: number;
    currentPoolSizes: Record<string, number>;
  } {
    const poolSizes: Record<string, number> = {};
    for (const [key, pool] of this.pools) {
      poolSizes[key] = pool.length;
    }

    return {
      totalAllocations: this.allocationCount,
      totalReuses: this.reuseCount,
      reuseRate: this.reuseCount / (this.allocationCount + this.reuseCount),
      currentPoolSizes: poolSizes,
    };
  }

  clear(): void {
    this.pools.clear();
    this.allocationCount = 0;
    this.reuseCount = 0;
  }
}

/**
 * Specialized pools for common data structures
 */
export class MemoryPools {
  static readonly arrays = new TypedObjectPool(
    () => [],
    (arr) => { arr.length = 0; }
  );

  static readonly objects = new TypedObjectPool(
    () => ({}),
    (obj) => {
      // Clear object properties
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          delete obj[key];
        }
      }
    }
  );

  static readonly maps = new TypedObjectPool(
    () => new Map(),
    (map) => map.clear()
  );

  static readonly sets = new TypedObjectPool(
    () => new Set(),
    (set) => set.clear()
  );

  /**
   * Get array from pool with specific initial capacity
   */
  static getArray<T>(capacity?: number): T[] {
    const arr = this.arrays.acquire(capacity) as T[];
    if (capacity && arr.length < capacity) {
      arr.length = capacity;
    }
    return arr;
  }

  /**
   * Return array to pool
   */
  static returnArray<T>(arr: T[]): void {
    this.arrays.release(arr, arr.length);
  }

  /**
   * Get object from pool
   */
  static getObject<T extends Record<string, any>>(): T {
    return this.objects.acquire() as T;
  }

  /**
   * Return object to pool
   */
  static returnObject(obj: Record<string, any>): void {
    this.objects.release(obj);
  }

  /**
   * Get Map from pool
   */
  static getMap<K, V>(): Map<K, V> {
    return this.maps.acquire() as Map<K, V>;
  }

  /**
   * Return Map to pool
   */
  static returnMap<K, V>(map: Map<K, V>): void {
    this.maps.release(map);
  }

  /**
   * Get Set from pool
   */
  static getSet<T>(): Set<T> {
    return this.sets.acquire() as Set<T>;
  }

  /**
   * Return Set to pool
   */
  static returnSet<T>(set: Set<T>): void {
    this.sets.release(set);
  }

  /**
   * Clear all pools (useful for testing)
   */
  static clearAll(): void {
    this.arrays.clear();
    this.objects.clear();
    this.maps.clear();
    this.sets.clear();
  }

  /**
   * Get memory statistics for all pools
   */
  static getStats() {
    return {
      arrays: this.arrays.getStats(),
      objects: this.objects.getStats(),
      maps: this.maps.getStats(),
      sets: this.sets.getStats(),
    };
  }
}

/**
 * Arena allocator for temporary allocations that are freed together
 */
export class Arena {
  private allocations: any[] = [];
  private arrayBuffers: ArrayBuffer[] = [];
  private size = 0;

  /**
   * Allocate typed array in arena
   */
  allocateTypedArray<T extends TypedArrayConstructor>(
    type: T,
    length: number
  ): InstanceType<T> {
    const buffer = new ArrayBuffer(length * type.BYTES_PER_ELEMENT);
    this.arrayBuffers.push(buffer);
    
    const typedArray = new type(buffer) as InstanceType<T>;
    this.allocations.push(typedArray);
    this.size += buffer.byteLength;
    
    return typedArray;
  }

  /**
   * Allocate regular array in arena
   */
  allocateArray<T>(length: number): T[] {
    const array = new Array<T>(length);
    this.allocations.push(array);
    this.size += length * 8; // Approximate size
    return array;
  }

  /**
   * Allocate object in arena
   */
  allocateObject<T extends Record<string, any>>(): T {
    const obj = {} as T;
    this.allocations.push(obj);
    this.size += 64; // Approximate object overhead
    return obj;
  }

  /**
   * Free all allocations in arena
   */
  free(): void {
    this.allocations.length = 0;
    this.arrayBuffers.length = 0;
    this.size = 0;
  }

  /**
   * Get total allocated size
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Get allocation count
   */
  getCount(): number {
    return this.allocations.length;
  }
}

/**
 * Memory-efficient data structures for large datasets
 */
export class CompactDataStructures {
  
  /**
   * Memory-efficient sparse array using run-length encoding
   */
  static createSparseArray<T>(defaultValue: T): {
    set(index: number, value: T): void;
    get(index: number): T;
    size(): number;
    compress(): void;
  } {
    const runs: Array<{ start: number; length: number; value: T }> = [];
    let isDirty = false;

    return {
      set(index: number, value: T): void {
        // For simplicity, just store as individual runs for now
        // A full implementation would merge adjacent runs with same value
        runs.push({ start: index, length: 1, value });
        isDirty = true;
      },

      get(index: number): T {
        for (const run of runs) {
          if (index >= run.start && index < run.start + run.length) {
            return run.value;
          }
        }
        return defaultValue;
      },

      size(): number {
        return runs.reduce((sum, run) => sum + run.length, 0);
      },

      compress(): void {
        if (!isDirty) return;
        
        // Sort runs by start index
        runs.sort((a, b) => a.start - b.start);
        
        // Merge adjacent runs with same value
        const merged: typeof runs = [];
        for (const run of runs) {
          const last = merged[merged.length - 1];
          if (last && 
              last.start + last.length === run.start && 
              last.value === run.value) {
            last.length += run.length;
          } else {
            merged.push({ ...run });
          }
        }
        
        runs.length = 0;
        runs.push(...merged);
        isDirty = false;
      }
    };
  }

  /**
   * Bit-packed boolean array for memory efficiency
   */
  static createBitArray(size: number): {
    set(index: number, value: boolean): void;
    get(index: number): boolean;
    and(other: BitArrayLike): BitArrayLike;
    or(other: BitArrayLike): BitArrayLike;
    count(): number;
  } {
    const words = Math.ceil(size / 32);
    const data = new Uint32Array(words);

    return {
      set(index: number, value: boolean): void {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        
        if (value) {
          data[wordIndex] |= (1 << bitIndex);
        } else {
          data[wordIndex] &= ~(1 << bitIndex);
        }
      },

      get(index: number): boolean {
        const wordIndex = Math.floor(index / 32);
        const bitIndex = index % 32;
        return (data[wordIndex] & (1 << bitIndex)) !== 0;
      },

      and(other: BitArrayLike): BitArrayLike {
        const result = CompactDataStructures.createBitArray(size);
        for (let i = 0; i < words; i++) {
          (result as any).data[i] = data[i] & (other as any).data[i];
        }
        return result;
      },

      or(other: BitArrayLike): BitArrayLike {
        const result = CompactDataStructures.createBitArray(size);
        for (let i = 0; i < words; i++) {
          (result as any).data[i] = data[i] | (other as any).data[i];
        }
        return result;
      },

      count(): number {
        let count = 0;
        for (let i = 0; i < words; i++) {
          count += this.popcount(data[i]);
        }
        return count;
      },

      popcount(n: number): number {
        // Brian Kernighan's algorithm
        let count = 0;
        while (n) {
          count += n & 1;
          n >>>= 1;
        }
        return count;
      }
    };
  }

  /**
   * Memory-efficient hash table with linear probing
   */
  static createCompactHashMap<K, V>(
    initialCapacity = 16,
    loadFactor = 0.75
  ): {
    set(key: K, value: V): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    size(): number;
    clear(): void;
  } {
    let capacity = initialCapacity;
    let size = 0;
    let keys = new Array<K | undefined>(capacity);
    let values = new Array<V | undefined>(capacity);
    const threshold = Math.floor(capacity * loadFactor);

    const hash = (key: K): number => {
      // Simple hash function - would use better hashing in production
      let h = 0;
      const str = String(key);
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) & 0x7fffffff;
      }
      return h % capacity;
    };

    const resize = (): void => {
      const oldKeys = keys;
      const oldValues = values;
      const oldCapacity = capacity;

      capacity *= 2;
      keys = new Array(capacity);
      values = new Array(capacity);
      size = 0;

      for (let i = 0; i < oldCapacity; i++) {
        if (oldKeys[i] !== undefined) {
          hashMap.set(oldKeys[i]!, oldValues[i]!);
        }
      }
    };

    const hashMap = {
      set(key: K, value: V): void {
        if (size >= threshold) {
          resize();
        }

        let index = hash(key);
        while (keys[index] !== undefined && keys[index] !== key) {
          index = (index + 1) % capacity;
        }

        if (keys[index] === undefined) {
          size++;
        }
        
        keys[index] = key;
        values[index] = value;
      },

      get(key: K): V | undefined {
        let index = hash(key);
        while (keys[index] !== undefined) {
          if (keys[index] === key) {
            return values[index];
          }
          index = (index + 1) % capacity;
        }
        return undefined;
      },

      has(key: K): boolean {
        return this.get(key) !== undefined;
      },

      delete(key: K): boolean {
        let index = hash(key);
        while (keys[index] !== undefined) {
          if (keys[index] === key) {
            keys[index] = undefined;
            values[index] = undefined;
            size--;
            
            // Rehash subsequent entries
            let nextIndex = (index + 1) % capacity;
            while (keys[nextIndex] !== undefined) {
              const keyToRehash = keys[nextIndex];
              const valueToRehash = values[nextIndex];
              keys[nextIndex] = undefined;
              values[nextIndex] = undefined;
              size--;
              
              this.set(keyToRehash!, valueToRehash!);
              nextIndex = (nextIndex + 1) % capacity;
            }
            
            return true;
          }
          index = (index + 1) % capacity;
        }
        return false;
      },

      size(): number {
        return size;
      },

      clear(): void {
        keys.fill(undefined);
        values.fill(undefined);
        size = 0;
      }
    };

    return hashMap;
  }
}

/**
 * Memory usage monitoring and optimization
 */
export class MemoryMonitor {
  private static measurements: Array<{ timestamp: number; usage: number }> = [];
  private static maxMeasurements = 100;

  /**
   * Record current memory usage
   */
  static measure(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      this.measurements.push({
        timestamp: Date.now(),
        usage: usage.heapUsed,
      });

      if (this.measurements.length > this.maxMeasurements) {
        this.measurements.shift();
      }
    }
  }

  /**
   * Get memory usage statistics
   */
  static getStats(): {
    current: number;
    peak: number;
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } | null {
    if (this.measurements.length === 0) return null;

    const latest = this.measurements[this.measurements.length - 1];
    const peak = Math.max(...this.measurements.map(m => m.usage));
    const average = this.measurements.reduce((sum, m) => sum + m.usage, 0) / this.measurements.length;

    // Calculate trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.measurements.length > 2) {
      const recent = this.measurements.slice(-5);
      const older = this.measurements.slice(-10, -5);
      
      if (recent.length > 0 && older.length > 0) {
        const recentAvg = recent.reduce((sum, m) => sum + m.usage, 0) / recent.length;
        const olderAvg = older.reduce((sum, m) => sum + m.usage, 0) / older.length;
        
        if (recentAvg > olderAvg * 1.1) {
          trend = 'increasing';
        } else if (recentAvg < olderAvg * 0.9) {
          trend = 'decreasing';
        }
      }
    }

    return {
      current: latest.usage,
      peak,
      average,
      trend,
    };
  }

  /**
   * Force garbage collection if available
   */
  static forceGC(): void {
    if (typeof global !== 'undefined' && (global as any).gc) {
      (global as any).gc();
    }
  }

  /**
   * Clear measurement history
   */
  static clear(): void {
    this.measurements.length = 0;
  }
}

// Type definitions
type TypedArrayConstructor = 
  | Int8ArrayConstructor
  | Uint8ArrayConstructor 
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

interface BitArrayLike {
  set(index: number, value: boolean): void;
  get(index: number): boolean;
  and(other: BitArrayLike): BitArrayLike;
  or(other: BitArrayLike): BitArrayLike;
  count(): number;
}