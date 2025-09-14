/**
 * Robin Hood Hash Table Implementation for High-Performance $group Operations
 * 
 * Provides O(1) amortized lookup with excellent cache performance
 * and stable performance under hash collisions using Robin Hood hashing.
 */

export interface RobinHoodEntry<K, V> {
  key: K;
  value: V;
  hash: number;
  distance: number; // Robin Hood distance from ideal position
}

/**
 * Robin Hood Hash Table with open addressing and backward shift deletion
 */
export class RobinHoodHashTable<K = string, V = any> {
  private static readonly LOAD_FACTOR = 0.75;
  private static readonly INITIAL_CAPACITY = 16;
  
  private buckets: Array<RobinHoodEntry<K, V> | null>;
  private capacity: number;
  private size: number = 0;
  
  constructor(initialCapacity: number = RobinHoodHashTable.INITIAL_CAPACITY) {
    this.capacity = this.nextPowerOf2(initialCapacity);
    this.buckets = new Array(this.capacity).fill(null);
  }

  /**
   * Fast hash function for strings and objects
   */
  private hash(key: K): number {
    if (typeof key === 'string') {
      return this.hashString(key);
    }
    
    // For objects, use JSON.stringify (can be optimized later with dedicated object hash)
    const str = typeof key === 'object' ? JSON.stringify(key) : String(key);
    return this.hashString(str);
  }

  /**
   * FNV-1a hash for strings - fast and good distribution
   */
  private hashString(str: string): number {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }
    return hash >>> 0; // Ensure unsigned 32-bit integer
  }

  /**
   * Get next power of 2 for capacity
   */
  private nextPowerOf2(n: number): number {
    if (n <= 0) return 1;
    let power = 1;
    while (power < n) {
      power <<= 1;
    }
    return power;
  }

  /**
   * Get ideal position for hash
   */
  private idealPos(hash: number): number {
    return hash & (this.capacity - 1);
  }

  /**
   * Get or create entry for key
   */
  get(key: K): V | undefined {
    const hash = this.hash(key);
    let pos = this.idealPos(hash);
    let distance = 0;

    while (true) {
      const entry = this.buckets[pos];
      
      if (!entry) {
        return undefined; // Key not found
      }

      if (entry.hash === hash && this.keysEqual(entry.key, key)) {
        return entry.value;
      }

      // Robin Hood: if we've traveled farther than the entry, key doesn't exist
      if (distance > entry.distance) {
        return undefined;
      }

      pos = (pos + 1) & (this.capacity - 1);
      distance++;
    }
  }

  /**
   * Set value for key, using Robin Hood insertion
   */
  set(key: K, value: V): void {
    if (this.size >= this.capacity * RobinHoodHashTable.LOAD_FACTOR) {
      this.resize();
    }

    const hash = this.hash(key);
    let pos = this.idealPos(hash);
    let distance = 0;
    let entry: RobinHoodEntry<K, V> = { key, value, hash, distance };

    while (true) {
      const existing = this.buckets[pos];
      
      if (!existing) {
        // Empty slot found
        this.buckets[pos] = entry;
        this.size++;
        return;
      }

      if (existing.hash === hash && this.keysEqual(existing.key, key)) {
        // Update existing key
        existing.value = value;
        return;
      }

      // Robin Hood: if our entry has traveled farther, displace the existing entry
      if (entry.distance > existing.distance) {
        this.buckets[pos] = entry;
        entry = existing;
        entry.distance = distance;
      }

      pos = (pos + 1) & (this.capacity - 1);
      distance++;
      entry.distance = distance;
    }
  }

  /**
   * Check if two keys are equal
   */
  private keysEqual(a: K, b: K): boolean {
    if (a === b) return true;
    
    // For objects, deep comparison via JSON (can be optimized)
    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    
    return false;
  }

  /**
   * Resize hash table to double capacity
   */
  private resize(): void {
    const oldBuckets = this.buckets;
    const oldCapacity = this.capacity;
    
    this.capacity *= 2;
    this.buckets = new Array(this.capacity).fill(null);
    this.size = 0;

    // Re-insert all entries
    for (let i = 0; i < oldCapacity; i++) {
      const entry = oldBuckets[i];
      if (entry) {
        this.set(entry.key, entry.value);
      }
    }
  }

  /**
   * Get all entries for iteration
   */
  entries(): Array<[K, V]> {
    const result: Array<[K, V]> = [];
    
    for (let i = 0; i < this.capacity; i++) {
      const entry = this.buckets[i];
      if (entry) {
        result.push([entry.key, entry.value]);
      }
    }
    
    return result;
  }

  /**
   * Get all values
   */
  values(): V[] {
    const result: V[] = [];
    
    for (let i = 0; i < this.capacity; i++) {
      const entry = this.buckets[i];
      if (entry) {
        result.push(entry.value);
      }
    }
    
    return result;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.buckets.fill(null);
    this.size = 0;
  }

  /**
   * Get current size
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Get load factor
   */
  getLoadFactor(): number {
    return this.size / this.capacity;
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    size: number;
    capacity: number;
    loadFactor: number;
    avgDistance: number;
    maxDistance: number;
  } {
    let totalDistance = 0;
    let maxDistance = 0;
    let entryCount = 0;

    for (let i = 0; i < this.capacity; i++) {
      const entry = this.buckets[i];
      if (entry) {
        totalDistance += entry.distance;
        maxDistance = Math.max(maxDistance, entry.distance);
        entryCount++;
      }
    }

    return {
      size: this.size,
      capacity: this.capacity,
      loadFactor: this.getLoadFactor(),
      avgDistance: entryCount > 0 ? totalDistance / entryCount : 0,
      maxDistance
    };
  }
}