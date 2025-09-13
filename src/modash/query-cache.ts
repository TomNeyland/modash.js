/**
 * Query Result Caching System for modash.js
 * Implements intelligent caching of query results for repeated operations
 */

import type { Collection, Document } from './expressions.js';
import type { Pipeline } from '../index.js';

interface CacheEntry {
  result: Collection<Document>;
  timestamp: number;
  accessCount: number;
  dataSignature: string;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export class QueryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private maxAge: number; // in milliseconds
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, hitRate: 0 };

  constructor(maxSize = 100, maxAgeMinutes = 5) {
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  /**
   * Generate a cache key from pipeline and data signature
   */
  private generateCacheKey(
    pipeline: Pipeline,
    dataSignature: string
  ): string {
    const pipelineKey = JSON.stringify(pipeline);
    return `${dataSignature}:${this.simpleHash(pipelineKey)}`;
  }

  /**
   * Generate a signature for the data to detect changes
   */
  private generateDataSignature<T extends Document>(
    collection: Collection<T>
  ): string {
    if (collection.length === 0) return 'empty';
    
    // Use length + first/last element hash for lightweight signature
    const first = JSON.stringify(collection[0]);
    const last = collection.length > 1 
      ? JSON.stringify(collection[collection.length - 1]) 
      : first;
    
    return `${collection.length}:${this.simpleHash(first)}:${this.simpleHash(last)}`;
  }

  /**
   * Simple hash function for strings
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Check if result is cached and still valid
   */
  get<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> | null {
    const dataSignature = this.generateDataSignature(collection);
    const cacheKey = this.generateCacheKey(pipeline, dataSignature);
    
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Check if data has changed
    if (entry.dataSignature !== dataSignature) {
      this.cache.delete(cacheKey);
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    // Cache hit
    entry.accessCount++;
    this.stats.hits++;
    this.updateStats();
    
    return entry.result as Collection<T>;
  }

  /**
   * Store result in cache
   */
  set<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline,
    result: Collection<T>
  ): void {
    // Don't cache very large results or very small collections
    if (result.length > 10000 || collection.length < 10) {
      return;
    }

    const dataSignature = this.generateDataSignature(collection);
    const cacheKey = this.generateCacheKey(pipeline, dataSignature);

    // Clean up if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictLeastUsed();
    }

    const entry: CacheEntry = {
      result: result as Collection<Document>,
      timestamp: Date.now(),
      accessCount: 1,
      dataSignature,
    };

    this.cache.set(cacheKey, entry);
    this.updateStats();
  }

  /**
   * Evict least recently used entries
   */
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by access count (ascending) and timestamp (ascending)
    entries.sort((a, b) => {
      const accessDiff = a[1].accessCount - b[1].accessCount;
      if (accessDiff !== 0) return accessDiff;
      return a[1].timestamp - b[1].timestamp;
    });

    // Remove the least used 25% of entries
    const toRemove = Math.max(1, Math.floor(entries.length * 0.25));
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.maxAge) {
        toDelete.push(key);
      }
    }

    toDelete.forEach(key => this.cache.delete(key));
    this.updateStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, size: 0, hitRate: 0 };
  }

  /**
   * Get detailed cache information for debugging
   */
  getDebugInfo() {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      timestamp: new Date(entry.timestamp).toISOString(),
      accessCount: entry.accessCount,
      resultSize: entry.result.length,
      age: Date.now() - entry.timestamp,
    }));

    return {
      stats: this.getStats(),
      entries: entries.sort((a, b) => b.accessCount - a.accessCount),
    };
  }
}

// Singleton instance for global use
export const globalQueryCache = new QueryCache();