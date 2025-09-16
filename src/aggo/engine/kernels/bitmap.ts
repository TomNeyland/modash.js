/**
 * Phase 10: Bitmap Operations for Boolean Kernels
 * 
 * High-performance boolean operations via bitsets:
 * - Boolean AND/OR via packed bitsets
 * - Fast bulk operations on boolean vectors
 * - Optimized null mask handling
 * - Population count and bit manipulation utilities
 */

export interface BooleanVector {
  values: boolean[];
  nullMask: boolean[];
  size: number;
}

export interface PackedBitSet {
  words: Uint32Array;
  size: number;
}

export interface BitmapStats {
  operationsProcessed: number;
  bitsProcessed: number;
  nullsSkipped: number;
  packedOperations: number;
  fastPathUsed: number;
}

/**
 * High-performance bitmap operations for boolean vectors
 */
export class BitmapKernels {
  private stats: BitmapStats = {
    operationsProcessed: 0,
    bitsProcessed: 0,
    nullsSkipped: 0,
    packedOperations: 0,
    fastPathUsed: 0
  };
  
  private static readonly WORD_SIZE = 32;
  private static readonly WORD_MASK = 31; // For modulo 32
  
  /**
   * Vector AND operation using bitsets
   */
  and(vectors: BooleanVector[]): BooleanVector {
    if (vectors.length === 0) {
      return this.createEmptyBooleanVector();
    }
    
    const size = vectors[0].size;
    this.stats.operationsProcessed++;
    this.stats.bitsProcessed += size;
    
    // Check if we can use packed bitsets
    if (this.canUsePackedOperation(vectors)) {
      this.stats.packedOperations++;
      return this.andPacked(vectors);
    }
    
    return this.andScalar(vectors);
  }
  
  /**
   * Vector OR operation using bitsets
   */
  or(vectors: BooleanVector[]): BooleanVector {
    if (vectors.length === 0) {
      return this.createEmptyBooleanVector();
    }
    
    const size = vectors[0].size;
    this.stats.operationsProcessed++;
    this.stats.bitsProcessed += size;
    
    if (this.canUsePackedOperation(vectors)) {
      this.stats.packedOperations++;
      return this.orPacked(vectors);
    }
    
    return this.orScalar(vectors);
  }
  
  /**
   * Vector NOT operation
   */
  not(vector: BooleanVector): BooleanVector {
    const size = vector.size;
    this.stats.operationsProcessed++;
    this.stats.bitsProcessed += size;
    
    if (this.hasNoNulls(vector)) {
      this.stats.fastPathUsed++;
      return this.notPacked(vector);
    }
    
    return this.notScalar(vector);
  }
  
  /**
   * Vector XOR operation
   */
  xor(left: BooleanVector, right: BooleanVector): BooleanVector {
    const size = left.size;
    this.stats.operationsProcessed++;
    this.stats.bitsProcessed += size;
    
    if (this.hasNoNulls(left) && this.hasNoNulls(right)) {
      this.stats.packedOperations++;
      return this.xorPacked(left, right);
    }
    
    return this.xorScalar(left, right);
  }
  
  /**
   * Population count (number of true bits)
   */
  popcount(vector: BooleanVector): number {
    this.stats.operationsProcessed++;
    this.stats.bitsProcessed += vector.size;
    
    if (this.hasNoNulls(vector)) {
      this.stats.fastPathUsed++;
      return this.popcountPacked(vector);
    }
    
    return this.popcountScalar(vector);
  }
  
  /**
   * Find first set bit (index of first true value)
   */
  findFirstSet(vector: BooleanVector): number {
    this.stats.operationsProcessed++;
    
    for (let i = 0; i < vector.size; i++) {
      if (!vector.nullMask[i] && vector.values[i]) {
        return i;
      }
      if (vector.nullMask[i]) {
        this.stats.nullsSkipped++;
      }
    }
    
    return -1; // Not found
  }
  
  /**
   * Find last set bit (index of last true value)
   */
  findLastSet(vector: BooleanVector): number {
    this.stats.operationsProcessed++;
    
    for (let i = vector.size - 1; i >= 0; i--) {
      if (!vector.nullMask[i] && vector.values[i]) {
        return i;
      }
      if (vector.nullMask[i]) {
        this.stats.nullsSkipped++;
      }
    }
    
    return -1; // Not found
  }
  
