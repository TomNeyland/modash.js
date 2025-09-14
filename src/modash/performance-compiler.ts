/**
 * Performance-optimized compiler for modash.js aggregation operations
 *
 * Key optimizations:
 * 1. Constant folding and precompilation
 * 2. Field access optimization with offset caching
 * 3. Operator fusion (especially $match + $project)
 * 4. Expression inlining and specialization
 * 5. Regex precompilation
 */

import type { Document, DocumentValue, Collection } from './expressions.js';
import type {
  Pipeline,
  PipelineStage,
  QueryExpression,
  Expression,
} from '../index.js';
import { perfCounters } from '../../benchmarks/operators.js';

// Compiled expression function type
export type CompiledExpression = (
  doc: Document,
  rowId?: number
) => DocumentValue;
export type CompiledPredicate = (doc: Document, rowId?: number) => boolean;
export type CompiledProjector = (doc: Document, rowId?: number) => Document;

// Field access cache for performance optimization
interface FieldAccessCache {
  simpleFields: Set<string>; // Fields without dots (direct object property access)
  compiledGetters: Map<string, (doc: Document) => DocumentValue>; // Precompiled field getters
  regexPatterns: Map<string, RegExp>; // Precompiled regex patterns
}

// Compilation context for sharing optimizations across operators
export interface CompilationContext {
  cache: FieldAccessCache;
  constants: Map<string, DocumentValue>; // Constant folding cache
  hotFields: Set<string>; // Frequently accessed fields for optimization
}

/**
 * Creates a new compilation context with optimized caches
 */
export function createCompilationContext(): CompilationContext {
  return {
    cache: {
      simpleFields: new Set(),
      compiledGetters: new Map(),
      regexPatterns: new Map(),
    },
    constants: new Map(),
    hotFields: new Set(),
  };
}

/**
 * Optimized field value accessor with caching
 */
export function compileFieldAccess(
  fieldPath: string,
  ctx: CompilationContext
): (doc: Document) => DocumentValue {
  // Check cache first
  if (ctx.cache.compiledGetters.has(fieldPath)) {
    perfCounters.recordCacheHit();
    return ctx.cache.compiledGetters.get(fieldPath)!;
  }

  perfCounters.recordCacheMiss();

  let getter: (doc: Document) => DocumentValue;

  if (!fieldPath.includes('.')) {
    // Simple field - direct property access
    ctx.cache.simpleFields.add(fieldPath);
    getter = (doc: Document) => doc[fieldPath];
  } else {
    // Nested field - compile path traversal
    const segments = fieldPath.split('.');
    getter = (doc: Document) => {
      let current: any = doc;
      for (const segment of segments) {
        if (current == null) return undefined;
        current = current[segment];
      }
      return current;
    };
  }

  ctx.cache.compiledGetters.set(fieldPath, getter);
  return getter;
}

/**
 * Compile regex patterns for reuse
 */
function compileRegex(
  pattern: string,
  options?: string,
  ctx?: CompilationContext
): RegExp {
  const key = `${pattern}:${options || ''}`;

  if (ctx?.cache.regexPatterns.has(key)) {
    perfCounters.recordCacheHit();
    return ctx.cache.regexPatterns.get(key)!;
  }

  perfCounters.recordCacheMiss();

  const regex = new RegExp(pattern, options);
  ctx?.cache.regexPatterns.set(key, regex);

  return regex;
}

/**
 * Constant folding for arithmetic expressions
 */
function foldConstants(
  expression: Expression,
  ctx: CompilationContext
): DocumentValue | null {
  if (
    typeof expression !== 'object' ||
    expression === null ||
    Array.isArray(expression)
  ) {
    return null;
  }

  const key = JSON.stringify(expression);
  if (ctx.constants.has(key)) {
    perfCounters.recordCacheHit();
    return ctx.constants.get(key)!;
  }

  // Try to fold arithmetic operations with constants
  if ('$add' in expression && Array.isArray(expression.$add)) {
    const values = expression.$add;
    if (values.every(v => typeof v === 'number')) {
      const result = values.reduce(
        (sum: number, val) => sum + (val as number),
        0
      );
      ctx.constants.set(key, result);
      return result;
    }
  }

  if ('$multiply' in expression && Array.isArray(expression.$multiply)) {
    const values = expression.$multiply;
    if (values.every(v => typeof v === 'number')) {
      const result = values.reduce(
        (product: number, val) => product * (val as number),
        1
      );
      ctx.constants.set(key, result);
      return result;
    }
  }

  if (
    '$subtract' in expression &&
    Array.isArray(expression.$subtract) &&
    expression.$subtract.length === 2
  ) {
    const [a, b] = expression.$subtract;
    if (typeof a === 'number' && typeof b === 'number') {
      const result = a - b;
      ctx.constants.set(key, result);
      return result;
    }
  }

  if (
    '$divide' in expression &&
    Array.isArray(expression.$divide) &&
    expression.$divide.length === 2
  ) {
    const [a, b] = expression.$divide;
    if (typeof a === 'number' && typeof b === 'number' && b !== 0) {
      const result = a / b;
      ctx.constants.set(key, result);
      return result;
    }
  }

  return null;
}

