/**
 * Phase 9: Columnar SoA Vector Types for Zero-Allocation IVM Engine
 *
 * Implements Structure-of-Arrays (SoA) vectors for cache-efficient data processing:
 * - Int32/Int64 vectors for integer data
 * - Float64 vectors for numeric data
 * - BigInt64 vectors for large integers
 * - Bool vectors using packed bitmasks
 * - Utf8 vectors using dictionary encoding + string pool
 * - Selection vectors (Uint32Array) for active row tracking
 * - Validity bitmaps for null/undefined handling
 */

import { DocumentValue } from './expressions';

/**
 * Schema information for columnar processing
 */
export interface ColumnarSchema {
  fields: Map<string, FieldType>;
  estimatedRowCount?: number;
  keyFields?: string[]; // Fields used for grouping/joining
}

export enum FieldType {
  INT32 = 'int32',
  INT64 = 'int64',
  FLOAT64 = 'float64',
  BIGINT64 = 'bigint64',
  BOOL = 'bool',
  UTF8 = 'utf8',
  MIXED = 'mixed', // Fallback for complex types
}
export interface ColumnarVector {
  readonly length: number;
  readonly capacity: number;
  get(index: number): DocumentValue;
  set(index: number, value: DocumentValue): void;
  resize(newCapacity: number): void;
  clear(): void;
}

/**
 * Selection vector for tracking active row IDs
 * Uses Uint32Array for efficient iteration and memory access
 */
export class SelectionVector {
  private data: Uint32Array;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.data = new Uint32Array(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  get(index: number): number {
    if (index >= this._length) throw new Error(`Index ${index} out of bounds`);
    return this.data[index];
  }

  set(index: number, rowId: number): void {
    if (index >= this.data.length) {
      this.resize(Math.max(this.data.length * 2, index + 1));
    }
    this.data[index] = rowId;
    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  push(rowId: number): void {
    this.set(this._length, rowId);
  }

  resize(newCapacity: number): void {
    const newData = new Uint32Array(newCapacity);
    newData.set(this.data.subarray(0, Math.min(this._length, newCapacity)));
    this.data = newData;
  }

  clear(): void {
    this._length = 0;
  }

  /** Get underlying typed array for vectorized operations */
  getBuffer(): Uint32Array {
    return this.data.subarray(0, this._length);
  }

  /** Copy from another selection vector */
  copyFrom(other: SelectionVector): void {
    if (other._length > this.data.length) {
      this.resize(other._length);
    }
    this.data.set(other.data.subarray(0, other._length));
    this._length = other._length;
  }
}

/**
 * Validity bitmap for null/undefined tracking using packed bits
 * Each bit represents whether a value at that index is valid (non-null)
 */
export class ValidityBitmap {
  private data: Uint32Array;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    // Each Uint32 holds 32 bits, so we need capacity/32 elements
    this.data = new Uint32Array(Math.ceil(capacity / 32));
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length * 32;
  }

  isValid(index: number): boolean {
    if (index >= this._length) return false;
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    return (this.data[wordIndex] & (1 << bitIndex)) !== 0;
  }

  setValid(index: number, valid: boolean): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;

    if (valid) {
      this.data[wordIndex] |= 1 << bitIndex;
    } else {
      this.data[wordIndex] &= ~(1 << bitIndex);
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new Uint32Array(Math.ceil(newCapacity / 32));
    newData.set(this.data);
    this.data = newData;
  }

  clear(): void {
    this.data.fill(0);
    this._length = 0;
  }

  /** Count valid (non-null) values */
  countValid(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.isValid(i)) count++;
    }
    return count;
  }
}

/**
 * Int32 vector for 32-bit integer data
 */
export class Int32Vector implements ColumnarVector {
  private data: Int32Array;
  private validity: ValidityBitmap;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.data = new Int32Array(capacity);
    this.validity = new ValidityBitmap(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  get(index: number): DocumentValue {
    if (!this.validity.isValid(index)) return null;
    return this.data[index];
  }

  set(index: number, value: DocumentValue): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    if (value === null || value === undefined) {
      this.validity.setValid(index, false);
    } else {
      const intValue =
        typeof value === 'number'
          ? Math.floor(value)
          : parseInt(String(value), 10);
      if (!isNaN(intValue)) {
        this.data[index] = intValue;
        this.validity.setValid(index, true);
      } else {
        this.validity.setValid(index, false);
      }
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new Int32Array(newCapacity);
    newData.set(this.data);
    this.data = newData;
    this.validity.resize(newCapacity);
  }

  clear(): void {
    this._length = 0;
    this.validity.clear();
  }

  /** Get underlying typed array for vectorized operations */
  getBuffer(): Int32Array {
    return this.data.subarray(0, this._length);
  }

  /** Sum all valid values (vectorized) */
  sum(): number {
    let result = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.validity.isValid(i)) {
        result += this.data[i];
      }
    }
    return result;
  }
}

