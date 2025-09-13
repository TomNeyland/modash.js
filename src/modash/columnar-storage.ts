/**
 * Columnar Storage Optimization for modash.js
 * Provides column-oriented data structures for efficient numeric operations
 */

import type { Collection, Document, DocumentValue } from './expressions.js';

interface ColumnSchema {
  [field: string]: 'number' | 'integer' | 'boolean' | 'date' | 'string';
}

interface ColumnStore {
  columns: Map<string, TypedArray | any[]>;
  rowCount: number;
  schema: ColumnSchema;
  
  // Efficient column-based operations
  filter(predicate: (row: Document, index: number) => boolean): number[];
  getRow(index: number): Document;
  slice(start: number, end?: number): ColumnStore;
}

type TypedArray = Float64Array | Int32Array | Uint8Array;

export class ColumnarStorage {
  /**
   * Convert row-oriented collection to column-oriented storage
   */
  static createColumnStore<T extends Document>(
    collection: Collection<T>,
    schema?: ColumnSchema
  ): ColumnStore {
    if (collection.length === 0) {
      return {
        columns: new Map(),
        rowCount: 0,
        schema: {},
        filter: () => [],
        getRow: () => ({}),
        slice: () => ColumnarStorage.createColumnStore([])
      };
    }

    // Auto-detect schema if not provided
    const detectedSchema = schema || this.detectSchema(collection);
    const columns = new Map<string, TypedArray | any[]>();
    const rowCount = collection.length;

    // Create typed arrays for different data types
    for (const [field, type] of Object.entries(detectedSchema)) {
      let columnData: TypedArray | any[];

      switch (type) {
        case 'number':
          columnData = new Float64Array(rowCount);
          break;
        case 'integer':
          columnData = new Int32Array(rowCount);
          break;
        case 'boolean':
          columnData = new Uint8Array(rowCount);
          break;
        case 'date':
          columnData = new Float64Array(rowCount); // Store as timestamps
          break;
        default:
          columnData = new Array(rowCount);
      }

      // Populate column data
      for (let i = 0; i < rowCount; i++) {
        const value = this.getNestedValue(collection[i], field);
        
        switch (type) {
          case 'number':
          case 'integer':
            (columnData as Float64Array | Int32Array)[i] = Number(value) || 0;
            break;
          case 'boolean':
            (columnData as Uint8Array)[i] = value ? 1 : 0;
            break;
          case 'date':
            (columnData as Float64Array)[i] = value instanceof Date ? value.getTime() : 0;
            break;
          default:
            (columnData as any[])[i] = value;
        }
      }

      columns.set(field, columnData);
    }

    return {
      columns,
      rowCount,
      schema: detectedSchema,

      filter(predicate: (row: Document, index: number) => boolean): number[] {
        const matchingRows: number[] = [];
        for (let i = 0; i < rowCount; i++) {
          const row = this.getRow(i);
          if (predicate(row, i)) {
            matchingRows.push(i);
          }
        }
        return matchingRows;
      },

      getRow(index: number): Document {
        const row: Document = {};
        for (const [field, type] of Object.entries(detectedSchema)) {
          const columnData = columns.get(field)!;
          
          switch (type) {
            case 'boolean':
              row[field] = (columnData as Uint8Array)[index] === 1;
              break;
            case 'date':
              const timestamp = (columnData as Float64Array)[index];
              row[field] = timestamp > 0 ? new Date(timestamp) : null;
              break;
            default:
              row[field] = columnData[index];
          }
        }
        return row;
      },

      slice(start: number, end = rowCount): ColumnStore {
        const sliceLength = end - start;
        const slicedColumns = new Map<string, TypedArray | any[]>();

        for (const [field, columnData] of columns.entries()) {
          if (columnData instanceof Float64Array || 
              columnData instanceof Int32Array || 
              columnData instanceof Uint8Array) {
            slicedColumns.set(field, columnData.slice(start, end));
          } else {
            slicedColumns.set(field, columnData.slice(start, end));
          }
        }

        return {
          columns: slicedColumns,
          rowCount: sliceLength,
          schema: detectedSchema,
          filter: this.filter,
          getRow: this.getRow,
          slice: this.slice
        };
      }
    };
  }

  /**
   * Vectorized numeric operations on columns
   */
  static vectorizedSum(columnData: Float64Array | Int32Array): number {
    let sum = 0;
    const length = columnData.length;
    
    // Process in chunks for better cache performance
    const chunkSize = 1024;
    for (let i = 0; i < length; i += chunkSize) {
      const end = Math.min(i + chunkSize, length);
      for (let j = i; j < end; j++) {
        sum += columnData[j];
      }
    }
    
    return sum;
  }

  static vectorizedAvg(columnData: Float64Array | Int32Array): number {
    const sum = this.vectorizedSum(columnData);
    return columnData.length > 0 ? sum / columnData.length : 0;
  }

  static vectorizedMin(columnData: Float64Array | Int32Array): number {
    if (columnData.length === 0) return Infinity;
    
    let min = columnData[0];
    for (let i = 1; i < columnData.length; i++) {
      if (columnData[i] < min) {
        min = columnData[i];
      }
    }
    return min;
  }

  static vectorizedMax(columnData: Float64Array | Int32Array): number {
    if (columnData.length === 0) return -Infinity;
    
    let max = columnData[0];
    for (let i = 1; i < columnData.length; i++) {
      if (columnData[i] > max) {
        max = columnData[i];
      }
    }
    return max;
  }

