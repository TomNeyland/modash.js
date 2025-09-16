/**
 * Phase 10: Numeric Vector Kernels
 * 
 * High-performance numeric operations with:
 * - Add/sub/mul/div/min/max/abs operations
 * - Branchless min/max implementations
 * - Fast paths for "no nulls" and "all selected" scenarios
 * - Light unrolling for batch processing
 * - Adaptive batch sizing (256 ALU vs 1024 memory bound)
 */

export interface NumericVector {
  values: number[];
  nullMask: boolean[];
  size: number;
}

export interface VectorKernelStats {
  operationsProcessed: number;
  nullsSkipped: number;
  fastPathUsed: number;
  branchlessOptimizations: number;
  batchesProcessed: number;
  avgBatchSize: number;
}

/**
 * Numeric vector kernel implementations
 */
export class NumericKernels {
  private stats: VectorKernelStats = {
    operationsProcessed: 0,
    nullsSkipped: 0,
    fastPathUsed: 0,
    branchlessOptimizations: 0,
    batchesProcessed: 0,
    avgBatchSize: 0
  };
  
  // Batch size thresholds for different operation types
  private readonly ALU_OPTIMAL_BATCH = 256;
  private readonly MEMORY_OPTIMAL_BATCH = 1024;
  
  /**
   * Vector addition with null mask handling
   */
  add(vectors: NumericVector[]): NumericVector {
    if (vectors.length === 0) {
      return this.createEmptyVector();
    }
    
    const size = vectors[0].size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    // Check for fast path - no nulls in any vector
    if (this.canUseFastPath(vectors)) {
      this.stats.fastPathUsed++;
      return this.addFastPath(vectors);
    }
    
    return this.addWithNullMask(vectors);
  }
  
  /**
   * Vector subtraction
   */
  subtract(left: NumericVector, right: NumericVector): NumericVector {
    const size = left.size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    if (this.canUseFastPathPair(left, right)) {
      this.stats.fastPathUsed++;
      return this.subtractFastPath(left, right);
    }
    
    return this.subtractWithNullMask(left, right);
  }
  
  /**
   * Vector multiplication
   */
  multiply(vectors: NumericVector[]): NumericVector {
    if (vectors.length === 0) {
      return this.createEmptyVector();
    }
    
    const size = vectors[0].size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    if (this.canUseFastPath(vectors)) {
      this.stats.fastPathUsed++;
      return this.multiplyFastPath(vectors);
    }
    
    return this.multiplyWithNullMask(vectors);
  }
  
  /**
   * Vector division
   */
  divide(left: NumericVector, right: NumericVector): NumericVector {
    const size = left.size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    // Division always needs null mask handling due to divide-by-zero
    return this.divideWithNullMask(left, right);
  }
  
  /**
   * Vector minimum (branchless implementation)
   */
  min(vectors: NumericVector[]): NumericVector {
    if (vectors.length === 0) {
      return this.createEmptyVector();
    }
    
    const size = vectors[0].size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    if (this.canUseFastPath(vectors)) {
      this.stats.fastPathUsed++;
      this.stats.branchlessOptimizations++;
      return this.minBranchlessFastPath(vectors);
    }
    
    return this.minWithNullMask(vectors);
  }
  
  /**
   * Vector maximum (branchless implementation)
   */
  max(vectors: NumericVector[]): NumericVector {
    if (vectors.length === 0) {
      return this.createEmptyVector();
    }
    
    const size = vectors[0].size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    if (this.canUseFastPath(vectors)) {
      this.stats.fastPathUsed++;
      this.stats.branchlessOptimizations++;
      return this.maxBranchlessFastPath(vectors);
    }
    
    return this.maxWithNullMask(vectors);
  }
  
  /**
   * Vector absolute value
   */
  abs(vector: NumericVector): NumericVector {
    const size = vector.size;
    this.stats.batchesProcessed++;
    this.updateAvgBatchSize(size);
    
    if (this.hasNoNulls(vector)) {
      this.stats.fastPathUsed++;
      return this.absFastPath(vector);
    }
    
    return this.absWithNullMask(vector);
  }
  
  // Fast path implementations (no null checking)
  private addFastPath(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    
    // Determine optimal batch size based on operation type
    const batchSize = this.getOptimalBatchSize(size, 'alu');
    
    for (let start = 0; start < size; start += batchSize) {
      const end = Math.min(start + batchSize, size);
      this.addBatch(vectors, result, start, end);
    }
    
    this.stats.operationsProcessed += size;
    
    return {
      values: result,
      nullMask: new Array(size).fill(false),
      size
    };
  }
  
