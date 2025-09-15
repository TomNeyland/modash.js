/**
 * Columnar Storage and Structure-of-Arrays (SoA) Implementation
 * 
 * This module implements columnar data layout optimized for analytics workloads,
 * providing better cache locality and vectorization opportunities for aggregations.
 * Inspired by analytical databases like ClickHouse and Apache Arrow.
 */

import { VectorizedOps, AggregateVectorOps } from './vectorized-ops';

/**
 * Column metadata for type-aware processing
 */
export interface ColumnInfo {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'date' | 'object';
  nullable: boolean;
  encoding?: 'dictionary' | 'rle' | 'delta' | 'none';
  statistics?: {
    min?: any;
    max?: any;
    nullCount: number;
    distinctCount?: number;
    cardinality?: number;
  };
}

/**
 * Compressed column storage with different encoding strategies
 */
export class CompressedColumn<T = any> {
  readonly name: string;
  readonly info: ColumnInfo;
  private values: T[];
  private nullBitmap?: boolean[];
  private dictionary?: Map<T, number>; // For dictionary encoding
  private dictionaryValues?: T[]; // Reverse lookup for dictionary

  constructor(name: string, info: ColumnInfo, values: T[] = []) {
    this.name = name;
    this.info = info;
    this.values = values;
    
    // Apply compression based on column characteristics
    this.optimizeEncoding();
  }

  /**
   * Add value to column with automatic encoding
   */
  add(value: T): void {
    if (value === null || value === undefined) {
      if (!this.nullBitmap) {
        this.nullBitmap = new Array(this.values.length).fill(false);
      }
      this.nullBitmap.push(true);
      this.values.push(null as T);
    } else {
      if (this.nullBitmap) {
        this.nullBitmap.push(false);
      }
      
      if (this.info.encoding === 'dictionary' && this.dictionary) {
        let dictIndex = this.dictionary.get(value);
        if (dictIndex === undefined) {
          dictIndex = this.dictionaryValues!.length;
          this.dictionary.set(value, dictIndex);
          this.dictionaryValues!.push(value);
        }
        this.values.push(dictIndex as T);
      } else {
        this.values.push(value);
      }
    }
    
    this.updateStatistics(value);
  }

  /**
   * Get value at index with decompression
   */
  get(index: number): T | null {
    if (this.nullBitmap && this.nullBitmap[index]) {
      return null;
    }
    
    const rawValue = this.values[index];
    
    if (this.info.encoding === 'dictionary' && this.dictionaryValues) {
      return this.dictionaryValues[rawValue as number];
    }
    
    return rawValue;
  }

  /**
   * Get raw values array for vectorized operations
   */
  getRawValues(): T[] {
    return this.values;
  }

  /**
   * Get decompressed values
   */
  getValues(): (T | null)[] {
    const result: (T | null)[] = new Array(this.values.length);
    
    for (let i = 0; i < this.values.length; i++) {
      result[i] = this.get(i);
    }
    
    return result;
  }

  /**
   * Filter indices based on predicate with vectorized evaluation
   */
  filterIndices(predicate: (value: T | null) => boolean): number[] {
    const indices: number[] = [];
    
    // Vectorized filtering in chunks
    const chunkSize = 64;
    
    for (let i = 0; i < this.values.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, this.values.length);
      
      for (let j = i; j < end; j++) {
        const value = this.get(j);
        if (predicate(value)) {
          indices.push(j);
        }
      }
    }
    
