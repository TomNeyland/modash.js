/**
 * Advanced Vectorization Engine for Numerical Operations
 * 
 * Leverages typed arrays and SIMD-like operations for maximum performance
 * on numerical aggregations, filters, and transformations.
 */

import type { Document, DocumentValue } from './expressions';
import type { Expression } from '../index';

interface VectorizedField {
  name: string;
  values: Float64Array;
  type: 'number' | 'date' | 'boolean';
  isNullable: boolean;
  nullMask?: Uint8Array;
}

interface VectorizedCollection {
  fields: Map<string, VectorizedField>;
  length: number;
  originalIndices?: Uint32Array;
}

interface VectorOperation {
  type: 'arithmetic' | 'comparison' | 'aggregation' | 'filter';
  operation: string;
  inputs: string[];
  output?: string;
  scalar?: number;
  predicate?: Uint8Array;
}

/**
 * Advanced vectorization engine for numerical operations
 */
export class AdvancedVectorization {
  private static readonly VECTORIZATION_THRESHOLD = 1000;
  private static readonly BATCH_SIZE = 256; // AVX2-friendly size
  
  private scratchBuffers = new Map<string, Float64Array>();
  private maskBuffers = new Map<string, Uint8Array>();

  /**
   * Convert collection to vectorized format
   */
  vectorizeCollection<T extends Document>(
    collection: T[],
    numericalFields: string[] = []
  ): VectorizedCollection | null {
    if (collection.length < AdvancedVectorization.VECTORIZATION_THRESHOLD) {
      return null;
    }

    const fieldsToVectorize = numericalFields.length > 0 
      ? numericalFields 
      : this.detectNumericalFields(collection);

    if (fieldsToVectorize.length === 0) {
      return null;
    }

    return this.createVectorizedCollection(collection, fieldsToVectorize);
  }

  /**
   * Execute vectorized arithmetic operations
   */
  executeVectorizedArithmetic(
    vectorized: VectorizedCollection,
    operations: VectorOperation[]
  ): VectorizedCollection {
    const result: VectorizedCollection = {
      fields: new Map(vectorized.fields),
      length: vectorized.length,
      originalIndices: vectorized.originalIndices
    };

    for (const op of operations) {
      this.executeVectorOperation(result, op);
    }

    return result;
  }

  /**
   * Vectorized filter operation
   */
  vectorizedFilter(
    vectorized: VectorizedCollection,
    filterOps: VectorOperation[]
  ): VectorizedCollection {
    let mask = this.createMask(vectorized.length, true); // Start with all true

    // Apply all filter operations
    for (const op of filterOps) {
      const opMask = this.executeFilterOperation(vectorized, op);
      if (opMask) {
        mask = this.andMasks(mask, opMask);
      }
    }

    return this.applyMask(vectorized, mask);
  }

  /**
   * Vectorized aggregation operations
   */
  vectorizedAggregate(
    vectorized: VectorizedCollection,
    aggregations: { field: string; operation: string }[]
  ): Record<string, number> {
    const results: Record<string, number> = {};

    for (const { field, operation } of aggregations) {
      const fieldData = vectorized.fields.get(field);
      if (!fieldData) continue;

      switch (operation) {
        case 'sum':
          results[`${field}_sum`] = this.vectorizedSum(fieldData.values, fieldData.nullMask);
          break;
        case 'avg':
          const { sum, count } = this.vectorizedSumCount(fieldData.values, fieldData.nullMask);
          results[`${field}_avg`] = count > 0 ? sum / count : 0;
          break;
        case 'min':
          results[`${field}_min`] = this.vectorizedMin(fieldData.values, fieldData.nullMask);
          break;
        case 'max':
          results[`${field}_max`] = this.vectorizedMax(fieldData.values, fieldData.nullMask);
          break;
        case 'count':
          results[`${field}_count`] = this.vectorizedCount(fieldData.nullMask);
          break;
      }
    }

    return results;
  }

  /**
   * Convert vectorized collection back to documents
   */
  materializeVectorized(vectorized: VectorizedCollection): Document[] {
    const documents: Document[] = new Array(vectorized.length);

    // Initialize documents
    for (let i = 0; i < vectorized.length; i++) {
      documents[i] = {};
    }

    // Populate fields using vectorized data
    for (const [fieldName, fieldData] of vectorized.fields) {
      for (let i = 0; i < vectorized.length; i++) {
        if (!fieldData.nullMask || fieldData.nullMask[i]) {
          documents[i][fieldName] = this.convertFromVector(fieldData.values[i], fieldData.type);
        } else {
          documents[i][fieldName] = null;
        }
      }
    }

    return documents;
  }