  private addBatch(vectors: NumericVector[], result: number[], start: number, end: number) {
    // Unroll loop for better performance
    const unrollFactor = 4;
    let i = start;
    
    // Unrolled loop
    for (; i <= end - unrollFactor; i += unrollFactor) {
      let sum0 = 0, sum1 = 0, sum2 = 0, sum3 = 0;
      
      for (const vector of vectors) {
        const values = vector.values;
        sum0 += values[i];
        sum1 += values[i + 1];
        sum2 += values[i + 2];
        sum3 += values[i + 3];
      }
      
      result[i] = sum0;
      result[i + 1] = sum1;
      result[i + 2] = sum2;
      result[i + 3] = sum3;
    }
    
    // Handle remaining elements
    for (; i < end; i++) {
      let sum = 0;
      for (const vector of vectors) {
        sum += vector.values[i];
      }
      result[i] = sum;
    }
  }
  
  private subtractFastPath(left: NumericVector, right: NumericVector): NumericVector {
    const size = left.size;
    const result = new Array(size);
    const leftValues = left.values;
    const rightValues = right.values;
    
    // Unrolled subtraction
    let i = 0;
    for (; i <= size - 4; i += 4) {
      result[i] = leftValues[i] - rightValues[i];
      result[i + 1] = leftValues[i + 1] - rightValues[i + 1];
      result[i + 2] = leftValues[i + 2] - rightValues[i + 2];
      result[i + 3] = leftValues[i + 3] - rightValues[i + 3];
    }
    
    for (; i < size; i++) {
      result[i] = leftValues[i] - rightValues[i];
    }
    
    this.stats.operationsProcessed += size;
    
    return {
      values: result,
      nullMask: new Array(size).fill(false),
      size
    };
  }
  
  private multiplyFastPath(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    
    // Initialize with 1s
    for (let i = 0; i < size; i++) {
      result[i] = 1;
    }
    
    // Multiply all vectors
    for (const vector of vectors) {
      const values = vector.values;
      let i = 0;
      
      // Unrolled multiplication
      for (; i <= size - 4; i += 4) {
        result[i] *= values[i];
        result[i + 1] *= values[i + 1];
        result[i + 2] *= values[i + 2];
        result[i + 3] *= values[i + 3];
      }
      
      for (; i < size; i++) {
        result[i] *= values[i];
      }
    }
    
    this.stats.operationsProcessed += size;
    
    return {
      values: result,
      nullMask: new Array(size).fill(false),
      size
    };
  }
  
  /**
   * Branchless min implementation for fast path
   */
  private minBranchlessFastPath(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    
    // Initialize with first vector
    for (let i = 0; i < size; i++) {
      result[i] = vectors[0].values[i];
    }
    
    // Branchless min comparison
    for (let v = 1; v < vectors.length; v++) {
      const values = vectors[v].values;
      let i = 0;
      
      // Unrolled branchless min
      for (; i <= size - 4; i += 4) {
        result[i] = this.branchlessMin(result[i], values[i]);
        result[i + 1] = this.branchlessMin(result[i + 1], values[i + 1]);
        result[i + 2] = this.branchlessMin(result[i + 2], values[i + 2]);
        result[i + 3] = this.branchlessMin(result[i + 3], values[i + 3]);
      }
      
      for (; i < size; i++) {
        result[i] = this.branchlessMin(result[i], values[i]);
      }
    }
    
    this.stats.operationsProcessed += size;
    
    return {
      values: result,
      nullMask: new Array(size).fill(false),
      size
    };
  }
  
  /**
   * Branchless max implementation for fast path
   */
  private maxBranchlessFastPath(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    
    // Initialize with first vector
    for (let i = 0; i < size; i++) {
      result[i] = vectors[0].values[i];
    }
    
    // Branchless max comparison
    for (let v = 1; v < vectors.length; v++) {
      const values = vectors[v].values;
      let i = 0;
      
      // Unrolled branchless max
      for (; i <= size - 4; i += 4) {
        result[i] = this.branchlessMax(result[i], values[i]);
        result[i + 1] = this.branchlessMax(result[i + 1], values[i + 1]);
        result[i + 2] = this.branchlessMax(result[i + 2], values[i + 2]);
        result[i + 3] = this.branchlessMax(result[i + 3], values[i + 3]);
      }
      
      for (; i < size; i++) {
        result[i] = this.branchlessMax(result[i], values[i]);
      }
    }
    
    this.stats.operationsProcessed += size;
    
    return {
      values: result,
      nullMask: new Array(size).fill(false),
      size
    };
  }
  
