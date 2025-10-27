/**
 * Phase 10: Bloom Filter Prefilter for Join Build Side
 * 
 * Space-efficient probabilistic data structure for join optimization:
 * - Tunable false positive rate (FPR)
 * - Probe-side check to skip expensive hash lookups
 * - Multiple hash functions using double hashing
 * - Memory-efficient bit array implementation
 */

/**
 * Bloom filter configuration
 */
export interface BloomFilterConfig {
  expectedItems: number;          // Expected number of items to insert
  falsePositiveRate: number;      // Desired false positive rate (0.01 = 1%)
  forceBitArraySize?: number;     // Override calculated bit array size
  forceHashCount?: number;        // Override calculated hash function count
}

/**
 * Bloom filter statistics
 */
export interface BloomFilterStats {
  bitArraySize: number;
  hashFunctionCount: number;
  insertedItems: number;
  probeCount: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  estimatedFPR: number;
  memoryUsageBytes: number;
}

/**
 * Hash result for double hashing scheme
 */
interface HashResult {
  hash1: number;
  hash2: number;
}

/**
 * Space-efficient Bloom filter implementation
 */
export class BloomFilter {
  private bitArray: Uint8Array;
  private bitArraySize: number;
  private hashFunctionCount: number;
  private insertedItems: number = 0;
  
  // Statistics
  private probeCount: number = 0;
  private truePositives: number = 0;
  private falsePositives: number = 0;
  private trueNegatives: number = 0;

  constructor(config: BloomFilterConfig) {
    this.validateConfig(config);
    
    // Calculate optimal bit array size: m = -n * ln(p) / (ln(2)^2)
    this.bitArraySize = config.forceBitArraySize ?? 
      Math.ceil(-config.expectedItems * Math.log(config.falsePositiveRate) / (Math.log(2) ** 2));
    
    // Calculate optimal hash function count: k = (m/n) * ln(2)
    this.hashFunctionCount = config.forceHashCount ?? 
      Math.ceil((this.bitArraySize / config.expectedItems) * Math.log(2));
    
    // Ensure reasonable bounds
    this.hashFunctionCount = Math.max(1, Math.min(this.hashFunctionCount, 20));
    
    // Initialize bit array (using bytes for efficiency)
    const byteArraySize = Math.ceil(this.bitArraySize / 8);
    this.bitArray = new Uint8Array(byteArraySize);
  }

  /**
   * Add item to the bloom filter
   */
  add(item: any): void {
    const itemStr = this.serializeItem(item);
    const hashes = this.computeHashes(itemStr);
    
    for (let i = 0; i < this.hashFunctionCount; i++) {
      const bitIndex = this.getHashIndex(hashes, i);
      this.setBit(bitIndex);
    }
    
    this.insertedItems++;
  }

  /**
   * Add multiple items efficiently
   */
  addBatch(items: any[]): void {
    for (const item of items) {
      this.add(item);
    }
  }

  /**
   * Test if item might be in the set (may have false positives)
   */
  mightContain(item: any): boolean {
    this.probeCount++;
    
    const itemStr = this.serializeItem(item);
    const hashes = this.computeHashes(itemStr);
    
    for (let i = 0; i < this.hashFunctionCount; i++) {
      const bitIndex = this.getHashIndex(hashes, i);
      if (!this.getBit(bitIndex)) {
        this.trueNegatives++;
        return false; // Definitely not in set
      }
    }
    
    // All bits are set - might be in set (could be false positive)
    return true;
  }

  /**
   * Test batch of items for membership
   */
  mightContainBatch(items: any[]): boolean[] {
    return items.map(item => this.mightContain(item));
  }

  /**
   * Report actual membership for statistics (call after hash table lookup)
   */
  reportActualMembership(item: any, wasActuallyPresent: boolean): void {
    const mightContain = this.mightContain(item);
    
    if (mightContain && wasActuallyPresent) {
      this.truePositives++;
    } else if (mightContain && !wasActuallyPresent) {
      this.falsePositives++;
    }
    // trueNegatives already counted in mightContain()
  }

  /**
   * Serialize item to string for hashing
   */
  private serializeItem(item: any): string {
    if (item === null || item === undefined) {
      return String(item);
    }
    
    if (typeof item === 'object') {
      // For objects, create a stable string representation
      if (Array.isArray(item)) {
        return JSON.stringify(item);
      } else {
        // Sort keys for stable serialization
        const sortedKeys = Object.keys(item).sort();
        const sortedObj = sortedKeys.reduce((acc, key) => {
          acc[key] = item[key];
          return acc;
        }, {} as any);
        return JSON.stringify(sortedObj);
      }
    }
    
    return String(item);
  }