  /**
   * Detect numerical fields in collection
   */
  private detectNumericalFields<T extends Document>(collection: T[]): string[] {
    const fieldTypes = new Map<string, { numbers: number; total: number }>();
    const sampleSize = Math.min(100, collection.length);

    // Sample documents to detect numerical fields
    for (let i = 0; i < sampleSize; i++) {
      const doc = collection[Math.floor(i * collection.length / sampleSize)];
      
      for (const [field, value] of Object.entries(doc)) {
        if (!fieldTypes.has(field)) {
          fieldTypes.set(field, { numbers: 0, total: 0 });
        }
        
        const stats = fieldTypes.get(field)!;
        stats.total++;
        
        if (typeof value === 'number' || 
            value instanceof Date || 
            typeof value === 'boolean') {
          stats.numbers++;
        }
      }
    }

    // Return fields that are mostly numerical
    return Array.from(fieldTypes.entries())
      .filter(([_, stats]) => stats.numbers / stats.total >= 0.8)
      .map(([field]) => field)
      .slice(0, 16); // Limit to avoid memory issues
  }

  /**
   * Create vectorized collection from documents
   */
  private createVectorizedCollection<T extends Document>(
    collection: T[],
    fields: string[]
  ): VectorizedCollection {
    const vectorizedFields = new Map<string, VectorizedField>();
    const length = collection.length;

    for (const fieldName of fields) {
      const values = new Float64Array(length);
      const nullMask = new Uint8Array(length);
      let fieldType: 'number' | 'date' | 'boolean' = 'number';
      let hasNulls = false;

      // Extract and convert values
      for (let i = 0; i < length; i++) {
        const value = this.getNestedValue(collection[i], fieldName);
        
        if (value === null || value === undefined) {
          values[i] = NaN;
          nullMask[i] = 0;
          hasNulls = true;
        } else {
          nullMask[i] = 1;
          
          if (typeof value === 'number') {
            values[i] = value;
            fieldType = 'number';
          } else if (value instanceof Date) {
            values[i] = value.getTime();
            fieldType = 'date';
          } else if (typeof value === 'boolean') {
            values[i] = value ? 1 : 0;
            fieldType = 'boolean';
          } else {
            // Try to convert to number
            const num = parseFloat(String(value));
            values[i] = isNaN(num) ? 0 : num;
          }
        }
      }

      vectorizedFields.set(fieldName, {
        name: fieldName,
        values,
        type: fieldType,
        isNullable: hasNulls,
        nullMask: hasNulls ? nullMask : undefined
      });
    }

    return {
      fields: vectorizedFields,
      length,
      originalIndices: new Uint32Array(Array.from({ length }, (_, i) => i))
    };
  }

  /**
   * Execute vector operation
   */
  private executeVectorOperation(
    vectorized: VectorizedCollection,
    op: VectorOperation
  ): void {
    const length = vectorized.length;
    
    switch (op.type) {
      case 'arithmetic':
        this.executeArithmeticOperation(vectorized, op, length);
        break;
      case 'comparison':
        this.executeComparisonOperation(vectorized, op, length);
        break;
    }
  }

  /**
   * Execute arithmetic operation
   */
  private executeArithmeticOperation(
    vectorized: VectorizedCollection,
    op: VectorOperation,
    length: number
  ): void {
    if (!op.output) return;

    const result = new Float64Array(length);
    const resultMask = new Uint8Array(length);
    
    if (op.inputs.length === 1) {
      // Unary operation
      const input = vectorized.fields.get(op.inputs[0]);
      if (!input) return;

      this.executeUnaryArithmetic(
        input.values, input.nullMask, 
        result, resultMask,
        op.operation, op.scalar || 0
      );
    } else if (op.inputs.length === 2) {
      // Binary operation
      const input1 = vectorized.fields.get(op.inputs[0]);
      const input2 = vectorized.fields.get(op.inputs[1]);
      if (!input1 || !input2) return;

      this.executeBinaryArithmetic(
        input1.values, input1.nullMask,
        input2.values, input2.nullMask,
        result, resultMask,
        op.operation
      );
    }

    vectorized.fields.set(op.output, {
      name: op.output,
      values: result,
      type: 'number',
      isNullable: true,
      nullMask: resultMask
    });
  }

  /**
   * Execute unary arithmetic operation
   */
  private executeUnaryArithmetic(
    input: Float64Array,
    inputMask: Uint8Array | undefined,
    result: Float64Array,
    resultMask: Uint8Array,
    operation: string,
    scalar: number
  ): void {
    const batchSize = AdvancedVectorization.BATCH_SIZE;
    
    for (let i = 0; i < input.length; i += batchSize) {
      const end = Math.min(i + batchSize, input.length);
      
      for (let j = i; j < end; j++) {
        const isValid = !inputMask || inputMask[j];
        
        if (isValid) {
          switch (operation) {
            case 'add':
              result[j] = input[j] + scalar;
              break;
            case 'subtract':
              result[j] = input[j] - scalar;
              break;
            case 'multiply':
              result[j] = input[j] * scalar;
              break;
            case 'divide':
              result[j] = scalar !== 0 ? input[j] / scalar : NaN;
              break;
            case 'abs':
              result[j] = Math.abs(input[j]);
              break;
            case 'sqrt':
              result[j] = Math.sqrt(input[j]);
              break;
            case 'ceil':
              result[j] = Math.ceil(input[j]);
              break;
            case 'floor':
              result[j] = Math.floor(input[j]);
              break;
            default:
              result[j] = input[j];
          }
          resultMask[j] = 1;
        } else {
          result[j] = NaN;
          resultMask[j] = 0;
        }
      }
    }
  }

