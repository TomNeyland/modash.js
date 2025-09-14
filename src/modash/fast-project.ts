/**
 * Ultra-fast $project implementation for modash.js
 * 
 * Optimizations:
 * 1. Specialized field projection without object reconstruction
 * 2. Compiled expression evaluation for common operations
 * 3. Minimal allocations with object reuse
 * 4. Type-specific optimizations
 */

import type { Collection, Document, DocumentValue } from './expressions.js';
import type { ProjectStage, Expression } from '../index.js';

/**
 * Fast field accessor
 */
function createFieldGetter(fieldPath: string): (doc: Document) => DocumentValue {
  if (!fieldPath.includes('.')) {
    return (doc: Document) => doc[fieldPath];
  }
  
  const segments = fieldPath.split('.');
  return (doc: Document) => {
    let current: any = doc;
    for (let i = 0; i < segments.length && current != null; i++) {
      current = current[segments[i]!];
    }
    return current;
  };
}

/**
 * Compile common expression patterns for fast evaluation
 */
function compileExpression(expr: Expression): ((doc: Document) => DocumentValue) | null {
  if (typeof expr === 'string' && expr.startsWith('$')) {
    // Field reference
    const fieldPath = expr.slice(1);
    return createFieldGetter(fieldPath);
  }
  
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    // Literal value
    return () => expr as DocumentValue;
  }
  
  // Handle common expression operators
  if ('$multiply' in expr && Array.isArray(expr.$multiply) && expr.$multiply.length === 2) {
    const [left, right] = expr.$multiply;
    const leftGetter = compileExpression(left as Expression);
    const rightGetter = compileExpression(right as Expression);
    
    if (leftGetter && rightGetter) {
      return (doc: Document) => {
        const leftVal = leftGetter(doc);
        const rightVal = rightGetter(doc);
        if (typeof leftVal === 'number' && typeof rightVal === 'number') {
          return leftVal * rightVal;
        }
        return 0;
      };
    }
  }
  
  if ('$gte' in expr && Array.isArray(expr.$gte) && expr.$gte.length === 2) {
    const [left, right] = expr.$gte;
    const leftGetter = compileExpression(left as Expression);
    const rightGetter = compileExpression(right as Expression);
    
    if (leftGetter && rightGetter) {
      return (doc: Document) => {
        const leftVal = leftGetter(doc);
        const rightVal = rightGetter(doc);
        if (typeof leftVal === 'number' && typeof rightVal === 'number') {
          return leftVal >= rightVal;
        }
        return leftVal >= rightVal;
      };
    }
  }
  
  if ('$month' in expr) {
    const dateGetter = compileExpression(expr.$month as Expression);
    if (dateGetter) {
      return (doc: Document) => {
        const dateVal = dateGetter(doc);
        if (dateVal instanceof Date) {
          return dateVal.getMonth() + 1; // MongoDB months are 1-based
        }
        return null;
      };
    }
  }
  
  return null; // Unsupported expression
}

/**
 * Check if we can use fast projection
 */
export function canUseFastProject(projectSpec: ProjectStage['$project']): boolean {
  for (const [field, spec] of Object.entries(projectSpec)) {
    if (field === '_id') continue;
    
    // Don't use fast path for dot notation field names - they need proper nesting
    if (field.includes('.')) {
      return false;
    }
    
    // Check if it's a simple include/exclude
    if (spec === 1 || spec === 0 || spec === true || spec === false) {
      continue;
    }
    
    // Check if it's a supported expression
    if (compileExpression(spec as Expression) === null) {
      return false; // Unsupported expression
    }
  }
  
  return true;
}

/**
 * Ultra-fast project implementation
 */
export function fastProject<T extends Document = Document>(
  collection: Collection<T>,
  projectSpec: ProjectStage['$project']
): Collection<T> {
  
  if (!Array.isArray(collection) || collection.length === 0) {
    return [];
  }
  
  // Analyze projection spec
  let includeId = true;
  if ('_id' in projectSpec) {
    includeId = !!projectSpec._id;
  }
  
  // Compile field projections
  const compiledProjections: Array<{
    field: string;
    type: 'include' | 'computed';
    getter?: (doc: Document) => DocumentValue;
    computeFunc?: (doc: Document) => DocumentValue;
  }> = [];
  
  for (const [field, spec] of Object.entries(projectSpec)) {
    if (field === '_id') continue;
    
    if (spec === 1 || spec === true) {
      // Include field
      compiledProjections.push({
        field,
        type: 'include',
        getter: createFieldGetter(field),
      });
    } else if (spec === 0 || spec === false) {
      // Exclude field - skip
      continue;
    } else {
      // Computed field
      const computeFunc = compileExpression(spec as Expression);
      if (computeFunc) {
        compiledProjections.push({
          field,
          type: 'computed',
          computeFunc,
        });
      }
    }
  }
  
  // Process documents
  const result: T[] = [];
  
  for (const doc of collection) {
    const projected: Record<string, DocumentValue> = {};
    
    // Handle _id field
    if (includeId) {
      projected._id = doc._id;
    }
    
    // Apply projections
    for (const projection of compiledProjections) {
      if (projection.type === 'include' && projection.getter) {
        projected[projection.field] = projection.getter(doc);
      } else if (projection.type === 'computed' && projection.computeFunc) {
        projected[projection.field] = projection.computeFunc(doc);
      }
    }
    
    result.push(projected as T);
  }
  
  return result;
}