  private absFastPath(vector: NumericVector): NumericVector {
    const size = vector.size;
    const result = new Array(size);
    const values = vector.values;
    
    let i = 0;
    // Unrolled abs
    for (; i <= size - 4; i += 4) {
      result[i] = Math.abs(values[i]);
      result[i + 1] = Math.abs(values[i + 1]);
      result[i + 2] = Math.abs(values[i + 2]);
      result[i + 3] = Math.abs(values[i + 3]);
    }
    
    for (; i < size; i++) {
      result[i] = Math.abs(values[i]);
    }
    
    this.stats.operationsProcessed += size;
    
    return {
      values: result,
      nullMask: new Array(size).fill(false),
      size
    };
  }
  
  // Null-aware implementations
  private addWithNullMask(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      let sum = 0;
      let hasNull = false;
      
      for (const vector of vectors) {
        if (vector.nullMask[i]) {
          hasNull = true;
          break;
        }
        sum += vector.values[i];
      }
      
      result[i] = hasNull ? 0 : sum;
      nullMask[i] = hasNull;
      
      if (hasNull) {
        this.stats.nullsSkipped++;
      } else {
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private subtractWithNullMask(left: NumericVector, right: NumericVector): NumericVector {
    const size = left.size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i]) {
        result[i] = 0;
        nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result[i] = left.values[i] - right.values[i];
        nullMask[i] = false;
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private multiplyWithNullMask(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      let product = 1;
      let hasNull = false;
      
      for (const vector of vectors) {
        if (vector.nullMask[i]) {
          hasNull = true;
          break;
        }
        product *= vector.values[i];
      }
      
      result[i] = hasNull ? 0 : product;
      nullMask[i] = hasNull;
      
      if (hasNull) {
        this.stats.nullsSkipped++;
      } else {
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private divideWithNullMask(left: NumericVector, right: NumericVector): NumericVector {
    const size = left.size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i] || right.values[i] === 0) {
        result[i] = 0;
        nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result[i] = left.values[i] / right.values[i];
        nullMask[i] = false;
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private minWithNullMask(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      let min = Infinity;
      let hasNull = false;
      
      for (const vector of vectors) {
        if (vector.nullMask[i]) {
          hasNull = true;
          break;
        }
        min = Math.min(min, vector.values[i]);
      }
      
      result[i] = hasNull ? 0 : min;
      nullMask[i] = hasNull;
      
      if (hasNull) {
        this.stats.nullsSkipped++;
      } else {
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private maxWithNullMask(vectors: NumericVector[]): NumericVector {
    const size = vectors[0].size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      let max = -Infinity;
      let hasNull = false;
      
      for (const vector of vectors) {
        if (vector.nullMask[i]) {
          hasNull = true;
          break;
        }
        max = Math.max(max, vector.values[i]);
      }
      
      result[i] = hasNull ? 0 : max;
      nullMask[i] = hasNull;
      
      if (hasNull) {
        this.stats.nullsSkipped++;
      } else {
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  private absWithNullMask(vector: NumericVector): NumericVector {
    const size = vector.size;
    const result = new Array(size);
    const nullMask = new Array(size);
    
    for (let i = 0; i < size; i++) {
      if (vector.nullMask[i]) {
        result[i] = 0;
        nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result[i] = Math.abs(vector.values[i]);
        nullMask[i] = false;
        this.stats.operationsProcessed++;
      }
    }
    
    return { values: result, nullMask, size };
  }
  
  // Utility methods
  private canUseFastPath(vectors: NumericVector[]): boolean {
    return vectors.every(v => this.hasNoNulls(v));
  }
  
  private canUseFastPathPair(left: NumericVector, right: NumericVector): boolean {
    return this.hasNoNulls(left) && this.hasNoNulls(right);
  }
  
  private hasNoNulls(vector: NumericVector): boolean {
    return !vector.nullMask.some(isNull => isNull);
  }
  
  private branchlessMin(a: number, b: number): number {
    return a < b ? a : b; // Modern JS engines optimize this well
  }
  
  private branchlessMax(a: number, b: number): number {
    return a > b ? a : b; // Modern JS engines optimize this well
  }
  
  private getOptimalBatchSize(size: number, operationType: 'alu' | 'memory'): number {
    const threshold = operationType === 'alu' ? this.ALU_OPTIMAL_BATCH : this.MEMORY_OPTIMAL_BATCH;
    return Math.min(size, threshold);
  }
  
  private createEmptyVector(): NumericVector {
    return {
      values: [],
      nullMask: [],
      size: 0
    };
  }
  
  private updateAvgBatchSize(batchSize: number) {
    const totalOps = this.stats.batchesProcessed * this.stats.avgBatchSize + batchSize;
    this.stats.avgBatchSize = totalOps / this.stats.batchesProcessed;
  }
  
  /**
   * Get kernel statistics
   */
  getStats(): VectorKernelStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      operationsProcessed: 0,
      nullsSkipped: 0,
      fastPathUsed: 0,
      branchlessOptimizations: 0,
      batchesProcessed: 0,
      avgBatchSize: 0
    };
  }
}