    return indices;
  }

  /**
   * Optimized numerical operations for numeric columns
   */
  numericOps(): {
    sum: () => number;
    avg: () => number;
    min: () => number;
    max: () => number;
    count: () => number;
  } {
    if (this.info.type !== 'number') {
      throw new Error('Numeric operations only supported for number columns');
    }

    const numValues = this.values.filter(v => v !== null) as number[];
    
    return {
      sum: () => VectorizedOps.sum(numValues),
      avg: () => VectorizedOps.avg(numValues),
      min: () => VectorizedOps.minMax(numValues).min,
      max: () => VectorizedOps.minMax(numValues).max,
      count: () => numValues.length,
    };
  }

  /**
   * Dictionary compression for high-cardinality string columns
   */
  private optimizeEncoding(): void {
    if (this.values.length === 0) return;
    
    // Analyze column characteristics
    const uniqueValues = new Set(this.values);
    const cardinality = uniqueValues.size;
    const totalValues = this.values.length;
    
    this.info.statistics = {
      ...this.info.statistics,
      distinctCount: cardinality,
      cardinality: cardinality / totalValues,
      nullCount: 0,
    };

    // Apply dictionary encoding for low-cardinality columns
    if (this.info.type === 'string' && cardinality < totalValues * 0.1 && cardinality < 10000) {
      this.info.encoding = 'dictionary';
      this.dictionary = new Map();
      this.dictionaryValues = [];
      
      const originalValues = [...this.values];
      this.values = [];
      
      for (const value of originalValues) {
        if (value !== null) {
          let dictIndex = this.dictionary.get(value);
          if (dictIndex === undefined) {
            dictIndex = this.dictionaryValues.length;
            this.dictionary.set(value, dictIndex);
            this.dictionaryValues.push(value);
          }
          this.values.push(dictIndex as T);
        } else {
          this.values.push(null as T);
        }
      }
    }
  }

  private updateStatistics(value: T): void {
    if (!this.info.statistics) {
      this.info.statistics = { nullCount: 0 };
    }

    if (value === null || value === undefined) {
      this.info.statistics.nullCount++;
      return;
    }

    // Update min/max for orderable types
    if (this.info.type === 'number' || this.info.type === 'date') {
      if (this.info.statistics.min === undefined || value < this.info.statistics.min) {
        this.info.statistics.min = value;
      }
      if (this.info.statistics.max === undefined || value > this.info.statistics.max) {
        this.info.statistics.max = value;
      }
    }
  }

  get length(): number {
    return this.values.length;
  }

  clear(): void {
    this.values.length = 0;
    this.nullBitmap = undefined;
    this.dictionary?.clear();
    this.dictionaryValues = undefined;
  }
}

/**
 * Columnar table implementation with vectorized operations
 */
export class ColumnarTable<T extends Record<string, any> = Record<string, any>> {
  private columns = new Map<string, CompressedColumn>();
  private columnInfos = new Map<string, ColumnInfo>();
  private rowCount = 0;
  
  // Index structures for fast lookups
  private indexes = new Map<string, Map<any, number[]>>();
  
  constructor(schema?: Record<string, Omit<ColumnInfo, 'name'>>) {
    if (schema) {
      for (const [name, info] of Object.entries(schema)) {
        this.addColumn(name, { ...info, name });
      }
    }
  }

  /**
   * Add a column to the table
   */
  addColumn(name: string, info: ColumnInfo): void {
    this.columnInfos.set(name, info);
    this.columns.set(name, new CompressedColumn(name, info));
  }

  /**
   * Bulk load documents with automatic schema inference
   */
  bulkLoad(documents: T[]): void {
    if (documents.length === 0) return;

    // Infer schema from first document if not provided
    if (this.columns.size === 0) {
      this.inferSchema(documents[0]);
    }

    // Convert row-oriented to column-oriented
    for (const doc of documents) {
      this.addRow(doc);
    }

    // Build indexes for frequently queried columns
    this.buildIndexes();
  }

  /**
   * Add a single row to the table
   */
  addRow(document: T): void {
    // Ensure all columns exist
    for (const [key, value] of Object.entries(document)) {
      if (!this.columns.has(key)) {
        const columnInfo: ColumnInfo = {
          name: key,
          type: this.inferType(value),
          nullable: true,
        };
        this.addColumn(key, columnInfo);
      }
    }

    // Add values to columns
    for (const [columnName] of this.columns) {
      const value = document[columnName];
      this.columns.get(columnName)!.add(value);
    }

    this.rowCount++;
  }

  /**
   * Get column by name
   */
  getColumn<V = any>(name: string): CompressedColumn<V> | undefined {
    return this.columns.get(name) as CompressedColumn<V>;
  }

