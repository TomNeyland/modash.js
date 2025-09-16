/**
 * Structure-of-Arrays (SoA) Accumulators for High-Performance $group Operations
 *
 * Provides cache-friendly data layout and vectorized operations
 * for common aggregation functions ($sum, $avg, $min, $max, etc.)
 */

import { $expression, type Document, type DocumentValue } from './expressions';
import type { Expression } from '../index';

/**
 * Structure-of-Arrays accumulator for efficient aggregation
 */
export class SoAAccumulator {
  // Parallel arrays for different data types
  private numbers: Float64Array;
  private strings: string[];
  private objects: any[];
  private masks: Uint8Array; // Bitmask for which array each element uses

  // Type constants
  private static readonly TYPE_NUMBER = 0;
  private static readonly TYPE_STRING = 1;
  private static readonly TYPE_OBJECT = 2;
  private static readonly TYPE_NULL = 3;
  private static readonly TYPE_UNDEFINED = 4;

  private size = 0;
  private capacity: number;

  constructor(initialCapacity = 64) {
    this.capacity = initialCapacity;
    this.numbers = new Float64Array(initialCapacity);
    this.strings = new Array(initialCapacity);
    this.objects = new Array(initialCapacity);
    this.masks = new Uint8Array(initialCapacity);
  }

  /**
   * Add a value to the accumulator
   */
  add(value: DocumentValue): void {
    if (this.size >= this.capacity) {
      this.resize();
    }

    const index = this.size++;

    if (typeof value === 'number') {
      this.numbers[index] = value;
      this.masks[index] = SoAAccumulator.TYPE_NUMBER;
    } else if (typeof value === 'string') {
      this.strings[index] = value;
      this.masks[index] = SoAAccumulator.TYPE_STRING;
    } else if (value === null) {
      this.masks[index] = SoAAccumulator.TYPE_NULL;
    } else if (value === undefined) {
      this.masks[index] = SoAAccumulator.TYPE_UNDEFINED;
    } else {
      this.objects[index] = value;
      this.masks[index] = SoAAccumulator.TYPE_OBJECT;
    }
  }

  /**
   * Resize arrays when capacity is exceeded
   */
  private resize(): void {
    const newCapacity = this.capacity * 2;

    // Resize typed array
    const newNumbers = new Float64Array(newCapacity);
    newNumbers.set(this.numbers);
    this.numbers = newNumbers;

    // Resize regular arrays
    this.strings.length = newCapacity;
    this.objects.length = newCapacity;

    // Resize mask array
    const newMasks = new Uint8Array(newCapacity);
    newMasks.set(this.masks);
    this.masks = newMasks;

    this.capacity = newCapacity;
  }

  /**
   * Calculate sum of numeric values
   */
  sum(): number {
    let sum = 0;

    // Vectorized operation over numbers array
    for (let i = 0; i < this.size; i++) {
      if (this.masks[i] === SoAAccumulator.TYPE_NUMBER) {
        sum += this.numbers[i];
      }
    }

    return sum;
  }