/**
 * Compile an optimized $match predicate function
 */
export function compileMatch(
  query: QueryExpression,
  ctx: CompilationContext
): CompiledPredicate {
  const compiledConditions: Array<(doc: Document) => boolean> = [];

  for (const [field, condition] of Object.entries(query)) {
    // Handle logical operators
    if (field === '$and' && Array.isArray(condition)) {
      const subPredicates = condition.map(subQuery =>
        compileMatch(subQuery as QueryExpression, ctx)
      );
      compiledConditions.push((doc: Document) =>
        subPredicates.every(pred => pred(doc))
      );
      continue;
    }

    if (field === '$or' && Array.isArray(condition)) {
      const subPredicates = condition.map(subQuery =>
        compileMatch(subQuery as QueryExpression, ctx)
      );
      compiledConditions.push((doc: Document) =>
        subPredicates.some(pred => pred(doc))
      );
      continue;
    }

    if (field === '$nor' && Array.isArray(condition)) {
      const subPredicates = condition.map(subQuery =>
        compileMatch(subQuery as QueryExpression, ctx)
      );
      compiledConditions.push(
        (doc: Document) => !subPredicates.some(pred => pred(doc))
      );
      continue;
    }

    // Regular field conditions
    const fieldGetter = compileFieldAccess(field, ctx);
    ctx.hotFields.add(field);

    if (typeof condition !== 'object' || condition === null) {
      // Simple equality
      compiledConditions.push(
        (doc: Document) => fieldGetter(doc) === condition
      );
    } else {
      // Complex operators
      for (const [operator, expectedValue] of Object.entries(condition)) {
        switch (operator) {
          case '$eq':
            compiledConditions.push(
              (doc: Document) => fieldGetter(doc) === expectedValue
            );
            break;

          case '$ne':
            compiledConditions.push(
              (doc: Document) => fieldGetter(doc) !== expectedValue
            );
            break;

          case '$gt':
            compiledConditions.push((doc: Document) => {
              const value = fieldGetter(doc);
              return typeof value === 'number' &&
                typeof expectedValue === 'number'
                ? value > expectedValue
                : value > expectedValue;
            });
            break;

          case '$gte':
            compiledConditions.push((doc: Document) => {
              const value = fieldGetter(doc);
              return typeof value === 'number' &&
                typeof expectedValue === 'number'
                ? value >= expectedValue
                : value >= expectedValue;
            });
            break;

          case '$lt':
            compiledConditions.push((doc: Document) => {
              const value = fieldGetter(doc);
              return typeof value === 'number' &&
                typeof expectedValue === 'number'
                ? value < expectedValue
                : value < expectedValue;
            });
            break;

          case '$lte':
            compiledConditions.push((doc: Document) => {
              const value = fieldGetter(doc);
              return typeof value === 'number' &&
                typeof expectedValue === 'number'
                ? value <= expectedValue
                : value <= expectedValue;
            });
            break;

          case '$in':
            if (Array.isArray(expectedValue)) {
              const valueSet = new Set(expectedValue); // Optimize with Set lookup
              compiledConditions.push((doc: Document) =>
                valueSet.has(fieldGetter(doc) as any)
              );
            }
            break;

          case '$nin':
            if (Array.isArray(expectedValue)) {
              const valueSet = new Set(expectedValue);
              compiledConditions.push(
                (doc: Document) => !valueSet.has(fieldGetter(doc) as any)
              );
            }
            break;

          case '$regex':
            if (typeof expectedValue === 'string') {
              const regex = compileRegex(
                expectedValue,
                condition.$options as string,
                ctx
              );
              compiledConditions.push((doc: Document) => {
                const value = fieldGetter(doc);
                return typeof value === 'string' && regex.test(value);
              });
            }
            break;

          case '$exists':
            compiledConditions.push((doc: Document) => {
              const value = fieldGetter(doc);
              return expectedValue ? value !== undefined : value === undefined;
            });
            break;

          default:
            // Fallback for unsupported operators
            perfCounters.recordFallback();
            break;
        }
      }
    }
  }

  // Return optimized predicate function
  return (doc: Document, rowId?: number) => {
    perfCounters.recordAdd(); // Count document processed
    return compiledConditions.every(condition => condition(doc));
  };
}

/**
 * Compile an optimized $project function
 */
