/**
 * Phase 10: Boolean Vector Kernels with Bitsets
 * 
 * High-performance boolean operations using packed bitsets:
 * - AND/OR/NOT/XOR operations on bit vectors
 * - Selection vector integration
 * - SIMD-friendly 64-bit word operations
 * - Null mask handling for three-valued logic
 */

import { NullMask } from '../expr/interp';

/**
 * Packed bitset for efficient boolean vector operations
 */
export class BitVector {
  private words: BigUint64Array;
  private _length: number;

  constructor(length: number) {
    this._length = length;
    const wordCount = Math.ceil(length / 64);
    this.words = new BigUint64Array(wordCount);
  }

  /**
   * Set bit at index to true
   */
  set(index: number): void {
    if (index >= this._length) return;
    const wordIndex = Math.floor(index / 64);
    const bitIndex = index % 64;
    this.words[wordIndex] |= (1n << BigInt(bitIndex));
  }

  /**
   * Set bit at index to false
   */
  clear(index: number): void {
    if (index >= this._length) return;
    const wordIndex = Math.floor(index / 64);
    const bitIndex = index % 64;
    this.words[wordIndex] &= ~(1n << BigInt(bitIndex));
  }

  /**
   * Get bit value at index
   */
  get(index: number): boolean {
    if (index >= this._length) return false;
    const wordIndex = Math.floor(index / 64);
    const bitIndex = index % 64;
    return (this.words[wordIndex] & (1n << BigInt(bitIndex))) !== 0n;
  }

  /**
   * Set bit value at index
   */
  setBit(index: number, value: boolean): void {
    if (value) {
      this.set(index);
    } else {
      this.clear(index);
    }
  }

  /**
   * Set all bits to false
   */
  clearAll(): void {
    this.words.fill(0n);
  }

  /**
   * Set all bits to true
   */
  setAll(): void {
    this.words.fill(0xFFFFFFFFFFFFFFFFn);
    
    // Clear bits beyond length in the last word
    const bitsInLastWord = this._length % 64;
    if (bitsInLastWord > 0) {
      const lastWordIndex = this.words.length - 1;
      const mask = (1n << BigInt(bitsInLastWord)) - 1n;
      this.words[lastWordIndex] &= mask;
    }
  }

  /**
   * Count number of set bits (population count)
   */
  popcount(): number {
    let count = 0;
    for (let i = 0; i < this.words.length; i++) {
      count += this.popcountWord(this.words[i]);
    }
    return count;
  }

  /**
   * Population count for a single 64-bit word
   */
  private popcountWord(word: bigint): number {
    let count = 0;
    while (word !== 0n) {
      count++;
      word &= word - 1n; // Clear the lowest set bit
    }
    return count;
  }

  /**
   * Find first set bit index
   */
  firstSetBit(): number {
    for (let wordIndex = 0; wordIndex < this.words.length; wordIndex++) {
      const word = this.words[wordIndex];
      if (word !== 0n) {
        // Find first bit in this word
        let bitIndex = 0;
        let temp = word;
        while ((temp & 1n) === 0n) {
          temp >>= 1n;
          bitIndex++;
        }
        return wordIndex * 64 + bitIndex;
      }
    }
    return -1; // No set bits found
  }

  /**
   * Get array of set bit indices
   */
  getSetBits(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this._length; i++) {
      if (this.get(i)) {
        result.push(i);
      }
    }
    return result;
  }

  get length(): number {
    return this._length;
  }

  get wordCount(): number {
    return this.words.length;
  }

  /**
   * Get underlying word array for SIMD operations
   */
  getWords(): BigUint64Array {
    return this.words;
  }
}

/**
 * Boolean operation result with null handling
 */
export interface BooleanResult {
  values: BitVector;
  nullMask: NullMask;
  trueCount: number;
  falseCount: number;
  nullCount: number;
}

/**
 * Bitmap kernel statistics
 */
export interface BitmapStats {
  totalOperations: number;
  simdOperations: number;
  totalBitsProcessed: number;
  averageBatchSize: number;
  nullPropagations: number;
}

/**
 * High-performance bitmap operations kernel
 */
export class BitmapKernels {
  private stats: BitmapStats = {
    totalOperations: 0,
    simdOperations: 0,
    totalBitsProcessed: 0,
    averageBatchSize: 0,
    nullPropagations: 0
  };

  /**
   * Logical AND operation on two bit vectors
   */
  and(a: BitVector, b: BitVector, aNulls?: NullMask, bNulls?: NullMask): BooleanResult {
    return this.binaryBitOperation(a, b, (x, y) => x & y, aNulls, bNulls, 'and');
  }

