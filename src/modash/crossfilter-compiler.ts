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

  compileMatchExpr(expr: any): (doc: Document, rowId: RowId) => boolean {
    const key = `match:${JSON.stringify(expr)}`;
    
    if (this.compiledCache.has(key)) {
      return this.compiledCache.get(key) as (doc: Document, rowId: RowId) => boolean;
    }

    const compiled = this.buildMatchFunction(expr);
    this.compiledCache.set(key, compiled);
    
    return compiled;
  }

  compileProjectExpr(expr: any): (doc: Document, rowId: RowId) => Document {
    const key = `project:${JSON.stringify(expr)}`;
    
    if (this.compiledCache.has(key)) {
      return this.compiledCache.get(key) as (doc: Document, rowId: RowId) => Document;
    }

    const compiled = this.buildProjectFunction(expr);
    this.compiledCache.set(key, compiled);
    
    return compiled;
  }

  compileGroupExpr(expr: any): {
    getGroupKey: (doc: Document, rowId: RowId) => DocumentValue;
    accumulators: Array<{
      field: string;
      type: string;
      getValue: (doc: Document, rowId: RowId) => DocumentValue;
    }>;
  } {
    const key = `group:${JSON.stringify(expr)}`;
    
    // Build group key function
    const getGroupKey = this.buildGroupKeyFunction(expr._id);
    
    // Build accumulator functions
    const accumulators: Array<{
      field: string;
      type: string;
      getValue: (doc: Document, rowId: RowId) => DocumentValue;
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
          const vectorizableOps = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin'];
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

  private buildMatchFunction(expr: any): (doc: Document, rowId: RowId) => boolean {
    if (typeof expr !== 'object' || expr === null) {
      return () => false;
    }

    // Generate optimized function code
    const conditions: string[] = [];
    
    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) {
        // Logical operators
        switch (field) {
          case '$and':
            const andConditions = (condition as any[]).map((cond, i) => {
              const subFn = this.buildMatchFunction(cond);
              return `subFn${i}(doc, rowId)`;
            });
            conditions.push(`(${andConditions.join(' && ')})`);
            break;
          
          case '$or':
            const orConditions = (condition as any[]).map((cond, i) => {
              const subFn = this.buildMatchFunction(cond);
              return `subFn${i}(doc, rowId)`;
            });
            conditions.push(`(${orConditions.join(' || ')})`);
            break;
          
          case '$not':
            const notFn = this.buildMatchFunction(condition);
            conditions.push(`!(subFn(doc, rowId))`);
            break;
        }
      } else {
        // Field conditions
        const fieldAccess = this.generateFieldAccess(field);
        
        if (typeof condition === 'object' && condition !== null) {
          for (const [op, value] of Object.entries(condition)) {
            const conditionCode = this.generateConditionCode(fieldAccess, op, value);
            conditions.push(conditionCode);
          }
        } else {
          // Simple equality
          conditions.push(`${fieldAccess} === ${JSON.stringify(condition)}`);
        }
      }
    }

    const functionBody = conditions.length > 0 
      ? `return ${conditions.join(' && ')};`
      : 'return true;';

    // Create optimized function
    try {
      return new Function('doc', 'rowId', `
        ${this.generateFieldAccessors()}
        ${functionBody}
      `) as (doc: Document, rowId: RowId) => boolean;
    } catch (error) {
      // Fallback to safer evaluation
      return (doc: Document, rowId: RowId) => {
        return this.evaluateMatchExpression(expr, doc);
      };
    }
  }

  private buildProjectFunction(expr: any): (doc: Document, rowId: RowId) => Document {
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
        projections.push(`if (${this.generateFieldAccess(field)} !== undefined) result.${field} = ${this.generateFieldAccess(field)};`);
      } else if (projection === 0 || projection === false) {
        // Exclude field (handled by not including it)
        continue;
      } else if (typeof projection === 'object' && projection !== null) {
        // Computed field with expression
        const exprCode = this.generateExpressionCode(projection);
        projections.push(`result.${field} = ${exprCode};`);
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
      return new Function('doc', 'rowId', `
        ${this.generateFieldAccessors()}
        ${functionBody}
      `) as (doc: Document, rowId: RowId) => Document;
    } catch (error) {
      // Fallback to safer evaluation
      return (doc: Document, rowId: RowId) => {
        return this.evaluateProjectExpression(expr, doc);
      };
    }
  }

  private buildGroupKeyFunction(keyExpr: any): (doc: Document, rowId: RowId) => DocumentValue {
    if (typeof keyExpr === 'string' && keyExpr.startsWith('$')) {
      const field = keyExpr.substring(1);
      const fieldAccess = this.generateFieldAccess(field);
      
      try {
        return new Function('doc', 'rowId', `
          ${this.generateFieldAccessors()}
          return ${fieldAccess};
        `) as (doc: Document, rowId: RowId) => DocumentValue;
      } catch (error) {
        return (doc: Document) => this.getFieldValue(doc, field);
      }
    } else if (typeof keyExpr === 'object' && keyExpr !== null) {
      // Complex grouping expression
      const exprCode = this.generateExpressionCode(keyExpr);
      
      try {
        return new Function('doc', 'rowId', `
          ${this.generateFieldAccessors()}
          return ${exprCode};
        `) as (doc: Document, rowId: RowId) => DocumentValue;
      } catch (error) {
        return (doc: Document) => this.evaluateExpression(keyExpr, doc);
      }
    } else {
      // Literal value
      return () => keyExpr;
    }
  }

  private buildAccumulatorValueFunction(accField: any): (doc: Document, rowId: RowId) => DocumentValue {
    if (accField === 1) {
      return () => 1; // Count
    } else if (typeof accField === 'string' && accField.startsWith('$')) {
      const field = accField.substring(1);
      const fieldAccess = this.generateFieldAccess(field);
      
      try {
        return new Function('doc', 'rowId', `
          ${this.generateFieldAccessors()}
          return ${fieldAccess};
        `) as (doc: Document, rowId: RowId) => DocumentValue;
      } catch (error) {
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
          // For complex expressions, we'll implement basic operators
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
          if (expr.$multiply && Array.isArray(expr.$multiply)) {
            const [left, right] = expr.$multiply;
            const leftVal = evalExpr(left, doc);
            const rightVal = evalExpr(right, doc);
            return (leftVal || 0) * (rightVal || 0);
          }
          if (expr.$substr && Array.isArray(expr.$substr) && expr.$substr.length === 3) {
            const [strExpr, startExpr, lengthExpr] = expr.$substr;
            const str = String(evalExpr(strExpr, doc) || '');
            const start = Number(evalExpr(startExpr, doc) || 0);
            const length = Number(evalExpr(lengthExpr, doc) || 0);
            return str.substring(start, start + length);
          }
          // Add other operators as needed
          return expr;
        } else {
          return expr;
        }
      }
    `;
  }

  private generateConditionCode(fieldAccess: string, operator: string, value: any): string {
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
          const checks = value.map(v => `(${fieldAccess} && Array.isArray(${fieldAccess}) && ${fieldAccess}.includes(${JSON.stringify(v)}))`);
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
          .map(([key, value]) => `"${key}": ${this.generateExpressionCode(value)}`)
          .join(', ');
        return `{${fields}}`;
      } else {
        // Complex expression with operators - fall back to runtime evaluation
        return `evalExpr(${JSON.stringify(expr)}, doc)`;
      }
    } else {
      return JSON.stringify(expr);
    }
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
            return (condition as any[]).every(cond => this.evaluateMatchExpression(cond, doc));
          case '$or':
            return (condition as any[]).some(cond => this.evaluateMatchExpression(cond, doc));
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
    
    for (const [field, projection] of Object.entries(expr)) {
      if (projection === 1 || projection === true) {
        result[field] = this.getFieldValue(doc, field);
      } else if (projection === 0 || projection === false) {
        // Skip field
      } else if (typeof projection === 'object' && projection !== null) {
        result[field] = this.evaluateExpression(projection, doc);
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
      // Complex expression - would need full expression evaluator
      return expr; // Simplified for now
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
            if (!Array.isArray(value) || !value.includes(docValue)) return false;
            break;
          case '$nin':
            if (Array.isArray(value) && value.includes(docValue)) return false;
            break;
          case '$exists':
            if ((docValue !== undefined) !== value) return false;
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

  compactColumns(store: CrossfilterStore): void {
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
    const stages = Array.isArray(pipeline) ? pipeline : [pipeline];
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

    // Determine optimal dimensions
    const primaryDimensions = this.getOptimalDimensions(pipeline);

    // Estimate complexity
    let estimatedComplexity: 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)' = 'O(1)';
    
    if (hasSort && !hasSortLimit) {
      estimatedComplexity = 'O(n log n)';
    } else if (hasSort || hasGroupBy) {
      estimatedComplexity = 'O(log n)';
    } else if (compiledStages.some(s => s.type === '$match')) {
      estimatedComplexity = 'O(n)';
    }

    this.optimizationStats.pipelinesOptimized++;

    return {
      stages: compiledStages,
      canFullyIncrement,
      canFullyDecrement,
      hasSort,
      hasSortLimit,
      hasGroupBy,
      primaryDimensions,
      estimatedComplexity,
    };
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
        for (const [accType, accField] of Object.entries(expr)) {
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
    const incrementalStages = ['$match', '$project', '$group', '$sort', '$limit', '$skip', '$addFields', '$set'];
    return incrementalStages.includes(stageType);
  }

  private canStageDecrement(stage: any): boolean {
    const stageType = Object.keys(stage)[0];
    
    // Most incremental stages also support decremental updates
    // Some might have limitations (e.g., $push with ordering)
    const decrementalStages = ['$match', '$project', '$group', '$sort', '$limit', '$skip', '$addFields', '$set'];
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
        return Object.keys(stageData).filter(field => stageData[field] !== 0 && stageData[field] !== false);
      
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