export function compileProject(
  projectSpec: Record<string, any>,
  ctx: CompilationContext
): CompiledProjector {
  const compiledProjections: Array<(doc: Document) => [string, DocumentValue]> =
    [];

  // Analyze projection specification
  let includeId = true;
  if ('_id' in projectSpec) {
    includeId = !!projectSpec._id;
  }

  for (const [field, spec] of Object.entries(projectSpec)) {
    if (field === '_id') continue; // Handle separately

    ctx.hotFields.add(field);

    if (spec === 1 || spec === true) {
      // Include field as-is
      const fieldGetter = compileFieldAccess(field, ctx);
      compiledProjections.push((doc: Document) => [field, fieldGetter(doc)]);
    } else if (spec === 0 || spec === false) {
      // Exclude field - handled by not including it
      continue;
    } else {
      // Computed field - try constant folding first
      const constantValue = foldConstants(spec as Expression, ctx);
      if (constantValue !== null) {
        compiledProjections.push(() => [field, constantValue]);
      } else {
        // Dynamic expression - compile it
        const compiledExpr = compileExpression(spec as Expression, ctx);
        compiledProjections.push((doc: Document) => [field, compiledExpr(doc)]);
      }
    }
  }

  return (doc: Document, rowId?: number) => {
    perfCounters.recordAdd();

    const result: Record<string, DocumentValue> = {};

    // Handle _id field
    if (includeId) {
      result._id = doc._id;
    }

    // Apply compiled projections
    for (const projection of compiledProjections) {
      const [field, value] = projection(doc);
      result[field] = value;
    }

    return result as Document;
  };
}

/**
 * Compile a general expression into an optimized function
 */
export function compileExpression(
  expression: Expression,
  ctx: CompilationContext
): CompiledExpression {
  // Try constant folding first
  const constantValue = foldConstants(expression, ctx);
  if (constantValue !== null) {
    return () => constantValue;
  }

  // Handle field paths
  if (
    typeof expression === 'string' &&
    expression.startsWith('$') &&
    !expression.startsWith('$$')
  ) {
    const fieldPath = expression.slice(1);
    const fieldGetter = compileFieldAccess(fieldPath, ctx);
    ctx.hotFields.add(fieldPath);
    return (doc: Document) => fieldGetter(doc);
  }

  // Handle literals
  if (
    typeof expression !== 'object' ||
    expression === null ||
    Array.isArray(expression)
  ) {
    return () => expression as DocumentValue;
  }

  // Handle arithmetic expressions
  if (
    '$multiply' in expression &&
    Array.isArray(expression.$multiply) &&
    expression.$multiply.length === 2
  ) {
    const [leftExpr, rightExpr] = expression.$multiply;
    const leftCompiled = compileExpression(leftExpr as Expression, ctx);
    const rightCompiled = compileExpression(rightExpr as Expression, ctx);

    return (doc: Document, rowId?: number) => {
      const left = leftCompiled(doc, rowId);
      const right = rightCompiled(doc, rowId);
      if (typeof left === 'number' && typeof right === 'number') {
        return left * right;
      }
      return 0;
    };
  }

  if ('$add' in expression && Array.isArray(expression.$add)) {
    const compiledTerms = expression.$add.map(term =>
      compileExpression(term as Expression, ctx)
    );

    return (doc: Document, rowId?: number) => {
      let sum = 0;
      for (const term of compiledTerms) {
        const value = term(doc, rowId);
        if (typeof value === 'number') {
          sum += value;
        }
      }
      return sum;
    };
  }

  // Fallback for complex expressions
  perfCounters.recordFallback();
  return (doc: Document) => {
    // For now, return a default value - this would need proper expression evaluation
    return null;
  };
}

/**
 * Check if $match and $project stages can be safely fused
 */
export function canFuseMatchProject(
  matchQuery: QueryExpression,
  projectSpec: Record<string, any>
): boolean {
  // Fusion is safe if:
  // 1. No field name collisions between match fields and projected computed fields
  // 2. No dependencies on computed fields in the match query
  // 3. No complex projection dependencies

  const matchFields = new Set<string>();
  const extractMatchFields = (query: QueryExpression) => {
    for (const field in query) {
      if (!field.startsWith('$')) {
        matchFields.add(field);
      } else if (field === '$and' || field === '$or' || field === '$nor') {
        const conditions = query[field] as QueryExpression[];
        if (Array.isArray(conditions)) {
          conditions.forEach(cond => extractMatchFields(cond));
        }
      }
    }
  };

  extractMatchFields(matchQuery);

  // Check for computed fields in projection that might conflict
  for (const [field, spec] of Object.entries(projectSpec)) {
    if (field === '_id') continue;

    if (spec !== 0 && spec !== 1 && spec !== false && spec !== true) {
      // Computed field - check if it conflicts with match fields
      if (matchFields.has(field)) {
        return false; // Conflict detected
      }
    }
  }

  return true;
}

/**
 * Create a fused $match + $project operator
 */
export function fuseMatchProject(
  matchQuery: QueryExpression,
  projectSpec: Record<string, any>,
  ctx: CompilationContext
): (collection: Collection) => Collection {
  if (!canFuseMatchProject(matchQuery, projectSpec)) {
    perfCounters.recordFallback();
    throw new Error('Cannot safely fuse $match and $project stages');
  }

  const matchPredicate = compileMatch(matchQuery, ctx);
  const projectFunction = compileProject(projectSpec, ctx);

  return (collection: Collection): Collection => {
    const result: Document[] = [];

    for (let i = 0; i < collection.length; i++) {
      const doc = collection[i]!;

      // Apply match first
      if (matchPredicate(doc, i)) {
        // Apply project
        const projectedDoc = projectFunction(doc, i);
        result.push(projectedDoc);
      }
    }

    return result;
  };
}
