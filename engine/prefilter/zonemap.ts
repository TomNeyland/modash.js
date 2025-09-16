/**
 * Phase 10: Zone-Map Prefilter for Column Chunks
 * 
 * Column-wise min/max statistics for efficient range pruning:
 * - Per-column chunk min/max tracking
 * - Range query pruning (skip scan batches)
 * - Support for numeric, string, and date comparisons
 * - Memory-efficient storage with lazy evaluation
 */

import { DocumentValue } from '../../src/aggo/expressions';

/**
 * Zone-map entry for a column chunk
 */
export interface ZoneMapEntry {
  columnName: string;
  chunkId: number;
  minValue: DocumentValue;
  maxValue: DocumentValue;
  nullCount: number;
  totalCount: number;
  dataType: 'number' | 'string' | 'date' | 'boolean' | 'mixed';
  lastUpdated: number;
}

/**
 * Query predicate for zone-map pruning
 */
export interface QueryPredicate {
  columnName: string;
  operator: '$eq' | '$ne' | '$lt' | '$lte' | '$gt' | '$gte' | '$in' | '$nin';
  value: DocumentValue | DocumentValue[];
}

/**
 * Zone-map pruning result
 */
export interface PruningResult {
  shouldScan: boolean;
  reason: string;
  estimatedSelectivity?: number;
}

/**
 * Zone-map statistics
 */
export interface ZoneMapStats {
  totalChunks: number;
  totalColumns: number;
  pruningQueries: number;
  chunksSkipped: number;
  chunksScanned: number;
  memoryUsageBytes: number;
  avgChunkSize: number;
}

/**
 * Zone-map configuration
 */
export interface ZoneMapConfig {
  maxChunkSize: number;        // Maximum documents per chunk (default: 1024)
  maxMemoryMB: number;         // Maximum memory for zone-maps (default: 100MB)
  enableStringMaps: boolean;   // Track string min/max (default: true)
  enableDateMaps: boolean;     // Track date min/max (default: true)
  refreshThreshold: number;    // Refresh after N updates (default: 100)
}

/**
 * High-performance zone-map implementation
 */
export class ZoneMap {
  private entries = new Map<string, ZoneMapEntry>(); // key: columnName:chunkId
  private chunkSizes = new Map<number, number>();
  private config: ZoneMapConfig;
  
  // Statistics
  private stats: ZoneMapStats = {
    totalChunks: 0,
    totalColumns: 0,
    pruningQueries: 0,
    chunksSkipped: 0,
    chunksScanned: 0,
    memoryUsageBytes: 0,
    avgChunkSize: 0
  };

  constructor(config: Partial<ZoneMapConfig> = {}) {
    this.config = {
      maxChunkSize: 1024,
      maxMemoryMB: 100,
      enableStringMaps: true,
      enableDateMaps: true,
      refreshThreshold: 100,
      ...config
    };
  }

  /**
   * Update zone-map with new batch of documents
   */
  updateChunk(chunkId: number, documents: any[]): void {
    if (documents.length === 0) return;
    
    // Extract all column names from documents
    const columns = this.extractColumns(documents);
    
    for (const columnName of columns) {
      this.updateColumnChunk(columnName, chunkId, documents);
    }
    
    this.chunkSizes.set(chunkId, documents.length);
    this.updateStats();
  }

  /**
   * Update zone-map for specific column and chunk
   */
  private updateColumnChunk(columnName: string, chunkId: number, documents: any[]): void {
    const key = `${columnName}:${chunkId}`;
    const existing = this.entries.get(key);
    
    const values = documents.map(doc => this.getFieldValue(doc, columnName))
                           .filter(val => val != null);
    
    if (values.length === 0) {
      // All null values
      if (existing) {
        existing.nullCount = documents.length;
        existing.totalCount = documents.length;
        existing.lastUpdated = Date.now();
      } else {
        this.entries.set(key, {
          columnName,
          chunkId,
          minValue: null,
          maxValue: null,
          nullCount: documents.length,
          totalCount: documents.length,
          dataType: 'mixed',
          lastUpdated: Date.now()
        });
      }
      return;
    }
    
    // Determine data type
    const dataType = this.inferDataType(values);
    
    // Calculate min/max
    const { min, max } = this.calculateMinMax(values, dataType);
    const nullCount = documents.length - values.length;
    
    if (existing) {
      // Update existing entry
      existing.minValue = this.compareValues(existing.minValue, min, dataType) <= 0 ? 
                          existing.minValue : min;
      existing.maxValue = this.compareValues(existing.maxValue, max, dataType) >= 0 ? 
                          existing.maxValue : max;
      existing.nullCount += nullCount;
      existing.totalCount += documents.length;
      existing.lastUpdated = Date.now();
    } else {
      // Create new entry
      this.entries.set(key, {
        columnName,
        chunkId,
        minValue: min,
        maxValue: max,
        nullCount,
        totalCount: documents.length,
        dataType,
        lastUpdated: Date.now()
      });
    }
  }