  /**
   * Vectorized filtering with index utilization
   */
  filter(predicate: (row: T, index: number) => boolean): number[] {
    const matchingIndices: number[] = [];
    
    // Try to use column indexes first for better performance
    const indexOptimizedResult = this.tryIndexOptimizedFilter(predicate);
    if (indexOptimizedResult) {
      return indexOptimizedResult;
    }

    // Fallback to row-by-row evaluation
    const chunkSize = 1000;
    
    for (let i = 0; i < this.rowCount; i += chunkSize) {
      const end = Math.min(i + chunkSize, this.rowCount);
      
      for (let j = i; j < end; j++) {
        const row = this.getRow(j);
        if (predicate(row, j)) {
          matchingIndices.push(j);
        }
      }
    }

    return matchingIndices;
  }

  /**
   * Vectorized group by with columnar aggregation
   */
  groupBy<K>(
    keyExtractor: (row: T) => K,
    aggregations: {
      [field: string]: {
        column: string;
        operation: 'sum' | 'avg' | 'min' | 'max' | 'count';
      };
    }
  ): Map<K, Record<string, number>> {
    const groups = new Map<K, Record<string, number>>();

    // Process in chunks for better memory locality
    const chunkSize = 1000;
    
    for (let i = 0; i < this.rowCount; i += chunkSize) {
      const end = Math.min(i + chunkSize, this.rowCount);
      
      // Extract chunk data
      const chunkKeys: K[] = [];
      const chunkData: Record<string, any[]> = {};
      
      for (const aggName of Object.keys(aggregations)) {
        chunkData[aggName] = [];
      }

      for (let j = i; j < end; j++) {
        const row = this.getRow(j);
        const key = keyExtractor(row);
        chunkKeys.push(key);

        for (const [aggName, aggSpec] of Object.entries(aggregations)) {
          const column = this.columns.get(aggSpec.column);
          const value = column ? column.get(j) : null;
          chunkData[aggName].push(value);
        }
      }

      // Process chunk aggregations
      for (let j = 0; j < chunkKeys.length; j++) {
        const key = chunkKeys[j];
        
        let group = groups.get(key);
        if (!group) {
          group = {};
          for (const aggName of Object.keys(aggregations)) {
            const op = aggregations[aggName].operation;
            group[aggName] = op === 'min' ? Infinity : op === 'max' ? -Infinity : 0;
            if (op === 'avg') group[`${aggName}_count`] = 0;
          }
          groups.set(key, group);
        }

        // Update aggregations
        for (const [aggName, aggSpec] of Object.entries(aggregations)) {
          const value = chunkData[aggName][j];
          if (value !== null && value !== undefined) {
            const op = aggSpec.operation;
            
            switch (op) {
              case 'sum':
                group[aggName] += value;
                break;
              case 'count':
                group[aggName]++;
                break;
              case 'min':
                group[aggName] = Math.min(group[aggName], value);
                break;
              case 'max':
                group[aggName] = Math.max(group[aggName], value);
                break;
              case 'avg':
                group[aggName] += value;
                group[`${aggName}_count`]++;
                break;
            }
          }
        }
      }
    }

    // Finalize averages
    for (const [key, group] of groups) {
      for (const [aggName, aggSpec] of Object.entries(aggregations)) {
        if (aggSpec.operation === 'avg') {
          const count = group[`${aggName}_count`];
          if (count > 0) {
            group[aggName] = group[aggName] / count;
          }
          delete group[`${aggName}_count`];
        }
      }
    }

    return groups;
  }

  /**
   * Get row at index by reconstructing from columns
   */
  getRow(index: number): T {
    const row: any = {};
    
    for (const [columnName, column] of this.columns) {
      row[columnName] = column.get(index);
    }
    
    return row as T;
  }

  /**
   * Get all rows with optional column projection
   */
  getRows(projection?: string[]): T[] {
    const result: T[] = new Array(this.rowCount);
    
    if (projection) {
      // Projected access - only fetch requested columns
      for (let i = 0; i < this.rowCount; i++) {
        const row: any = {};
        for (const columnName of projection) {
          const column = this.columns.get(columnName);
          if (column) {
            row[columnName] = column.get(i);
          }
        }
        result[i] = row as T;
      }
    } else {
      // Full row access
      for (let i = 0; i < this.rowCount; i++) {
        result[i] = this.getRow(i);
      }
    }
    
    return result;
  }