  /**
   * Create selection mask from boolean vector
   */
  createSelectionMask(vector: BooleanVector): boolean[] {
    const mask = new Array(vector.size);
    
    for (let i = 0; i < vector.size; i++) {
      mask[i] = !vector.nullMask[i] && vector.values[i];
    }
    
    return mask;
  }
  
  /**
   * Apply selection mask to filter indices
   */
  applySelectionMask(mask: boolean[]): number[] {
    const selected: number[] = [];
    
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        selected.push(i);
      }
    }
    
    return selected;
  }
  
  // Packed bitset implementations
  private andPacked(vectors: BooleanVector[]): BooleanVector {
    const size = vectors[0].size;
    const bitsets = vectors.map(v => this.packBooleanVector(v));
    
    // Perform bitwise AND on packed words
    const resultBitset = this.createPackedBitSet(size);
    const wordCount = resultBitset.words.length;
    
    // Initialize result with first bitset
    for (let w = 0; w < wordCount; w++) {
      resultBitset.words[w] = bitsets[0].words[w];
    }
    
    // AND with remaining bitsets
    for (let v = 1; v < bitsets.length; v++) {
      for (let w = 0; w < wordCount; w++) {
        resultBitset.words[w] &= bitsets[v].words[w];
      }
    }
    
    this.stats.fastPathUsed++;
    return this.unpackBooleanVector(resultBitset);
  }
  
  private orPacked(vectors: BooleanVector[]): BooleanVector {
    const size = vectors[0].size;
    const bitsets = vectors.map(v => this.packBooleanVector(v));
    
    // Perform bitwise OR on packed words
    const resultBitset = this.createPackedBitSet(size);
    const wordCount = resultBitset.words.length;
    
    // Initialize result with zeros
    for (let w = 0; w < wordCount; w++) {
      resultBitset.words[w] = 0;
    }
    
    // OR with all bitsets
    for (const bitset of bitsets) {
      for (let w = 0; w < wordCount; w++) {
        resultBitset.words[w] |= bitset.words[w];
      }
    }
    
    this.stats.fastPathUsed++;
    return this.unpackBooleanVector(resultBitset);
  }
  
  private notPacked(vector: BooleanVector): BooleanVector {
    const bitset = this.packBooleanVector(vector);
    const wordCount = bitset.words.length;
    
    // Perform bitwise NOT
    for (let w = 0; w < wordCount; w++) {
      bitset.words[w] = ~bitset.words[w];
    }
    
    // Handle partial last word
    if (vector.size % BitmapKernels.WORD_SIZE !== 0) {
      const lastWordBits = vector.size % BitmapKernels.WORD_SIZE;
      const mask = (1 << lastWordBits) - 1;
      bitset.words[wordCount - 1] &= mask;
    }
    
    this.stats.fastPathUsed++;
    return this.unpackBooleanVector(bitset);
  }
  
  private xorPacked(left: BooleanVector, right: BooleanVector): BooleanVector {
    const leftBitset = this.packBooleanVector(left);
    const rightBitset = this.packBooleanVector(right);
    const wordCount = leftBitset.words.length;
    
    // Perform bitwise XOR
    for (let w = 0; w < wordCount; w++) {
      leftBitset.words[w] ^= rightBitset.words[w];
    }
    
    this.stats.fastPathUsed++;
    return this.unpackBooleanVector(leftBitset);
  }
  
  private popcountPacked(vector: BooleanVector): number {
    const bitset = this.packBooleanVector(vector);
    let count = 0;
    
    for (const word of bitset.words) {
      count += this.popcountWord(word);
    }
    
    return count;
  }
  
  // Scalar implementations (with null handling)
  private andScalar(vectors: BooleanVector[]): BooleanVector {
    const size = vectors[0].size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      let allTrue = true;
      let hasNull = false;
      
      for (const vector of vectors) {
        if (vector.nullMask[i]) {
          hasNull = true;
          break;
        }
        if (!vector.values[i]) {
          allTrue = false;
          break;
        }
      }
      
      result[i] = hasNull ? false : allTrue;
      nullMask[i] = hasNull;
      
      if (hasNull) {
        this.stats.nullsSkipped++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private orScalar(vectors: BooleanVector[]): BooleanVector {
    const size = vectors[0].size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      let anyTrue = false;
      let hasNull = false;
      
      for (const vector of vectors) {
        if (vector.nullMask[i]) {
          hasNull = true;
          continue;
        }
        if (vector.values[i]) {
          anyTrue = true;
          break;
        }
      }
      
      result[i] = hasNull && !anyTrue ? false : anyTrue;
      nullMask[i] = hasNull && !anyTrue;
      
      if (hasNull && !anyTrue) {
        this.stats.nullsSkipped++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private notScalar(vector: BooleanVector): BooleanVector {
    const size = vector.size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      if (vector.nullMask[i]) {
        result[i] = false;
        nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result[i] = !vector.values[i];
        nullMask[i] = false;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private xorScalar(left: BooleanVector, right: BooleanVector): BooleanVector {
    const size = left.size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i]) {
        result[i] = false;
        nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result[i] = left.values[i] !== right.values[i]; // XOR logic
        nullMask[i] = false;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private popcountScalar(vector: BooleanVector): number {
    let count = 0;
    
    for (let i = 0; i < vector.size; i++) {
      if (vector.nullMask[i]) {
        this.stats.nullsSkipped++;
      } else if (vector.values[i]) {
        count++;
      }
    }
    
    return count;
  }
  
  // Packing/unpacking utilities
  private packBooleanVector(vector: BooleanVector): PackedBitSet {
    const bitset = this.createPackedBitSet(vector.size);
    
    for (let i = 0; i < vector.size; i++) {
      if (!vector.nullMask[i] && vector.values[i]) {
        this.setBit(bitset, i);
      }
    }
    
    return bitset;
  }
  
  private unpackBooleanVector(bitset: PackedBitSet): BooleanVector {
    const values = new Array(bitset.size);
    const nullMask = new Array(bitset.size).fill(false);
    
    for (let i = 0; i < bitset.size; i++) {
      values[i] = this.getBit(bitset, i);
    }
    
    return { values, nullMask, size: bitset.size };
  }
  
  private createPackedBitSet(size: number): PackedBitSet {
    const wordCount = Math.ceil(size / BitmapKernels.WORD_SIZE);
    return {
      words: new Uint32Array(wordCount),
      size
    };
  }
  
  private setBit(bitset: PackedBitSet, index: number) {
    const wordIndex = Math.floor(index / BitmapKernels.WORD_SIZE);
    const bitIndex = index & BitmapKernels.WORD_MASK;
    bitset.words[wordIndex] |= (1 << bitIndex);
  }
  
  private getBit(bitset: PackedBitSet, index: number): boolean {
    const wordIndex = Math.floor(index / BitmapKernels.WORD_SIZE);
    const bitIndex = index & BitmapKernels.WORD_MASK;
    return (bitset.words[wordIndex] & (1 << bitIndex)) !== 0;
  }
  
  /**
   * Population count for a 32-bit word
   * Uses Brian Kernighan's algorithm
   */
  private popcountWord(word: number): number {
    let count = 0;
    while (word) {
      word &= word - 1; // Clear the lowest set bit
      count++;
    }
    return count;
  }
  
  // Utility methods
  private canUsePackedOperation(vectors: BooleanVector[]): boolean {
    return vectors.every(v => this.hasNoNulls(v));
  }
  
  private hasNoNulls(vector: BooleanVector): boolean {
    return !vector.nullMask.some(isNull => isNull);
  }
  
  private createEmptyBooleanVector(): BooleanVector {
    return {
      values: [],
      nullMask: [],
      size: 0
    };
  }
  
  /**
   * Get bitmap operation statistics
   */
  getStats(): BitmapStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      operationsProcessed: 0,
      bitsProcessed: 0,
      nullsSkipped: 0,
      packedOperations: 0,
      fastPathUsed: 0
    };
  }
}

/**
 * Utility class for working with selection vectors
 */
export class SelectionVector {
  private indices: number[];
  private capacity: number;
  
  constructor(capacity: number = 1024) {
    this.capacity = capacity;
    this.indices = [];
  }
  
  /**
   * Add index to selection
   */
  add(index: number) {
    if (this.indices.length < this.capacity) {
      this.indices.push(index);
    }
  }
  
  /**
   * Get selected indices
   */
  getIndices(): number[] {
    return this.indices.slice();
  }
  
  /**
   * Get selection count
   */
  size(): number {
    return this.indices.length;
  }
  
  /**
   * Clear selection
   */
  clear() {
    this.indices.length = 0;
  }
  
  /**
   * Apply selection to an array
   */
  apply<T>(array: T[]): T[] {
    return this.indices.map(i => array[i]);
  }
  
  /**
   * Create selection vector from boolean mask
   */
  static fromMask(mask: boolean[]): SelectionVector {
    const selection = new SelectionVector(mask.length);
    
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        selection.add(i);
      }
    }
    
    return selection;
  }
}