  /**
   * Test if chunk should be scanned for given predicate
   */
  shouldScanChunk(chunkId: number, predicate: QueryPredicate): PruningResult {
    this.stats.pruningQueries++;
    
    const key = `${predicate.columnName}:${chunkId}`;
    const entry = this.entries.get(key);
    
    if (!entry) {
      // No zone-map data - must scan
      this.stats.chunksScanned++;
      return {
        shouldScan: true,
        reason: 'No zone-map data available'
      };
    }
    
    const result = this.evaluatePredicate(entry, predicate);
    
    if (result.shouldScan) {
      this.stats.chunksScanned++;
    } else {
      this.stats.chunksSkipped++;
    }
    
    return result;
  }

  /**
   * Test multiple predicates against chunk (AND logic)
   */
  shouldScanChunkMultiple(chunkId: number, predicates: QueryPredicate[]): PruningResult {
    if (predicates.length === 0) {
      return { shouldScan: true, reason: 'No predicates provided' };
    }
    
    const results = predicates.map(pred => this.shouldScanChunk(chunkId, pred));
    
    // AND logic - if any predicate says skip, we can skip
    const canSkip = results.some(r => !r.shouldScan);
    
    if (canSkip) {
      const skipReasons = results.filter(r => !r.shouldScan)
                                 .map(r => r.reason)
                                 .join(', ');
      return {
        shouldScan: false,
        reason: `Pruned by: ${skipReasons}`
      };
    }
    
    return {
      shouldScan: true,
      reason: 'All predicates require scanning'
    };
  }

  /**
   * Evaluate single predicate against zone-map entry
   */
  private evaluatePredicate(entry: ZoneMapEntry, predicate: QueryPredicate): PruningResult {
    const { operator, value } = predicate;
    const { minValue, maxValue, dataType } = entry;
    
    // Handle null-only chunks
    if (minValue == null && maxValue == null) {
      return {
        shouldScan: operator === '$ne' || operator === '$nin',
        reason: operator === '$ne' || operator === '$nin' ? 
                'Null chunk matches != predicate' : 
                'Null chunk cannot match equality predicate'
      };
    }
    
    switch (operator) {
      case '$eq':
        if (this.compareValues(value, minValue, dataType) < 0 || 
            this.compareValues(value, maxValue, dataType) > 0) {
          return { shouldScan: false, reason: `Value ${value} outside range [${minValue}, ${maxValue}]` };
        }
        break;
        
      case '$ne':
        // Cannot prune NE - value might exist in chunk
        break;
        
      case '$lt':
        if (this.compareValues(value, minValue, dataType) <= 0) {
          return { shouldScan: false, reason: `All values >= ${minValue}, predicate < ${value}` };
        }
        break;
        
      case '$lte':
        if (this.compareValues(value, minValue, dataType) < 0) {
          return { shouldScan: false, reason: `All values >= ${minValue}, predicate <= ${value}` };
        }
        break;
        
      case '$gt':
        if (this.compareValues(value, maxValue, dataType) >= 0) {
          return { shouldScan: false, reason: `All values <= ${maxValue}, predicate > ${value}` };
        }
        break;
        
      case '$gte':
        if (this.compareValues(value, maxValue, dataType) > 0) {
          return { shouldScan: false, reason: `All values <= ${maxValue}, predicate >= ${value}` };
        }
        break;
        
      case '$in':
        if (Array.isArray(value)) {
          const inRange = value.some(v => 
            this.compareValues(v, minValue, dataType) >= 0 && 
            this.compareValues(v, maxValue, dataType) <= 0
          );
          if (!inRange) {
            return { shouldScan: false, reason: `No $in values overlap range [${minValue}, ${maxValue}]` };
          }
        }
        break;
        
      case '$nin':
        // Cannot reliably prune $nin
        break;
    }
    
    return { shouldScan: true, reason: 'Predicate requires scanning' };
  }

  /**
   * Get all chunks that should be scanned for query
   */
  getChunksToScan(predicates: QueryPredicate[]): number[] {
    const allChunkIds = new Set<number>();
    
    // Get all chunk IDs
    for (const key of this.entries.keys()) {
      const chunkId = parseInt(key.split(':')[1]);
      allChunkIds.add(chunkId);
    }
    
    const chunksToScan: number[] = [];
    
    for (const chunkId of allChunkIds) {
      const result = this.shouldScanChunkMultiple(chunkId, predicates);
      if (result.shouldScan) {
        chunksToScan.push(chunkId);
      }
    }
    
    return chunksToScan.sort((a, b) => a - b);
  }

