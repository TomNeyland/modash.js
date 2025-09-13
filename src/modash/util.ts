/**
 * Modern JavaScript utility functions to replace lodash
 * All functions are immutable and functional programming style
 */

// Path cache for compiled property access patterns
const pathCache = new WeakMap<object, Map<string, Function>>();

/**
 * Fast property getter with optimized paths for common patterns
 * Provides significant performance improvement over generic property access
 */
export function fastGet(
  obj: any,
  path: string | string[],
  defaultValue?: any
): any {
  if (obj === null || obj === undefined) return defaultValue;

  // Fast path for simple single-level property access
  if (typeof path === 'string' && !path.includes('.')) {
    const result = obj[path];
    return result !== undefined ? result : defaultValue;
  }

  // Fast path for two-level nested access (most common pattern)
  if (typeof path === 'string' && path.indexOf('.') === path.lastIndexOf('.')) {
    const dotIndex = path.indexOf('.');
    const first = path.slice(0, dotIndex);
    const second = path.slice(dotIndex + 1);
    const intermediate = obj[first];
    if (intermediate === null || intermediate === undefined) return defaultValue;
    const result = intermediate[second];
    return result !== undefined ? result : defaultValue;
  }

  // Fallback to generic path traversal for complex paths
  const keys = Array.isArray(path) ? path : path.split('.');
  let result = obj;

  for (const key of keys) {
    result = result?.[key];
    if (result === undefined) return defaultValue;
  }

  return result;
}

/**
 * Deep property getter - replaces lodash.get
 * Now uses fastGet for improved performance
 */
export function get(
  obj: any,
  path: string | string[],
  defaultValue?: any
): any {
  return fastGet(obj, path, defaultValue);
}

/**
 * Deep property setter - replaces lodash.set (immutable version)
 */
export function set(obj: any, path: string | string[], value: any): any {
  const keys = Array.isArray(path) ? path : path.split('.');
  const result = Array.isArray(obj) ? [...obj] : { ...obj };
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      current[key] === null ||
      current[key] === undefined ||
      typeof current[key] !== 'object'
    ) {
      current[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    } else {
      current[key] = Array.isArray(current[key])
        ? [...current[key]]
        : { ...current[key] };
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return result;
}

/**
 * Deep merge objects - replaces lodash.merge
 */
export function merge(target: any, ...sources: any[]): any {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    const result = { ...target };
    for (const key in source) {
      if (isObject(source[key])) {
        if (!result[key]) result[key] = {};
        result[key] = merge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return merge(result, ...sources);
  }

  return target;
}

/**
 * Check if value is a plain object
 */
export function isObject(value: any): value is Record<string, any> {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Deep equality check - replaces lodash.isEqual
 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => isEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Fast array intersection using Set for O(1) lookups
 */
export function intersection<T>(arr1: T[], arr2: T[]): T[] {
  if (arr1.length === 0 || arr2.length === 0) return [];
  
  // Use the smaller array for Set construction
  const [smaller, larger] = arr1.length <= arr2.length ? [arr1, arr2] : [arr2, arr1];
  const set = new Set(smaller);
  
  return larger.filter(item => set.has(item));
}

/**
 * Fast array union using Set for deduplication
 */
export function union<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return [...arrays[0]];
  
  return [...new Set(arrays.flat())];
}

/**
 * Fast array difference using Set for O(1) lookups
 */
export function difference<T>(arr1: T[], arr2: T[]): T[] {
  if (arr1.length === 0) return [];
  if (arr2.length === 0) return [...arr1];
  
  const excludeSet = new Set(arr2);
  return arr1.filter(item => !excludeSet.has(item));
}

/**
 * Comparison functions
 */
export function gt(a: any, b: any): boolean {
  return a > b;
}

export function gte(a: any, b: any): boolean {
  return a >= b;
}

export function lt(a: any, b: any): boolean {
  return a < b;
}

export function lte(a: any, b: any): boolean {
  return a <= b;
}

/**
 * Fast groupBy implementation using Map for O(1) key lookups
 * Significantly faster than object-based grouping for large datasets
 */
export function fastGroupBy<T>(
  collection: T[],
  keyFn: (item: T) => any
): Map<any, T[]> {
  const groups = new Map<any, T[]>();
  
  for (const item of collection) {
    const key = keyFn(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }
  
  return groups;
}

/**
 * Optimized unique values extraction using Set
 */
export function uniqueValues<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Fast object cloning for performance-critical paths
 */
export function fastClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (Array.isArray(obj)) return obj.slice() as T;
  
  // Shallow clone for objects (faster than deep clone when deep isn't needed)
  return { ...obj };
}

/**
 * Efficient array flattening
 */
export function flattenArray<T>(arr: (T | T[])[]): T[] {
  const result: T[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}