/**
 * Int64 vector for 64-bit integer data using regular numbers
 * (JavaScript numbers can safely represent integers up to 2^53)
 */
export class Int64Vector implements ColumnarVector {
  private data: Float64Array; // Use Float64Array for full range
  private validity: ValidityBitmap;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.data = new Float64Array(capacity);
    this.validity = new ValidityBitmap(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  get(index: number): DocumentValue {
    if (!this.validity.isValid(index)) return null;
    return this.data[index];
  }

  set(index: number, value: DocumentValue): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    if (value === null || value === undefined) {
      this.validity.setValid(index, false);
    } else {
      const numValue =
        typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(numValue) && Number.isSafeInteger(numValue)) {
        this.data[index] = numValue;
        this.validity.setValid(index, true);
      } else {
        this.validity.setValid(index, false);
      }
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new Float64Array(newCapacity);
    newData.set(this.data);
    this.data = newData;
    this.validity.resize(newCapacity);
  }

  clear(): void {
    this._length = 0;
    this.validity.clear();
  }

  getBuffer(): Float64Array {
    return this.data.subarray(0, this._length);
  }
}

/**
 * Float64 vector for floating-point data
 */
export class Float64Vector implements ColumnarVector {
  private data: Float64Array;
  private validity: ValidityBitmap;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.data = new Float64Array(capacity);
    this.validity = new ValidityBitmap(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  get(index: number): DocumentValue {
    if (!this.validity.isValid(index)) return null;
    return this.data[index];
  }

  set(index: number, value: DocumentValue): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    if (value === null || value === undefined) {
      this.validity.setValid(index, false);
    } else {
      const numValue =
        typeof value === 'number' ? value : parseFloat(String(value));
      if (!isNaN(numValue)) {
        this.data[index] = numValue;
        this.validity.setValid(index, true);
      } else {
        this.validity.setValid(index, false);
      }
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new Float64Array(newCapacity);
    newData.set(this.data);
    this.data = newData;
    this.validity.resize(newCapacity);
  }

  clear(): void {
    this._length = 0;
    this.validity.clear();
  }

  getBuffer(): Float64Array {
    return this.data.subarray(0, this._length);
  }

  /** Sum all valid values (vectorized) */
  sum(): number {
    let result = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.validity.isValid(i)) {
        result += this.data[i];
      }
    }
    return result;
  }

  /** Average of all valid values */
  avg(): number {
    const validCount = this.validity.countValid();
    return validCount > 0 ? this.sum() / validCount : 0;
  }
}

/**
 * BigInt64 vector for large integer data
 */
export class BigInt64Vector implements ColumnarVector {
  private data: BigInt64Array;
  private validity: ValidityBitmap;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.data = new BigInt64Array(capacity);
    this.validity = new ValidityBitmap(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length;
  }

  get(index: number): DocumentValue {
    if (!this.validity.isValid(index)) return null;
    return Number(this.data[index]); // Convert back to regular number for API compatibility
  }

  set(index: number, value: DocumentValue): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    if (value === null || value === undefined) {
      this.validity.setValid(index, false);
    } else {
      try {
        const bigIntValue =
          typeof value === 'bigint' ? value : BigInt(String(value));
        this.data[index] = bigIntValue;
        this.validity.setValid(index, true);
      } catch (_e) {
        this.validity.setValid(index, false);
      }
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new BigInt64Array(newCapacity);
    newData.set(this.data);
    this.data = newData;
    this.validity.resize(newCapacity);
  }

  clear(): void {
    this._length = 0;
    this.validity.clear();
  }

  getBuffer(): BigInt64Array {
    return this.data.subarray(0, this._length);
  }
}

/**
 * Boolean vector using packed bitmask for space efficiency
 */
export class BoolVector implements ColumnarVector {
  private data: Uint32Array; // Packed bitmask
  private validity: ValidityBitmap;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.data = new Uint32Array(Math.ceil(capacity / 32));
    this.validity = new ValidityBitmap(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.data.length * 32;
  }

  get(index: number): DocumentValue {
    if (!this.validity.isValid(index)) return null;
    const wordIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    return (this.data[wordIndex] & (1 << bitIndex)) !== 0;
  }

  set(index: number, value: DocumentValue): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    if (value === null || value === undefined) {
      this.validity.setValid(index, false);
    } else {
      const boolValue = Boolean(value);
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;

      if (boolValue) {
        this.data[wordIndex] |= 1 << bitIndex;
      } else {
        this.data[wordIndex] &= ~(1 << bitIndex);
      }

      this.validity.setValid(index, true);
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new Uint32Array(Math.ceil(newCapacity / 32));
    newData.set(this.data);
    this.data = newData;
    this.validity.resize(newCapacity);
  }

