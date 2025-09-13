/**
 * Expression compiler and performance engine for crossfilter IVM system
 */

import type {
  RowId,
  ExpressionCompiler,
  PerformanceEngine,
  CrossfilterStore,
  CompiledStage,
  ExecutionPlan,
} from './crossfilter-ivm.js';
import type { Document, DocumentValue } from './expressions.js';
import type { Pipeline } from '../index.js';

/**
 * JIT Expression Compiler for MongoDB expressions
 */
export class ExpressionCompilerImpl implements ExpressionCompiler {
  private compiledCache = new Map<string, Function>();

  compileMatchExpr(expr: any): (doc: Document, _rowId: RowId) => boolean {
    const key = `match:${JSON.stringify(expr)}`;

    if (this.compiledCache.has(key)) {
      return this.compiledCache.get(key) as (
        doc: Document,
        rowId: RowId
      ) => boolean;
    }

    const compiled = this.buildMatchFunction(expr);
    this.compiledCache.set(key, compiled);

    return compiled;
  }

  compileProjectExpr(expr: any): (doc: Document, _rowId: RowId) => Document {
    const key = `project:${JSON.stringify(expr)}`;

    if (this.compiledCache.has(key)) {
      return this.compiledCache.get(key) as (
        doc: Document,
        rowId: RowId
      ) => Document;
    }

    const compiled = this.buildProjectFunction(expr);
    this.compiledCache.set(key, compiled);

    return compiled;
  }

  compileGroupExpr(expr: any): {
    getGroupKey: (doc: Document, _rowId: RowId) => DocumentValue;
    accumulators: Array<{
      field: string;
      type: string;
      getValue: (doc: Document, _rowId: RowId) => DocumentValue;
    }>;
  } {
    const _key = `group:${JSON.stringify(expr)}`;

    // Build group key function
    const getGroupKey = this.buildGroupKeyFunction(expr._id);

    // Build accumulator functions
    const accumulators: Array<{
      field: string;
      type: string;
      getValue: (doc: Document, _rowId: RowId) => DocumentValue;
    }> = [];

    for (const [field, accumExpr] of Object.entries(expr)) {
      if (field === '_id') continue;

      if (typeof accumExpr === 'object' && accumExpr !== null) {
        for (const [accType, accField] of Object.entries(accumExpr)) {
          const getValue = this.buildAccumulatorValueFunction(accField);
          accumulators.push({
            field,
            type: accType,
            getValue,
          });
        }
      }
    }

    return { getGroupKey, accumulators };
  }