  /**
   * Execute binary arithmetic operation
   */
  private executeBinaryArithmetic(
    input1: Float64Array,
    mask1: Uint8Array | undefined,
    input2: Float64Array,
    mask2: Uint8Array | undefined,
    result: Float64Array,
    resultMask: Uint8Array,
    operation: string
  ): void {
    const batchSize = AdvancedVectorization.BATCH_SIZE;
    
    for (let i = 0; i < input1.length; i += batchSize) {
      const end = Math.min(i + batchSize, input1.length);
      
      for (let j = i; j < end; j++) {
        const valid1 = !mask1 || mask1[j];
        const valid2 = !mask2 || mask2[j];
        const isValid = valid1 && valid2;
        
        if (isValid) {
          switch (operation) {
            case 'add':
              result[j] = input1[j] + input2[j];
              break;
            case 'subtract':
              result[j] = input1[j] - input2[j];
              break;
            case 'multiply':
              result[j] = input1[j] * input2[j];
              break;
            case 'divide':
              result[j] = input2[j] !== 0 ? input1[j] / input2[j] : NaN;
              break;
            case 'mod':
              result[j] = input1[j] % input2[j];
              break;
            case 'pow':
              result[j] = Math.pow(input1[j], input2[j]);
              break;
            default:
              result[j] = input1[j];
          }
          resultMask[j] = 1;
        } else {
          result[j] = NaN;
          resultMask[j] = 0;
        }
      }
    }
  }

  /**
   * Execute comparison operation
   */
  private executeComparisonOperation(
    vectorized: VectorizedCollection,
    op: VectorOperation,
    length: number
  ): void {
    // Comparison operations return boolean masks
    // This would be used for filtering
  }

  /**
   * Execute filter operation and return mask
   */
  private executeFilterOperation(
    vectorized: VectorizedCollection,
    op: VectorOperation
  ): Uint8Array | null {
    if (op.inputs.length === 0) return null;

    const field = vectorized.fields.get(op.inputs[0]);
    if (!field) return null;

    const mask = new Uint8Array(vectorized.length);
    const scalar = op.scalar || 0;

    for (let i = 0; i < vectorized.length; i++) {
      const value = field.values[i];
      const isValid = !field.nullMask || field.nullMask[i];
      
      if (!isValid) {
        mask[i] = 0;
        continue;
      }

      switch (op.operation) {
        case 'gt':
          mask[i] = value > scalar ? 1 : 0;
          break;
        case 'gte':
          mask[i] = value >= scalar ? 1 : 0;
          break;
        case 'lt':
          mask[i] = value < scalar ? 1 : 0;
          break;
        case 'lte':
          mask[i] = value <= scalar ? 1 : 0;
          break;
        case 'eq':
          mask[i] = value === scalar ? 1 : 0;
          break;
        case 'ne':
          mask[i] = value !== scalar ? 1 : 0;
          break;
        default:
          mask[i] = 1;
      }
    }

    return mask;
  }

  /**
   * Vectorized sum operation
   */
  private vectorizedSum(values: Float64Array, mask?: Uint8Array): number {
    let sum = 0;
    const batchSize = AdvancedVectorization.BATCH_SIZE;
    
    for (let i = 0; i < values.length; i += batchSize) {
      const end = Math.min(i + batchSize, values.length);
      let batchSum = 0;
      
      for (let j = i; j < end; j++) {
        if (!mask || mask[j]) {
          batchSum += values[j];
        }
      }
      
      sum += batchSum;
    }
    
    return sum;
  }

  /**
   * Vectorized sum and count operation
   */
  private vectorizedSumCount(values: Float64Array, mask?: Uint8Array): { sum: number; count: number } {
    let sum = 0;
    let count = 0;
    const batchSize = AdvancedVectorization.BATCH_SIZE;
    
    for (let i = 0; i < values.length; i += batchSize) {
      const end = Math.min(i + batchSize, values.length);
      let batchSum = 0;
      let batchCount = 0;
      
      for (let j = i; j < end; j++) {
        if (!mask || mask[j]) {
          batchSum += values[j];
          batchCount++;
        }
      }
      
      sum += batchSum;
      count += batchCount;
    }
    
    return { sum, count };
  }

