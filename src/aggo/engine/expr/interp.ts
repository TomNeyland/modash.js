/**
 * Phase 10: Vector Expression Interpreter
 * 
 * High-performance vector interpreter with:
 * - Math/compare/boolean kernels with null masks
 * - Auto fallback from JIT on megamorphism
 * - Batch processing optimizations
 * - SIMD-style operations where possible
 */

import { ExpressionAST } from './jit';

export interface VectorBatch {
  values: any[];
  nullMask: boolean[];
  size: number;
}

export interface InterpreterStats {
  batchesProcessed: number;
  totalOperations: number;
  avgBatchSize: number;
  nullsSkipped: number;
  fastPathUsed: number;
}

/**
 * Vector-optimized expression interpreter
 * Processes batches of values with null mask handling
 */
export class VectorInterpreter {
  private stats: InterpreterStats = {
    batchesProcessed: 0,
    totalOperations: 0,
    avgBatchSize: 0,
    nullsSkipped: 0,
    fastPathUsed: 0
  };
  
  /**
   * Evaluate expression on a batch of documents
   */
  evaluateBatch(ast: ExpressionAST, batch: VectorBatch): VectorBatch {
    this.stats.batchesProcessed++;
    this.stats.totalOperations += batch.size;
    
    const result = this.evaluateNode(ast, batch);
    
    // Update average batch size
    this.stats.avgBatchSize = this.stats.totalOperations / this.stats.batchesProcessed;
    
    return result;
  }
  
  private evaluateNode(ast: ExpressionAST, batch: VectorBatch): VectorBatch {
    switch (ast.type) {
      case 'field':
        return this.evaluateField(ast.field!, batch);
        
      case 'literal':
        return this.evaluateLiteral(ast.value, batch);
        
      case 'operator':
        return this.evaluateOperator(ast.operator!, ast.operands!, batch);
        
      case 'conditional':
        return this.evaluateConditional(ast, batch);
        
      default:
        return this.createNullBatch(batch.size);
    }
  }
  
  private evaluateField(fieldName: string, batch: VectorBatch): VectorBatch {
    const result: VectorBatch = {
      values: new Array(batch.size),
      nullMask: new Array(batch.size),
      size: batch.size
    };
    
    for (let i = 0; i < batch.size; i++) {
      if (batch.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        const doc = batch.values[i];
        const value = doc && doc[fieldName];
        result.values[i] = value;
        result.nullMask[i] = value === null || value === undefined;
      }
    }
    
    return result;
  }
  
  private evaluateLiteral(value: any, batch: VectorBatch): VectorBatch {
    this.stats.fastPathUsed++;
    
    return {
      values: new Array(batch.size).fill(value),
      nullMask: new Array(batch.size).fill(false),
      size: batch.size
    };
  }
  
  private evaluateOperator(operator: string, operands: ExpressionAST[], batch: VectorBatch): VectorBatch {
    const operandBatches = operands.map(op => this.evaluateNode(op, batch));
    
    switch (operator) {
      case '$add':
        return this.vectorAdd(operandBatches);
      case '$subtract':
        return this.vectorSubtract(operandBatches[0], operandBatches[1]);
      case '$multiply':
        return this.vectorMultiply(operandBatches);
      case '$divide':
        return this.vectorDivide(operandBatches[0], operandBatches[1]);
      case '$mod':
        return this.vectorMod(operandBatches[0], operandBatches[1]);
      case '$eq':
        return this.vectorEquals(operandBatches[0], operandBatches[1]);
      case '$ne':
        return this.vectorNotEquals(operandBatches[0], operandBatches[1]);
      case '$gt':
        return this.vectorGreaterThan(operandBatches[0], operandBatches[1]);
      case '$gte':
        return this.vectorGreaterThanOrEqual(operandBatches[0], operandBatches[1]);
      case '$lt':
        return this.vectorLessThan(operandBatches[0], operandBatches[1]);
      case '$lte':
        return this.vectorLessThanOrEqual(operandBatches[0], operandBatches[1]);
      case '$and':
        return this.vectorAnd(operandBatches);
      case '$or':
        return this.vectorOr(operandBatches);
      case '$not':
        return this.vectorNot(operandBatches[0]);
      case '$abs':
        return this.vectorAbs(operandBatches[0]);
      case '$min':
        return this.vectorMin(operandBatches);
      case '$max':
        return this.vectorMax(operandBatches);
      case '$concat':
        return this.vectorConcat(operandBatches);
      default:
        return this.createNullBatch(batch.size);
    }
  }
  