  canVectorize(expr: any): boolean {
    // Simple heuristics for vectorization potential
    if (typeof expr !== 'object' || expr === null) {
      return false;
    }

    // Check for simple field comparisons that can be vectorized
    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) {
        // Logical operators - check if all conditions can be vectorized
        if (field === '$and' || field === '$or') {
          const conditions = condition as any[];
          return conditions.every(cond => this.canVectorize(cond));
        }
        return false; // Other logical operators not yet vectorized
      } else {
        // Field conditions - check if simple enough for vectorization
        if (typeof condition === 'object' && condition !== null) {
          const operators = Object.keys(condition);
          const vectorizableOps = [
            '$eq',
            '$ne',
            '$gt',
            '$gte',
            '$lt',
            '$lte',
            '$in',
            '$nin',
          ];
          if (!operators.every(op => vectorizableOps.includes(op))) {
            return false;
          }
        }
      }
    }

    return true;
  }

  createVectorizedFn(expr: any): (docs: Document[], rowIds: RowId[]) => any[] {
    // For now, return a simple vectorized version
    // In a full implementation, this would generate optimized SIMD code
    const scalarFn = this.compileMatchExpr(expr);

    return (docs: Document[], rowIds: RowId[]) => {
      const results = new Array(docs.length);
      for (let i = 0; i < docs.length; i++) {
        results[i] = scalarFn(docs[i], rowIds[i]);
      }
      return results;
    };
  }

  private buildMatchFunction(
    expr: any
  ): (doc: Document, _rowId: RowId) => boolean {
    if (typeof expr !== 'object' || expr === null) {
      return () => false;
    }

    // Build compiled predicates recursively
    const predicates: ((doc: Document, _rowId: RowId) => boolean)[] = [];

    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) {
        // Handle logical operators with recursive compilation
        switch (field) {
          case '$and': {
            const subConditions = condition as any[];
            const subPredicates = subConditions.map(cond =>
              this.buildMatchFunction(cond)
            );
            predicates.push((doc: Document, _rowId: RowId) => {
              for (let i = 0; i < subPredicates.length; i++) {
                if (!subPredicates[i](doc, _rowId)) return false;
              }
              return true;
            });
            break;
          }
          case '$or': {
            const subConditions = condition as any[];
            const subPredicates = subConditions.map(cond =>
              this.buildMatchFunction(cond)
            );
            predicates.push((doc: Document, _rowId: RowId) => {
              for (let i = 0; i < subPredicates.length; i++) {
                if (subPredicates[i](doc, _rowId)) return true;
              }
              return false;
            });
            break;
          }
          case '$not': {
            const subPredicate = this.buildMatchFunction(condition);
            predicates.push(
              (doc: Document, _rowId: RowId) => !subPredicate(doc, _rowId)
            );
            break;
          }
          case '$nor': {
            const subConditions = condition as any[];
            const subPredicates = subConditions.map(cond =>
              this.buildMatchFunction(cond)
            );
            predicates.push((doc: Document, _rowId: RowId) => {
              for (let i = 0; i < subPredicates.length; i++) {
                if (subPredicates[i](doc, _rowId)) return false;
              }
              return true;
            });
            break;
          }
          default:
            // For unsupported operators, fall back
            predicates.push((doc: Document, _rowId: RowId) => {
              return this.evaluateMatchExpression({ [field]: condition }, doc);
            });
            break;
        }
      } else {
        // Regular field conditions - compile directly
        const fieldPredicate = this.buildFieldCondition(field, condition);
        predicates.push(fieldPredicate);
      }
    }

    // Combine all predicates with AND logic
    if (predicates.length === 0) {
      return () => true;
    } else if (predicates.length === 1) {
      return predicates[0];
    } else {
      return (doc: Document, _rowId: RowId) => {
        for (let i = 0; i < predicates.length; i++) {
          if (!predicates[i](doc, _rowId)) return false;
        }
        return true;
      };
    }
  }

  private buildFieldCondition(
    field: string,
    condition: any
  ): (doc: Document, _rowId: RowId) => boolean {
    // Get field access function for efficient lookup
    const getFieldValue = (doc: Document) => this.getFieldValue(doc, field);

    // Handle different condition types
    if (typeof condition === 'object' && condition !== null) {
      // Build compiled conditions for all operators
      const compiledChecks: string[] = [];

      for (const [op, value] of Object.entries(condition)) {
        const fieldAccess = this.generateFieldAccess(field);

        switch (op) {
          case '$eq':
            compiledChecks.push(`${fieldAccess} === ${JSON.stringify(value)}`);
            break;
          case '$ne':
            compiledChecks.push(`${fieldAccess} !== ${JSON.stringify(value)}`);
            break;
          case '$gt':
            compiledChecks.push(`${fieldAccess} > ${JSON.stringify(value)}`);
            break;
          case '$gte':
            compiledChecks.push(`${fieldAccess} >= ${JSON.stringify(value)}`);
            break;
          case '$lt':
            compiledChecks.push(`${fieldAccess} < ${JSON.stringify(value)}`);
            break;
          case '$lte':
            compiledChecks.push(`${fieldAccess} <= ${JSON.stringify(value)}`);
            break;
          case '$in':
            if (Array.isArray(value)) {
              const values = JSON.stringify(value);
              compiledChecks.push(`${values}.includes(${fieldAccess})`);
            }
            break;
          case '$nin':
            if (Array.isArray(value)) {
              const values = JSON.stringify(value);
              compiledChecks.push(`!${values}.includes(${fieldAccess})`);
            }
            break;
          case '$exists':
            if (value) {
              compiledChecks.push(`${fieldAccess} !== undefined`);
            } else {
              compiledChecks.push(`${fieldAccess} === undefined`);
            }
            break;
          case '$regex':
            const pattern = value instanceof RegExp ? value.source : value;
            const flags = value instanceof RegExp ? value.flags : '';
            compiledChecks.push(
              `new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(flags)}).test(String(${fieldAccess} || ''))`
            );
            break;
          case '$all':
            if (Array.isArray(value)) {
              const values = JSON.stringify(value);
              compiledChecks.push(
                `Array.isArray(${fieldAccess}) && ${values}.every(v => ${fieldAccess}.includes(v))`
              );
            }
            break;
          case '$size':
            compiledChecks.push(
              `Array.isArray(${fieldAccess}) && ${fieldAccess}.length === ${JSON.stringify(value)}`
            );
            break;
          default:
            // For unsupported operators, fall back to runtime evaluation
            return (doc: Document, _rowId: RowId) => {
              const fieldValue = getFieldValue(doc);
              return this.evaluateCondition(fieldValue, condition);
            };
        }
      }

      if (compiledChecks.length > 0) {
        const checkCode = compiledChecks.join(' && ');
        try {
          // eslint-disable-next-line no-new-func
          return new Function(
            'doc',
            'rowId',
            `
            ${this.generateFieldAccessors()}
            return ${checkCode};
          `
          ) as (doc: Document, _rowId: RowId) => boolean;
        } catch (_error) {
          // Fallback for compilation errors
          return (doc: Document, _rowId: RowId) => {
            const fieldValue = getFieldValue(doc);
            return this.evaluateCondition(fieldValue, condition);
          };
        }
      }

      return () => true;
    } else {
      // Simple equality condition
      const fieldAccess = this.generateFieldAccess(field);
      try {
        // eslint-disable-next-line no-new-func
        return new Function(
          'doc',
          'rowId',
          `
          ${this.generateFieldAccessors()}
          return ${fieldAccess} === ${JSON.stringify(condition)};
        `
        ) as (doc: Document, _rowId: RowId) => boolean;
      } catch (_error) {
        return (doc: Document, _rowId: RowId) => {
          const fieldValue = getFieldValue(doc);
          return fieldValue === condition;
        };
      }
    }
  }

  private buildProjectFunction(
    expr: any
  ): (doc: Document, _rowId: RowId) => Document {
    // Build projection function
    const projections: string[] = [];

    // Check if _id should be included (default is include unless explicitly excluded)
    const excludeId = expr._id === 0 || expr._id === false;
    if (!excludeId) {
      projections.push(`if (doc._id !== undefined) result._id = doc._id;`);
    }

    for (const [field, projection] of Object.entries(expr)) {
      if (field === '_id' && (projection === 0 || projection === false)) {
        // Skip _id exclusion, already handled above
        continue;
      } else if (projection === 1 || projection === true) {
        // Include field
        projections.push(
          `if (${this.generateFieldAccess(field)} !== undefined) result.${field} = ${this.generateFieldAccess(field)};`
        );
      } else if (projection === 0 || projection === false) {
        // Exclude field (handled by not including it)
        continue;
      } else if (typeof projection === 'object' && projection !== null) {
        // Handle nested object projection like {title: 1, author: 1}
        if (this.isNestedProjection(projection)) {
          const nestedCode = this.generateNestedProjectionCode(
            field,
            projection
          );
          projections.push(nestedCode);
        } else {
          // Computed field with expression
          const exprCode = this.generateExpressionCode(projection);
          projections.push(`result.${field} = ${exprCode};`);
        }
      } else if (typeof projection === 'string' && projection.startsWith('$')) {
        // Field reference
        const exprCode = this.generateExpressionCode(projection);
        projections.push(`result.${field} = ${exprCode};`);
      } else {
        // Literal value
        projections.push(`result.${field} = ${JSON.stringify(projection)};`);
      }
    }

    const functionBody = `
      const result = {};
      ${projections.join('\n      ')}
      return result;
    `;

    try {
      // eslint-disable-next-line no-new-func
      return new Function(
        'doc',
        'rowId',
        `
        ${this.generateFieldAccessors()}
        ${functionBody}
      `
      ) as (doc: Document, _rowId: RowId) => Document;
    } catch (_error) {
      // Fallback to safer evaluation
      return (doc: Document, _rowId: RowId) => {
        return this.evaluateProjectExpression(expr, doc);
      };
    }
  }

  private buildGroupKeyFunction(
    keyExpr: any
  ): (doc: Document, _rowId: RowId) => DocumentValue {
    if (typeof keyExpr === 'string' && keyExpr.startsWith('$')) {
      const field = keyExpr.substring(1);
      const fieldAccess = this.generateFieldAccess(field);

      try {
        // eslint-disable-next-line no-new-func
        return new Function(
          'doc',
          'rowId',
          `
          ${this.generateFieldAccessors()}
          return ${fieldAccess};
        `
        ) as (doc: Document, _rowId: RowId) => DocumentValue;
      } catch (_error) {
        return (doc: Document) => this.getFieldValue(doc, field);
      }
    } else if (typeof keyExpr === 'object' && keyExpr !== null) {
      // Complex grouping expression
      const exprCode = this.generateExpressionCode(keyExpr);

      try {
        // eslint-disable-next-line no-new-func
        return new Function(
          'doc',
          'rowId',
          `
          ${this.generateFieldAccessors()}
          return ${exprCode};
        `
        ) as (doc: Document, _rowId: RowId) => DocumentValue;
      } catch (_error) {
        return (doc: Document) => this.evaluateExpression(keyExpr, doc);
      }
    } else {
      // Literal value
      return () => keyExpr;
    }
  }

  private buildAccumulatorValueFunction(
    accField: any
  ): (doc: Document, _rowId: RowId) => DocumentValue {
    if (accField === 1) {
      return () => 1; // Count
    } else if (typeof accField === 'string' && accField.startsWith('$')) {
      const field = accField.substring(1);
      const fieldAccess = this.generateFieldAccess(field);

      try {
        // eslint-disable-next-line no-new-func
        return new Function(
          'doc',
          'rowId',
          `
          ${this.generateFieldAccessors()}
          return ${fieldAccess};
        `
        ) as (doc: Document, _rowId: RowId) => DocumentValue;
      } catch (_error) {
        return (doc: Document) => this.getFieldValue(doc, field);
      }
    } else {
      return () => accField; // Literal value
    }
  }

  private generateFieldAccess(fieldPath: string): string {
    // Generate safe field access code with dot notation support
    const parts = fieldPath.split('.');
    let access = 'doc';

    for (const part of parts) {
      access = `(${access} && typeof ${access} === 'object' ? ${access}.${part} : undefined)`;
    }

    return access;
  }

  private generateFieldAccessors(): string {
    // Common field accessor utilities
    return `
      function getField(obj, path) {
        const parts = path.split('.');
        let value = obj;
        for (const part of parts) {
          if (value && typeof value === 'object') {
            value = value[part];
          } else {
            return undefined;
          }
        }
        return value;
      }
      
      function evalExpr(expr, doc) {
        // Fallback expression evaluator for complex expressions
        if (typeof expr === 'string' && expr.startsWith('$')) {
          return getField(doc, expr.substring(1));
        } else if (typeof expr === 'object' && expr !== null) {
          // Date operators
          if (expr.$year) {
            const dateField = expr.$year;
            const dateValue = getField(doc, dateField.substring(1));
            if (dateValue && dateValue instanceof Date) {
              return dateValue.getFullYear();
            }
            return null;
          }
          if (expr.$month) {
            const dateField = expr.$month;
            const dateValue = getField(doc, dateField.substring(1));
            if (dateValue && dateValue instanceof Date) {
              return dateValue.getMonth() + 1; // MongoDB months are 1-based
            }
            return null;
          }
          if (expr.$dayOfMonth) {
            const dateField = expr.$dayOfMonth;
            const dateValue = getField(doc, dateField.substring(1));
            if (dateValue && dateValue instanceof Date) {
              return dateValue.getDate();
            }
            return null;
          }
          
          // Math operators
          if (expr.$multiply && Array.isArray(expr.$multiply)) {
            const [left, right] = expr.$multiply;
            const leftVal = evalExpr(left, doc);
            const rightVal = evalExpr(right, doc);
            return (leftVal || 0) * (rightVal || 0);
          }
          if (expr.$add && Array.isArray(expr.$add)) {
            const values = expr.$add.map(v => Number(evalExpr(v, doc)) || 0);
            return values.reduce((sum, val) => sum + val, 0);
          }
          if (expr.$subtract && Array.isArray(expr.$subtract) && expr.$subtract.length === 2) {
            const [left, right] = expr.$subtract;
            const leftVal = Number(evalExpr(left, doc)) || 0;
            const rightVal = Number(evalExpr(right, doc)) || 0;
            return leftVal - rightVal;
          }
          if (expr.$divide && Array.isArray(expr.$divide) && expr.$divide.length === 2) {
            const [left, right] = expr.$divide;
            const leftVal = Number(evalExpr(left, doc)) || 0;
            const rightVal = Number(evalExpr(right, doc)) || 1; // Avoid division by zero
            return rightVal !== 0 ? leftVal / rightVal : null;
          }
          if (expr.$abs) {
            const val = Number(evalExpr(expr.$abs, doc)) || 0;
            return Math.abs(val);
          }
          if (expr.$ceil) {
            const val = Number(evalExpr(expr.$ceil, doc)) || 0;
            return Math.ceil(val);
          }
          if (expr.$floor) {
            const val = Number(evalExpr(expr.$floor, doc)) || 0;
            return Math.floor(val);
          }
          if (expr.$sqrt) {
            const val = Number(evalExpr(expr.$sqrt, doc)) || 0;
            return Math.sqrt(val);
          }
          if (expr.$pow && Array.isArray(expr.$pow) && expr.$pow.length === 2) {
            const [base, exp] = expr.$pow;
            const baseVal = Number(evalExpr(base, doc)) || 0;
            const expVal = Number(evalExpr(exp, doc)) || 0;
            return Math.pow(baseVal, expVal);
          }
          
          // String operators
          if (expr.$substr && Array.isArray(expr.$substr) && expr.$substr.length === 3) {
            const [strExpr, startExpr, lengthExpr] = expr.$substr;
            const str = String(evalExpr(strExpr, doc) || '');
            const start = Number(evalExpr(startExpr, doc) || 0);
            const length = Number(evalExpr(lengthExpr, doc) || 0);
            return str.substring(start, start + length);
          }
          if (expr.$concat && Array.isArray(expr.$concat)) {
            const parts = expr.$concat.map(part => String(evalExpr(part, doc) || ''));
            return parts.join('');
          }
          if (expr.$toLower) {
            const str = String(evalExpr(expr.$toLower, doc) || '');
            return str.toLowerCase();
          }
          if (expr.$toUpper) {
            const str = String(evalExpr(expr.$toUpper, doc) || '');
            return str.toUpperCase();
          }
          if (expr.$split && Array.isArray(expr.$split) && expr.$split.length === 2) {
            const [strExpr, delimiterExpr] = expr.$split;
            const str = String(evalExpr(strExpr, doc) || '');
            const delimiter = String(evalExpr(delimiterExpr, doc) || '');
            return str.split(delimiter);
          }
          if (expr.$strLen) {
            const str = String(evalExpr(expr.$strLen, doc) || '');
            return str.length;
          }
          if (expr.$trim) {
            const str = String(evalExpr(expr.$trim, doc) || '');
            return str.trim();
          }
          
          // Array operators
          if (expr.$arrayElemAt && Array.isArray(expr.$arrayElemAt) && expr.$arrayElemAt.length === 2) {
            const [arrayExpr, indexExpr] = expr.$arrayElemAt;
            const arr = evalExpr(arrayExpr, doc);
            const index = Number(evalExpr(indexExpr, doc)) || 0;
            if (Array.isArray(arr)) {
              return index >= 0 ? arr[index] : arr[arr.length + index];
            }
            return null;
          }
          if (expr.$slice && Array.isArray(expr.$slice)) {
            const [arrayExpr, ...params] = expr.$slice;
            const arr = evalExpr(arrayExpr, doc);
            if (Array.isArray(arr)) {
              if (params.length === 1) {
                const count = Number(evalExpr(params[0], doc)) || 0;
                return count >= 0 ? arr.slice(0, count) : arr.slice(count);
              } else if (params.length === 2) {
                const start = Number(evalExpr(params[0], doc)) || 0;
                const count = Number(evalExpr(params[1], doc)) || 0;
                return arr.slice(start, start + count);
              }
            }
            return [];
          }
          if (expr.$concatArrays && Array.isArray(expr.$concatArrays)) {
            const arrays = expr.$concatArrays.map(arrExpr => {
              const result = evalExpr(arrExpr, doc);
              return Array.isArray(result) ? result : [];
            });
            return arrays.flat();
          }
          if (expr.$size) {
            const arr = evalExpr(expr.$size, doc);
            return Array.isArray(arr) ? arr.length : null;
          }
          if (expr.$in && Array.isArray(expr.$in) && expr.$in.length === 2) {
            const [needle, haystack] = expr.$in;
            const needleVal = evalExpr(needle, doc);
            const haystackVal = evalExpr(haystack, doc);
            return Array.isArray(haystackVal) ? haystackVal.includes(needleVal) : false;
          }
          
          // Conditional operators
          if (expr.$cond && Array.isArray(expr.$cond) && expr.$cond.length === 3) {
            const [condition, trueValue, falseValue] = expr.$cond;
            const condResult = evalExpr(condition, doc);
            return condResult ? evalExpr(trueValue, doc) : evalExpr(falseValue, doc);
          }
          if (expr.$ifNull && Array.isArray(expr.$ifNull) && expr.$ifNull.length === 2) {
            const [value, defaultValue] = expr.$ifNull;
            const result = evalExpr(value, doc);
            return result != null ? result : evalExpr(defaultValue, doc);
          }
          
          // Add other operators as needed
          return expr;
        } else {
          return expr;
        }
      }
    `;
  }

  private generateConditionCode(
    fieldAccess: string,
    operator: string,
    value: any
  ): string {
    const jsonValue = JSON.stringify(value);

    switch (operator) {
      case '$eq':
        return `${fieldAccess} === ${jsonValue}`;

      case '$ne':
        return `${fieldAccess} !== ${jsonValue}`;

      case '$gt':
        return `${fieldAccess} > ${jsonValue}`;

      case '$gte':
        return `${fieldAccess} >= ${jsonValue}`;

      case '$lt':
        return `${fieldAccess} < ${jsonValue}`;

      case '$lte':
        return `${fieldAccess} <= ${jsonValue}`;

      case '$in':
        if (Array.isArray(value)) {
          const valueSet = JSON.stringify(value);
          return `${valueSet}.includes(${fieldAccess})`;
        }
        return 'false';

      case '$nin':
        if (Array.isArray(value)) {
          const valueSet = JSON.stringify(value);
          return `!${valueSet}.includes(${fieldAccess})`;
        }
        return 'true';

      case '$regex':
        // Handle regex patterns
        if (typeof value === 'string') {
          return `new RegExp(${JSON.stringify(value)}).test(${fieldAccess})`;
        } else if (value && typeof value === 'object' && value.$regex) {
          const pattern = JSON.stringify(value.$regex);
          const flags = value.$options || '';
          return `new RegExp(${pattern}, ${JSON.stringify(flags)}).test(${fieldAccess})`;
        }
        return 'false';

      case '$all':
        if (Array.isArray(value)) {
          const checks = value.map(
            v =>
              `(${fieldAccess} && Array.isArray(${fieldAccess}) && ${fieldAccess}.includes(${JSON.stringify(v)}))`
          );
          return checks.join(' && ');
        }
        return 'false';

      case '$size':
        return `(Array.isArray(${fieldAccess}) && ${fieldAccess}.length === ${JSON.stringify(value)})`;

      case '$exists':
        return value
          ? `${fieldAccess} !== undefined`
          : `${fieldAccess} === undefined`;

      default:
        return 'true'; // Unsupported operator
    }
  }

  private generateExpressionCode(expr: any): string {
    if (typeof expr === 'string' && expr.startsWith('$')) {
      return this.generateFieldAccess(expr.substring(1));
    } else if (Array.isArray(expr)) {
      // Array expression
      const elements = expr.map(item => this.generateExpressionCode(item));
      return `[${elements.join(', ')}]`;
    } else if (typeof expr === 'object' && expr !== null) {
      // Check if it's a plain object (like {day: ..., month: ..., year: ...})
      if (this.isPlainObject(expr)) {
        // Generate code to create an object with each field evaluated
        const fields = Object.entries(expr)
          .map(
            ([key, value]) => `"${key}": ${this.generateExpressionCode(value)}`
          )
          .join(', ');
        return `{${fields}}`;
      } else {
        // MongoDB expression with operators - compile directly
        return this.compileOperatorExpression(expr);
      }
    } else {
      return JSON.stringify(expr);
    }
  }

  private compileOperatorExpression(expr: any): string {
    // Math operators
    if (expr.$add && Array.isArray(expr.$add)) {
      const values = expr.$add.map(
        v => `(Number(${this.generateExpressionCode(v)}) || 0)`
      );
      return `(${values.join(' + ')})`;
    }
    if (
      expr.$subtract &&
      Array.isArray(expr.$subtract) &&
      expr.$subtract.length === 2
    ) {
      const left = `(Number(${this.generateExpressionCode(expr.$subtract[0])}) || 0)`;
      const right = `(Number(${this.generateExpressionCode(expr.$subtract[1])}) || 0)`;
      return `(${left} - ${right})`;
    }
    if (
      expr.$multiply &&
      Array.isArray(expr.$multiply) &&
      expr.$multiply.length === 2
    ) {
      const left = `(Number(${this.generateExpressionCode(expr.$multiply[0])}) || 0)`;
      const right = `(Number(${this.generateExpressionCode(expr.$multiply[1])}) || 0)`;
      return `(${left} * ${right})`;
    }
    if (
      expr.$divide &&
      Array.isArray(expr.$divide) &&
      expr.$divide.length === 2
    ) {
      const left = `(Number(${this.generateExpressionCode(expr.$divide[0])}) || 0)`;
      const right = `(Number(${this.generateExpressionCode(expr.$divide[1])}) || 1)`;
      return `((${right}) !== 0 ? (${left}) / (${right}) : null)`;
    }
    if (expr.$abs) {
      const val = `(Number(${this.generateExpressionCode(expr.$abs)}) || 0)`;
      return `Math.abs(${val})`;
    }
    if (expr.$ceil) {
      const val = `(Number(${this.generateExpressionCode(expr.$ceil)}) || 0)`;
      return `Math.ceil(${val})`;
    }
    if (expr.$floor) {
      const val = `(Number(${this.generateExpressionCode(expr.$floor)}) || 0)`;
      return `Math.floor(${val})`;
    }
    if (expr.$sqrt) {
      const val = `(Number(${this.generateExpressionCode(expr.$sqrt)}) || 0)`;
      return `Math.sqrt(${val})`;
    }
    if (expr.$pow && Array.isArray(expr.$pow) && expr.$pow.length === 2) {
      const base = `(Number(${this.generateExpressionCode(expr.$pow[0])}) || 0)`;
      const exp = `(Number(${this.generateExpressionCode(expr.$pow[1])}) || 0)`;
      return `Math.pow(${base}, ${exp})`;
    }

    // String operators
    if (
      expr.$substr &&
      Array.isArray(expr.$substr) &&
      expr.$substr.length === 3
    ) {
      const str = `String(${this.generateExpressionCode(expr.$substr[0])} || '')`;
      const start = `(Number(${this.generateExpressionCode(expr.$substr[1])}) || 0)`;
      const length = `(Number(${this.generateExpressionCode(expr.$substr[2])}) || 0)`;
      return `(${str}).substring(${start}, ${start} + ${length})`;
    }
    if (expr.$concat && Array.isArray(expr.$concat)) {
      const parts = expr.$concat.map(
        part => `String(${this.generateExpressionCode(part)} || '')`
      );
      return `(${parts.join(' + ')})`;
    }
    if (expr.$toLower) {
      const str = `String(${this.generateExpressionCode(expr.$toLower)} || '')`;
      return `(${str}).toLowerCase()`;
    }
    if (expr.$toUpper) {
      const str = `String(${this.generateExpressionCode(expr.$toUpper)} || '')`;
      return `(${str}).toUpperCase()`;
    }
    if (expr.$split && Array.isArray(expr.$split) && expr.$split.length === 2) {
      const str = `String(${this.generateExpressionCode(expr.$split[0])} || '')`;
      const delimiter = `String(${this.generateExpressionCode(expr.$split[1])} || '')`;
      return `(${str}).split(${delimiter})`;
    }
    if (expr.$strLen) {
      const str = `String(${this.generateExpressionCode(expr.$strLen)} || '')`;
      return `(${str}).length`;
    }
    if (expr.$trim) {
      const str = `String(${this.generateExpressionCode(expr.$trim)} || '')`;
      return `(${str}).trim()`;
    }

    // Array operators (use evalExpr for reliability)
    if (
      expr.$arrayElemAt &&
      Array.isArray(expr.$arrayElemAt) &&
      expr.$arrayElemAt.length === 2
    ) {
      return `evalExpr(${JSON.stringify(expr)}, doc)`;
    }
    if (expr.$slice && Array.isArray(expr.$slice)) {
      return `evalExpr(${JSON.stringify(expr)}, doc)`;
    }
    if (expr.$concatArrays && Array.isArray(expr.$concatArrays)) {
      return `evalExpr(${JSON.stringify(expr)}, doc)`;
    }
    if (expr.$size) {
      return `evalExpr(${JSON.stringify(expr)}, doc)`;
    }
    if (expr.$in && Array.isArray(expr.$in) && expr.$in.length === 2) {
      return `evalExpr(${JSON.stringify(expr)}, doc)`;
    }

    // Conditional operators
    if (expr.$cond && Array.isArray(expr.$cond) && expr.$cond.length === 3) {
      const condition = this.generateExpressionCode(expr.$cond[0]);
      const trueValue = this.generateExpressionCode(expr.$cond[1]);
      const falseValue = this.generateExpressionCode(expr.$cond[2]);
      return `(${condition} ? ${trueValue} : ${falseValue})`;
    }
    if (
      expr.$ifNull &&
      Array.isArray(expr.$ifNull) &&
      expr.$ifNull.length === 2
    ) {
      const value = this.generateExpressionCode(expr.$ifNull[0]);
      const fallback = this.generateExpressionCode(expr.$ifNull[1]);
      return `((val => val != null ? val : ${fallback})(${value}))`;
    }

    // Date operators
    if (expr.$dayOfMonth) {
      const date = this.generateExpressionCode(expr.$dayOfMonth);
      return `((d => d instanceof Date ? d.getDate() : null)(${date}))`;
    }
    if (expr.$month) {
      const date = this.generateExpressionCode(expr.$month);
      return `((d => d instanceof Date ? d.getMonth() + 1 : null)(${date}))`;
    }
    if (expr.$year) {
      const date = this.generateExpressionCode(expr.$year);
      return `((d => d instanceof Date ? d.getFullYear() : null)(${date}))`;
    }

    // Comparison operators (for use in conditionals)
    if (expr.$eq && Array.isArray(expr.$eq) && expr.$eq.length === 2) {
      const left = this.generateExpressionCode(expr.$eq[0]);
      const right = this.generateExpressionCode(expr.$eq[1]);
      return `(${left} === ${right})`;
    }
    if (expr.$ne && Array.isArray(expr.$ne) && expr.$ne.length === 2) {
      const left = this.generateExpressionCode(expr.$ne[0]);
      const right = this.generateExpressionCode(expr.$ne[1]);
      return `(${left} !== ${right})`;
    }
    if (expr.$gte && Array.isArray(expr.$gte) && expr.$gte.length === 2) {
      const left = this.generateExpressionCode(expr.$gte[0]);
      const right = this.generateExpressionCode(expr.$gte[1]);
      return `(${left} >= ${right})`;
    }
    if (expr.$lt && Array.isArray(expr.$lt) && expr.$lt.length === 2) {
      const left = this.generateExpressionCode(expr.$lt[0]);
      const right = this.generateExpressionCode(expr.$lt[1]);
      return `(${left} < ${right})`;
    }
    if (expr.$lte && Array.isArray(expr.$lte) && expr.$lte.length === 2) {
      const left = this.generateExpressionCode(expr.$lte[0]);
      const right = this.generateExpressionCode(expr.$lte[1]);
      return `(${left} <= ${right})`;
    }

    // Special case: $avg in projection context (for compatibility)
    // Note: This is not standard MongoDB but some tests expect it
    if (expr.$avg) {
      const fieldExpr = this.generateExpressionCode(expr.$avg);
      return `((arr => Array.isArray(arr) ? arr.reduce((sum, val) => sum + (Number(val) || 0), 0) / arr.length : 0)(${fieldExpr}))`;
    }

    // Fallback for truly complex expressions - but this should be rare now
    return `evalExpr(${JSON.stringify(expr)}, doc)`;
  }

  private isPlainObject(obj: any): boolean {
    // Check if object contains only string keys and no MongoDB operators
    if (typeof obj !== 'object' || obj === null) return false;

    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        return false; // Contains MongoDB operator, not a plain object
      }
    }
    return true;
  }

  private isNestedProjection(obj: any): boolean {
    // Check if this is a nested projection like {title: 1, author: 1}
    if (typeof obj !== 'object' || obj === null) return false;

    for (const value of Object.values(obj)) {
      if (value === 1 || value === true || value === 0 || value === false) {
        return true; // Has projection flags, this is nested projection
      }
    }
    return false;
  }

  private generateNestedProjectionCode(
    parentField: string,
    projection: any
  ): string {
    const nestedFields: string[] = [];
    const projectionEntries = Object.entries(projection).filter(
      ([_, include]) => include === 1 || include === true
    );

    if (projectionEntries.length === 0) return '';

    // Generate code that handles both object and array cases
    const fieldAccess = this.generateFieldAccess(parentField);
    const projectionLogic = projectionEntries
      .map(([nestedField, _]) => {
        return `"${nestedField}": item.${nestedField}`;
      })
      .join(', ');

    nestedFields.push(`
      if (${fieldAccess} !== undefined) {
        if (Array.isArray(${fieldAccess})) {
          result.${parentField} = ${fieldAccess}.map(item => item && typeof item === 'object' ? {${projectionLogic}} : item);
        } else if (${fieldAccess} && typeof ${fieldAccess} === 'object') {
          result.${parentField} = {${projectionLogic.replace(/item\./g, `${fieldAccess}.`)}};
        } else {
          result.${parentField} = ${fieldAccess};
        }
      }
    `);

    return nestedFields.join('\n      ');
  }

  // Fallback evaluation methods for when JIT compilation fails
  private evaluateMatchExpression(expr: any, doc: Document): boolean {
    if (typeof expr !== 'object' || expr === null) {
      return false;
    }

    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) {
        // Logical operators
        switch (field) {
          case '$and':
            return (condition as any[]).every(cond =>
              this.evaluateMatchExpression(cond, doc)
            );
          case '$or':
            return (condition as any[]).some(cond =>
              this.evaluateMatchExpression(cond, doc)
            );
          case '$not':
            return !this.evaluateMatchExpression(condition, doc);
        }
      } else {
        // Field conditions
        const docValue = this.getFieldValue(doc, field);
        if (!this.evaluateCondition(docValue, condition)) {
          return false;
        }
      }
    }

    return true;
  }

  private evaluateProjectExpression(expr: any, doc: Document): Document {
    const result: Document = {};

    // Handle _id inclusion by default
    const excludeId = expr._id === 0 || expr._id === false;
    if (!excludeId && doc._id !== undefined) {
      result._id = doc._id;
    }

    for (const [field, projection] of Object.entries(expr)) {
      if (field === '_id' && (projection === 0 || projection === false)) {
        // Skip _id exclusion, already handled above
        continue;
      } else if (projection === 1 || projection === true) {
        const value = this.getFieldValue(doc, field);
        if (value !== undefined) {
          result[field] = value;
        }
      } else if (projection === 0 || projection === false) {
        // Skip field
      } else if (typeof projection === 'object' && projection !== null) {
        if (this.isNestedProjection(projection)) {
          // Handle nested projection
          const sourceValue = this.getFieldValue(doc, field);
          if (sourceValue !== undefined) {
            if (Array.isArray(sourceValue)) {
              // Project each array element
              result[field] = sourceValue.map(item => {
                if (item && typeof item === 'object') {
                  const projected: any = {};
                  for (const [nestedField, include] of Object.entries(
                    projection
                  )) {
                    if (
                      include === 1 ||
                      (include === true && item[nestedField] !== undefined)
                    ) {
                      projected[nestedField] = item[nestedField];
                    }
                  }
                  return projected;
                }
                return item;
              });
            } else if (sourceValue && typeof sourceValue === 'object') {
              // Project object fields
              const projected: any = {};
              for (const [nestedField, include] of Object.entries(projection)) {
                if (
                  include === 1 ||
                  (include === true && sourceValue[nestedField] !== undefined)
                ) {
                  projected[nestedField] = sourceValue[nestedField];
                }
              }
              result[field] = projected;
            } else {
              result[field] = sourceValue;
            }
          }
        } else {
          const evaluated = this.evaluateExpression(projection, doc);
          result[field] = evaluated;
        }
      } else {
        result[field] = projection;
      }
    }

    return result;
  }

  private evaluateExpression(expr: any, doc: Document): any {
    if (typeof expr === 'string' && expr.startsWith('$')) {
      return this.getFieldValue(doc, expr.substring(1));
    } else if (typeof expr === 'object' && expr !== null) {
      // Use the runtime evaluateProjectExpression logic for complex expressions
      // This is the same logic as the evalExpr helper but directly accessible

      // Date operators
      if (expr.$year) {
        const dateField = expr.$year;
        if (typeof dateField === 'string' && dateField.startsWith('$')) {
          const dateValue = this.getFieldValue(doc, dateField.substring(1));
          if (dateValue && dateValue instanceof Date) {
            return dateValue.getFullYear();
          }
        }
        return null;
      }
      if (expr.$month) {
        const dateField = expr.$month;
        if (typeof dateField === 'string' && dateField.startsWith('$')) {
          const dateValue = this.getFieldValue(doc, dateField.substring(1));
          if (dateValue && dateValue instanceof Date) {
            return dateValue.getMonth() + 1;
          }
        }
        return null;
      }
      if (expr.$dayOfMonth) {
        const dateField = expr.$dayOfMonth;
        if (typeof dateField === 'string' && dateField.startsWith('$')) {
          const dateValue = this.getFieldValue(doc, dateField.substring(1));
          if (dateValue && dateValue instanceof Date) {
            return dateValue.getDate();
          }
        }
        return null;
      }

      // Array operators
      if (
        expr.$arrayElemAt &&
        Array.isArray(expr.$arrayElemAt) &&
        expr.$arrayElemAt.length === 2
      ) {
        const [arrayExpr, indexExpr] = expr.$arrayElemAt;
        const arr = this.evaluateExpression(arrayExpr, doc);
        const index = Number(this.evaluateExpression(indexExpr, doc)) || 0;
        if (Array.isArray(arr)) {
          return index >= 0 ? arr[index] : arr[arr.length + index];
        }
        return null;
      }
      if (expr.$slice && Array.isArray(expr.$slice)) {
        const [arrayExpr, ...params] = expr.$slice;
        const arr = this.evaluateExpression(arrayExpr, doc);
        if (Array.isArray(arr)) {
          if (params.length === 1) {
            const count = Number(this.evaluateExpression(params[0], doc)) || 0;
            return count >= 0 ? arr.slice(0, count) : arr.slice(count);
          } else if (params.length === 2) {
            const start = Number(this.evaluateExpression(params[0], doc)) || 0;
            const count = Number(this.evaluateExpression(params[1], doc)) || 0;
            return arr.slice(start, start + count);
          }
        }
        return [];
      }
      if (expr.$concatArrays && Array.isArray(expr.$concatArrays)) {
        const arrays = expr.$concatArrays.map(arrExpr => {
          const result = this.evaluateExpression(arrExpr, doc);
          return Array.isArray(result) ? result : [];
        });
        return arrays.flat();
      }
      if (expr.$size) {
        const arr = this.evaluateExpression(expr.$size, doc);
        return Array.isArray(arr) ? arr.length : null;
      }
      if (expr.$in && Array.isArray(expr.$in) && expr.$in.length === 2) {
        const [needle, haystack] = expr.$in;
        const needleVal = this.evaluateExpression(needle, doc);
        const haystackVal = this.evaluateExpression(haystack, doc);
        return Array.isArray(haystackVal)
          ? haystackVal.includes(needleVal)
          : false;
      }

      // Math operators
      if (expr.$add && Array.isArray(expr.$add)) {
        const values = expr.$add.map(
          v => Number(this.evaluateExpression(v, doc)) || 0
        );
        return values.reduce((sum, val) => sum + val, 0);
      }
      if (expr.$multiply && Array.isArray(expr.$multiply)) {
        const [left, right] = expr.$multiply;
        const leftVal = this.evaluateExpression(left, doc);
        const rightVal = this.evaluateExpression(right, doc);
        return (leftVal || 0) * (rightVal || 0);
      }

      // Comparison operators
      if (expr.$gte && Array.isArray(expr.$gte) && expr.$gte.length === 2) {
        const left = this.evaluateExpression(expr.$gte[0], doc);
        const right = this.evaluateExpression(expr.$gte[1], doc);
        return left >= right;
      }

      // For unsupported expressions, return the expression as-is
      return expr;
    } else {
      return expr;
    }
  }

  private evaluateCondition(docValue: any, condition: any): boolean {
    if (typeof condition === 'object' && condition !== null) {
      for (const [op, value] of Object.entries(condition)) {
        switch (op) {
          case '$eq':
            if (docValue !== value) return false;
            break;
          case '$ne':
            if (docValue === value) return false;
            break;
          case '$gt':
            if (!(docValue > value)) return false;
            break;
          case '$gte':
            if (!(docValue >= value)) return false;
            break;
          case '$lt':
            if (!(docValue < value)) return false;
            break;
          case '$lte':
            if (!(docValue <= value)) return false;
            break;
          case '$in':
            if (!Array.isArray(value) || !value.includes(docValue))
              return false;
            break;
          case '$nin':
            if (Array.isArray(value) && value.includes(docValue)) return false;
            break;
          case '$exists':
            if ((docValue !== undefined) !== value) return false;
            break;
          case '$regex': {
            const pattern = value instanceof RegExp ? value : new RegExp(value);
            if (!pattern.test(String(docValue || ''))) return false;
            break;
          }
          case '$all':
            if (!Array.isArray(docValue) || !Array.isArray(value)) return false;
            if (!value.every(v => docValue.includes(v))) return false;
            break;
          case '$size':
            if (!Array.isArray(docValue) || docValue.length !== value)
              return false;
            break;
        }
      }
    } else {
      return docValue === condition;
    }

    return true;
  }

  private getFieldValue(doc: Document, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value = doc;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as any)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }
}