  /**
   * Create index on column for faster lookups
   */
  createIndex(columnName: string): void {
    const column = this.columns.get(columnName);
    if (!column) return;

    const index = new Map<any, number[]>();
    
    for (let i = 0; i < column.length; i++) {
      const value = column.get(i);
      if (!index.has(value)) {
        index.set(value, []);
      }
      index.get(value)!.push(i);
    }

    this.indexes.set(columnName, index);
  }

  /**
   * Try to optimize filter using column indexes
   */
  private tryIndexOptimizedFilter(predicate: (row: T, index: number) => boolean): number[] | null {
    // This is a simplified implementation
    // In practice, we would need to parse the predicate to identify column constraints
    return null;
  }

  private inferSchema(document: T): void {
    for (const [key, value] of Object.entries(document)) {
      const columnInfo: ColumnInfo = {
        name: key,
        type: this.inferType(value),
        nullable: true,
      };
      this.addColumn(key, columnInfo);
    }
  }

  private inferType(value: any): ColumnInfo['type'] {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'object';
  }

  private buildIndexes(): void {
    // Auto-create indexes for columns with good selectivity
    for (const [columnName, column] of this.columns) {
      const info = this.columnInfos.get(columnName)!;
      
      if (info.statistics && 
          info.statistics.cardinality && 
          info.statistics.cardinality < 0.5 && 
          info.statistics.cardinality > 0.01) {
        this.createIndex(columnName);
      }
    }
  }

  get size(): number {
    return this.rowCount;
  }

  clear(): void {
    this.columns.forEach(column => column.clear());
    this.columns.clear();
    this.columnInfos.clear();
    this.indexes.clear();
    this.rowCount = 0;
  }
}

/**
 * Columnar aggregation engine optimized for analytics workloads
 */
export class ColumnarAggregationEngine {
  
  /**
   * Execute aggregation pipeline on columnar data
   */
  static aggregate<T extends Record<string, any>>(
    documents: T[],
    pipeline: any[]
  ): any[] {
    if (documents.length === 0) return [];

    // Convert to columnar format
    const table = new ColumnarTable<T>();
    table.bulkLoad(documents);

    let currentData = table;
    
    // Process each stage of the pipeline
    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0];
      const stageSpec = stage[stageType];