  /**
   * Calculate average of numeric values
   */
  avg(): number {
    let sum = 0;
    let count = 0;

    for (let i = 0; i < this.size; i++) {
      if (this.masks[i] === SoAAccumulator.TYPE_NUMBER) {
        sum += this.numbers[i];
        count++;
      }
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * Find minimum numeric value
   */
  min(): number {
    let min = Infinity;

    for (let i = 0; i < this.size; i++) {
      if (this.masks[i] === SoAAccumulator.TYPE_NUMBER) {
        min = Math.min(min, this.numbers[i]);
      }
    }

    return min === Infinity ? 0 : min;
  }

  /**
   * Find maximum numeric value
   */
  max(): number {
    let max = -Infinity;

    for (let i = 0; i < this.size; i++) {
      if (this.masks[i] === SoAAccumulator.TYPE_NUMBER) {
        max = Math.max(max, this.numbers[i]);
      }
    }

    return max === -Infinity ? 0 : max;
  }

  /**
   * Get first value
   */
  first(): DocumentValue {
    if (this.size === 0) return null;

    const type = this.masks[0];
    switch (type) {
      case SoAAccumulator.TYPE_NUMBER:
        return this.numbers[0];
      case SoAAccumulator.TYPE_STRING:
        return this.strings[0];
      case SoAAccumulator.TYPE_OBJECT:
        return this.objects[0];
      case SoAAccumulator.TYPE_UNDEFINED:
        return undefined;
      default:
        return null;
    }
  }

  /**
   * Get last value
   */
  last(): DocumentValue {
    if (this.size === 0) return null;

    const index = this.size - 1;
    const type = this.masks[index];
    switch (type) {
      case SoAAccumulator.TYPE_NUMBER:
        return this.numbers[index];
      case SoAAccumulator.TYPE_STRING:
        return this.strings[index];
      case SoAAccumulator.TYPE_OBJECT:
        return this.objects[index];
      case SoAAccumulator.TYPE_UNDEFINED:
        return undefined;
      default:
        return null;
    }
  }

  /**
   * Push all values to an array
   */
  push(): DocumentValue[] {
    const result: DocumentValue[] = [];

    for (let i = 0; i < this.size; i++) {
      const type = this.masks[i];
      switch (type) {
        case SoAAccumulator.TYPE_NUMBER:
          result.push(this.numbers[i]);
          break;
        case SoAAccumulator.TYPE_STRING:
          result.push(this.strings[i]);
          break;
        case SoAAccumulator.TYPE_OBJECT:
          result.push(this.objects[i]);
          break;
        case SoAAccumulator.TYPE_UNDEFINED:
          // Preserve explicit undefined values in $push semantics
          result.push(undefined);
          break;
        default:
          result.push(null);
          break;
      }
    }

    return result;
  }

  /**
   * Add to set (unique values only)
   */
  addToSet(): DocumentValue[] {
    const seen = new Set<string>();
    const result: DocumentValue[] = [];

    for (let i = 0; i < this.size; i++) {
      const type = this.masks[i];
      let value: DocumentValue;

      switch (type) {
        case SoAAccumulator.TYPE_NUMBER:
          value = this.numbers[i];
          break;
        case SoAAccumulator.TYPE_STRING:
          value = this.strings[i];
          break;
        case SoAAccumulator.TYPE_OBJECT:
          value = this.objects[i];
          break;
        default:
          value = null;
          break;
      }

      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(value);
      }
    }

    return result;
  }

  /**
   * Get count of non-null values
   */
  count(): number {
    let count = 0;

    for (let i = 0; i < this.size; i++) {
      if (this.masks[i] !== SoAAccumulator.TYPE_NULL) {
        count++;
      }
    }

    return count;
  }

  /**
   * Clear accumulator for reuse
   */
  clear(): void {
    this.size = 0;
    // Arrays don't need to be cleared, just reset size
  }

  /**
   * Get current size
   */
  getSize(): number {
    return this.size;
  }
}

/**
 * High-performance accumulator factory using SoA layout
 */
export function createSoAAccumulator(
  documents: Document[],
  fieldExpression: Expression
): SoAAccumulator {
  const accumulator = new SoAAccumulator(documents.length);

  // Fast path for simple field references
  if (typeof fieldExpression === 'string' && fieldExpression.startsWith('$')) {
    const fieldName = fieldExpression.slice(1);

    // Direct field access - faster than expression evaluation
    for (const doc of documents) {
      accumulator.add(doc[fieldName]);
    }
  } else {
    // General expression evaluation
    for (const doc of documents) {
      const value = $expression(doc, fieldExpression);
      accumulator.add(value);
    }
  }

  return accumulator;
}

/**
 * Execute accumulator operation with SoA optimization
 */
export function executeSoAAccumulator(
  operator: string,
  documents: Document[],
  fieldExpression: Expression
): DocumentValue {
  const accumulator = createSoAAccumulator(documents, fieldExpression);

  switch (operator) {
    case '$sum':
      return accumulator.sum();
    case '$avg':
      return accumulator.avg();
    case '$min':
      return accumulator.min();
    case '$max':
      return accumulator.max();
    case '$first':
      return accumulator.first();
    case '$last':
      return accumulator.last();
    case '$push':
      return accumulator.push();
    case '$addToSet':
      return accumulator.addToSet();
    default:
      throw new Error(`Unsupported accumulator operator: ${operator}`);
  }
}

/**
 * Batch SoA accumulation for multiple fields
 */
export class BatchSoAAccumulator {
  private accumulators = new Map<string, SoAAccumulator>();

  constructor(private documents: Document[]) {}

  /**
   * Add accumulator for a field
   */
  addField(fieldName: string, expression: Expression): void {
    this.accumulators.set(
      fieldName,
      createSoAAccumulator(this.documents, expression)
    );
  }

  /**
   * Execute all accumulators
   */
  execute(operators: Record<string, string>): Record<string, DocumentValue> {
    const result: Record<string, DocumentValue> = {};

    for (const [fieldName, operator] of Object.entries(operators)) {
      const accumulator = this.accumulators.get(fieldName);
      if (!accumulator) {
        throw new Error(`No accumulator found for field: ${fieldName}`);
      }

      switch (operator) {
        case '$sum':
          result[fieldName] = accumulator.sum();
          break;
        case '$avg':
          result[fieldName] = accumulator.avg();
          break;
        case '$min':
          result[fieldName] = accumulator.min();
          break;
        case '$max':
          result[fieldName] = accumulator.max();
          break;
        case '$first':
          result[fieldName] = accumulator.first();
          break;
        case '$last':
          result[fieldName] = accumulator.last();
          break;
        case '$push':
          result[fieldName] = accumulator.push();
          break;
        case '$addToSet':
          result[fieldName] = accumulator.addToSet();
          break;
        default:
          throw new Error(`Unsupported accumulator operator: ${operator}`);
      }
    }

    return result;
  }
}