  clear(): void {
    this.data.fill(0);
    this._length = 0;
    this.validity.clear();
  }

  /** Count true values */
  countTrue(): number {
    let count = 0;
    for (let i = 0; i < this._length; i++) {
      if (this.validity.isValid(i) && this.get(i)) {
        count++;
      }
    }
    return count;
  }
}

/**
 * UTF-8 string vector using dictionary encoding + string pool
 * Stores string IDs in Uint32Array, actual strings in separate pool
 */
export class Utf8Vector implements ColumnarVector {
  private dictIds: Uint32Array; // Dictionary IDs
  private stringPool: string[] = []; // String pool
  private stringToId: Map<string, number> = new Map(); // Reverse lookup
  private validity: ValidityBitmap;
  private _length: number = 0;

  constructor(capacity: number = 1024) {
    this.dictIds = new Uint32Array(capacity);
    this.validity = new ValidityBitmap(capacity);
  }

  get length(): number {
    return this._length;
  }

  get capacity(): number {
    return this.dictIds.length;
  }

  get(index: number): DocumentValue {
    if (!this.validity.isValid(index)) return null;
    const dictId = this.dictIds[index];
    return this.stringPool[dictId] || null;
  }

  set(index: number, value: DocumentValue): void {
    if (index >= this.capacity) {
      this.resize(Math.max(this.capacity * 2, index + 1));
    }

    if (value === null || value === undefined) {
      this.validity.setValid(index, false);
    } else {
      const strValue = String(value);
      let dictId = this.stringToId.get(strValue);

      if (dictId === undefined) {
        // Add new string to pool
        dictId = this.stringPool.length;
        this.stringPool.push(strValue);
        this.stringToId.set(strValue, dictId);
      }

      this.dictIds[index] = dictId;
      this.validity.setValid(index, true);
    }

    if (index >= this._length) {
      this._length = index + 1;
    }
  }

  resize(newCapacity: number): void {
    const newData = new Uint32Array(newCapacity);
    newData.set(this.dictIds);
    this.dictIds = newData;
    this.validity.resize(newCapacity);
  }

  clear(): void {
    this._length = 0;
    this.dictIds.fill(0);
    this.stringPool.length = 0;
    this.stringToId.clear();
    this.validity.clear();
  }

  /** Get dictionary statistics */
  getDictStats(): {
    uniqueStrings: number;
    totalLength: number;
    compressionRatio: number;
  } {
    const uniqueStrings = this.stringPool.length;
    const totalLength = this.stringPool.reduce(
      (sum, str) => sum + str.length,
      0
    );
    const uncompressedSize =
      this._length * (totalLength / Math.max(uniqueStrings, 1));
    const compressedSize = this._length * 4 + totalLength; // 4 bytes per dict ID + string pool

    return {
      uniqueStrings,
      totalLength,
      compressionRatio: uncompressedSize / Math.max(compressedSize, 1),
    };
  }

  /** Get underlying dict ID array for vectorized operations */
  getDictIds(): Uint32Array {
    return this.dictIds.subarray(0, this._length);
  }

  /** Get string pool */
  getStringPool(): readonly string[] {
    return this.stringPool;
  }
}

/**
 * Columnar batch containing multiple typed vectors
 * Represents a fixed-size batch of rows in columnar format
 */
export class ColumnarBatch {
  private vectors: Map<string, ColumnarVector> = new Map();
  private selection: SelectionVector;
  private _length: number = 0;

  readonly batchSize: number;

  constructor(batchSize: number = 1024) {
    this.batchSize = batchSize;
    this.selection = new SelectionVector(batchSize);
  }

  get length(): number {
    return this._length;
  }

  /** Add a vector for a specific field */
  addVector(field: string, vector: ColumnarVector): void {
    this.vectors.set(field, vector);
  }

  /** Get vector for a field */
  getVector(field: string): ColumnarVector | undefined {
    return this.vectors.get(field);
  }

  /** Get selection vector */
  getSelection(): SelectionVector {
    return this.selection;
  }

  /** Set value at specific row and field */
  setValue(rowIndex: number, field: string, value: DocumentValue): void {
    const vector = this.vectors.get(field);
    if (vector) {
      vector.set(rowIndex, value);
      if (rowIndex >= this._length) {
        this._length = rowIndex + 1;
      }
    }
  }

  /** Get value at specific row and field */
  getValue(rowIndex: number, field: string): DocumentValue {
    const vector = this.vectors.get(field);
    return vector ? vector.get(rowIndex) : undefined;
  }

  /** Clear all data */
  clear(): void {
    for (const vector of this.vectors.values()) {
      vector.clear();
    }
    this.selection.clear();
    this._length = 0;
  }

  /** Get all field names */
  getFields(): string[] {
    return Array.from(this.vectors.keys());
  }

  /** Check if batch is full */
  isFull(): boolean {
    return this._length >= this.batchSize;
  }
}
