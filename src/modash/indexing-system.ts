/**
 * Intelligent Indexing System for modash.js
 * Provides automatic index creation and management for optimized queries
 */

import type { Collection, Document } from './expressions.js';

interface IndexStatistics {
  hitCount: number;
  createTime: number;
  lastUsed: number;
  avgSelectivity: number;
  totalQueries: number;
}

interface IndexEntry {
  field: string;
  type: 'equality' | 'range' | 'composite';
  data: Map<any, Set<number>>;
  stats: IndexStatistics;
}

export class IndexingSystem {
  private indexes: Map<string, IndexEntry> = new Map();
  private queryPatterns: Map<string, number> = new Map();
  private autoIndexThreshold = 3;
  private maxIndexes = 50;

  /**
   * Auto-create indexes based on query patterns
   */
  trackQuery(
    field: string,
    operator: string,
    collection: Collection<Document>
  ) {
    const pattern = `${field}:${operator}`;
    const currentCount = this.queryPatterns.get(pattern) || 0;
    this.queryPatterns.set(pattern, currentCount + 1);

    // Auto-create index if threshold met
    if (
      currentCount + 1 >= this.autoIndexThreshold &&
      !this.indexes.has(field)
    ) {
      this.createIndex(
        field,
        collection,
        operator === '$eq' ? 'equality' : 'range'
      );
    }
  }

  /**
   * Create an index for a specific field
   */
  createIndex(
    field: string,
    collection: Collection<Document>,
    type: 'equality' | 'range' | 'composite' = 'equality'
  ): boolean {
    if (this.indexes.has(field) || this.indexes.size >= this.maxIndexes) {
      return false;
    }

    const startTime = performance.now();
    const indexData = new Map<any, Set<number>>();

    // Build index
    for (let i = 0; i < collection.length; i++) {
      const value = this.getNestedValue(collection[i], field);

      if (value !== undefined && value !== null) {
        if (!indexData.has(value)) {
          indexData.set(value, new Set());
        }
        indexData.get(value)!.add(i);
      }
    }

    const index: IndexEntry = {
      field,
      type,
      data: indexData,
      stats: {
        hitCount: 0,
        createTime: performance.now() - startTime,
        lastUsed: Date.now(),
        avgSelectivity: this.calculateSelectivity(indexData, collection.length),
        totalQueries: 0,
      },
    };

    this.indexes.set(field, index);
    return true;
  }

  /**
   * Use index for equality lookups
   */
  lookup(field: string, value: any): number[] | null {
    const index = this.indexes.get(field);
    if (!index || index.type !== 'equality') {
      return null;
    }

    // Update statistics
    index.stats.hitCount++;
    index.stats.lastUsed = Date.now();
    index.stats.totalQueries++;

    const indices = index.data.get(value);
    return indices ? Array.from(indices) : [];
  }

  /**
   * Use index for range queries
   */
  rangeLookup(field: string, min?: any, max?: any): number[] | null {
    const index = this.indexes.get(field);
    if (!index) {
      return null;
    }

    const results = new Set<number>();

    // Update statistics
    index.stats.hitCount++;
    index.stats.lastUsed = Date.now();
    index.stats.totalQueries++;

    for (const [indexValue, indices] of index.data) {
      let include = true;

      if (min !== undefined && indexValue < min) include = false;
      if (max !== undefined && indexValue > max) include = false;

      if (include) {
        indices.forEach(idx => results.add(idx));
      }
    }

    return Array.from(results);
  }

  /**
   * Check if an index exists for a field
   */
  hasIndex(field: string): boolean {
    return this.indexes.has(field);
  }

  /**
   * Get index statistics
   */
  getIndexStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [field, index] of this.indexes) {
      stats[field] = {
        type: index.type,
        size: index.data.size,
        hitCount: index.stats.hitCount,
        createTime: index.stats.createTime,
        avgSelectivity: index.stats.avgSelectivity,
        totalQueries: index.stats.totalQueries,
        hitRate:
          index.stats.totalQueries > 0
            ? `${(
                (index.stats.hitCount / index.stats.totalQueries) *
                100
              ).toFixed(1)}%`
            : '0%',
      };
    }

    return stats;
  }

  /**
   * Clear unused indexes based on usage patterns
   */
  cleanupIndexes(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [field, index] of this.indexes) {
      if (now - index.stats.lastUsed > maxAge && index.stats.hitCount < 5) {
        this.indexes.delete(field);
      }
    }
  }

  /**
   * Update index when data changes
   */
  updateIndex(field: string, collection: Collection<Document>): void {
    const index = this.indexes.get(field);
    if (!index) return;

    // Recreate index with new data
    this.indexes.delete(field);
    this.createIndex(field, collection, index.type);
  }

  /**
   * Get suggested indexes based on query patterns
   */
  getSuggestedIndexes(): string[] {
    const suggestions: string[] = [];

    for (const [pattern, count] of this.queryPatterns) {
      const field = pattern.split(':')[0];

      if (
        count >= Math.floor(this.autoIndexThreshold / 2) &&
        !this.indexes.has(field) &&
        suggestions.length < 10
      ) {
        suggestions.push(field);
      }
    }

    return suggestions;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private calculateSelectivity(
    indexData: Map<any, Set<number>>,
    totalDocs: number
  ): number {
    if (totalDocs === 0) return 1;

    const totalUniqueValues = indexData.size;
    return totalUniqueValues / totalDocs;
  }
}
