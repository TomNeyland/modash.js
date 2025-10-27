/**
 * Phase 10: Zone Maps for Column Chunk Filtering
 *
 * Zone maps (min/max statistics) per column chunk:
 * - Skip scan batches based on min/max values
 * - Efficient range queries and comparison operations
 * - Automatic statistics maintenance
 * - Support for multiple data types
 */

export interface ZoneMapStats {
  min: any;
  max: any;
  nullCount: number;
  totalCount: number;
  dataType: string;
  hasNulls: boolean;
}

export interface ZoneMapConfig {
  chunkSize: number;
  trackNulls: boolean;
  supportedTypes: string[];
}

export interface FilterResult {
  canSkip: boolean;
  reason?: string;
  confidence: number; // 0-1, how confident we are in the filter decision
}

/**
 * Zone map implementation for column chunks
 */
export class ZoneMap {
  private stats: ZoneMapStats;
  private readonly config: ZoneMapConfig;

  constructor(config: Partial<ZoneMapConfig> = {}) {
    this.config = {
      chunkSize: 1024,
      trackNulls: true,
      supportedTypes: ['number', 'string', 'boolean', 'date'],
      ...config,
    };

    this.stats = {
      min: undefined,
      max: undefined,
      nullCount: 0,
      totalCount: 0,
      dataType: 'unknown',
      hasNulls: false,
    };
  }

  /**
   * Add values to the zone map statistics
   */
  addValues(values: any[]) {
    for (const value of values) {
      this.addValue(value);
    }
  }

  /**
   * Add single value to zone map
   */
  addValue(value: any) {
    this.stats.totalCount++;

    if (value === null || value === undefined) {
      if (this.config.trackNulls) {
        this.stats.nullCount++;
        this.stats.hasNulls = true;
      }
      return;
    }

    const valueType = this.getValueType(value);

    // Set data type on first non-null value
    if (this.stats.dataType === 'unknown') {
      this.stats.dataType = valueType;
    }

    // Only track min/max for supported types and consistent types
    if (
      this.config.supportedTypes.includes(valueType) &&
      valueType === this.stats.dataType
    ) {
      this.updateMinMax(value);
    }
  }

  /**
   * Check if a range query can skip this chunk
   */
  canSkipForRange(operator: string, compareValue: any): FilterResult {
    if (this.stats.min === undefined || this.stats.max === undefined) {
      return {
        canSkip: false,
        reason: 'No statistics available',
        confidence: 0,
      };
    }

    const valueType = this.getValueType(compareValue);
    if (valueType !== this.stats.dataType) {
      return { canSkip: false, reason: 'Type mismatch', confidence: 0 };
    }

    switch (operator) {
      case '$gt':
        if (this.stats.max <= compareValue) {
          return {
            canSkip: true,
            reason: 'Max value <= compare value',
            confidence: 1.0,
          };
        }
        break;

      case '$gte':
        if (this.stats.max < compareValue) {
          return {
            canSkip: true,
            reason: 'Max value < compare value',
            confidence: 1.0,
          };
        }
        break;

      case '$lt':
        if (this.stats.min >= compareValue) {
          return {
            canSkip: true,
            reason: 'Min value >= compare value',
            confidence: 1.0,
          };
        }
        break;

      case '$lte':
        if (this.stats.min > compareValue) {
          return {
            canSkip: true,
            reason: 'Min value > compare value',
            confidence: 1.0,
          };
        }
        break;

      case '$eq':
        if (compareValue < this.stats.min || compareValue > this.stats.max) {
          return {
            canSkip: true,
            reason: 'Value outside min/max range',
            confidence: 1.0,
          };
        }
        break;

      case '$ne':
        // Can only skip if chunk contains only one unique value equal to compareValue
        if (
          this.stats.min === this.stats.max &&
          this.stats.min === compareValue &&
          !this.stats.hasNulls
        ) {
          return {
            canSkip: true,
            reason: 'Chunk contains only the excluded value',
            confidence: 1.0,
          };
        }
        break;

      case '$in':
        if (Array.isArray(compareValue)) {
          const minInList = Math.min(...compareValue);
          const maxInList = Math.max(...compareValue);

          if (this.stats.max < minInList || this.stats.min > maxInList) {
            return {
              canSkip: true,
              reason: 'Chunk range outside $in list range',
              confidence: 1.0,
            };
          }
        }
        break;

      case '$nin':
        if (Array.isArray(compareValue)) {
          const minInList = Math.min(...compareValue);
          const maxInList = Math.max(...compareValue);

          // Can only skip if chunk range is entirely within $nin list and list is comprehensive
          if (
            this.stats.min >= minInList &&
            this.stats.max <= maxInList &&
            this.stats.min === this.stats.max &&
            compareValue.includes(this.stats.min)
          ) {
            return {
              canSkip: true,
              reason: 'Chunk value is in exclusion list',
              confidence: 1.0,
            };
          }
        }
        break;
    }

    return {
      canSkip: false,
      reason: 'Cannot determine skip condition',
      confidence: 0,
    };
  }

