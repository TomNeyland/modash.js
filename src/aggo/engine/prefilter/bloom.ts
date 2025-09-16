/**
 * Phase 10: Bloom Filter for Join Build Side
 * 
 * High-performance Bloom filters for:
 * - Join build side filtering with tunable false positive rate
 * - Probe-side check to skip expensive hash lookups
 * - Multiple hash functions for optimal distribution
 * - Memory-efficient bit array implementation
 */

export interface BloomFilterConfig {
  expectedElements: number;
  falsePositiveRate: number;
  hashFunctions?: number;
  bitArraySize?: number;
}

export interface BloomFilterStats {
  elementsAdded: number;
  lookups: number;
  possibleMatches: number;
  definiteRejects: number;
  falsePositiveRate: number;
  memoryUsage: number;
}

/**
 * High-performance Bloom filter implementation
 */
export class BloomFilter {
  private bitArray: Uint32Array;
  private bitCount: number;
  private hashFunctions: number;
  private expectedElements: number;
  private targetFPR: number;
  
  private stats: BloomFilterStats = {
    elementsAdded: 0,
    lookups: 0,
    possibleMatches: 0,
    definiteRejects: 0,
    falsePositiveRate: 0,
    memoryUsage: 0
  };
  
  constructor(config: BloomFilterConfig) {
    this.expectedElements = config.expectedElements;
    this.targetFPR = config.falsePositiveRate;
    
    // Calculate optimal parameters if not provided
    if (config.bitArraySize && config.hashFunctions) {
      this.bitCount = config.bitArraySize;
      this.hashFunctions = config.hashFunctions;
    } else {
      const optimal = this.calculateOptimalParameters(
        config.expectedElements,
        config.falsePositiveRate
      );
      this.bitCount = optimal.bitCount;
      this.hashFunctions = optimal.hashFunctions;
    }
    
    // Allocate bit array (using 32-bit words)
    const wordCount = Math.ceil(this.bitCount / 32);
    this.bitArray = new Uint32Array(wordCount);
    this.stats.memoryUsage = wordCount * 4; // 4 bytes per word
  }
  
  /**
   * Add element to the bloom filter
   */
  add(element: any) {
    const hashes = this.hash(element);
    
    for (let i = 0; i < this.hashFunctions; i++) {
      const bitIndex = hashes[i] % this.bitCount;
      this.setBit(bitIndex);
    }
    
    this.stats.elementsAdded++;
  }
  
  /**
   * Check if element might be in the set
   * Returns false for definite rejection, true for possible match
   */
  mightContain(element: any): boolean {
    this.stats.lookups++;
    
    const hashes = this.hash(element);
    
    for (let i = 0; i < this.hashFunctions; i++) {
      const bitIndex = hashes[i] % this.bitCount;
      if (!this.getBit(bitIndex)) {
        this.stats.definiteRejects++;
        return false; // Definite rejection
      }
    }
    
    this.stats.possibleMatches++;
    return true; // Possible match (could be false positive)
  }
  
  /**
   * Add multiple elements efficiently
   */
  addBatch(elements: any[]) {
    for (const element of elements) {
      this.add(element);
    }
  }
  
  /**
   * Check multiple elements efficiently
   */
  mightContainBatch(elements: any[]): boolean[] {
    return elements.map(element => this.mightContain(element));
  }
  
  /**
   * Clear the bloom filter
   */
  clear() {
    this.bitArray.fill(0);
    this.stats.elementsAdded = 0;
    this.stats.lookups = 0;
    this.stats.possibleMatches = 0;
    this.stats.definiteRejects = 0;
  }
  
  /**
   * Get current false positive rate estimate
   */
  getCurrentFPR(): number {
    if (this.stats.elementsAdded === 0) return 0;
    
    // Estimate based on number of bits set
    const bitsSet = this.countSetBits();
    const probability = bitsSet / this.bitCount;
    return Math.pow(probability, this.hashFunctions);
  }
  
  /**
   * Get bloom filter statistics
   */
  getStats(): BloomFilterStats {
    const currentFPR = this.getCurrentFPR();
    
    return {
      ...this.stats,
      falsePositiveRate: currentFPR
    };
  }
  
  /**
   * Get configuration information
   */
  getConfig() {
    return {
      bitCount: this.bitCount,
      hashFunctions: this.hashFunctions,
      expectedElements: this.expectedElements,
      targetFPR: this.targetFPR,
      wordCount: this.bitArray.length,
      memoryUsage: this.stats.memoryUsage
    };
  }
  
  private calculateOptimalParameters(expectedElements: number, falsePositiveRate: number) {
    // Optimal bit count: m = -n * ln(p) / (ln(2)^2)
    const bitCount = Math.ceil(
      (-expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) * Math.log(2))
    );
    
    // Optimal hash functions: k = (m/n) * ln(2)
    const hashFunctions = Math.ceil((bitCount / expectedElements) * Math.log(2));
    