/**
 * Performance optimization engine
 */
export class PerformanceEngineImpl implements PerformanceEngine {
  private optimizationStats = {
    dimensionsCreated: 0,
    compactionsRun: 0,
    pipelinesOptimized: 0,
  };

  shouldCompactColumns(): boolean {
    // Heuristics for when to compact columnar storage
    // Could be based on fragmentation ratio, memory usage, etc.
    return false; // Simplified for now
  }

  compactColumns(_store: CrossfilterStore): void {
    // Compact columnar storage to improve cache locality
    // Implementation would defragment arrays, remove gaps, etc.
    this.optimizationStats.compactionsRun++;
  }

  shouldCreateDimension(fieldPath: string, selectivity: number): boolean {
    // Create dimensions for fields with good selectivity (not too high, not too low)
    // High selectivity (many unique values) = good for filtering
    // Low selectivity (few unique values) = good for grouping
    return selectivity > 0.01 && selectivity < 0.8;
  }

  getOptimalDimensions(pipeline: Pipeline): string[] {
    const dimensions = new Set<string>();
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];

    for (const stage of stages) {
      const stageType = Object.keys(stage)[0];

      switch (stageType) {
        case '$match':
          this.extractMatchFields(stage.$match, dimensions);
          break;

        case '$group':
          this.extractGroupFields(stage.$group, dimensions);
          break;

        case '$sort':
          this.extractSortFields(stage.$sort, dimensions);
          break;
      }
    }

