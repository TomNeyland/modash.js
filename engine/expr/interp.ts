/**
 * Phase 10: Vector Expression Interpreter
 * 
 * High-performance vector interpreter with null mask support:
 * - Vectorized math/compare/boolean operations
 * - Null propagation via bitsets
 * - Auto fallback from JIT on megamorphism
 * - Batch processing with SIMD-friendly loops
 */

import { DocumentValue } from '../../src/aggo/expressions';
import { ExpressionAST } from './jit';

/**
 * Null mask for tracking null/undefined values in batches
 */
export class NullMask {
  private mask: Uint8Array;
  private _length: number;

  constructor(length: number) {
    this._length = length;
    // Use byte array for simplicity (could optimize to bit-packed later)
    this.mask = new Uint8Array(Math.ceil(length / 8));
  }

  setNull(index: number): void {
    if (index >= this._length) return;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.mask[byteIndex] |= (1 << bitIndex);
  }

  isNull(index: number): boolean {
    if (index >= this._length) return true;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return (this.mask[byteIndex] & (1 << bitIndex)) !== 0;
  }

  clear(): void {
    this.mask.fill(0);
  }

  get length(): number {
    return this._length;
  }

  /**
   * Count non-null values
   */
  countValid(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (!this.isNull(i)) count++;
    }
    return count;
  }
}

/**
 * Vector result with null mask
 */
export interface VectorResult {
  values: DocumentValue[];
  nullMask: NullMask;
  length: number;
}

/**
 * Vector interpreter statistics
 */
export interface InterpreterStats {
  totalEvaluations: number;
  vectorOperations: number;
  nullPropagations: number;
  avgBatchSize: number;
  totalProcessingTimeMs: number;
}

/**
 * High-performance vector expression interpreter
 */
export class VectorInterpreter {
  private stats: InterpreterStats = {
    totalEvaluations: 0,
    vectorOperations: 0,
    nullPropagations: 0,
    avgBatchSize: 0,
    totalProcessingTimeMs: 0
  };

  /**
   * Evaluate expression on a batch of documents
   */
  evaluateBatch(ast: ExpressionAST, docs: any[]): VectorResult {
    const startTime = Date.now();
    const length = docs.length;
    const result: VectorResult = {
      values: new Array(length),
      nullMask: new NullMask(length),
      length
    };

    this.evaluateNode(ast, docs, result, 0, length);

    this.stats.totalEvaluations++;
    this.stats.vectorOperations++;
    this.stats.totalProcessingTimeMs += Date.now() - startTime;
    this.stats.avgBatchSize = (this.stats.avgBatchSize * (this.stats.totalEvaluations - 1) + length) / this.stats.totalEvaluations;

    return result;
  }

  /**
   * Core node evaluation with vectorization
   */
  private evaluateNode(ast: ExpressionAST, docs: any[], result: VectorResult, start: number, end: number): void {
    switch (ast.type) {
      case 'literal':
        this.evaluateLiteral(ast, result, start, end);
        break;
        
      case 'field':
        this.evaluateField(ast, docs, result, start, end);
        break;
        
      case 'operator':
        this.evaluateOperator(ast, docs, result, start, end);
        break;
        
      case 'conditional':
        this.evaluateConditional(ast, docs, result, start, end);
        break;
        
      default:
        // Fill with nulls for unknown types
        for (let i = start; i < end; i++) {
          result.values[i] = null;
          result.nullMask.setNull(i);
        }
    }
  }

  /**
   * Evaluate literal values (broadcast to vector)
   */
  private evaluateLiteral(ast: ExpressionAST, result: VectorResult, start: number, end: number): void {
    const value = ast.value;
    const isNull = value == null;
    
    for (let i = start; i < end; i++) {
      result.values[i] = value;
      if (isNull) {
        result.nullMask.setNull(i);
      }
    }
  }

  /**
   * Evaluate field access with null checking
   */
  private evaluateField(ast: ExpressionAST, docs: any[], result: VectorResult, start: number, end: number): void {
    const fieldPath = ast.field!;
    
    for (let i = start; i < end; i++) {
      const value = this.getFieldValue(docs[i], fieldPath);
      result.values[i] = value;
      if (value == null) {
        result.nullMask.setNull(i);
      }
    }
  }

