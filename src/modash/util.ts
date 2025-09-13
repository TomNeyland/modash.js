/**
 * Modern JavaScript utility functions to replace lodash
 * All functions are immutable and functional programming style
 */

/**
 * Deep property getter - replaces lodash.get
 */
export function get(obj: any, path: string | string[], defaultValue?: any): any {
  if (obj == null) return defaultValue;
  
  const keys = Array.isArray(path) ? path : path.split('.');
  let result = obj;
  
  for (const key of keys) {
    result = result?.[key];
    if (result === undefined) return defaultValue;
  }
  
  return result;
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
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    } else {
      current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] };
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
  return value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Deep equality check - replaces lodash.isEqual
 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
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
 * Array intersection - replaces lodash.intersection
 */
export function intersection<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter(item => arr2.includes(item));
}

/**
 * Array union - replaces lodash.union
 */
export function union<T>(...arrays: T[][]): T[] {
  return [...new Set(arrays.flat())];
}

/**
 * Array difference - replaces lodash.difference
 */
export function difference<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter(item => !arr2.includes(item));
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