  /**
   * Extract column names from documents
   */
  private extractColumns(documents: any[]): Set<string> {
    const columns = new Set<string>();
    
    for (const doc of documents.slice(0, 10)) { // Sample first 10 docs
      this.extractFieldPaths(doc, '', columns);
    }
    
    return columns;
  }

  /**
   * Recursively extract field paths
   */
  private extractFieldPaths(obj: any, prefix: string, columns: Set<string>): void {
    if (obj == null || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        // Recurse for nested objects
        this.extractFieldPaths(value, fieldPath, columns);
      } else {
        // Add leaf field
        columns.add(fieldPath);
      }
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
   * Infer data type from values
   */
  private inferDataType(values: DocumentValue[]): ZoneMapEntry['dataType'] {
    if (values.length === 0) return 'mixed';
    
    const types = new Set(values.map(v => {
      if (typeof v === 'number') return 'number';
      if (typeof v === 'string') return 'string';
      if (typeof v === 'boolean') return 'boolean';
      if (v instanceof Date) return 'date';
      return 'mixed';
    }));
    
    if (types.size === 1) {
      return types.values().next().value;
    }
    
    return 'mixed';
  }

  /**
   * Calculate min/max for values based on data type
   */
  private calculateMinMax(values: DocumentValue[], dataType: string): { min: DocumentValue; max: DocumentValue } {
    if (values.length === 0) return { min: null, max: null };
    
    let min = values[0];
    let max = values[0];
    
    for (let i = 1; i < values.length; i++) {
      const value = values[i];
      if (this.compareValues(value, min, dataType) < 0) {
        min = value;
      }
      if (this.compareValues(value, max, dataType) > 0) {
        max = value;
      }
    }
    
    return { min, max };
  }

  /**
   * Compare two values based on data type
   */
  private compareValues(a: DocumentValue, b: DocumentValue, dataType: string): number {
    if (a === b) return 0;
    if (a == null) return b == null ? 0 : -1;
    if (b == null) return 1;
    
    switch (dataType) {
      case 'number':
        return Number(a) - Number(b);
        
      case 'string':
        return String(a).localeCompare(String(b));
        
      case 'date':
        const dateA = a instanceof Date ? a : new Date(a as any);
        const dateB = b instanceof Date ? b : new Date(b as any);
        return dateA.getTime() - dateB.getTime();
        
      case 'boolean':
        return Number(a) - Number(b);
        
      default:
        // Mixed type comparison - convert to string
        return String(a).localeCompare(String(b));
    }
  }

  /**
   * Update internal statistics
   */
  private updateStats(): void {
    const chunkIds = new Set<number>();
    const columns = new Set<string>();
    
    for (const entry of this.entries.values()) {
      chunkIds.add(entry.chunkId);
      columns.add(entry.columnName);
    }
    
    this.stats.totalChunks = chunkIds.size;
    this.stats.totalColumns = columns.size;
    
    // Estimate memory usage
    let memoryBytes = 0;
    for (const entry of this.entries.values()) {
      memoryBytes += 200; // Rough estimate per entry
      memoryBytes += this.estimateValueSize(entry.minValue);
      memoryBytes += this.estimateValueSize(entry.maxValue);
    }
    this.stats.memoryUsageBytes = memoryBytes;
    
    // Calculate average chunk size
    const totalDocs = Array.from(this.chunkSizes.values()).reduce((a, b) => a + b, 0);
    this.stats.avgChunkSize = this.stats.totalChunks > 0 ? totalDocs / this.stats.totalChunks : 0;
  }

  /**
   * Estimate memory size of a value
   */
  private estimateValueSize(value: DocumentValue): number {
    if (value == null) return 8;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (typeof value === 'string') return value.length * 2;
    if (value instanceof Date) return 8;
    return 50; // Rough estimate for complex values
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): ZoneMapStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get pruning efficiency metrics
   */
  getEfficiencyMetrics() {
    const stats = this.getStats();
    const totalQueries = stats.pruningQueries;
    const pruningRatio = totalQueries > 0 ? (stats.chunksSkipped / totalQueries * 100) : 0;
    
    return {
      pruningRatio: pruningRatio.toFixed(2) + '%',
      avgChunkSize: Math.round(stats.avgChunkSize),
      memoryUsageMB: (stats.memoryUsageBytes / (1024 * 1024)).toFixed(2) + 'MB',
      entriesPerColumn: stats.totalColumns > 0 ? 
        (this.entries.size / stats.totalColumns).toFixed(1) : '0'
    };
  }

  /**
   * Clear all zone-map data
   */
  clear(): void {
    this.entries.clear();
    this.chunkSizes.clear();
    this.stats = {
      totalChunks: 0,
      totalColumns: 0,
      pruningQueries: 0,
      chunksSkipped: 0,
      chunksScanned: 0,
      memoryUsageBytes: 0,
      avgChunkSize: 0
    };
  }
}