  /**
   * Optimized grouping using columnar data
   */
  static fastGroupBy<T extends Document>(
    columnStore: ColumnStore,
    keyField: string,
    aggregations: Record<string, { $sum?: string; $avg?: string; $min?: string; $max?: string; $count?: 1 }>
  ): Collection<T> {
    const groups = new Map<any, any>();
    const keyColumn = columnStore.columns.get(keyField);
    
    if (!keyColumn) {
      throw new Error(`Field ${keyField} not found in column store`);
    }

    // Initialize groups
    for (let i = 0; i < columnStore.rowCount; i++) {
      const key = keyColumn[i];
      
      if (!groups.has(key)) {
        const group: any = { _id: key };
        
        // Initialize aggregation fields
        for (const [field, operations] of Object.entries(aggregations)) {
          if (operations.$sum !== undefined) {
            group[field] = 0;
          } else if (operations.$avg !== undefined) {
            group[field] = { sum: 0, count: 0 };
          } else if (operations.$min !== undefined) {
            group[field] = Infinity;
          } else if (operations.$max !== undefined) {
            group[field] = -Infinity;
          } else if (operations.$count) {
            group[field] = 0;
          }
        }
        
        groups.set(key, group);
      }
    }

    // Process aggregations using vectorized operations where possible
    for (const [field, operations] of Object.entries(aggregations)) {
      if (operations.$sum || operations.$avg) {
        const sourceField = operations.$sum || operations.$avg;
        const sourceColumn = columnStore.columns.get(sourceField!);
        
        if (sourceColumn && (sourceColumn instanceof Float64Array || sourceColumn instanceof Int32Array)) {
          // Use vectorized operations for numeric columns
          this.processNumericAggregation(groups, keyColumn, sourceColumn, field, operations);
        } else {
          // Fallback to row-by-row processing
          this.processRowByRowAggregation(columnStore, keyField, field, operations, groups);
        }
      } else if (operations.$count) {
        // Count aggregation
        for (let i = 0; i < columnStore.rowCount; i++) {
          const key = keyColumn[i];
          const group = groups.get(key);
          group[field]++;
        }
      }
    }

    // Finalize average calculations
    for (const group of groups.values()) {
      for (const [field, operations] of Object.entries(aggregations)) {
        if (operations.$avg && typeof group[field] === 'object') {
          group[field] = group[field].count > 0 ? group[field].sum / group[field].count : 0;
        }
      }
    }

    return Array.from(groups.values()) as Collection<T>;
  }

  private static processNumericAggregation(
    groups: Map<any, any>,
    keyColumn: TypedArray | any[],
    sourceColumn: Float64Array | Int32Array,
    field: string,
    operations: any
  ) {
    for (let i = 0; i < sourceColumn.length; i++) {
      const key = keyColumn[i];
      const value = sourceColumn[i];
      const group = groups.get(key);
      
      if (operations.$sum) {
        group[field] += value;
      } else if (operations.$avg) {
        group[field].sum += value;
        group[field].count++;
      } else if (operations.$min) {
        group[field] = Math.min(group[field], value);
      } else if (operations.$max) {
        group[field] = Math.max(group[field], value);
      }
    }
  }

  private static processRowByRowAggregation(
    columnStore: ColumnStore,
    keyField: string,
    field: string,
    operations: any,
    groups: Map<any, any>
  ) {
    for (let i = 0; i < columnStore.rowCount; i++) {
      const row = columnStore.getRow(i);
      const key = row[keyField];
      const group = groups.get(key);
      
      const sourceField = operations.$sum || operations.$avg || operations.$min || operations.$max;
      const value = this.getNestedValue(row, sourceField);
      
      if (operations.$sum) {
        group[field] += Number(value) || 0;
      } else if (operations.$avg) {
        group[field].sum += Number(value) || 0;
        group[field].count++;
      } else if (operations.$min) {
        group[field] = Math.min(group[field], Number(value) || Infinity);
      } else if (operations.$max) {
        group[field] = Math.max(group[field], Number(value) || -Infinity);
      }
    }
  }

  /**
   * Auto-detect schema from sample data
   */
  private static detectSchema<T extends Document>(collection: Collection<T>): ColumnSchema {
    const schema: ColumnSchema = {};
    const sampleSize = Math.min(100, collection.length);
    
    // Sample first few documents to detect types
    for (let i = 0; i < sampleSize; i++) {
      const doc = collection[i];
      this.extractFieldTypes(doc, schema, '');
    }
    
    return schema;
  }

  private static extractFieldTypes(obj: any, schema: ColumnSchema, prefix: string) {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      
      if (value === null || value === undefined) {
        continue;
      }
      
      if (typeof value === 'number') {
        schema[fieldPath] = Number.isInteger(value) ? 'integer' : 'number';
      } else if (typeof value === 'boolean') {
        schema[fieldPath] = 'boolean';
      } else if (value instanceof Date) {
        schema[fieldPath] = 'date';
      } else if (typeof value === 'string') {
        schema[fieldPath] = 'string';
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects (limited depth)
        if (prefix.split('.').length < 3) {
          this.extractFieldTypes(value, schema, fieldPath);
        }
      }
    }
  }

  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}