  /**
   * Check if an exists query can skip this chunk
   */
  canSkipForExists(exists: boolean): FilterResult {
    if (exists) {
      // Looking for non-null values
      if (this.stats.totalCount === this.stats.nullCount) {
        return {
          canSkip: true,
          reason: 'Chunk contains only nulls',
          confidence: 1.0,
        };
      }
    } else {
      // Looking for null values
      if (!this.stats.hasNulls) {
        return {
          canSkip: true,
          reason: 'Chunk contains no nulls',
          confidence: 1.0,
        };
      }
    }

    return { canSkip: false, confidence: 0 };
  }

  /**
   * Get zone map statistics
   */
  getStats(): ZoneMapStats {
    return { ...this.stats };
  }

  /**
   * Reset zone map statistics
   */
  reset() {
    this.stats = {
      min: undefined,
      max: undefined,
      nullCount: 0,
      totalCount: 0,
      dataType: 'unknown',
      hasNulls: false,
    };
  }

  /**
   * Merge with another zone map (for combining chunks)
   */
  merge(other: ZoneMap): ZoneMap {
    const merged = new ZoneMap(this.config);
    const otherStats = other.getStats();

    merged.stats.totalCount = this.stats.totalCount + otherStats.totalCount;
    merged.stats.nullCount = this.stats.nullCount + otherStats.nullCount;
    merged.stats.hasNulls = this.stats.hasNulls || otherStats.hasNulls;

    // Use primary data type
    merged.stats.dataType =
      this.stats.dataType !== 'unknown'
        ? this.stats.dataType
        : otherStats.dataType;

    // Merge min/max values
    if (this.stats.min !== undefined && otherStats.min !== undefined) {
      merged.stats.min =
        this.compareValues(this.stats.min, otherStats.min) <= 0
          ? this.stats.min
          : otherStats.min;
      merged.stats.max =
        this.compareValues(this.stats.max, otherStats.max) >= 0
          ? this.stats.max
          : otherStats.max;
    } else if (this.stats.min !== undefined) {
      merged.stats.min = this.stats.min;
      merged.stats.max = this.stats.max;
    } else if (otherStats.min !== undefined) {
      merged.stats.min = otherStats.min;
      merged.stats.max = otherStats.max;
    }

    return merged;
  }

  private updateMinMax(value: any) {
    if (
      this.stats.min === undefined ||
      this.compareValues(value, this.stats.min) < 0
    ) {
      this.stats.min = value;
    }

    if (
      this.stats.max === undefined ||
      this.compareValues(value, this.stats.max) > 0
    ) {
      this.stats.max = value;
    }
  }

  private compareValues(a: any, b: any): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  private getValueType(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'object';
  }
}

/**
 * Zone map manager for multiple columns
 */
export class ZoneMapManager {
  private zoneMaps = new Map<string, ZoneMap[]>();
  private readonly config: ZoneMapConfig;

  constructor(config: Partial<ZoneMapConfig> = {}) {
    this.config = {
      chunkSize: 1024,
      trackNulls: true,
      supportedTypes: ['number', 'string', 'boolean', 'date'],
      ...config,
    };
  }

  /**
   * Add data batch and create zone maps
   */
  addBatch(data: any[], chunkIndex: number = 0) {
    if (data.length === 0) return;

    // Get all column names from first non-null object
    const sampleObject = data.find(item => item && typeof item === 'object');
    if (!sampleObject) return;

    const columnNames = Object.keys(sampleObject);

    // Process each column
    for (const columnName of columnNames) {
      this.addColumnBatch(columnName, data, chunkIndex);
    }
  }

  /**
   * Add data for specific column
   */
  addColumnBatch(columnName: string, data: any[], chunkIndex: number = 0) {
    let columnZoneMaps = this.zoneMaps.get(columnName);

    if (!columnZoneMaps) {
      columnZoneMaps = [];
      this.zoneMaps.set(columnName, columnZoneMaps);
    }

    // Ensure we have a zone map for this chunk
    while (columnZoneMaps.length <= chunkIndex) {
      columnZoneMaps.push(new ZoneMap(this.config));
    }

    const zoneMap = columnZoneMaps[chunkIndex];
    const columnValues = data.map(item => item && item[columnName]);

    zoneMap.addValues(columnValues);
  }

  /**
   * Check which chunks can be skipped for a filter condition
   */
  getSkippableChunks(
    columnName: string,
    operator: string,
    value: any
  ): number[] {
    const skippableChunks: number[] = [];
    const columnZoneMaps = this.zoneMaps.get(columnName);

    if (!columnZoneMaps) {
      return skippableChunks;
    }

    for (let i = 0; i < columnZoneMaps.length; i++) {
      const zoneMap = columnZoneMaps[i];
      const result = zoneMap.canSkipForRange(operator, value);

      if (result.canSkip && result.confidence > 0.5) {
        skippableChunks.push(i);
      }
    }

    return skippableChunks;
  }