  /**
   * Logical OR operation on two bit vectors
   */
  or(a: BitVector, b: BitVector, aNulls?: NullMask, bNulls?: NullMask): BooleanResult {
    return this.binaryBitOperation(a, b, (x, y) => x | y, aNulls, bNulls, 'or');
  }

  /**
   * Logical XOR operation on two bit vectors
   */
  xor(a: BitVector, b: BitVector, aNulls?: NullMask, bNulls?: NullMask): BooleanResult {
    return this.binaryBitOperation(a, b, (x, y) => x ^ y, aNulls, bNulls, 'xor');
  }

  /**
   * Logical NOT operation on bit vector
   */
  not(a: BitVector, nullMask?: NullMask): BooleanResult {
    const length = Math.min(a.length, nullMask?.length ?? a.length);
    const result = new BitVector(length);
    const resultNulls = new NullMask(length);
    
    let trueCount = 0;
    let falseCount = 0;
    let nullCount = 0;

    this.updateStats(length);

    // SIMD-friendly word-level operation when no nulls
    if (!nullMask) {
      const aWords = a.getWords();
      const resultWords = result.getWords();
      
      for (let i = 0; i < Math.min(aWords.length, resultWords.length); i++) {
        resultWords[i] = ~aWords[i];
      }
      
      // Handle last word bits beyond length
      const bitsInLastWord = length % 64;
      if (bitsInLastWord > 0) {
        const lastWordIndex = resultWords.length - 1;
        const mask = (1n << BigInt(bitsInLastWord)) - 1n;
        resultWords[lastWordIndex] &= mask;
      }
      
      trueCount = result.popcount();
      falseCount = length - trueCount;
      this.stats.simdOperations++;
    } else {
      // Null-aware bit-by-bit operation
      for (let i = 0; i < length; i++) {
        if (nullMask.isNull(i)) {
          resultNulls.setNull(i);
          nullCount++;
        } else {
          const inverted = !a.get(i);
          result.setBit(i, inverted);
          if (inverted) trueCount++;
          else falseCount++;
        }
      }
      this.stats.nullPropagations += nullCount;
    }

    return {
      values: result,
      nullMask: resultNulls,
      trueCount,
      falseCount,
      nullCount
    };
  }

  /**
   * Core binary bit operation with SIMD optimization
   */
  private binaryBitOperation(
    a: BitVector, 
    b: BitVector, 
    op: (x: bigint, y: bigint) => bigint,
    aNulls?: NullMask, 
    bNulls?: NullMask,
    operation: string = 'binary'
  ): BooleanResult {
    const length = Math.min(a.length, b.length);
    const result = new BitVector(length);
    const resultNulls = new NullMask(length);
    
    let trueCount = 0;
    let falseCount = 0;
    let nullCount = 0;

    this.updateStats(length);

    // Fast path: SIMD word-level operations when no nulls
    if (!aNulls && !bNulls) {
      const aWords = a.getWords();
      const bWords = b.getWords();
      const resultWords = result.getWords();
      
      const wordCount = Math.min(aWords.length, bWords.length, resultWords.length);
      
      for (let i = 0; i < wordCount; i++) {
        resultWords[i] = op(aWords[i], bWords[i]);
      }
      
      // Handle last word masking
      const bitsInLastWord = length % 64;
      if (bitsInLastWord > 0 && wordCount > 0) {
        const lastWordIndex = wordCount - 1;
        const mask = (1n << BigInt(bitsInLastWord)) - 1n;
        resultWords[lastWordIndex] &= mask;
      }
      
      trueCount = result.popcount();
      falseCount = length - trueCount;
      this.stats.simdOperations++;
    } else {
      // Null-aware operation with three-valued logic
      for (let i = 0; i < length; i++) {
        const aIsNull = aNulls?.isNull(i) ?? false;
        const bIsNull = bNulls?.isNull(i) ?? false;
        
        if (aIsNull || bIsNull) {
          // Three-valued logic: NULL op anything = NULL
          if (operation === 'and' && ((aIsNull && !bIsNull && !b.get(i)) || 
                                      (bIsNull && !aIsNull && !a.get(i)))) {
            // Special case: NULL AND FALSE = FALSE
            result.setBit(i, false);
            falseCount++;
          } else if (operation === 'or' && ((aIsNull && !bIsNull && b.get(i)) || 
                                            (bIsNull && !aIsNull && a.get(i)))) {
            // Special case: NULL OR TRUE = TRUE
            result.setBit(i, true);
            trueCount++;
          } else {
            resultNulls.setNull(i);
            nullCount++;
          }
          this.stats.nullPropagations++;
        } else {
          // Both values are non-null, perform operation
          const aVal = a.get(i);
          const bVal = b.get(i);
          const resultVal = this.evaluateBooleanOp(aVal, bVal, operation);
          
          result.setBit(i, resultVal);
          if (resultVal) trueCount++;
          else falseCount++;
        }
      }
    }

    return {
      values: result,
      nullMask: resultNulls,
      trueCount,
      falseCount,
      nullCount
    };
  }

