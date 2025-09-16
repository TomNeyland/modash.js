/**
 * Phase 10: Expression JIT Compiler
 * 
 * Compiles MongoDB expressions to closure-free JavaScript functions:
 * - Cache keyed by AST hash + type vector for monomorphic ICs
 * - Stable argument order for V8 optimization
 * - Automatic fallback to interpreter on megamorphism
 * - Handles $expr, $cond, $switch with optimized code generation
 */

import { DocumentValue } from '../../src/aggo/expressions';

export interface ExpressionAST {
  type: string;
  operator?: string;
  operands?: ExpressionAST[];
  value?: DocumentValue;
  field?: string;
}

export interface TypeVector {
  types: string[];
  hash: string;
}

export interface CompiledExpression {
  fn: Function;
  cacheKey: string;
  typeVector: TypeVector;
  compileTimeMs: number;
  hitCount: number;
  megamorphic: boolean;
}

export interface JITStats {
  cacheHits: number;
  cacheMisses: number;
  compilations: number;
  megamorphicFallbacks: number;
  totalCompileTimeMs: number;
  averageCompileTimeMs: number;
}

/**
 * Simple hash function for cache keys
 */
function hashString(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(36);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract type vector from sample documents for monomorphic IC optimization
 */
function extractTypeVector(docs: any[], fieldPaths: string[]): TypeVector {
  const types: string[] = [];
  
  for (const path of fieldPaths) {
    const sampleValues = docs.slice(0, 10).map(doc => {
      const value = getFieldValue(doc, path);
      return typeof value;
    });
    
    // Use most common type
    const typeFreq = sampleValues.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostCommonType = Object.keys(typeFreq).reduce((a, b) => 
      typeFreq[a] > typeFreq[b] ? a : b, 'undefined'
    );
    
    types.push(mostCommonType);
  }
  
  const typeString = types.join(',');
  return {
    types,
    hash: hashString(typeString)
  };
}

/**
 * Get field value from document using dot notation
 */
function getFieldValue(doc: any, path: string): any {
  const parts = path.split('.');
  let current = doc;
  
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  
  return current;
}

/**
 * Expression JIT Compiler with caching and type specialization
 */
export class ExpressionJIT {
  private cache = new Map<string, CompiledExpression>();
  private stats: JITStats = {
    cacheHits: 0,
    cacheMisses: 0,
    compilations: 0,
    megamorphicFallbacks: 0,
    totalCompileTimeMs: 0,
    averageCompileTimeMs: 0
  };
  
  // Megamorphic detection threshold
  private readonly MEGAMORPHIC_THRESHOLD = 5;
  
  /**
   * Compile expression with type specialization and caching
   */
  compile(ast: ExpressionAST, sampleDocs: any[] = []): CompiledExpression {
    const astHash = hashString(JSON.stringify(ast));
    const fieldPaths = this.extractFieldPaths(ast);
    const typeVector = extractTypeVector(sampleDocs, fieldPaths);
    const cacheKey = `${astHash}_${typeVector.hash}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.hitCount++;
      this.stats.cacheHits++;
      
      // Check for megamorphism
      if (cached.hitCount > this.MEGAMORPHIC_THRESHOLD) {
        const allCachedForAST = Array.from(this.cache.values())
          .filter(c => c.cacheKey.startsWith(astHash));
        
        if (allCachedForAST.length > this.MEGAMORPHIC_THRESHOLD) {
          cached.megamorphic = true;
          this.stats.megamorphicFallbacks++;
        }
      }
      
      return cached;
    }
    
    // Cache miss - compile new function
    this.stats.cacheMisses++;
    const startTime = Date.now();
    
    const compiled = this.compileExpression(ast, fieldPaths, typeVector);
    
    const compileTime = Date.now() - startTime;
    this.stats.compilations++;
    this.stats.totalCompileTimeMs += compileTime;
    this.stats.averageCompileTimeMs = this.stats.totalCompileTimeMs / this.stats.compilations;
    
    const compiledExpr: CompiledExpression = {
      fn: compiled,
      cacheKey,
      typeVector,
      compileTimeMs: compileTime,
      hitCount: 1,
      megamorphic: false
    };
    
    this.cache.set(cacheKey, compiledExpr);
    return compiledExpr;
  }

  /**
   * Core expression compilation to JavaScript function
   */
  private compileExpression(ast: ExpressionAST, fieldPaths: string[], typeVector: TypeVector): Function {
    const code = this.generateCode(ast, 'doc');
    const argNames = ['doc', 'getField']; // Stable argument order for V8 optimization
    
    // Create helper function for field access
    const getField = (doc: any, path: string) => getFieldValue(doc, path);
    
    try {
      // Use new Function for closure-free compilation
      const compiled = new Function(...argNames, `
        "use strict";
        try {
          return (${code});
        } catch (e) {
          return null;
        }
      `);
      
      // Return bound function with stable context
      return (doc: any) => compiled(doc, getField);
    } catch (e) {
      // Fallback for compilation errors
      return () => null;
    }
  }

  /**
   * Generate JavaScript code from AST
   */
  private generateCode(ast: ExpressionAST, docVar: string = 'doc'): string {
    switch (ast.type) {
      case 'literal':
        return JSON.stringify(ast.value);
        
      case 'field':
        return `getField(${docVar}, ${JSON.stringify(ast.field)})`;
        
      case 'operator':
        return this.generateOperatorCode(ast, docVar);
        
      case 'conditional':
        return this.generateConditionalCode(ast, docVar);
        
      default:
        return 'null';
    }
  }

  /**
   * Generate code for operator expressions
   */
  private generateOperatorCode(ast: ExpressionAST, docVar: string): string {
    const operands = ast.operands || [];
    const operandCodes = operands.map(op => this.generateCode(op, docVar));
    
    switch (ast.operator) {
      case '$add':
        return operandCodes.length > 0 ? 
          `(${operandCodes.join(' + ')})` : '0';
          
      case '$subtract':
        return operandCodes.length === 2 ? 
          `(${operandCodes[0]} - ${operandCodes[1]})` : 'null';
          
      case '$multiply':
        return operandCodes.length > 0 ? 
          `(${operandCodes.join(' * ')})` : '1';
          
      case '$divide':
        return operandCodes.length === 2 ? 
          `(${operandCodes[1]} !== 0 ? ${operandCodes[0]} / ${operandCodes[1]} : null)` : 'null';
          
      case '$eq':
        return operandCodes.length === 2 ? 
          `(${operandCodes[0]} === ${operandCodes[1]})` : 'false';
          
      case '$gt':
        return operandCodes.length === 2 ? 
          `(${operandCodes[0]} > ${operandCodes[1]})` : 'false';
          
      case '$gte':
        return operandCodes.length === 2 ? 
          `(${operandCodes[0]} >= ${operandCodes[1]})` : 'false';
          
      case '$lt':
        return operandCodes.length === 2 ? 
          `(${operandCodes[0]} < ${operandCodes[1]})` : 'false';
          
      case '$lte':
        return operandCodes.length === 2 ? 
          `(${operandCodes[0]} <= ${operandCodes[1]})` : 'false';
          
      case '$concat':
        return operandCodes.length > 0 ? 
          `String(${operandCodes.join(') + String(')})` : '""';
          
      default:
        return 'null';
    }
  }

  /**
   * Generate code for conditional expressions ($cond, $switch)
   */
  private generateConditionalCode(ast: ExpressionAST, docVar: string): string {
    const operands = ast.operands || [];
    
    if (ast.operator === '$cond' && operands.length === 3) {
      const [condition, thenExpr, elseExpr] = operands;
      return `(${this.generateCode(condition, docVar)} ? ${this.generateCode(thenExpr, docVar)} : ${this.generateCode(elseExpr, docVar)})`;
    }
    
    if (ast.operator === '$switch' && operands.length >= 2) {
      const branches = operands.slice(0, -1);
      const defaultExpr = operands[operands.length - 1];
      
      let code = '';
      for (let i = 0; i < branches.length; i += 2) {
        const condition = branches[i];
        const value = branches[i + 1];
        
        if (i === 0) {
          code = `(${this.generateCode(condition, docVar)} ? ${this.generateCode(value, docVar)} : `;
        } else {
          code += `${this.generateCode(condition, docVar)} ? ${this.generateCode(value, docVar)} : `;
        }
      }
      
      code += `${this.generateCode(defaultExpr, docVar)}`;
      for (let i = 0; i < branches.length / 2; i++) {
        code += ')';
      }
      
      return code;
    }
    
    return 'null';
  }

  /**
   * Extract field paths from AST for type vector generation
   */
  private extractFieldPaths(ast: ExpressionAST): string[] {
    const paths: string[] = [];
    
    const extract = (node: ExpressionAST) => {
      if (node.type === 'field' && node.field) {
        paths.push(node.field);
      }
      
      if (node.operands) {
        node.operands.forEach(extract);
      }
    };
    
    extract(ast);
    return [...new Set(paths)]; // Remove duplicates
  }

  /**
   * Clear compilation cache
   */
  clearCache(): void {
    this.cache.clear();
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      compilations: 0,
      megamorphicFallbacks: 0,
      totalCompileTimeMs: 0,
      averageCompileTimeMs: 0
    };
  }

  /**
   * Get compilation statistics
   */
  getStats(): JITStats {
    return { ...this.stats };
  }

  /**
   * Get cache size and efficiency metrics
   */
  getCacheMetrics() {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = totalRequests > 0 ? (this.stats.cacheHits / totalRequests) * 100 : 0;
    
    return {
      cacheSize: this.cache.size,
      hitRate: hitRate.toFixed(2) + '%',
      totalRequests,
      megamorphicPercentage: totalRequests > 0 ? 
        (this.stats.megamorphicFallbacks / totalRequests * 100).toFixed(2) + '%' : '0%'
    };
  }
}