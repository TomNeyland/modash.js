/**
 * Path Caching System for modash.js
 * Optimizes property access by caching compiled path accessors
 */

import type { DocumentValue } from './expressions.js';

interface CompiledPath {
  segments: string[];
  isSimple: boolean;
  accessor: (obj: any) => any;
  lastUsed: number;
  hitCount: number;
}

const PATH_CACHE_SIZE = 1000;
const SIMPLE_PATH_REGEX =
  /^[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/;

/**
 * High-performance path caching system
 */
export class PathCache {
  private cache = new Map<string, CompiledPath>();
  private accessCount = 0;

  /**
   * Get value from object using cached path accessor
   */
  getValue(obj: any, path: string): any {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    // Handle simple single-property access
    if (path.indexOf('.') === -1) {
      return obj[path];
    }

    const compiled = this.getOrCompilePath(path);
    compiled.lastUsed = Date.now();
    compiled.hitCount++;

    return compiled.accessor(obj);
  }

  /**
   * Set value in object using cached path accessor
   */
  setValue(obj: any, path: string, value: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Handle simple single-property access
    if (path.indexOf('.') === -1) {
      obj[path] = value;
      return;
    }

    const compiled = this.getOrCompilePath(path);
    compiled.lastUsed = Date.now();
    compiled.hitCount++;

    this.setValueWithCompiledPath(obj, compiled, value);
  }

  /**
   * Check if path exists in object
   */
  hasPath(obj: any, path: string): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    // Handle simple single-property access
    if (path.indexOf('.') === -1) {
      return path in obj;
    }

    const compiled = this.getOrCompilePath(path);
    const value = compiled.accessor(obj);
    return value !== undefined;
  }

  /**
   * Get or compile path accessor
   */
  private getOrCompilePath(path: string): CompiledPath {
    let compiled = this.cache.get(path);

    if (!compiled) {
      compiled = this.compilePath(path);

      // Manage cache size
      if (this.cache.size >= PATH_CACHE_SIZE) {
        this.evictLeastUsed();
      }

      this.cache.set(path, compiled);
    }

    return compiled;
  }

  /**
   * Compile path into optimized accessor function
   */
  private compilePath(path: string): CompiledPath {
    const segments = path.split('.');
    const isSimple = SIMPLE_PATH_REGEX.test(path);

    let accessor: (obj: any) => any;

    if (isSimple && segments.length <= 4) {
      // Create specialized fast accessors for common patterns
      accessor = this.createFastAccessor(segments);
    } else {
      // Create general-purpose accessor
      accessor = this.createGeneralAccessor(segments);
    }

    return {
      segments,
      isSimple,
      accessor,
      lastUsed: Date.now(),
      hitCount: 0,
    };
  }

  /**
   * Create fast accessor for simple paths
   */
  private createFastAccessor(segments: string[]): (obj: any) => any {
    switch (segments.length) {
      case 1:
        return (obj: any) => obj?.[segments[0]];

      case 2:
        return (obj: any) => obj?.[segments[0]]?.[segments[1]];

      case 3:
        return (obj: any) => obj?.[segments[0]]?.[segments[1]]?.[segments[2]];

      case 4:
        return (obj: any) =>
          obj?.[segments[0]]?.[segments[1]]?.[segments[2]]?.[segments[3]];

      default:
        return this.createGeneralAccessor(segments);
    }
  }

  /**
   * Create general-purpose accessor
   */
  private createGeneralAccessor(segments: string[]): (obj: any) => any {
    return (obj: any) => {
      let current = obj;

      for (let i = 0; i < segments.length; i++) {
        if (current === null || current === undefined) {
          return undefined;
        }
        current = current[segments[i]];
      }

      return current;
    };
  }

  /**
   * Set value using compiled path
   */
  private setValueWithCompiledPath(
    obj: any,
    compiled: CompiledPath,
    value: any
  ): void {
    const segments = compiled.segments;
    let current = obj;

    // Navigate to parent object
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];

      if (current[segment] === null || current[segment] === undefined) {
        current[segment] = {};
      }

      current = current[segment];
    }

    // Set the final value
    current[segments[segments.length - 1]] = value;
  }

  /**
   * Evict least recently used entries
   */
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());

    // Sort by last used time (ascending)
    entries.sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);

    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalHits = Array.from(this.cache.values()).reduce(
      (sum, compiled) => sum + compiled.hitCount,
      0
    );

    const paths = Array.from(this.cache.values());
    const avgHits = paths.length > 0 ? totalHits / paths.length : 0;

    return {
      cacheSize: this.cache.size,
      totalHits,
      avgHitsPerPath: Math.round(avgHits * 100) / 100,
      totalAccesses: this.accessCount,
      hitRate: this.accessCount > 0 ? (totalHits / this.accessCount) * 100 : 0,
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessCount = 0;
  }
}

/**
 * Global path cache instance
 */
export const globalPathCache = new PathCache();

/**
 * Optimized property access utilities
 */
export class FastPropertyAccess {
  private static pathCache = globalPathCache;

  /**
   * Fast get with path caching
   */
  static get(obj: any, path: string): any {
    return this.pathCache.getValue(obj, path);
  }

  /**
   * Fast set with path caching
   */
  static set(obj: any, path: string, value: any): void {
    this.pathCache.setValue(obj, path, value);
  }

  /**
   * Fast has check with path caching
   */
  static has(obj: any, path: string): boolean {
    return this.pathCache.hasPath(obj, path);
  }

  /**
   * Batch property access optimization
   */
  static batchGet(objects: any[], paths: string[]): DocumentValue[][] {
    const results: DocumentValue[][] = [];

    // Pre-compile all paths
    const compiledPaths = paths.map(path => ({
      path,
      compiled: this.pathCache.getOrCompilePath(path),
    }));

    // Process all objects with compiled paths
    for (const obj of objects) {
      const row: DocumentValue[] = [];

      for (const { compiled } of compiledPaths) {
        row.push(compiled.accessor(obj));
        compiled.hitCount++;
      }

      results.push(row);
    }

    return results;
  }

  /**
   * Optimized property mapping
   */
  static mapProperties<T, R>(
    objects: T[],
    mapper: (obj: T) => R,
    cachePaths = true
  ): R[] {
    if (!cachePaths) {
      return objects.map(mapper);
    }

    // This would analyze the mapper function to extract property access patterns
    // For now, just use regular mapping
    return objects.map(mapper);
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return this.pathCache.getStats();
  }

  /**
   * Clear path cache
   */
  static clearCache(): void {
    this.pathCache.clear();
  }
}

/**
 * Property access optimization decorator
 */
export function withPathCaching<T extends any[], R>(
  fn: (...args: T) => R,
  pathExtractor?: (args: T) => string[]
) {
  return function (...args: T): R {
    // Pre-warm cache with extracted paths if provided
    if (pathExtractor) {
      const paths = pathExtractor(args);
      paths.forEach(path => globalPathCache.getOrCompilePath(path));
    }

    return fn(...args);
  };
}