  /**
   * Evaluate boolean operation on scalar values
   */
  private evaluateBooleanOp(a: boolean, b: boolean, operation: string): boolean {
    switch (operation) {
      case 'and': return a && b;
      case 'or': return a || b;
      case 'xor': return a !== b;
      default: return false;
    }
  }

  /**
   * Convert boolean array to BitVector
   */
  fromBooleanArray(values: boolean[], nullMask?: NullMask): BooleanResult {
    const length = values.length;
    const result = new BitVector(length);
    const resultNulls = nullMask ? new NullMask(length) : new NullMask(length);
    
    let trueCount = 0;
    let falseCount = 0;
    let nullCount = 0;

    for (let i = 0; i < length; i++) {
      if (nullMask?.isNull(i)) {
        resultNulls.setNull(i);
        nullCount++;
      } else {
        const value = Boolean(values[i]);
        result.setBit(i, value);
        if (value) trueCount++;
        else falseCount++;
      }
    }

    this.updateStats(length);

    return {
      values: result,
      nullMask: resultNulls,
      trueCount,
      falseCount,
      nullCount
    };
  }

  /**
   * Convert BitVector to boolean array
   */
  toBooleanArray(bitVector: BitVector, nullMask?: NullMask): boolean[] {
    const result = new Array(bitVector.length);
    
    for (let i = 0; i < bitVector.length; i++) {
      if (nullMask?.isNull(i)) {
        result[i] = false; // Default for nulls
      } else {
        result[i] = bitVector.get(i);
      }
    }

    return result;
  }

  /**
   * Create selection vector from BitVector
   */
  toSelectionVector(bitVector: BitVector, nullMask?: NullMask): Uint32Array {
    const setBits: number[] = [];
    
    for (let i = 0; i < bitVector.length; i++) {
      if (!(nullMask?.isNull(i) ?? false) && bitVector.get(i)) {
        setBits.push(i);
      }
    }
    
    return new Uint32Array(setBits);
  }

  /**
   * Apply selection vector to filter another BitVector
   */
  select(bitVector: BitVector, selectionVector: Uint32Array): BitVector {
    const result = new BitVector(selectionVector.length);
    
    for (let i = 0; i < selectionVector.length; i++) {
      const sourceIndex = selectionVector[i];
      if (sourceIndex < bitVector.length) {
        result.setBit(i, bitVector.get(sourceIndex));
      }
    }
    
    this.updateStats(selectionVector.length);
    
    return result;
  }

  /**
   * Count matching bits between two BitVectors
   */
  countMatches(a: BitVector, b: BitVector): number {
    let matches = 0;
    const length = Math.min(a.length, b.length);
    
    for (let i = 0; i < length; i++) {
      if (a.get(i) === b.get(i)) {
        matches++;
      }
    }
    
    return matches;
  }

  /**
   * Update performance statistics
   */
  private updateStats(batchSize: number): void {
    this.stats.totalOperations++;
    this.stats.totalBitsProcessed += batchSize;
    
    const totalOps = this.stats.totalOperations;
    this.stats.averageBatchSize = 
      (this.stats.averageBatchSize * (totalOps - 1) + batchSize) / totalOps;
  }

  /**
   * Get performance statistics
   */
  getStats(): BitmapStats {
    return { ...this.stats };
  }

  /**
   * Reset performance statistics
   */
  resetStats(): void {
    this.stats = {
      totalOperations: 0,
      simdOperations: 0,
      totalBitsProcessed: 0,
      averageBatchSize: 0,
      nullPropagations: 0
    };
  }

  /**
   * Get efficiency metrics
   */
  getEfficiencyMetrics() {
    const totalOps = this.stats.totalOperations;
    if (totalOps === 0) return { simdRatio: 0, avgBatchSize: 0, nullRatio: 0 };

    return {
      simdRatio: (this.stats.simdOperations / totalOps * 100).toFixed(2) + '%',
      avgBatchSize: Math.round(this.stats.averageBatchSize),
      nullRatio: (this.stats.nullPropagations / this.stats.totalBitsProcessed * 100).toFixed(2) + '%'
    };
  }
}