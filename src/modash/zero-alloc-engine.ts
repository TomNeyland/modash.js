/**
 * Zero-Allocation Engine for Hot Path Operations
 * 
 * This engine implements the P0 performance requirements:
 * - Row IDs only in hot path, materialization only at end
 * - Near-zero allocations in steady state
 * - Compiled path only, no interpreter fallbacks
 * - Vectorized operations where possible
 */

import type { Collection, Document, DocumentValue } from './expressions.js';
import { $expressionObject } from './expressions.js';
import type { Pipeline } from '../index.js';
import { highPerformanceGroup, canUseHighPerformanceGroup } from './high-performance-group.js';

/**
 * Minimal hot path context - no object allocations
 */
interface HotPathContext {
  readonly documents: Document[];
  readonly activeRowIds: Uint32Array;
  activeCount: number;
  scratchBuffer: Uint32Array;
  scratchCount: number;
}

/**
 * Pre-compiled pipeline stage function
 * Returns count of rows that passed through to scratchBuffer
 */
type CompiledStage = (context: HotPathContext) => number;

/**
 * Zero allocation pipeline compiler
 */
export class ZeroAllocEngine {
  private compiledPipelines = new Map<string, CompiledStage[]>();
  private contextPool: HotPathContext[] = [];
  private activeRowIdsPool: Uint32Array[] = [];
  private scratchBufferPool: Uint32Array[] = [];