    return Array.from(dimensions);
  }

  optimizePipeline(pipeline: Pipeline): ExecutionPlan {
    const stages = Array.isArray(pipeline) ? [...pipeline] : [pipeline];

    // Apply optimization rules iteratively until no more changes
    let changed = true;
    while (changed) {
      changed = false;

      // Rule 1: Fuse $project + $match into one compiled function
      changed = this.fuseProjectMatch(stages) || changed;

      // Rule 2: Push down $match predicates before $sort/$group/$unwind/$lookup where safe
      changed = this.pushdownMatch(stages) || changed;

      // Rule 3: Top-k rewrite: $sort→$limit k → bounded heap
      changed = this.optimizeTopK(stages) || changed;

      // Rule 4: Constant folding: precompute literals at plan time
      changed = this.foldConstants(stages) || changed;

      // Rule 5: Projection pruning: drop unused columns early
      changed = this.pruneProjection(stages) || changed;
    }

    const compiledStages: CompiledStage[] = [];
    let canFullyIncrement = true;
    let canFullyDecrement = true;
    let hasSort = false;
    let hasSortLimit = false;
    let hasGroupBy = false;

    // Analyze and compile each stage
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageType = Object.keys(stage)[0];

      const compiledStage: CompiledStage = {
        type: stageType,
        canIncrement: this.canStageIncrement(stage),
        canDecrement: this.canStageDecrement(stage),
        inputFields: this.getStageInputFields(stage),
        outputFields: this.getStageOutputFields(stage),
        stageData: stage[stageType],
      };

      if (!compiledStage.canIncrement) canFullyIncrement = false;
      if (!compiledStage.canDecrement) canFullyDecrement = false;

      if (stageType === '$sort') {
        hasSort = true;
        // Check if next stage is $limit (top-k optimization)
        if (i + 1 < stages.length && '$limit' in stages[i + 1]) {
          hasSortLimit = true;
        }
      }

      if (stageType === '$group') {
        hasGroupBy = true;
      }

      compiledStages.push(compiledStage);
    }

    this.optimizationStats.pipelinesOptimized++;

    return {
      stages: compiledStages,
      canIncrement: canFullyIncrement,
      canDecrement: canFullyDecrement,
      estimatedComplexity: this.estimatePipelineComplexity(compiledStages),
      primaryDimensions: this.getOptimalDimensions(stages),
      optimizations: {
        hasSort,
        hasSortLimit,
        hasGroupBy,
        canUseTopK: hasSortLimit,
        canVectorize: this.canVectorizePipeline(compiledStages),
      },
    };
  }

  // Rule 1: Fuse $project + $match into one compiled function
  private fuseProjectMatch(stages: any[]): boolean {
    let changed = false;

    for (let i = 0; i < stages.length - 1; i++) {
      const current = stages[i];
      const next = stages[i + 1];

      if ('$project' in current && '$match' in next) {
        // Create fused stage that projects then filters in one pass
        const fusedStage = {
          $projectMatch: {
            project: current.$project,
            match: next.$match,
          },
        };

        stages.splice(i, 2, fusedStage);
        changed = true;
        break;
      }
    }

    return changed;
  }

  // Rule 2: Push down $match predicates before expensive operations
  private pushdownMatch(stages: any[]): boolean {
    let changed = false;

    for (let i = 0; i < stages.length - 1; i++) {
      const current = stages[i];
      const next = stages[i + 1];

      // Push $match before $sort, $group, $unwind, $lookup when safe
      if (
        '$match' in next &&
        ('$sort' in current ||
          '$group' in current ||
          '$unwind' in current ||
          '$lookup' in current)
      ) {
        // Check if match predicate doesn't depend on current stage's output
        if (this.isMatchPredicateSafe(next.$match, current)) {
          // Swap stages
          stages[i] = next;
          stages[i + 1] = current;
          changed = true;
          break;
        }
      }
    }

    return changed;
  }

  // Rule 3: Top-k rewrite: $sort→$limit k → bounded heap
  private optimizeTopK(stages: any[]): boolean {
    let changed = false;

    for (let i = 0; i < stages.length - 1; i++) {
      const current = stages[i];
      const next = stages[i + 1];

      if ('$sort' in current && '$limit' in next) {
        // Replace with bounded top-k operation
        const topKStage = {
          $topK: {
            sort: current.$sort,
            limit: next.$limit,
          },
        };

        stages.splice(i, 2, topKStage);
        changed = true;
        break;
      }
    }

    return changed;
  }

  // Rule 4: Constant folding: precompute literals at plan time
  private foldConstants(stages: any[]): boolean {
    let changed = false;

    for (const stage of stages) {
      if ('$project' in stage) {
        for (const [field, expr] of Object.entries(stage.$project)) {
          if (this.isConstantExpression(expr)) {
            const evaluated = this.evaluateConstant(expr);
            if (evaluated !== expr) {
              stage.$project[field] = evaluated;
              changed = true;
            }
          }
        }
      }
    }

    return changed;
  }

  // Rule 5: Projection pruning: drop unused columns early
  private pruneProjection(stages: any[]): boolean {
    let changed = false;

    // Analyze which fields are actually used in downstream stages
    const usedFields = this.analyzeFieldUsage(stages);

    for (const stage of stages) {
      if ('$project' in stage) {
        for (const field of Object.keys(stage.$project)) {
          if (!usedFields.has(field) && field !== '_id') {
            delete stage.$project[field];
            changed = true;
          }
        }
      }
    }

    return changed;
  }

  private isMatchPredicateSafe(matchExpr: any, previousStage: any): boolean {
    // Simplified safety check - in real implementation would analyze field dependencies
    const matchFields = this.extractMatchFields(matchExpr, new Set());
    const stageOutputs = this.getStageOutputFields(previousStage);

    // Safe if match doesn't depend on fields produced by previous stage
    return !matchFields.some(field => stageOutputs.includes(field));
  }

  private isConstantExpression(expr: any): boolean {
    if (typeof expr === 'string' && expr.startsWith('$')) return false;
    if (typeof expr === 'object' && expr !== null) {
      return Object.values(expr).every(v => this.isConstantExpression(v));
    }
    return true;
  }

  private evaluateConstant(expr: any): any {
    // Simplified constant evaluation
    if (typeof expr === 'object' && expr !== null && !Array.isArray(expr)) {
      if (expr.$add && Array.isArray(expr.$add)) {
        const values = expr.$add.map(v => this.evaluateConstant(v));
        if (values.every(v => typeof v === 'number')) {
          return values.reduce((sum, val) => sum + val, 0);
        }
      }
    }
    return expr;
  }

  private analyzeFieldUsage(stages: any[]): Set<string> {
    const usedFields = new Set<string>();

    for (const stage of stages) {
      const inputs = this.getStageInputFields(stage);
      inputs.forEach(field => usedFields.add(field));
    }

    return usedFields;
  }

  private estimatePipelineComplexity(stages: CompiledStage[]): string {
    if (
      stages.some(
        s => s.type === '$sort' && !stages.some(s2 => s2.type === '$limit')
      )
    ) {
      return 'O(n log n)';
    } else if (stages.some(s => s.type === '$sort' || s.type === '$group')) {
      return 'O(log n)';
    } else if (stages.some(s => s.type === '$match')) {
      return 'O(n)';
    }
    return 'O(1)';
  }

  private canVectorizePipeline(stages: CompiledStage[]): boolean {
    // Vectorization is possible if all stages are simple enough
    return stages.every(
      stage => stage.type === '$match' || stage.type === '$project'
    );
  }

  reorderStagesForEfficiency(stages: CompiledStage[]): CompiledStage[] {
    // Reorder stages for optimal performance
    // E.g., move $match stages before $group, combine adjacent $project stages

    const reordered = [...stages];

    // Move $match stages to the front
    reordered.sort((a, b) => {
      if (a.type === '$match' && b.type !== '$match') return -1;
      if (a.type !== '$match' && b.type === '$match') return 1;
      return 0;
    });

    return reordered;
  }

  private extractMatchFields(matchExpr: any, dimensions: Set<string>): void {
    if (typeof matchExpr !== 'object' || matchExpr === null) return;

    for (const [field, condition] of Object.entries(matchExpr)) {
      if (!field.startsWith('$')) {
        dimensions.add(field);
      } else if (field === '$and' || field === '$or') {
        const conditions = condition as any[];
        for (const cond of conditions) {
          this.extractMatchFields(cond, dimensions);
        }
      }
    }
  }

  private extractGroupFields(groupExpr: any, dimensions: Set<string>): void {
    if (!groupExpr || typeof groupExpr !== 'object') return;

    // Group by field
    if (typeof groupExpr._id === 'string' && groupExpr._id.startsWith('$')) {
      dimensions.add(groupExpr._id.substring(1));
    }

    // Accumulator fields
    for (const [field, expr] of Object.entries(groupExpr)) {
      if (field === '_id') continue;

      if (typeof expr === 'object' && expr !== null) {
        for (const [_accType, accField] of Object.entries(expr)) {
          if (typeof accField === 'string' && accField.startsWith('$')) {
            dimensions.add(accField.substring(1));
          }
        }
      }
    }
  }

  private extractSortFields(sortExpr: any, dimensions: Set<string>): void {
    if (typeof sortExpr !== 'object' || sortExpr === null) return;

    for (const field of Object.keys(sortExpr)) {
      dimensions.add(field);
    }
  }

  private canStageIncrement(stage: any): boolean {
    const stageType = Object.keys(stage)[0];

    // Define which stages support incremental updates
    const incrementalStages = [
      '$match',
      '$project',
      '$group',
      '$sort',
      '$limit',
      '$skip',
      '$addFields',
      '$set',
    ];
    return incrementalStages.includes(stageType);
  }

  private canStageDecrement(stage: any): boolean {
    const stageType = Object.keys(stage)[0];

    // Most incremental stages also support decremental updates
    // Some might have limitations (e.g., $push with ordering)
    const decrementalStages = [
      '$match',
      '$project',
      '$group',
      '$sort',
      '$limit',
      '$skip',
      '$addFields',
      '$set',
    ];
    return decrementalStages.includes(stageType);
  }

  private getStageInputFields(stage: any): string[] {
    const fields = new Set<string>();
    const stageType = Object.keys(stage)[0];
    const stageData = stage[stageType];

    switch (stageType) {
      case '$match':
        this.extractMatchFields(stageData, fields);
        break;

      case '$group':
        this.extractGroupFields(stageData, fields);
        break;

      case '$sort':
        this.extractSortFields(stageData, fields);
        break;

      case '$project':
        // Input fields are those referenced in expressions
        for (const [field, expr] of Object.entries(stageData)) {
          if (expr === 1 || expr === true) {
            fields.add(field);
          } else if (typeof expr === 'string' && expr.startsWith('$')) {
            fields.add(expr.substring(1));
          }
        }
        break;
    }

    return Array.from(fields);
  }

  private getStageOutputFields(stage: any): string[] {
    const stageType = Object.keys(stage)[0];
    const stageData = stage[stageType];

    switch (stageType) {
      case '$project':
        return Object.keys(stageData).filter(
          field => stageData[field] !== 0 && stageData[field] !== false
        );

      case '$group':
        return Object.keys(stageData);

      default:
        return []; // Other stages don't change field structure
    }
  }

  getStatistics(): any {
    return {
      ...this.optimizationStats,
    };
  }
}