  /**
   * Evaluate operators with vectorized implementations
   */
  private evaluateOperator(ast: ExpressionAST, docs: any[], result: VectorResult, start: number, end: number): void {
    const operands = ast.operands || [];
    
    switch (ast.operator) {
      case '$add':
        this.evaluateArithmetic(operands, docs, result, start, end, (a, b) => a + b, 0);
        break;
        
      case '$subtract':
        if (operands.length === 2) {
          this.evaluateBinaryArithmetic(operands, docs, result, start, end, (a, b) => a - b);
        }
        break;
        
      case '$multiply':
        this.evaluateArithmetic(operands, docs, result, start, end, (a, b) => a * b, 1);
        break;
        
      case '$divide':
        if (operands.length === 2) {
          this.evaluateBinaryArithmetic(operands, docs, result, start, end, (a, b) => b !== 0 ? a / b : null);
        }
        break;
        
      case '$eq':
        if (operands.length === 2) {
          this.evaluateComparison(operands, docs, result, start, end, (a, b) => a === b);
        }
        break;
        
      case '$gt':
        if (operands.length === 2) {
          this.evaluateComparison(operands, docs, result, start, end, (a, b) => a > b);
        }
        break;
        
      case '$gte':
        if (operands.length === 2) {
          this.evaluateComparison(operands, docs, result, start, end, (a, b) => a >= b);
        }
        break;
        
      case '$lt':
        if (operands.length === 2) {
          this.evaluateComparison(operands, docs, result, start, end, (a, b) => a < b);
        }
        break;
        
      case '$lte':
        if (operands.length === 2) {
          this.evaluateComparison(operands, docs, result, start, end, (a, b) => a <= b);
        }
        break;
        
      case '$concat':
        this.evaluateStringConcat(operands, docs, result, start, end);
        break;
        
      default:
        // Fallback for unsupported operators
        for (let i = start; i < end; i++) {
          result.values[i] = null;
          result.nullMask.setNull(i);
        }
    }
  }

  /**
   * Vectorized arithmetic operations with null propagation
   */
  private evaluateArithmetic(
    operands: ExpressionAST[], 
    docs: any[], 
    result: VectorResult, 
    start: number, 
    end: number,
    op: (a: number, b: number) => number,
    identity: number
  ): void {
    if (operands.length === 0) {
      for (let i = start; i < end; i++) {
        result.values[i] = identity;
      }
      return;
    }

    // Evaluate first operand
    const temp1: VectorResult = {
      values: new Array(end - start),
      nullMask: new NullMask(end - start),
      length: end - start
    };
    this.evaluateNode(operands[0], docs, temp1, 0, end - start);

    // Copy first operand results
    for (let i = 0; i < end - start; i++) {
      result.values[start + i] = temp1.values[i];
      if (temp1.nullMask.isNull(i)) {
        result.nullMask.setNull(start + i);
      }
    }

    // Apply remaining operands
    for (let opIndex = 1; opIndex < operands.length; opIndex++) {
      const temp2: VectorResult = {
        values: new Array(end - start),
        nullMask: new NullMask(end - start),
        length: end - start
      };
      this.evaluateNode(operands[opIndex], docs, temp2, 0, end - start);

      // Vectorized operation with null propagation
      for (let i = 0; i < end - start; i++) {
        const resultIndex = start + i;
        
        if (result.nullMask.isNull(resultIndex) || temp2.nullMask.isNull(i)) {
          result.values[resultIndex] = null;
          result.nullMask.setNull(resultIndex);
          this.stats.nullPropagations++;
        } else {
          const a = Number(result.values[resultIndex]) || 0;
          const b = Number(temp2.values[i]) || 0;
          result.values[resultIndex] = op(a, b);
        }
      }
    }
  }

  /**
   * Binary arithmetic operations
   */
  private evaluateBinaryArithmetic(
    operands: ExpressionAST[], 
    docs: any[], 
    result: VectorResult, 
    start: number, 
    end: number,
    op: (a: number, b: number) => number | null
  ): void {
    const temp1: VectorResult = {
      values: new Array(end - start),
      nullMask: new NullMask(end - start),
      length: end - start
    };
    const temp2: VectorResult = {
      values: new Array(end - start),
      nullMask: new NullMask(end - start),
      length: end - start
    };

    this.evaluateNode(operands[0], docs, temp1, 0, end - start);
    this.evaluateNode(operands[1], docs, temp2, 0, end - start);

    for (let i = 0; i < end - start; i++) {
      const resultIndex = start + i;
      
      if (temp1.nullMask.isNull(i) || temp2.nullMask.isNull(i)) {
        result.values[resultIndex] = null;
        result.nullMask.setNull(resultIndex);
        this.stats.nullPropagations++;
      } else {
        const a = Number(temp1.values[i]) || 0;
        const b = Number(temp2.values[i]) || 0;
        const opResult = op(a, b);
        
        if (opResult === null) {
          result.values[resultIndex] = null;
          result.nullMask.setNull(resultIndex);
        } else {
          result.values[resultIndex] = opResult;
        }
      }
    }
  }