  /**
   * Vectorized min operation
   */
  private vectorizedMin(values: Float64Array, mask?: Uint8Array): number {
    let min = Infinity;
    
    for (let i = 0; i < values.length; i++) {
      if ((!mask || mask[i]) && values[i] < min) {
        min = values[i];
      }
    }
    
    return min === Infinity ? NaN : min;
  }

  /**
   * Vectorized max operation
   */
  private vectorizedMax(values: Float64Array, mask?: Uint8Array): number {
    let max = -Infinity;
    
    for (let i = 0; i < values.length; i++) {
      if ((!mask || mask[i]) && values[i] > max) {
        max = values[i];
      }
    }
    
    return max === -Infinity ? NaN : max;
  }

  /**
   * Vectorized count operation
   */
  private vectorizedCount(mask?: Uint8Array): number {
    if (!mask) return 0;
    
    let count = 0;
    const batchSize = AdvancedVectorization.BATCH_SIZE;
    
    for (let i = 0; i < mask.length; i += batchSize) {
      const end = Math.min(i + batchSize, mask.length);
      let batchCount = 0;
      
      for (let j = i; j < end; j++) {
        batchCount += mask[j];
      }
      
      count += batchCount;
    }
    
    return count;
  }

  /**
   * Create boolean mask
   */
  private createMask(length: number, value: boolean): Uint8Array {
    const mask = new Uint8Array(length);
    if (value) {
      mask.fill(1);
    }
    return mask;
  }

  /**
   * AND two boolean masks
   */
  private andMasks(mask1: Uint8Array, mask2: Uint8Array): Uint8Array {
    const result = new Uint8Array(mask1.length);
    
    for (let i = 0; i < mask1.length; i++) {
      result[i] = mask1[i] && mask2[i] ? 1 : 0;
    }
    
    return result;
  }

  /**
   * Apply mask to vectorized collection
   */
  private applyMask(
    vectorized: VectorizedCollection,
    mask: Uint8Array
  ): VectorizedCollection {
    // Count valid entries
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) count++;
    }

    const result: VectorizedCollection = {
      fields: new Map(),
      length: count,
      originalIndices: new Uint32Array(count)
    };

    let resultIndex = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        if (vectorized.originalIndices) {
          result.originalIndices![resultIndex] = vectorized.originalIndices[i];
        }
        resultIndex++;
      }
    }

    // Copy fields with mask applied
    for (const [fieldName, fieldData] of vectorized.fields) {
      const newValues = new Float64Array(count);
      const newMask = fieldData.nullMask ? new Uint8Array(count) : undefined;
      
      resultIndex = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          newValues[resultIndex] = fieldData.values[i];
          if (newMask && fieldData.nullMask) {
            newMask[resultIndex] = fieldData.nullMask[i];
          }
          resultIndex++;
        }
      }

      result.fields.set(fieldName, {
        name: fieldName,
        values: newValues,
        type: fieldData.type,
        isNullable: fieldData.isNullable,
        nullMask: newMask
      });
    }

    return result;
  }

  /**
   * Get nested field value
   */
  private getNestedValue(doc: Document, fieldPath: string): DocumentValue {
    if (!fieldPath.includes('.')) {
      return doc[fieldPath];
    }

    const parts = fieldPath.split('.');
    let value: any = doc;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    return value;
  }

  /**
   * Convert from vector format back to original type
   */
  private convertFromVector(value: number, type: 'number' | 'date' | 'boolean'): DocumentValue {
    if (isNaN(value)) return null;
    
    switch (type) {
      case 'number':
        return value;
      case 'date':
        return new Date(value);
      case 'boolean':
        return value > 0;
      default:
        return value;
    }
  }

  /**
   * Get vectorization statistics
   */
  getStats() {
    return {
      threshold: AdvancedVectorization.VECTORIZATION_THRESHOLD,
      batchSize: AdvancedVectorization.BATCH_SIZE,
      scratchBuffers: this.scratchBuffers.size,
      maskBuffers: this.maskBuffers.size
    };
  }

  /**
   * Clear scratch buffers
   */
  clearBuffers(): void {
    this.scratchBuffers.clear();
    this.maskBuffers.clear();
  }
}

/**
 * Check if operation would benefit from vectorization
 */
export function shouldUseVectorization<T extends Document>(
  collection: T[],
  operations: string[]
): boolean {
  if (collection.length < AdvancedVectorization.VECTORIZATION_THRESHOLD) {
    return false;
  }

  // Check if operations are vectorizable
  const vectorizableOps = ['$add', '$subtract', '$multiply', '$divide', '$sum', '$avg', '$min', '$max'];
  return operations.some(op => vectorizableOps.includes(op));
}

// Singleton instance for global use
export const advancedVectorization = new AdvancedVectorization();