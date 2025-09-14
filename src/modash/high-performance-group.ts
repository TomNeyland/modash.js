/**
 * High-Performance $group Implementation
 * 
 * Combines Robin Hood hash tables with Structure-of-Arrays accumulators
 * for stable 1M+ docs/sec group performance with minimal memory allocation.
 */

import type { Collection, Document, DocumentValue } from './expressions.js';
import type { GroupStage, Expression } from '../index.js';
import { $expression } from './expressions.js';
import { RobinHoodHashTable } from './robin-hood-hash.js';
import { BatchSoAAccumulator } from './soa-accumulators.js';
import { DEBUG, logPipelineExecution } from './debug.js';

/**
 * Group result interface
 */
interface GroupResult {
  _id: DocumentValue;
  [field: string]: DocumentValue;
}

/**
 * Accumulator specification
 */
interface AccumulatorSpec {
  operator: string;
  expression: Expression;
}

/**
 * High-performance group engine
 */
export class HighPerformanceGroupEngine {
  private groupsTable = new RobinHoodHashTable<string, Document[]>();
  private keyCache = new Map<Document, string>(); // Cache for group keys
  
  /**
   * Execute high-performance group operation
   */
  execute<T extends Document = Document>(
    collection: Collection<T>,
    groupSpec: GroupStage['$group']
  ): Collection<Document> {
    if (!Array.isArray(collection) || collection.length === 0) {
      return [];
    }

    const startTime = DEBUG ? performance.now() : 0;
    
    // Clear state for new operation
    this.groupsTable.clear();
    this.keyCache.clear();
    
    const { _id: idSpec, ...accumulatorSpecs } = groupSpec;
    
    // Phase 1: Fast grouping with Robin Hood hash table
    const groupingTime = DEBUG ? performance.now() : 0;
    this.performGrouping(collection, idSpec);
    
    if (DEBUG) {
      const groupingDuration = performance.now() - groupingTime;
      logPipelineExecution('HIGH_PERF_GROUP', `Grouping phase completed`, {
        documents: collection.length,
        groups: this.groupsTable.getSize(),
        groupingTimeMs: groupingDuration.toFixed(2),
        hashStats: this.groupsTable.getStats()
      });
    }

    // Phase 2: SoA accumulation for each group
    const accumulationTime = DEBUG ? performance.now() : 0;
    const results = this.performAccumulation(idSpec, accumulatorSpecs);
    
    if (DEBUG) {
      const totalDuration = performance.now() - startTime;
      const accumulationDuration = performance.now() - accumulationTime;
      
      logPipelineExecution('HIGH_PERF_GROUP', `High-performance group completed`, {
        documents: collection.length,
        groups: results.length,
        totalTimeMs: totalDuration.toFixed(2),
        accumulationTimeMs: accumulationDuration.toFixed(2),
        throughputDocsPerSec: Math.round(collection.length / (totalDuration / 1000)),
        avgGroupSize: Math.round(collection.length / results.length)
      });
    }
    
    return results as Collection<Document>;
  }

  /**
   * Phase 1: Group documents using Robin Hood hash table
   */
  private performGrouping<T extends Document>(
    collection: Collection<T>,
    idSpec: Expression
  ): void {
    // Fast path for simple field references
    if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
      this.groupBySimpleField(collection, idSpec.slice(1));
      return;
    }

    // General expression-based grouping
    for (const doc of collection) {
      const groupKey = this.getGroupKey(doc, idSpec);
      
      let group = this.groupsTable.get(groupKey);
      if (!group) {
        group = [];
        this.groupsTable.set(groupKey, group);
      }
      
      group.push(doc);
    }
  }

  /**
   * Optimized grouping for simple field references
   */
  private groupBySimpleField<T extends Document>(
    collection: Collection<T>,
    fieldName: string
  ): void {
    for (const doc of collection) {
      const value = doc[fieldName];
      const groupKey = JSON.stringify(value);
      
      let group = this.groupsTable.get(groupKey);
      if (!group) {
        group = [];
        this.groupsTable.set(groupKey, group);
      }
      
      group.push(doc);
    }
  }

  /**
   * Get group key for document with caching
   */
  private getGroupKey(doc: Document, idSpec: Expression): string {
    // Check cache first
    if (this.keyCache.has(doc)) {
      return this.keyCache.get(doc)!;
    }
    
    const idValue = $expression(doc, idSpec);
    const key = JSON.stringify(idValue);
    
    // Cache the result
    this.keyCache.set(doc, key);
    
    return key;
  }

  /**
   * Phase 2: Perform SoA accumulation for each group
   */
  private performAccumulation(
    idSpec: Expression,
    accumulatorSpecs: Record<string, any>
  ): GroupResult[] {
    const results: GroupResult[] = [];
    
    // Process each group with SoA accumulators
    for (const [groupKey, documents] of this.groupsTable.entries()) {
      const result: GroupResult = {
        _id: idSpec ? $expression(documents[0]!, idSpec) : null
      };
      
      // Use batch SoA accumulator for multiple fields
      if (Object.keys(accumulatorSpecs).length > 0) {
        const batchAccumulator = new BatchSoAAccumulator(documents);
        const operators: Record<string, string> = {};
        
        // Set up accumulators for each field
        for (const [fieldName, spec] of Object.entries(accumulatorSpecs)) {
          if (typeof spec === 'object' && spec !== null) {
            const [[operator, expression]] = Object.entries(spec);
            batchAccumulator.addField(fieldName, expression as Expression);
            operators[fieldName] = operator;
          }
        }
        
        // Execute all accumulators in batch
        const accumulatedResults = batchAccumulator.execute(operators);
        Object.assign(result, accumulatedResults);
      }
      
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    groupCount: number;
    hashTableStats: any;
    cacheHitRate: number;
  } {
    return {
      groupCount: this.groupsTable.getSize(),
      hashTableStats: this.groupsTable.getStats(),
      cacheHitRate: this.keyCache.size > 0 ? 
        (this.keyCache.size / this.groupsTable.getSize()) : 0
    };
  }
}

/**
 * Singleton high-performance group engine
 */
const highPerfGroupEngine = new HighPerformanceGroupEngine();

/**
 * High-performance $group function
 */
export function highPerformanceGroup<T extends Document = Document>(
  collection: Collection<T>,
  groupSpec: GroupStage['$group']
): Collection<Document> {
  return highPerfGroupEngine.execute(collection, groupSpec);
}

/**
 * Check if group operation can use high-performance engine
 */
export function canUseHighPerformanceGroup(groupSpec: GroupStage['$group']): boolean {
  const { _id, ...accumulatorSpecs } = groupSpec;
  
  // Support all simple _id specifications
  if (_id === null || _id === undefined) {
    // Single group
  } else if (typeof _id === 'string' && _id.startsWith('$')) {
    // Simple field reference
  } else if (typeof _id === 'object' && _id !== null) {
    // Complex grouping - can still be optimized
  }
  
  // Check accumulator specifications
  for (const [fieldName, spec] of Object.entries(accumulatorSpecs)) {
    if (typeof spec !== 'object' || spec === null) {
      return false;
    }
    
    const operators = Object.keys(spec);
    if (operators.length !== 1) {
      return false; // Only single operator per field for now
    }
    
    const operator = operators[0];
    const supportedOperators = ['$sum', '$avg', '$min', '$max', '$first', '$last', '$push', '$addToSet'];
    
    if (!supportedOperators.includes(operator)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get group engine statistics
 */
export function getGroupEngineStats(): any {
  return highPerfGroupEngine.getStats();
}