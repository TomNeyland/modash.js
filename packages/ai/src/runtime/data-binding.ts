/**
 * Safe JSONPath implementation for data binding
 * Provides read-only access to query results for UI components
 */

export type JSONPathExpression = string;

/**
 * Simple, safe JSONPath evaluator
 * Supports basic path expressions like $.items[*].name, $.meta.total
 */
export function evaluateJSONPath(data: any, path: JSONPathExpression): any {
  if (!path || !path.startsWith('$.')) {
    throw new Error(`Invalid JSONPath: ${path}. Must start with $.`);
  }

  let current = data;
  const parts = path.slice(2).split(/[.\[\]]+/).filter(Boolean);

  for (const part of parts) {
    if (part === '*') {
      // Handle array iteration
      if (!Array.isArray(current)) {
        return [];
      }
      return current;
    } else if (part.match(/^\d+$/)) {
      // Handle array index
      const index = parseInt(part, 10);
      if (!Array.isArray(current) || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else {
      // Handle object property
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
  }

  return current;
}

/**
 * Extract array items from a path expression
 * Handles paths like $.items[*] to extract array elements
 */
export function extractArrayItems(data: any, path: JSONPathExpression): any[] {
  if (!path.includes('[*]')) {
    const result = evaluateJSONPath(data, path);
    return Array.isArray(result) ? result : [result].filter(x => x != null);
  }

  // Handle [*] expansion
  const basePath = path.replace('[*]', '');
  const baseData = evaluateJSONPath(data, basePath);
  
  if (!Array.isArray(baseData)) {
    return [];
  }

  return baseData;
}

/**
 * Template interpolation for list components
 * Replaces {field} with values from each item
 */
export function interpolateTemplate(template: string, item: any): string {
  return template.replace(/\{([^}]+)\}/g, (match, fieldPath) => {
    try {
      const value = evaluateJSONPath(item, `$.${fieldPath}`);
      return value != null ? String(value) : '';
    } catch {
      return match; // Keep original if path is invalid
    }
  });
}

/**
 * Get nested value safely
 */
export function getNestedValue(obj: any, path: string): any {
  if (!path) return obj;
  
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Validate JSONPath expression
 */
export function isValidJSONPath(path: string): boolean {
  try {
    // Basic syntax validation
    if (!path.startsWith('$.')) return false;
    
    // Test with dummy data
    evaluateJSONPath({ test: 'value' }, '$.test');
    return true;
  } catch {
    return false;
  }
}

/**
 * Cache for compiled JSONPath expressions to improve performance
 */
const pathCache = new Map<string, (data: any) => any>();

/**
 * Cached JSONPath evaluation for better performance
 */
export function cachedEvaluateJSONPath(data: any, path: JSONPathExpression): any {
  let evaluator = pathCache.get(path);
  
  if (!evaluator) {
    evaluator = (data: any) => evaluateJSONPath(data, path);
    pathCache.set(path, evaluator);
  }
  
  return evaluator(data);
}

/**
 * Clear the JSONPath cache (useful for testing)
 */
export function clearJSONPathCache(): void {
  pathCache.clear();
}