    return {
      bitCount: Math.max(bitCount, 64), // Minimum size
      hashFunctions: Math.max(Math.min(hashFunctions, 10), 1) // Between 1 and 10
    };
  }
  
  private hash(element: any): number[] {
    // Convert element to string for hashing
    const str = this.elementToString(element);
    
    // Use multiple hash functions based on FNV-1a variants
    const hashes: number[] = [];
    
    for (let i = 0; i < this.hashFunctions; i++) {
      hashes.push(this.fnv1aHash(str, i));
    }
    
    return hashes;
  }
  
  private elementToString(element: any): string {
    if (typeof element === 'string') return element;
    if (typeof element === 'number') return element.toString();
    if (element === null) return 'null';
    if (element === undefined) return 'undefined';
    
    try {
      return JSON.stringify(element);
    } catch {
      return element.toString();
    }
  }
  
  /**
   * FNV-1a hash with seed for multiple hash functions
   */
  private fnv1aHash(str: string, seed: number = 0): number {
    let hash = 2166136261 ^ seed; // FNV offset basis with seed
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash *= 16777619; // FNV prime
      hash = hash >>> 0; // Keep as 32-bit unsigned integer
    }
    
    return Math.abs(hash);
  }
  
  private setBit(index: number) {
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    this.bitArray[wordIndex] |= (1 << bitIndex);
  }
  
  private getBit(index: number): boolean {
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    return (this.bitArray[wordIndex] & (1 << bitIndex)) !== 0;
  }
  
  private countSetBits(): number {
    let count = 0;
    
    for (const word of this.bitArray) {
      count += this.popcount(word);
    }
    
    return count;
  }
  
  private popcount(word: number): number {
    // Brian Kernighan's algorithm
    let count = 0;
    while (word) {
      word &= word - 1;
      count++;
    }
    return count;
  }
}

/**
 * Bloom filter manager for join operations
 */
export class JoinBloomFilterManager {
  private filters = new Map<string, BloomFilter>();
  private readonly defaultConfig: BloomFilterConfig = {
    expectedElements: 10000,
    falsePositiveRate: 0.01
  };
  
  /**
   * Create bloom filter for join build side
   */
  createFilter(joinKey: string, config?: Partial<BloomFilterConfig>): BloomFilter {
    const fullConfig = { ...this.defaultConfig, ...config };
    const filter = new BloomFilter(fullConfig);
    this.filters.set(joinKey, filter);
    return filter;
  }
  
  /**
   * Get existing filter
   */
  getFilter(joinKey: string): BloomFilter | undefined {
    return this.filters.get(joinKey);
  }
  
  /**
   * Populate filter with build side data
   */
  populateFilter(joinKey: string, buildData: any[], keyExtractor: (item: any) => any) {
    const filter = this.filters.get(joinKey);
    if (!filter) {
      throw new Error(`Bloom filter not found for join key: ${joinKey}`);
    }
    
    for (const item of buildData) {
      const key = keyExtractor(item);
      filter.add(key);
    }
  }
  
  /**
   * Filter probe side data using bloom filter
   */
  filterProbeData(
    joinKey: string, 
    probeData: any[], 
    keyExtractor: (item: any) => any
  ): { filtered: any[]; rejectedCount: number } {
    const filter = this.filters.get(joinKey);
    if (!filter) {
      return { filtered: probeData, rejectedCount: 0 };
    }
    
    const filtered: any[] = [];
    let rejectedCount = 0;
    
    for (const item of probeData) {
      const key = keyExtractor(item);
      if (filter.mightContain(key)) {
        filtered.push(item);
      } else {
        rejectedCount++;
      }
    }
    
    return { filtered, rejectedCount };
  }
  
  /**
   * Get combined statistics for all filters
   */
  getCombinedStats() {
    const combined = {
      totalFilters: this.filters.size,
      totalElements: 0,
      totalLookups: 0,
      totalMemoryUsage: 0,
      avgFalsePositiveRate: 0
    };
    
    let totalFPR = 0;
    
    for (const filter of this.filters.values()) {
      const stats = filter.getStats();
      combined.totalElements += stats.elementsAdded;
      combined.totalLookups += stats.lookups;
      combined.totalMemoryUsage += stats.memoryUsage;
      totalFPR += stats.falsePositiveRate;
    }
    
    combined.avgFalsePositiveRate = this.filters.size > 0 ? totalFPR / this.filters.size : 0;
    
    return combined;
  }
  
  /**
   * Clear all filters
   */
  clear() {
    for (const filter of this.filters.values()) {
      filter.clear();
    }
    this.filters.clear();
  }
  
  /**
   * Remove specific filter
   */
  removeFilter(joinKey: string) {
    this.filters.delete(joinKey);
  }
}

/**
 * Utility functions for bloom filter operations
 */
export class BloomFilterUtils {
  /**
   * Calculate optimal bloom filter size for given parameters
   */
  static calculateOptimalSize(expectedElements: number, falsePositiveRate: number) {
    const bitCount = Math.ceil(
      (-expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) * Math.log(2))
    );
    
    const hashFunctions = Math.ceil((bitCount / expectedElements) * Math.log(2));
    
    return {
      bitCount,
      hashFunctions,
      memoryUsage: Math.ceil(bitCount / 32) * 4 // bytes
    };
  }
  
  /**
   * Estimate false positive rate for current filter state
   */
  static estimateFPR(bitsSet: number, totalBits: number, hashFunctions: number): number {
    const probability = bitsSet / totalBits;
    return Math.pow(probability, hashFunctions);
  }
  
  /**
   * Recommend bloom filter configuration for join operation
   */
  static recommendConfig(buildSideSize: number, probeRatio: number = 0.1): BloomFilterConfig {
    // Target FPR based on probe ratio - lower ratio allows higher FPR
    const targetFPR = Math.max(0.001, Math.min(0.1, probeRatio));
    
    return {
      expectedElements: buildSideSize,
      falsePositiveRate: targetFPR
    };
  }
}