  /**
   * Comparison operations
   */
  private evaluateComparison(
    operands: ExpressionAST[], 
    docs: any[], 
    result: VectorResult, 
    start: number, 
    end: number,
    compare: (a: any, b: any) => boolean
  ): void {
    const temp1: VectorResult = {
      values: new Array(end - start),
      nullMask: new NullMask(end - start),
      length: end - start
    };
    const temp2: VectorResult = {
      values: new Array(end - start),
      nullMask: new NullMask(end - start),
      length: end - start
    };

    this.evaluateNode(operands[0], docs, temp1, 0, end - start);
    this.evaluateNode(operands[1], docs, temp2, 0, end - start);

    for (let i = 0; i < end - start; i++) {
      const resultIndex = start + i;
      
      if (temp1.nullMask.isNull(i) || temp2.nullMask.isNull(i)) {
        result.values[resultIndex] = false; // MongoDB comparison with null = false
      } else {
        result.values[resultIndex] = compare(temp1.values[i], temp2.values[i]);
      }
    }
  }

  /**
   * String concatenation
   */
  private evaluateStringConcat(
    operands: ExpressionAST[], 
    docs: any[], 
    result: VectorResult, 
    start: number, 
    end: number
  ): void {
    const tempResults: VectorResult[] = operands.map(() => ({
      values: new Array(end - start),
      nullMask: new NullMask(end - start),
      length: end - start
    }));

    // Evaluate all operands
    operands.forEach((operand, opIndex) => {
      this.evaluateNode(operand, docs, tempResults[opIndex], 0, end - start);
    });

    // Concatenate results
    for (let i = 0; i < end - start; i++) {
      const resultIndex = start + i;
      let hasNull = false;
      const parts: string[] = [];

      for (let opIndex = 0; opIndex < operands.length; opIndex++) {
        if (tempResults[opIndex].nullMask.isNull(i)) {
          hasNull = true;
          break;
        }
        parts.push(String(tempResults[opIndex].values[i]));
      }

      if (hasNull) {
        result.values[resultIndex] = null;
        result.nullMask.setNull(resultIndex);
        this.stats.nullPropagations++;
      } else {
        result.values[resultIndex] = parts.join('');
      }
    }
  }

  /**
   * Conditional evaluation ($cond, $switch)
   */
  private evaluateConditional(ast: ExpressionAST, docs: any[], result: VectorResult, start: number, end: number): void {
    // Fallback to simple evaluation for now - could be vectorized further
    for (let i = start; i < end; i++) {
      result.values[i] = this.evaluateScalar(ast, docs[i]);
      if (result.values[i] == null) {
        result.nullMask.setNull(i);
      }
    }
  }

  /**
   * Scalar evaluation fallback for complex expressions
   */
  private evaluateScalar(ast: ExpressionAST, doc: any): DocumentValue {
    switch (ast.type) {
      case 'literal':
        return ast.value!;
        
      case 'field':
        return this.getFieldValue(doc, ast.field!);
        
      case 'operator':
        const operands = ast.operands || [];
        const values = operands.map(op => this.evaluateScalar(op, doc));
        
        switch (ast.operator) {
          case '$cond':
            if (values.length === 3) {
              return values[0] ? values[1] : values[2];
            }
            return null;
            
          default:
            return null;
        }
        
      default:
        return null;
    }
  }

  /**
   * Get field value using dot notation
   */
  private getFieldValue(doc: any, path: string): DocumentValue {
    const parts = path.split('.');
    let current = doc;
    
    for (const part of parts) {
      if (current == null) return null;
      current = current[part];
    }
    
    return current;
  }

  /**
   * Get interpreter statistics
   */
  getStats(): InterpreterStats {
    return { ...this.stats };
  }

  /**
   * Clear statistics
   */
  clearStats(): void {
    this.stats = {
      totalEvaluations: 0,
      vectorOperations: 0,
      nullPropagations: 0,
      avgBatchSize: 0,
      totalProcessingTimeMs: 0
    };
  }
}