  /**
   * Compute two hash values using simple hash functions
   */
  private computeHashes(str: string): HashResult {
    let hash1 = 0;
    let hash2 = 0;
    
    // Simple hash function 1 (FNV-1a variant)
    for (let i = 0; i < str.length; i++) {
      hash1 ^= str.charCodeAt(i);
      hash1 *= 0x01000193;
    }
    
    // Simple hash function 2 (djb2 variant)
    hash2 = 5381;
    for (let i = 0; i < str.length; i++) {
      hash2 = ((hash2 << 5) + hash2) + str.charCodeAt(i);
    }
    
    // Ensure positive values
    hash1 = Math.abs(hash1);
    hash2 = Math.abs(hash2);
    
    return { hash1, hash2 };
  }

  /**
   * Get hash index using double hashing: hash1 + i * hash2
   */
  private getHashIndex(hashes: HashResult, i: number): number {
    const combinedHash = (hashes.hash1 + i * hashes.hash2) % this.bitArraySize;
    return Math.abs(combinedHash);
  }

  /**
   * Set bit at index
   */
  private setBit(bitIndex: number): void {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    this.bitArray[byteIndex] |= (1 << bitOffset);
  }

  /**
   * Get bit at index
   */
  private getBit(bitIndex: number): boolean {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitOffset = bitIndex % 8;
    return (this.bitArray[byteIndex] & (1 << bitOffset)) !== 0;
  }

  /**
   * Calculate current false positive probability
   */
  private calculateCurrentFPR(): number {
    if (this.insertedItems === 0) return 0;
    
    // FPR = (1 - e^(-k*n/m))^k
    const k = this.hashFunctionCount;
    const n = this.insertedItems;
    const m = this.bitArraySize;
    
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(config: BloomFilterConfig): void {
    if (config.expectedItems <= 0) {
      throw new Error('Expected items must be positive');
    }
    
    if (config.falsePositiveRate <= 0 || config.falsePositiveRate >= 1) {
      throw new Error('False positive rate must be between 0 and 1');
    }
    
    if (config.forceBitArraySize && config.forceBitArraySize <= 0) {
      throw new Error('Forced bit array size must be positive');
    }
    
    if (config.forceHashCount && config.forceHashCount <= 0) {
      throw new Error('Forced hash count must be positive');
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): BloomFilterStats {
    const totalProbes = this.probeCount;
    const actualFPR = totalProbes > 0 ? 
      this.falsePositives / Math.max(1, this.falsePositives + this.trueNegatives) : 0;
    
    return {
      bitArraySize: this.bitArraySize,
      hashFunctionCount: this.hashFunctionCount,
      insertedItems: this.insertedItems,
      probeCount: this.probeCount,
      truePositives: this.truePositives,
      falsePositives: this.falsePositives,
      trueNegatives: this.trueNegatives,
      estimatedFPR: this.calculateCurrentFPR(),
      memoryUsageBytes: this.bitArray.length
    };
  }

  /**
   * Get efficiency metrics
   */
  getEfficiencyMetrics() {
    const stats = this.getStats();
    const bitsPerItem = stats.insertedItems > 0 ? stats.bitArraySize / stats.insertedItems : 0;
    const fillRatio = this.getBitsFilled() / stats.bitArraySize;
    
    return {
      bitsPerItem: bitsPerItem.toFixed(2),
      fillRatio: (fillRatio * 100).toFixed(2) + '%',
      memoryUsageMB: (stats.memoryUsageBytes / (1024 * 1024)).toFixed(2) + 'MB',
      actualFPR: stats.probeCount > 0 ? 
        (stats.falsePositives / Math.max(1, stats.falsePositives + stats.trueNegatives) * 100).toFixed(3) + '%' : '0%'
    };
  }

  /**
   * Count number of set bits (for fill ratio calculation)
   */
  private getBitsFilled(): number {
    let count = 0;
    for (let i = 0; i < this.bitArray.length; i++) {
      let byte = this.bitArray[i];
      // Brian Kernighan's algorithm for counting set bits
      while (byte) {
        count++;
        byte &= byte - 1;
      }
    }
    return count;
  }

  /**
   * Clear all bits and reset statistics
   */
  clear(): void {
    this.bitArray.fill(0);
    this.insertedItems = 0;
    this.probeCount = 0;
    this.truePositives = 0;
    this.falsePositives = 0;
    this.trueNegatives = 0;
  }

  /**
   * Create bloom filter with optimal parameters for join scenario
   */
  static forJoin(buildSideSize: number, desiredFPR: number = 0.01): BloomFilter {
    return new BloomFilter({
      expectedItems: buildSideSize,
      falsePositiveRate: desiredFPR
    });
  }

  /**
   * Create bloom filter for memory-constrained scenario
   */
  static withMemoryLimit(expectedItems: number, maxMemoryBytes: number): BloomFilter {
    const maxBits = maxMemoryBytes * 8;
    const optimalFPR = Math.pow(0.5, Math.ceil(maxBits / expectedItems * Math.log(2)));
    
    return new BloomFilter({
      expectedItems,
      falsePositiveRate: Math.max(0.001, optimalFPR), // Don't go below 0.1%
      forceBitArraySize: maxBits
    });
  }
}