      switch (stageType) {
        case '$match':
          currentData = this.processMatch(currentData, stageSpec);
          break;
        case '$group':
          return this.processGroup(currentData, stageSpec);
        case '$sort':
          return this.processSort(currentData, stageSpec);
        case '$project':
          return this.processProject(currentData, stageSpec);
        default:
          // Fallback to row-oriented processing for unsupported stages
          return this.fallbackToRowOriented(currentData.getRows(), [stage]);
      }
    }

    return currentData.getRows();
  }

  private static processMatch<T extends Record<string, any>>(
    table: ColumnarTable<T>,
    matchSpec: any
  ): ColumnarTable<T> {
    // Convert match specification to predicate
    const predicate = this.compileMatchPredicate(matchSpec);
    
    // Get matching indices
    const matchingIndices = table.filter(predicate);
    
    // Create new table with filtered data
    const filteredTable = new ColumnarTable<T>();
    
    for (const index of matchingIndices) {
      const row = table.getRow(index);
      filteredTable.addRow(row);
    }
    
    return filteredTable;
  }

  private static processGroup<T extends Record<string, any>>(
    table: ColumnarTable<T>,
    groupSpec: any
  ): any[] {
    const { _id: groupKey, ...aggregations } = groupSpec;
    
    // Compile key extractor
    const keyExtractor = this.compileKeyExtractor(groupKey);
    
    // Prepare aggregation specifications
    const aggSpecs: Record<string, { column: string; operation: string }> = {};
    
    for (const [field, aggExpr] of Object.entries(aggregations)) {
      if (typeof aggExpr === 'object' && aggExpr !== null) {
        const operation = Object.keys(aggExpr)[0];
        const column = aggExpr[operation];
        
        if (typeof column === 'string' && column.startsWith('$')) {
          aggSpecs[field] = {
            column: column.substring(1),
            operation: operation.substring(1), // Remove $ prefix
          };
        }
      }
    }

    // Execute group by
    const groupResults = table.groupBy(keyExtractor, aggSpecs);
    
    // Convert to array format
    const result: any[] = [];
    for (const [key, aggregatedValues] of groupResults) {
      const resultDoc: any = { _id: key, ...aggregatedValues };
      result.push(resultDoc);
    }
    
    return result;
  }

  private static processSort<T extends Record<string, any>>(
    table: ColumnarTable<T>,
    sortSpec: any
  ): T[] {
    const sortFields = Object.entries(sortSpec);
    
    if (sortFields.length === 1) {
      // Single field sort - use column-optimized sorting
      const [fieldName, direction] = sortFields[0] as [string, 1 | -1];
      const column = table.getColumn(fieldName);
      
      if (column && column.info.type === 'number') {
        // Use vectorized numeric sort
        const indices = Array.from({ length: table.size }, (_, i) => i);
        
        indices.sort((a, b) => {
          const valueA = column.get(a) as number;
          const valueB = column.get(b) as number;
          
          if (valueA < valueB) return -direction;
          if (valueA > valueB) return direction;
          return 0;
        });
        
        return indices.map(i => table.getRow(i));
      }
    }
    
    // Fallback to standard sorting
    const rows = table.getRows();
    return rows.sort(this.compileComparator(sortSpec));
  }

  private static processProject<T extends Record<string, any>>(
    table: ColumnarTable<T>,
    projectSpec: any
  ): any[] {
    const projectedFields = Object.keys(projectSpec).filter(key => projectSpec[key] === 1);
    return table.getRows(projectedFields);
  }

  private static compileMatchPredicate(matchSpec: any): (row: any) => boolean {
    // Simplified predicate compiler
    return (row: any) => {
      for (const [field, condition] of Object.entries(matchSpec)) {
        const value = row[field];
        
        if (typeof condition === 'object' && condition !== null) {
          for (const [op, expected] of Object.entries(condition)) {
            switch (op) {
              case '$eq':
                if (value !== expected) return false;
                break;
              case '$gt':
                if (value <= expected) return false;
                break;
              case '$gte':
                if (value < expected) return false;
                break;
              case '$lt':
                if (value >= expected) return false;
                break;
              case '$lte':
                if (value > expected) return false;
                break;
              case '$in':
                if (!Array.isArray(expected) || !expected.includes(value)) return false;
                break;
              default:
                return false;
            }
          }
        } else {
          if (value !== condition) return false;
        }
      }
      return true;
    };
  }

  private static compileKeyExtractor(keySpec: any): (row: any) => any {
    if (typeof keySpec === 'string' && keySpec.startsWith('$')) {
      const field = keySpec.substring(1);
      return (row: any) => row[field];
    }
    
    if (typeof keySpec === 'object' && keySpec !== null) {
      // Multi-field grouping key
      return (row: any) => {
        const result: any = {};
        for (const [key, expr] of Object.entries(keySpec)) {
          if (typeof expr === 'string' && expr.startsWith('$')) {
            result[key] = row[expr.substring(1)];
          }
        }
        return JSON.stringify(result);
      };
    }
    
    return () => keySpec; // Constant key
  }

  private static compileComparator(sortSpec: any): (a: any, b: any) => number {
    const sortFields = Object.entries(sortSpec);
    
    return (a: any, b: any): number => {
      for (const [field, direction] of sortFields) {
        const valueA = a[field];
        const valueB = b[field];
        
        if (valueA < valueB) return -(direction as number);
        if (valueA > valueB) return direction as number;
      }
      return 0;
    };
  }

  private static fallbackToRowOriented(rows: any[], pipeline: any[]): any[] {
    // This would use the standard aggregation engine
    // For now, return the rows as-is
    return rows;
  }
}