  /**
   * Get zone map statistics for all columns
   */
  getAllStats(): Map<string, ZoneMapStats[]> {
    const allStats = new Map<string, ZoneMapStats[]>();

    for (const [columnName, zoneMaps] of this.zoneMaps) {
      allStats.set(
        columnName,
        zoneMaps.map(zm => zm.getStats())
      );
    }

    return allStats;
  }

  /**
   * Get column statistics summary
   */
  getColumnSummary(columnName: string) {
    const zoneMaps = this.zoneMaps.get(columnName);
    if (!zoneMaps || zoneMaps.length === 0) {
      return null;
    }

    // Merge all chunks for column summary
    let merged = zoneMaps[0];
    for (let i = 1; i < zoneMaps.length; i++) {
      merged = merged.merge(zoneMaps[i]);
    }

    return merged.getStats();
  }

  /**
   * Clear all zone maps
   */
  clear() {
    this.zoneMaps.clear();
  }

  /**
   * Remove zone maps for specific column
   */
  removeColumn(columnName: string) {
    this.zoneMaps.delete(columnName);
  }

  /**
   * Get chunk count for column
   */
  getChunkCount(columnName: string): number {
    const zoneMaps = this.zoneMaps.get(columnName);
    return zoneMaps ? zoneMaps.length : 0;
  }
}

/**
 * Zone map utilities for query optimization
 */
export class ZoneMapUtils {
  /**
   * Estimate selectivity of a filter condition
   */
  static estimateSelectivity(
    zoneMap: ZoneMapStats,
    operator: string,
    value: any
  ): number {
    if (zoneMap.min === undefined || zoneMap.max === undefined) {
      return 0.5; // Unknown, assume medium selectivity
    }

    const range = zoneMap.max - zoneMap.min;
    if (range === 0) {
      // Single value
      switch (operator) {
        case '$eq':
          return zoneMap.min === value ? 1.0 : 0.0;
        case '$ne':
          return zoneMap.min === value ? 0.0 : 1.0;
        default:
          return 0.5;
      }
    }

    switch (operator) {
      case '$gt':
        return Math.max(0, (zoneMap.max - value) / range);
      case '$gte':
        return Math.max(0, (zoneMap.max - value + 1) / range);
      case '$lt':
        return Math.max(0, (value - zoneMap.min) / range);
      case '$lte':
        return Math.max(0, (value - zoneMap.min + 1) / range);
      case '$eq':
        // Very rough estimate
        return 1.0 / Math.max(1, range);
      default:
        return 0.5;
    }
  }

  /**
   * Recommend chunk size based on data characteristics
   */
  static recommendChunkSize(totalRows: number, memoryBudget: number): number {
    const bytesPerRow = 100; // Rough estimate
    const maxRowsPerChunk = Math.floor(memoryBudget / bytesPerRow);

    // Balance between too many small chunks and too few large chunks
    const targetChunks = Math.sqrt(totalRows);
    const recommendedSize = Math.floor(totalRows / targetChunks);

    return Math.min(maxRowsPerChunk, Math.max(256, recommendedSize));
  }

  /**
   * Analyze column for zone map effectiveness
   */
  static analyzeColumn(values: any[]): {
    effectiveness: number;
    dataType: string;
    uniqueValues: number;
    nullRate: number;
    recommendation: string;
  } {
    if (values.length === 0) {
      return {
        effectiveness: 0,
        dataType: 'unknown',
        uniqueValues: 0,
        nullRate: 0,
        recommendation: 'No data to analyze',
      };
    }

    const nonNullValues = values.filter(v => v !== null && v !== undefined);
    const uniqueValues = new Set(nonNullValues).size;
    const nullRate = (values.length - nonNullValues.length) / values.length;
    const dataType =
      nonNullValues.length > 0 ? typeof nonNullValues[0] : 'unknown';

    // Calculate effectiveness based on cardinality and data type
    let effectiveness = 0;

    if (dataType === 'number' || dataType === 'string') {
      // High effectiveness for ordered data types
      const cardinalityRatio = uniqueValues / nonNullValues.length;
      effectiveness = Math.min(1.0, 1.0 - cardinalityRatio + 0.1);
    } else if (dataType === 'boolean') {
      // Medium effectiveness for boolean
      effectiveness = 0.5;
    } else {
      // Low effectiveness for complex types
      effectiveness = 0.2;
    }

    let recommendation = '';
    if (effectiveness > 0.7) {
      recommendation = 'Highly recommended - good for zone maps';
    } else if (effectiveness > 0.4) {
      recommendation = 'Moderately effective for zone maps';
    } else {
      recommendation = 'Low effectiveness - consider other indexing strategies';
    }

    return {
      effectiveness,
      dataType,
      uniqueValues,
      nullRate,
      recommendation,
    };
  }
}