  private evaluateConditional(ast: ExpressionAST, batch: VectorBatch): VectorBatch {
    const conditionBatch = ast.condition ? this.evaluateNode(ast.condition, batch) : this.createNullBatch(batch.size);
    const thenBatch = ast.then ? this.evaluateNode(ast.then, batch) : this.createNullBatch(batch.size);
    const elseBatch = ast.else ? this.evaluateNode(ast.else, batch) : this.createNullBatch(batch.size);
    
    const result: VectorBatch = {
      values: new Array(batch.size),
      nullMask: new Array(batch.size),
      size: batch.size
    };
    
    for (let i = 0; i < batch.size; i++) {
      if (conditionBatch.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        const condition = conditionBatch.values[i];
        if (condition) {
          result.values[i] = thenBatch.values[i];
          result.nullMask[i] = thenBatch.nullMask[i];
        } else {
          result.values[i] = elseBatch.values[i];
          result.nullMask[i] = elseBatch.nullMask[i];
        }
      }
    }
    
    return result;
  }
  
  // Arithmetic operations with null mask handling
  private vectorAdd(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let sum = 0;
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          break;
        }
        sum += Number(operand.values[i]) || 0;
      }
      
      result.values[i] = hasNull ? null : sum;
      result.nullMask[i] = hasNull;
      
      if (hasNull) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  private vectorSubtract(left: VectorBatch, right: VectorBatch): VectorBatch {
    const size = left.size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result.values[i] = (Number(left.values[i]) || 0) - (Number(right.values[i]) || 0);
        result.nullMask[i] = false;
      }
    }
    
    return result;
  }
  
  private vectorMultiply(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let product = 1;
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          break;
        }
        product *= Number(operand.values[i]) || 0;
      }
      
      result.values[i] = hasNull ? null : product;
      result.nullMask[i] = hasNull;
      
      if (hasNull) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  private vectorDivide(left: VectorBatch, right: VectorBatch): VectorBatch {
    const size = left.size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        const divisor = Number(right.values[i]);
        if (divisor === 0) {
          result.values[i] = null;
          result.nullMask[i] = true;
        } else {
          result.values[i] = (Number(left.values[i]) || 0) / divisor;
          result.nullMask[i] = false;
        }
      }
    }
    
    return result;
  }
  
  private vectorMod(left: VectorBatch, right: VectorBatch): VectorBatch {
    const size = left.size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        const divisor = Number(right.values[i]);
        if (divisor === 0) {
          result.values[i] = null;
          result.nullMask[i] = true;
        } else {
          result.values[i] = (Number(left.values[i]) || 0) % divisor;
          result.nullMask[i] = false;
        }
      }
    }
    
    return result;
  }
  
  // Comparison operations
  private vectorEquals(left: VectorBatch, right: VectorBatch): VectorBatch {
    return this.vectorCompare(left, right, (a, b) => a === b);
  }
  
  private vectorNotEquals(left: VectorBatch, right: VectorBatch): VectorBatch {
    return this.vectorCompare(left, right, (a, b) => a !== b);
  }
  
  private vectorGreaterThan(left: VectorBatch, right: VectorBatch): VectorBatch {
    return this.vectorCompare(left, right, (a, b) => a > b);
  }
  
  private vectorGreaterThanOrEqual(left: VectorBatch, right: VectorBatch): VectorBatch {
    return this.vectorCompare(left, right, (a, b) => a >= b);
  }
  
  private vectorLessThan(left: VectorBatch, right: VectorBatch): VectorBatch {
    return this.vectorCompare(left, right, (a, b) => a < b);
  }
  
  private vectorLessThanOrEqual(left: VectorBatch, right: VectorBatch): VectorBatch {
    return this.vectorCompare(left, right, (a, b) => a <= b);
  }
  
  private vectorCompare(left: VectorBatch, right: VectorBatch, compareFn: (a: any, b: any) => boolean): VectorBatch {
    const size = left.size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      if (left.nullMask[i] || right.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result.values[i] = compareFn(left.values[i], right.values[i]);
        result.nullMask[i] = false;
      }
    }
    
    return result;
  }
  
  // Boolean operations
  private vectorAnd(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let allTrue = true;
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          break;
        }
        if (!operand.values[i]) {
          allTrue = false;
          break;
        }
      }
      
      result.values[i] = hasNull ? null : allTrue;
      result.nullMask[i] = hasNull;
      
      if (hasNull) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  private vectorOr(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let anyTrue = false;
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          continue;
        }
        if (operand.values[i]) {
          anyTrue = true;
          break;
        }
      }
      
      result.values[i] = hasNull && !anyTrue ? null : anyTrue;
      result.nullMask[i] = hasNull && !anyTrue;
      
      if (hasNull && !anyTrue) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  private vectorNot(operand: VectorBatch): VectorBatch {
    const result: VectorBatch = {
      values: new Array(operand.size),
      nullMask: new Array(operand.size),
      size: operand.size
    };
    
    for (let i = 0; i < operand.size; i++) {
      if (operand.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result.values[i] = !operand.values[i];
        result.nullMask[i] = false;
      }
    }
    
    return result;
  }
  
  // Mathematical functions
  private vectorAbs(operand: VectorBatch): VectorBatch {
    const result: VectorBatch = {
      values: new Array(operand.size),
      nullMask: new Array(operand.size),
      size: operand.size
    };
    
    for (let i = 0; i < operand.size; i++) {
      if (operand.nullMask[i]) {
        result.values[i] = null;
        result.nullMask[i] = true;
        this.stats.nullsSkipped++;
      } else {
        result.values[i] = Math.abs(Number(operand.values[i]) || 0);
        result.nullMask[i] = false;
      }
    }
    
    return result;
  }
  
  private vectorMin(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let min = Infinity;
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          break;
        }
        const value = Number(operand.values[i]) || 0;
        min = Math.min(min, value);
      }
      
      result.values[i] = hasNull ? null : min;
      result.nullMask[i] = hasNull;
      
      if (hasNull) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  private vectorMax(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let max = -Infinity;
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          break;
        }
        const value = Number(operand.values[i]) || 0;
        max = Math.max(max, value);
      }
      
      result.values[i] = hasNull ? null : max;
      result.nullMask[i] = hasNull;
      
      if (hasNull) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  // String operations
  private vectorConcat(operands: VectorBatch[]): VectorBatch {
    if (operands.length === 0) return this.createNullBatch(0);
    
    const size = operands[0].size;
    const result: VectorBatch = {
      values: new Array(size),
      nullMask: new Array(size),
      size
    };
    
    for (let i = 0; i < size; i++) {
      let concat = '';
      let hasNull = false;
      
      for (const operand of operands) {
        if (operand.nullMask[i]) {
          hasNull = true;
          break;
        }
        concat += String(operand.values[i] || '');
      }
      
      result.values[i] = hasNull ? null : concat;
      result.nullMask[i] = hasNull;
      
      if (hasNull) this.stats.nullsSkipped++;
    }
    
    return result;
  }
  
  private createNullBatch(size: number): VectorBatch {
    return {
      values: new Array(size).fill(null),
      nullMask: new Array(size).fill(true),
      size
    };
  }
  
  /**
   * Get interpreter statistics
   */
  getStats(): InterpreterStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      batchesProcessed: 0,
      totalOperations: 0,
      avgBatchSize: 0,
      nullsSkipped: 0,
      fastPathUsed: 0
    };
  }
}