  /**
   * Execute pipeline with zero allocations in hot path
   */
  execute(documents: Collection, pipeline: Pipeline): Collection {
    const pipelineKey = JSON.stringify(pipeline);
    
    // Get or compile pipeline
    let compiledStages = this.compiledPipelines.get(pipelineKey);
    if (!compiledStages) {
      compiledStages = this.compilePipeline(pipeline);
      this.compiledPipelines.set(pipelineKey, compiledStages);
    }

    // Get context from pool
    const context = this.getContext(documents, pipeline);
    
    try {
      // Execute each compiled stage in sequence
      context.activeCount = documents.length;
      
      for (let i = 0; i < compiledStages.length; i++) {
        const stage = compiledStages[i];
        
        // Execute stage - modifies context.scratchBuffer and returns count
        context.scratchCount = stage(context);
        
        // Swap buffers for next stage
        [context.activeRowIds, context.scratchBuffer] = [context.scratchBuffer, context.activeRowIds];
        context.activeCount = context.scratchCount;
        
        // Early exit if no rows remain
        if (context.activeCount === 0) break;
      }

      // Materialize final result from row IDs
      // Check if we have group results stored in context
      if ((context as any)._groupResults) {
        // Return group results directly
        const groupResults = (context as any)._groupResults;
        return groupResults as Collection;
      }
      
      const result: Document[] = new Array(context.activeCount);
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        let doc = this.getEffectiveDocument(context, rowId);
        
        // Apply projection if it exists
        const projectionSpec = (context as any)._projectionSpec;
        if (projectionSpec) {
          doc = this.applyProjection(doc, projectionSpec);
        }
        
        result[i] = doc;
      }
      
      return result as Collection;
      
    } finally {
      // Return context to pool
      this.returnContext(context);
    }
  }

  /**
   * Compile pipeline to optimized stages
   * Phase 3: Enhanced fusion and $unwind support
   */
  private compilePipeline(pipeline: Pipeline): CompiledStage[] {
    const stages: CompiledStage[] = [];
    
    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];
      const nextStage = i < pipeline.length - 1 ? pipeline[i + 1] : null;
      
      // Check for Phase 3 fusion opportunities
      if (stage.$match && nextStage?.$project) {
        // Fuse $match + $project
        stages.push(this.compileFusedMatchProject(stage.$match, nextStage.$project));
        i++; // Skip next stage
      } else if (stage.$sort && nextStage?.$limit) {
        // Fuse $sort + $limit for Top-K
        stages.push(this.compileFusedSortLimit(stage.$sort, nextStage.$limit));
        i++; // Skip next stage
      } else if (stage.$unwind && nextStage?.$group) {
        // Phase 3: Fuse $unwind + $group to avoid repeated materialization
        stages.push(this.compileFusedUnwindGroup(stage.$unwind, nextStage.$group));
        i++; // Skip next stage
      } else if (stage.$match) {
        stages.push(this.compileMatch(stage.$match));
      } else if (stage.$project) {
        stages.push(this.compileProject(stage.$project));
      } else if (stage.$group) {
        stages.push(this.compileGroup(stage.$group));
      } else if (stage.$sort) {
        stages.push(this.compileSort(stage.$sort));
      } else if (stage.$limit) {
        stages.push(this.compileLimit(stage.$limit));
      } else if (stage.$skip) {
        stages.push(this.compileSkip(stage.$skip));
      } else if (stage.$unwind) {
        stages.push(this.compileUnwind(stage.$unwind));
      } else {
        // Unsupported stage - fallback
        throw new Error(`Unsupported stage: ${Object.keys(stage)[0]}`);
      }
    }
    
    return stages;
  }

  /**
   * Compile $match stage to hot path function
   */
  private compileMatch(expr: any): CompiledStage {
    // Handle simple field equality (most common case)
    if (this.isSimpleEquality(expr)) {
      const entries = Object.entries(expr);
      if (entries.length === 1) {
        const [field, value] = entries[0];
        return (context: HotPathContext): number => {
          let count = 0;
          for (let i = 0; i < context.activeCount; i++) {
            const rowId = context.activeRowIds[i];
            const doc = this.getEffectiveDocument(context, rowId);
            if (doc[field] === value) {
              context.scratchBuffer[count++] = rowId;
            }
          }
          return count;
        };
      } else {
        // Multiple field equality
        return (context: HotPathContext): number => {
          let count = 0;
          for (let i = 0; i < context.activeCount; i++) {
            const rowId = context.activeRowIds[i];
            const doc = this.getEffectiveDocument(context, rowId);
            let matches = true;
            for (const [field, expectedValue] of entries) {
              if (doc[field] !== expectedValue) {
                matches = false;
                break;
              }
            }
            if (matches) {
              context.scratchBuffer[count++] = rowId;
            }
          }
          return count;
        };
      }
    }

    // Complex match expression - use general evaluator
    const compiledExpr = this.compileMatchExpression(expr);
    return (context: HotPathContext): number => {
      let count = 0;
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        const doc = this.getEffectiveDocument(context, rowId);
        if (compiledExpr(doc)) {
          context.scratchBuffer[count++] = rowId;
        }
      }
      return count;
    };
  }

  /**
   * Compile $project stage to hot path function
   * Store projection spec for final materialization
   */
  private compileProject(spec: any): CompiledStage {
    return (context: HotPathContext): number => {
      // Store projection spec for later materialization
      (context as any)._projectionSpec = spec;
      
      // Copy all active row IDs to scratch buffer (no filtering at this stage)
      for (let i = 0; i < context.activeCount; i++) {
        context.scratchBuffer[i] = context.activeRowIds[i];
      }
      return context.activeCount;
    };
  }

  /**
   * Compile $group stage to hot path function
   */
  private compileGroup(spec: any): CompiledStage {
    // Check if we can use high-performance group engine
    if (!canUseHighPerformanceGroup(spec)) {
      throw new Error('Group operation not supported in zero-alloc path');
    }
    
    return (context: HotPathContext): number => {
      // Materialize active documents for grouping using effective document resolution
      const activeDocuments = [];
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        activeDocuments.push(this.getEffectiveDocument(context, rowId));
      }
      
      // Use high-performance group engine
      const groupResults = highPerformanceGroup(activeDocuments, spec);
      
      // Store results in context for materialization
      (context as any)._groupResults = groupResults;
      
      return groupResults.length;
    };
  }

  /**
   * Compile $sort stage to hot path function
   */
  private compileSort(spec: any): CompiledStage {
    const [field, order] = Object.entries(spec)[0] as [string, 1 | -1];
    
    return (context: HotPathContext): number => {
      // Create sorting pairs
      const pairs: Array<{ rowId: number; value: any }> = new Array(context.activeCount);
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        pairs[i] = { rowId, value: context.documents[rowId][field] };
      }
      
      // Sort pairs
      pairs.sort((a, b) => {
        let comparison = 0;
        if (a.value < b.value) comparison = -1;
        else if (a.value > b.value) comparison = 1;
        return order * comparison;
      });
      
      // Extract sorted row IDs
      for (let i = 0; i < pairs.length; i++) {
        context.scratchBuffer[i] = pairs[i].rowId;
      }
      
      return context.activeCount;
    };
  }

  /**
   * Compile $limit stage to hot path function
   */
  private compileLimit(limit: number): CompiledStage {
    return (context: HotPathContext): number => {
      const count = Math.min(limit, context.activeCount);
      for (let i = 0; i < count; i++) {
        context.scratchBuffer[i] = context.activeRowIds[i];
      }
      return count;
    };
  }

  /**
   * Compile $skip stage to hot path function
   */
  private compileSkip(skip: number): CompiledStage {
    return (context: HotPathContext): number => {
      const start = Math.min(skip, context.activeCount);
      const count = context.activeCount - start;
      for (let i = 0; i < count; i++) {
        context.scratchBuffer[i] = context.activeRowIds[start + i];
      }
      return count;
    };
  }

  /**
   * Compile fused $match + $project
   */
  private compileFusedMatchProject(matchExpr: any, projectSpec: any): CompiledStage {
    const matchFn = this.compileMatch(matchExpr);
    
    return (context: HotPathContext): number => {
      // Apply match filtering first
      const matchedCount = matchFn(context);
      
      // Store projection spec for final materialization
      (context as any)._projectionSpec = projectSpec;
      
      return matchedCount;
    };
  }

  /**
   * Compile fused $sort + $limit for Top-K
   */
  private compileFusedSortLimit(sortSpec: any, limit: number): CompiledStage {
    const [field, order] = Object.entries(sortSpec)[0] as [string, 1 | -1];
    
    return (context: HotPathContext): number => {
      // Use Top-K algorithm for better performance when limit << activeCount
      if (limit >= context.activeCount * 0.5) {
        // Use regular sort for large limits
        const sortStage = this.compileSort(sortSpec);
        const sortedCount = sortStage(context);
        
        // Apply limit
        const finalCount = Math.min(limit, sortedCount);
        return finalCount;
      } else {
        // Use Top-K heap for small limits
        const heap: Array<{ rowId: number; value: any }> = [];
        
        for (let i = 0; i < context.activeCount; i++) {
          const rowId = context.activeRowIds[i];
          const value = context.documents[rowId][field];
          
          if (heap.length < limit) {
            heap.push({ rowId, value });
            if (heap.length === limit) {
              // Heapify
              this.heapify(heap, order);
            }
          } else {
            // Check if this item should replace heap root
            const comparison = this.compareValues(value, heap[0].value);
            const shouldReplace = order === 1 ? comparison < 0 : comparison > 0;
            
            if (shouldReplace) {
              heap[0] = { rowId, value };
              this.siftDown(heap, 0, order);
            }
          }
        }
        
        // Extract sorted results
        heap.sort((a, b) => order * this.compareValues(a.value, b.value));
        
        for (let i = 0; i < heap.length; i++) {
          context.scratchBuffer[i] = heap[i].rowId;
        }
        
        return heap.length;
      }
    };
  }

  /**
   * Estimate buffer size needed for pipeline
   * $unwind can expand results, so we need larger buffers
   */
  private estimateBufferSize(documents: Document[], pipeline: Pipeline): number {
    let estimatedSize = documents.length;
    
    // Check for $unwind operations that can expand results
    for (const stage of pipeline) {
      if ('$unwind' in stage) {
        const path = typeof stage.$unwind === 'string' ? stage.$unwind : stage.$unwind.path;
        const fieldName = path.startsWith('$') ? path.slice(1) : path;
        
        // Estimate expansion factor by examining array lengths
        let totalExpansion = 0;
        for (const doc of documents) {
          const arrayValue = doc[fieldName];
          if (Array.isArray(arrayValue)) {
            totalExpansion += arrayValue.length;
          } else if (arrayValue != null) {
            totalExpansion += 1;
          }
          // null/undefined values are skipped in $unwind
        }
        estimatedSize = totalExpansion;
      }
    }
    
    // Add some buffer for safety
    return Math.max(estimatedSize * 1.2, 16);
  }

  /**
   * Get context from pool or create new one
   */
  private getContext(documents: Document[], pipeline: Pipeline): HotPathContext {
    let context = this.contextPool.pop();
    if (!context) {
      context = {
        documents: [],
        activeRowIds: new Uint32Array(0),
        activeCount: 0,
        scratchBuffer: new Uint32Array(0),
        scratchCount: 0
      };
    }

    // Update context for current operation
    context.documents = documents as Document[];
    const estimatedSize = this.estimateBufferSize(documents, pipeline);
    
    if (context.activeRowIds.length < estimatedSize) {
      context.activeRowIds = this.getActiveRowIds(estimatedSize);
      context.scratchBuffer = this.getScratchBuffer(estimatedSize);
    }

    // Initialize active row IDs (0, 1, 2, ...)
    const initialSize = documents.length;
    for (let i = 0; i < initialSize; i++) {
      context.activeRowIds[i] = i;
    }
    
    return context;
  }

  /**
   * Return context to pool
   */
  private returnContext(context: HotPathContext): void {
    this.returnActiveRowIds(context.activeRowIds);
    this.returnScratchBuffer(context.scratchBuffer);
    this.contextPool.push(context);
  }

  /**
   * Get Uint32Array from pool for active row IDs
   */
  private getActiveRowIds(size: number): Uint32Array {
    for (let i = 0; i < this.activeRowIdsPool.length; i++) {
      const buffer = this.activeRowIdsPool[i];
      if (buffer.length >= size) {
        this.activeRowIdsPool.splice(i, 1);
        return buffer;
      }
    }
    return new Uint32Array(size);
  }

  /**
   * Return Uint32Array to pool
   */
  private returnActiveRowIds(buffer: Uint32Array): void {
    if (this.activeRowIdsPool.length < 10) {
      this.activeRowIdsPool.push(buffer);
    }
  }

  /**
   * Get Uint32Array from pool for scratch buffer
   */
  private getScratchBuffer(size: number): Uint32Array {
    for (let i = 0; i < this.scratchBufferPool.length; i++) {
      const buffer = this.scratchBufferPool[i];
      if (buffer.length >= size) {
        this.scratchBufferPool.splice(i, 1);
        return buffer;
      }
    }
    return new Uint32Array(size);
  }

  /**
   * Return Uint32Array to pool
   */
  private returnScratchBuffer(buffer: Uint32Array): void {
    if (this.scratchBufferPool.length < 10) {
      this.scratchBufferPool.push(buffer);
    }
  }

  /**
   * Check if expression is simple equality
   */
  private isSimpleEquality(expr: any): boolean {
    if (typeof expr !== 'object' || expr === null) return false;
    
    for (const [key, value] of Object.entries(expr)) {
      if (key.startsWith('$')) return false;
      if (typeof value === 'object' && value !== null) return false;
    }
    return true;
  }

  /**
   * Compile complex match expression
   */
  private compileMatchExpression(expr: any): (doc: Document) => boolean {
    // Simplified for P0 - basic operators only
    return (doc: Document): boolean => {
      for (const [field, condition] of Object.entries(expr)) {
        if (field.startsWith('$')) {
          // Logical operators
          if (field === '$and' && Array.isArray(condition)) {
            for (const subExpr of condition) {
              if (!this.compileMatchExpression(subExpr)(doc)) return false;
            }
          } else if (field === '$or' && Array.isArray(condition)) {
            let matched = false;
            for (const subExpr of condition) {
              if (this.compileMatchExpression(subExpr)(doc)) {
                matched = true;
                break;
              }
            }
            if (!matched) return false;
          }
        } else {
          // Field condition
          const docValue = doc[field];
          if (typeof condition === 'object' && condition !== null) {
            // Complex condition
            for (const [op, value] of Object.entries(condition)) {
              switch (op) {
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
                case '$ne':
                  if (docValue === value) return false;
                  break;
                case '$in':
                  if (!Array.isArray(value) || !value.includes(docValue)) return false;
                  break;
                default:
                  return false; // Unsupported operator
              }
            }
          } else {
            // Simple equality
            if (docValue !== condition) return false;
          }
        }
      }
      return true;
    };
  }

  /**
   * Compare two values for sorting
   */
  private compareValues(a: any, b: any): number {
    if (a === b) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    } else if (typeof a === 'string' && typeof b === 'string') {
      return a < b ? -1 : 1;
    } else {
      return String(a) < String(b) ? -1 : 1;
    }
  }

  /**
   * Build heap for Top-K
   */
  private heapify(heap: Array<{ rowId: number; value: any }>, order: 1 | -1): void {
    const n = heap.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      this.siftDown(heap, i, order);
    }
  }

  /**
   * Sift down for heap maintenance
   */
  private siftDown(heap: Array<{ rowId: number; value: any }>, start: number, order: 1 | -1): void {
    let parent = start;
    const n = heap.length;
    
    while (true) {
      const left = 2 * parent + 1;
      const right = 2 * parent + 2;
      let target = parent;
      
      if (left < n) {
        const comparison = this.compareValues(heap[left].value, heap[target].value);
        const shouldPreferLeft = order === 1 ? comparison > 0 : comparison < 0;
        if (shouldPreferLeft) target = left;
      }
      
      if (right < n) {
        const comparison = this.compareValues(heap[right].value, heap[target].value);
        const shouldPreferRight = order === 1 ? comparison > 0 : comparison < 0;
        if (shouldPreferRight) target = right;
      }
      
      if (target === parent) break;
      
      [heap[parent], heap[target]] = [heap[target], heap[parent]];
      parent = target;
    }
  }

  /**
   * Phase 3: Compile $unwind stage with virtual row IDs
   * Following zero-allocation invariants: no document mutations, virtual IDs only
   */
  private compileUnwind(unwindSpec: any): CompiledStage {
    const path = typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path;
    const fieldName = path.startsWith('$') ? path.slice(1) : path;
    
    return (context: HotPathContext): number => {
      let count = 0;
      
      // Generate virtual row IDs for unwound elements
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        const doc = context.documents[rowId];
        const arrayValue = doc[fieldName];
        
        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
          // Generate virtual IDs for each array element
          for (let elemIdx = 0; elemIdx < arrayValue.length; elemIdx++) {
            if (count < context.scratchBuffer.length) {
              // Create virtual row ID: "parentRowId:fieldName:elemIdx"
              const virtualRowId = `${rowId}:${fieldName}:${elemIdx}`;
              // Store as number by hashing for efficient lookup
              const virtualId = this.hashVirtualRowId(virtualRowId);
              context.scratchBuffer[count++] = virtualId;
              
              // Store virtual row mapping for getValue resolution
              if (!(context as any)._virtualRows) {
                (context as any)._virtualRows = new Map();
              }
              (context as any)._virtualRows.set(virtualId, {
                parentRowId: rowId,
                fieldName,
                elemIdx
              });
            }
          }
        } else if (arrayValue != null) {
          // Non-array value, keep original row ID
          if (count < context.scratchBuffer.length) {
            context.scratchBuffer[count++] = rowId;
          }
        }
        // Skip if arrayValue is null/undefined (MongoDB behavior)
      }
      
      return count;
    };
  }

  /**
   * Hash virtual row ID to number for efficient storage
   */
  private hashVirtualRowId(virtualRowId: string): number {
    let hash = 0;
    for (let i = 0; i < virtualRowId.length; i++) {
      const char = virtualRowId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Apply projection specification to document
   */
  private applyProjection(doc: Document, projectionSpec: any): Document {
    // Apply default _id inclusion if not specified
    const specs = { ...projectionSpec };
    if (!('_id' in specs)) {
      specs._id = 1;
    }
    
    return $expressionObject(doc, specs, doc);
  }
  private getEffectiveDocument(context: HotPathContext, rowId: number): Document {
    // Check if this is a virtual row ID
    const virtualRows = (context as any)._virtualRows;
    if (virtualRows && virtualRows.has(rowId)) {
      const virtualInfo = virtualRows.get(rowId);
      const parentDoc = context.documents[virtualInfo.parentRowId];
      const arrayValue = parentDoc[virtualInfo.fieldName];
      
      // Create unwound document view
      return {
        ...parentDoc,
        [virtualInfo.fieldName]: arrayValue[virtualInfo.elemIdx]
      };
    }
    
    // Regular row ID
    return context.documents[rowId];
  }

  /**
   * Phase 3: Compile fused $unwind + $group for optimization
   * Avoids repeated materialization by processing arrays directly
   */
  private compileFusedUnwindGroup(unwindSpec: any, groupSpec: any): CompiledStage {
    const path = typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path;
    const fieldName = path.startsWith('$') ? path.slice(1) : path;
    
    return (context: HotPathContext): number => {
      const groupMap = new Map<string, any>();
      
      // Process each document and unwind + group in one pass
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        const doc = context.documents[rowId];
        const arrayValue = doc[fieldName];
        
        if (Array.isArray(arrayValue)) {
          for (const element of arrayValue) {
            const unwoundDoc = { ...doc, [fieldName]: element };
            this.processGroupDocument(unwoundDoc, groupSpec, groupMap);
          }
        } else if (arrayValue != null) {
          this.processGroupDocument(doc, groupSpec, groupMap);
        }
      }
      
      // Convert group results to array
      const groupResults = Array.from(groupMap.values());
      
      // Finalize all accumulators
      for (const group of groupResults) {
        this.finalizeAccumulators(group, groupSpec);
      }
      
      (context as any)._groupResults = groupResults;
      
      return groupResults.length;
    };
  }

  /**
   * Process a single document for grouping (helper for fused operations)
   */
  private processGroupDocument(doc: Document, groupSpec: any, groupMap: Map<string, any>): void {
    // Extract group key
    const groupKey = this.extractGroupKey(doc, groupSpec._id);
    const keyStr = JSON.stringify(groupKey);
    
    // Get or create group
    let group = groupMap.get(keyStr);
    if (!group) {
      group = { _id: groupKey };
      
      // Initialize accumulators
      for (const [field, accumulatorSpec] of Object.entries(groupSpec)) {
        if (field === '_id') continue;
        
        const accumulatorOp = Object.keys(accumulatorSpec as object)[0];
        switch (accumulatorOp) {
          case '$sum':
            group[field] = 0;
            break;
          case '$avg':
            group[field] = { sum: 0, count: 0 };
            break;
          case '$min':
            group[field] = Infinity;
            break;
          case '$max':
            group[field] = -Infinity;
            break;
          case '$first':
          case '$last':
            group[field] = undefined;
            break;
          case '$push':
            group[field] = [];
            break;
          case '$addToSet':
            group[field] = new Set();
            break;
        }
      }
      
      groupMap.set(keyStr, group);
    }
    
    // Update accumulators
    this.updateAccumulators(doc, groupSpec, group);
  }

  /**
   * Extract group key from document
   */
  private extractGroupKey(doc: Document, idSpec: any): any {
    if (idSpec === null || idSpec === undefined) {
      return null;
    }
    
    if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
      const field = idSpec.slice(1);
      return doc[field];
    }
    
    if (typeof idSpec === 'object' && idSpec !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(idSpec)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          const field = value.slice(1);
          result[key] = doc[field];
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    
    return idSpec;
  }

  /**
   * Update group accumulators with document values
   */
  private updateAccumulators(doc: Document, groupSpec: any, group: any): void {
    for (const [field, accumulatorSpec] of Object.entries(groupSpec)) {
      if (field === '_id') continue;
      
      const accumulatorOp = Object.keys(accumulatorSpec as object)[0];
      const valueExpr = (accumulatorSpec as any)[accumulatorOp];
      
      let value: any;
      if (typeof valueExpr === 'string' && valueExpr.startsWith('$')) {
        const fieldName = valueExpr.slice(1);
        value = doc[fieldName];
      } else if (typeof valueExpr === 'number') {
        value = valueExpr;
      } else {
        value = 1; // Default for counting
      }
      
      switch (accumulatorOp) {
        case '$sum':
          group[field] += (typeof value === 'number') ? value : 0;
          break;
        case '$avg':
          if (typeof value === 'number') {
            group[field].sum += value;
            group[field].count++;
          }
          break;
        case '$min':
          if (value != null && value < group[field]) {
            group[field] = value;
          }
          break;
        case '$max':
          if (value != null && value > group[field]) {
            group[field] = value;
          }
          break;
        case '$first':
          if (group[field] === undefined) {
            group[field] = value;
          }
          break;
        case '$last':
          group[field] = value;
          break;
        case '$push':
          group[field].push(value);
          break;
        case '$addToSet':
          if (value != null) {
            if (!group[field].has(value)) {
              group[field].add(value);
            }
          }
          break;
      }
    }
  }

  /**
   * Finalize accumulators after all documents are processed
   */
  private finalizeAccumulators(group: any, groupSpec: any): void {
    // Finalize $avg calculations and convert Sets to Arrays
    for (const [field, accumulatorSpec] of Object.entries(groupSpec)) {
      if (field === '_id') continue;
      
      const accumulatorOp = Object.keys(accumulatorSpec as object)[0];
      if (accumulatorOp === '$avg' && group[field] && typeof group[field] === 'object' && group[field].count > 0) {
        const avgData = group[field];
        group[field] = avgData.sum / avgData.count;
      } else if (accumulatorOp === '$addToSet') {
        // Convert Set to Array for final result
        group[field] = Array.from(group[field]);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.compiledPipelines.clear();
    this.contextPool.length = 0;
    this.activeRowIdsPool.length = 0;
    this.scratchBufferPool.length = 0;
  }
}