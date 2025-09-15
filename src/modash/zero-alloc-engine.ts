/**
 * Zero-Allocation Engine for Hot Path Operations
 *
 * This engine implements the P0 performance requirements:
 * - Row IDs only in hot path, materialization only at end
 * - Near-zero allocations in steady state
 * - Compiled path only, no interpreter fallbacks
 * - Vectorized operations where possible
 */

import {
  $expressionObject,
  type Collection,
  type Document,
} from './expressions';
import type { Pipeline } from '../index';
import {
  highPerformanceGroup,
  canUseHighPerformanceGroup,
} from './high-performance-group';

/**
 * Minimal hot path context - no object allocations
 */
interface HotPathContext {
  documents: Document[];
  activeRowIds: Uint32Array;
  activeCount: number;
  scratchBuffer: Uint32Array;
  scratchCount: number;
  runId?: number; // Track run ID to prevent cross-run contamination
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
  private stageMetadata = new Map<CompiledStage, { name: string }>();
  private contextPool: HotPathContext[] = [];
  private activeRowIdsPool: Uint32Array[] = [];
  private scratchBufferPool: Uint32Array[] = [];
  private static globalRunId = 0;

  /**
   * Execute pipeline with zero allocations in hot path
   */
  execute(documents: Collection, pipeline: Pipeline): Collection {
    // Generate unique run ID to prevent cross-run contamination
    const runId = ++ZeroAllocEngine.globalRunId;

    if (process.env.DEBUG_IVM) {
      console.log(
        `[IVM DEBUG] Starting run ${runId} with pipeline:`,
        JSON.stringify(pipeline)
      );
    }

    // Deep clone pipeline to prevent mutation of cached plans
    const immutablePipeline = JSON.parse(JSON.stringify(pipeline));
    const pipelineKey = JSON.stringify(immutablePipeline);

    // Get or compile pipeline
    let compiledStages = this.compiledPipelines.get(pipelineKey);
    if (!compiledStages) {
      if (process.env.DEBUG_IVM) {
        console.log(`[IVM DEBUG] Compiling new pipeline for run ${runId}`);
      }
      compiledStages = this.compilePipeline(immutablePipeline);
      this.compiledPipelines.set(pipelineKey, compiledStages);
    } else if (process.env.DEBUG_IVM) {
      console.log(`[IVM DEBUG] Using cached pipeline for run ${runId}`);
    }

    // Get context from pool
    const context = this.getContext(documents, immutablePipeline);
    context.runId = runId;

    if (process.env.DEBUG_IVM) {
      console.log(`[IVM DEBUG] Context initialized for run ${runId}:`, {
        activeCount: context.activeCount,
        hasGroupResults: !!(context as any)._groupResults,
        hasVirtualRows: !!(context as any)._virtualRows,
        hasProjectionSpec: !!(context as any)._projectionSpec,
      });
    }

    try {
      // Execute each compiled stage in sequence
      context.activeCount = documents.length;

      for (let i = 0; i < compiledStages.length; i++) {
        const stage = compiledStages[i];

        // Check for buffer growth needs before stage execution
        const metadata = this.stageMetadata.get(stage);
        const stageName = metadata?.name || `stage_${i}`;

        if (stageName.includes('$unwind')) {
          // Estimate potential expansion for $unwind operations
          const potentialSize = context.activeCount * 4; // Conservative estimate
          this.growBufferIfNeeded(context, potentialSize);
        }

        // Execute stage - modifies context.scratchBuffer and returns count
        context.scratchCount = stage(context);

        // Add DEBUG_IVM invariant checks
        this.checkBufferBounds(context, stageName);

        // Verify run ID consistency in DEBUG mode
        if (process.env.DEBUG_IVM && context.runId !== runId) {
          throw new Error(
            `[IVM INVARIANT VIOLATION] Run ID mismatch in ${stageName}: expected ${runId}, got ${context.runId}`
          );
        }

        // TODO(refactor): Consider avoiding in-place buffer swaps by returning new buffers per stage.
        // This would make contexts immutable at the cost of allocations; evaluate perf trade-offs.
        // Swap buffers for next stage
        [context.activeRowIds, context.scratchBuffer] = [
          context.scratchBuffer,
          context.activeRowIds,
        ];
        context.activeCount = context.scratchCount;

        // Early exit if no rows remain
        if (context.activeCount === 0) break;
      }

      // Materialize final result from row IDs - ALWAYS use last operator's view
      return this.materializeFinalResult(context, runId);
    } finally {
      // Return context to pool
      this.returnContext(context);
    }
  }

  /**
   * Materialize final result ensuring deterministic source selection
   */
  private materializeFinalResult(
    context: HotPathContext,
    runId: number
  ): Collection {
    if (process.env.DEBUG_IVM) {
      console.log(`[IVM DEBUG] Materializing final result for run ${runId}:`, {
        activeCount: context.activeCount,
        hasGroupResults: !!(context as any)._groupResults,
        groupResultsRunId: (context as any)._groupResultsRunId,
        hasVirtualRows: !!(context as any)._virtualRows,
        hasProjectionSpec: !!(context as any)._projectionSpec,
        materializationSource:
          (context as any)._groupResults &&
          (context as any)._groupResultsRunId === runId
            ? 'groupResults'
            : 'lastOperatorView',
      });
    }

    // Check if we have group results stored in context AND they belong to this run
    const groupResults = (context as any)._groupResults;
    const groupResultsRunId = (context as any)._groupResultsRunId;

    if (groupResults && groupResultsRunId === runId) {
      // If downstream stages have produced an index mapping, honor it
      const useIndices = (context as any)._groupIndexModeActive === true;
      if (useIndices && context.activeCount > 0) {
        const result: Document[] = new Array(context.activeCount);
        for (let i = 0; i < context.activeCount; i++) {
          const idx = context.activeRowIds[i];
          result[i] = groupResults[idx];
        }
        return result as Collection;
      }
      // Otherwise return only the active count of group results
      // This respects any $limit applied after $group
      return groupResults.slice(0, context.activeCount) as Collection;
    } else if (groupResults && groupResultsRunId !== runId) {
      // This is the exact bug we're fixing!
      if (process.env.DEBUG_IVM) {
        console.error(
          `[IVM ERROR] Found stale group results from run ${groupResultsRunId} in run ${runId}! Using row IDs instead.`
        );
      }
    }

    // Materialize from last operator's view (row IDs)
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

    if (process.env.DEBUG_IVM) {
      console.log(
        `[IVM DEBUG] Materialized ${result.length} documents from row IDs for run ${runId}`
      );
    }

    return result as Collection;
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
        stages.push(
          this.compileFusedMatchProject(stage.$match, nextStage.$project)
        );
        i++; // Skip next stage
      } else if (stage.$sort && nextStage?.$limit) {
        // Fuse $sort + $limit for Top-K
        stages.push(this.compileFusedSortLimit(stage.$sort, nextStage.$limit));
        i++; // Skip next stage
      } else if (stage.$unwind && nextStage?.$group) {
        // Phase 3: Fuse $unwind + $group to avoid repeated materialization
        stages.push(
          this.compileFusedUnwindGroup(stage.$unwind, nextStage.$group)
        );
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

      // Store results in context for materialization with run ID tagging
      (context as any)._groupResults = groupResults;
      (context as any)._groupResultsRunId = context.runId;

      return groupResults.length;
    };
  }

  /**
   * Compile $sort stage to hot path function
   */
  private compileSort(spec: any): CompiledStage {
    const [field, order] = Object.entries(spec)[0] as [string, 1 | -1];

    return (context: HotPathContext): number => {
      // If we have group results, sort those directly and use group indices as rowIds
      const groupResults = (context as any)._groupResults as any[] | undefined;
      const usingGroups = Array.isArray(groupResults);

      // Create sorting pairs from appropriate source
      const pairs: Array<{ rowId: number; value: any }> = new Array(
        context.activeCount
      );
      if (usingGroups) {
        for (let i = 0; i < context.activeCount; i++) {
          const idx = i; // current index corresponds to group result index prior to sort
          const value = groupResults[idx]?.[field];
          pairs[i] = { rowId: idx, value };
        }
      } else {
        for (let i = 0; i < context.activeCount; i++) {
          const rowId = context.activeRowIds[i];
          const doc = this.getEffectiveDocument(context, rowId);
          const value = (doc as any)?.[field];
          pairs[i] = { rowId, value };
        }
      }

      // Sort pairs
      pairs.sort((a, b) => {
        let comparison = 0;
        if (a.value < b.value) comparison = -1;
        else if (a.value > b.value) comparison = 1;
        return order * comparison;
      });

      if (usingGroups) {
        // Reorder groupResults according to sorted pairs
        const sortedGroups = new Array(pairs.length);
        for (let i = 0; i < pairs.length; i++) {
          sortedGroups[i] = groupResults[pairs[i].rowId];
          context.scratchBuffer[i] = i; // indices 0..n-1
        }
        (context as any)._groupResults = sortedGroups;
        (context as any)._groupIndexModeActive = true;
      } else {
        // Extract sorted row IDs
        for (let i = 0; i < pairs.length; i++) {
          context.scratchBuffer[i] = pairs[i].rowId;
        }
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
      const usingGroups = Array.isArray((context as any)._groupResults);
      if (usingGroups) {
        // Check if we're in index mode (e.g., after sort)
        const isIndexMode = (context as any)._groupIndexModeActive === true;
        if (isIndexMode) {
          // Already sorted - just copy the first 'count' indices
          for (let i = 0; i < count; i++) {
            context.scratchBuffer[i] = context.activeRowIds[i];
          }
        } else {
          // Not sorted - slice the group results and set up indices
          (context as any)._groupResults = (context as any)._groupResults.slice(
            0,
            count
          );
          (context as any)._groupIndexModeActive = true;
          for (let i = 0; i < count; i++) {
            context.scratchBuffer[i] = i;
          }
        }
        return count;
      } else {
        for (let i = 0; i < count; i++) {
          context.scratchBuffer[i] = context.activeRowIds[i];
        }
        return count;
      }
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
  private compileFusedMatchProject(
    matchExpr: any,
    projectSpec: any
  ): CompiledStage {
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
   * Enhanced with dynamic growth capabilities
   */
  private estimateBufferSize(
    documents: Document[],
    pipeline: Pipeline
  ): number {
    let estimatedSize = documents.length;

    // Check for $unwind operations that can expand results
    for (const stage of pipeline) {
      if ('$unwind' in stage) {
        const path =
          typeof stage.$unwind === 'string'
            ? stage.$unwind
            : stage.$unwind.path;
        const fieldName = path.startsWith('$') ? path.slice(1) : path;

        // Estimate expansion factor by examining array lengths
        let totalExpansion = 0;
        for (const doc of documents) {
          const arrayValue = this.getFieldValue(doc, fieldName);
          if (Array.isArray(arrayValue)) {
            totalExpansion += arrayValue.length;
          } else if (arrayValue !== null && arrayValue !== undefined) {
            totalExpansion += 1;
          }
          // null/undefined values are skipped in $unwind
        }
        estimatedSize = totalExpansion;
      }
    }

    // Use power-of-two sizing for better memory allocation
    return this.nextPowerOfTwo(Math.max(estimatedSize * 1.5, 32));
  }

  /**
   * Get next power of two for optimal buffer sizing
   */
  private nextPowerOfTwo(n: number): number {
    if (n <= 0) return 1;
    n = n - 1;
    n = n | (n >> 1);
    n = n | (n >> 2);
    n = n | (n >> 4);
    n = n | (n >> 8);
    n = n | (n >> 16);
    return n + 1;
  }

  /**
   * Get field value supporting dot notation
   */
  private getFieldValue(doc: Document, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value = doc;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as any)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Get context from pool or create new one
   */
  private getContext(
    documents: Document[],
    pipeline: Pipeline
  ): HotPathContext {
    let context = this.contextPool.pop();
    if (!context) {
      context = {
        documents: [],
        activeRowIds: new Uint32Array(0),
        activeCount: 0,
        scratchBuffer: new Uint32Array(0),
        scratchCount: 0,
      };
    }

    // CRITICAL: Hard reset all per-run state to prevent cross-run contamination
    this.resetContextState(context);

    // Update context for current operation
    context.documents = documents as Document[];
    const estimatedSize = this.estimateBufferSize(documents, pipeline);

    if (context.activeRowIds.length < estimatedSize) {
      context.activeRowIds = this.getActiveRowIds(estimatedSize);
      context.scratchBuffer = this.getScratchBuffer(estimatedSize);
    }

    // Initialize active row IDs (0, 1, 2, ...)
    const initialSize = documents.length;
    context.activeCount = initialSize;
    context.scratchCount = 0;

    // Zero out any residual data in buffers
    for (let i = 0; i < initialSize; i++) {
      context.activeRowIds[i] = i;
    }
    // Clear remaining buffer to prevent accessing stale row IDs
    for (let i = initialSize; i < context.activeRowIds.length; i++) {
      context.activeRowIds[i] = 0;
    }

    return context;
  }

  /**
   * Hard reset all context state to ensure no cross-run contamination
   */
  private resetContextState(context: HotPathContext): void {
    // Clear all possible state from previous runs
    delete (context as any)._virtualRows;
    delete (context as any)._groupResults;
    delete (context as any)._groupResultsRunId;
    delete (context as any)._groupIndexModeActive;
    delete (context as any)._projectionSpec;
    delete (context as any).tempState;
    delete (context as any)._projectedDocs;

    // Clear any stage-specific state that might exist
    const keys = Object.keys(context);
    for (const key of keys) {
      if (
        key.startsWith('active_rowids_stage_') ||
        key.startsWith('_temp_') ||
        key.startsWith('_stage_')
      ) {
        delete (context as any)[key];
      }
    }

    // Reset counters
    context.activeCount = 0;
    context.scratchCount = 0;
    delete context.runId;
  }

  /**
   * Return context to pool with thorough cleanup
   */
  private returnContext(context: HotPathContext): void {
    // Thorough cleanup before returning to pool
    this.resetContextState(context);

    // Return buffers to their respective pools
    this.returnActiveRowIds(context.activeRowIds);
    this.returnScratchBuffer(context.scratchBuffer);

    // Reset buffer references to prevent accidental reuse
    (context as any).activeRowIds = new Uint32Array(0);
    (context as any).scratchBuffer = new Uint32Array(0);
    (context as any).documents = [];

    // Return to pool only if pool isn't too large (prevent memory leaks)
    if (this.contextPool.length < 10) {
      this.contextPool.push(context);
    }
  }

  /**
   * Get Uint32Array from pool for active row IDs with dynamic growth
   */
  private getActiveRowIds(size: number): Uint32Array {
    // Use power-of-two sizing for better allocation
    const optimalSize = this.nextPowerOfTwo(size);

    for (let i = 0; i < this.activeRowIdsPool.length; i++) {
      const buffer = this.activeRowIdsPool[i];
      if (buffer.length >= optimalSize) {
        this.activeRowIdsPool.splice(i, 1);
        // Zero out the buffer to prevent stale data
        buffer.fill(0);
        return buffer;
      }
    }
    return new Uint32Array(optimalSize);
  }

  /**
   * Dynamically grow buffer if needed during $unwind expansion
   */
  private growBufferIfNeeded(
    context: HotPathContext,
    requiredSize: number
  ): void {
    if (context.activeRowIds.length < requiredSize) {
      const newSize = this.nextPowerOfTwo(requiredSize);

      if (process.env.DEBUG_IVM) {
        console.log(
          `[IVM DEBUG] Growing buffer from ${context.activeRowIds.length} to ${newSize}`
        );
      }

      // Return old buffers to pool
      this.returnActiveRowIds(context.activeRowIds);
      this.returnScratchBuffer(context.scratchBuffer);

      // Get new larger buffers
      context.activeRowIds = this.getActiveRowIds(newSize);
      context.scratchBuffer = this.getScratchBuffer(newSize);
    }
  }

  /**
   * Add DEBUG_IVM invariant check for buffer overrun prevention
   */
  private checkBufferBounds(context: HotPathContext, operation: string): void {
    if (process.env.DEBUG_IVM) {
      if (context.activeCount > context.activeRowIds.length) {
        throw new Error(
          `[IVM INVARIANT VIOLATION] ${operation}: activeCount ${context.activeCount} exceeds buffer length ${context.activeRowIds.length}`
        );
      }
      if (context.scratchCount > context.scratchBuffer.length) {
        throw new Error(
          `[IVM INVARIANT VIOLATION] ${operation}: scratchCount ${context.scratchCount} exceeds buffer length ${context.scratchBuffer.length}`
        );
      }
    }
  }

  /**
   * Return Uint32Array to pool
   */
  private returnActiveRowIds(buffer: Uint32Array): void {
    if (this.activeRowIdsPool.length < 10) {
      // Zero out before returning to pool
      buffer.fill(0);
      this.activeRowIdsPool.push(buffer);
    }
  }

  /**
   * Get Uint32Array from pool for scratch buffer with dynamic growth
   */
  private getScratchBuffer(size: number): Uint32Array {
    // Use power-of-two sizing for better allocation
    const optimalSize = this.nextPowerOfTwo(size);

    for (let i = 0; i < this.scratchBufferPool.length; i++) {
      const buffer = this.scratchBufferPool[i];
      if (buffer.length >= optimalSize) {
        this.scratchBufferPool.splice(i, 1);
        // Zero out the buffer to prevent stale data
        buffer.fill(0);
        return buffer;
      }
    }
    return new Uint32Array(optimalSize);
  }

  /**
   * Return Uint32Array to pool
   */
  private returnScratchBuffer(buffer: Uint32Array): void {
    if (this.scratchBufferPool.length < 10) {
      // Zero out before returning to pool
      buffer.fill(0);
      this.scratchBufferPool.push(buffer);
    }
  }

  /**
   * Add static method to reset global state (for testing)
   */
  static resetGlobalState(): void {
    ZeroAllocEngine.globalRunId = 0;
  }

  /**
   * Clear all caches and pools (for testing)
   */
  clearCaches(): void {
    this.compiledPipelines.clear();
    this.stageMetadata.clear();
    this.contextPool.length = 0;
    this.activeRowIdsPool.length = 0;
    this.scratchBufferPool.length = 0;
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
                  if (docValue === null || !(docValue > value)) return false;
                  break;
                case '$gte':
                  if (docValue === null || !(docValue >= value)) return false;
                  break;
                case '$lt':
                  if (docValue === null || !(docValue < value)) return false;
                  break;
                case '$lte':
                  if (docValue === null || !(docValue <= value)) return false;
                  break;
                case '$ne':
                  if (docValue === value) return false;
                  break;
                case '$in':
                  if (!Array.isArray(value) || !value.includes(docValue))
                    return false;
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
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;

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
  private heapify(
    heap: Array<{ rowId: number; value: any }>,
    order: 1 | -1
  ): void {
    const n = heap.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      this.siftDown(heap, i, order);
    }
  }

  /**
   * Sift down for heap maintenance
   */
  private siftDown(
    heap: Array<{ rowId: number; value: any }>,
    start: number,
    order: 1 | -1
  ): void {
    let parent = start;
    const n = heap.length;

    while (true) {
      const left = 2 * parent + 1;
      const right = 2 * parent + 2;
      let target = parent;

      if (left < n) {
        const comparison = this.compareValues(
          heap[left].value,
          heap[target].value
        );
        const shouldPreferLeft = order === 1 ? comparison > 0 : comparison < 0;
        if (shouldPreferLeft) target = left;
      }

      if (right < n) {
        const comparison = this.compareValues(
          heap[right].value,
          heap[target].value
        );
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

    const compiledStage = (context: HotPathContext): number => {
      let count = 0;
      let virtualIdCounter = 1000000; // Start virtual IDs from high numbers

      // Estimate expansion to check for buffer growth needs
      let estimatedExpansion = 0;
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        const doc = context.documents[rowId];
        const arrayValue = this.getFieldValue(doc, fieldName);
        if (Array.isArray(arrayValue)) {
          estimatedExpansion += arrayValue.length;
        } else if (arrayValue !== null && arrayValue !== undefined) {
          estimatedExpansion += 1;
        }
      }

      // Grow buffer if needed for expansion
      if (estimatedExpansion > context.scratchBuffer.length) {
        this.growBufferIfNeeded(context, estimatedExpansion);
      }

      // Generate virtual row IDs for unwound elements
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        const doc = context.documents[rowId];
        const arrayValue = this.getFieldValue(doc, fieldName);

        if (Array.isArray(arrayValue)) {
          if (arrayValue.length > 0) {
            // Generate virtual IDs for each array element
            for (let elemIdx = 0; elemIdx < arrayValue.length; elemIdx++) {
              if (count >= context.scratchBuffer.length) {
                // This should not happen with proper buffer growth, but safety check
                if (process.env.DEBUG_IVM) {
                  throw new Error(
                    `[IVM INVARIANT VIOLATION] $unwind buffer overflow: ${count} >= ${context.scratchBuffer.length}`
                  );
                }
                break;
              }

              // Use simple incremental virtual ID
              const virtualId = virtualIdCounter++;
              context.scratchBuffer[count++] = virtualId;

              // Store virtual row mapping for getValue resolution
              if (!(context as any)._virtualRows) {
                (context as any)._virtualRows = new Map();
              }
              (context as any)._virtualRows.set(virtualId, {
                parentRowId: rowId,
                fieldName,
                elemIdx,
                arrayValue: arrayValue[elemIdx],
              });
            }
          }
          // Empty arrays are skipped (MongoDB behavior)
        } else if (arrayValue !== null && arrayValue !== undefined) {
          // Non-array value, keep original row ID
          if (count < context.scratchBuffer.length) {
            context.scratchBuffer[count++] = rowId;
          }
        }
        // Skip if arrayValue is null/undefined or empty array (MongoDB behavior)
      }

      return count;
    };

    // Add metadata for debugging
    this.stageMetadata.set(compiledStage, { name: '$unwind' });
    return compiledStage;
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
    const projected = $expressionObject(doc, specs, doc) as any;
    if (projected && projected._id === undefined) {
      delete projected._id; // Omit undefined _id for parity with compiled project
    }
    return projected as Document;
  }
  private getEffectiveDocument(
    context: HotPathContext,
    rowId: number
  ): Document {
    // Check if this is a virtual row ID
    const virtualRows = (context as any)._virtualRows;
    if (virtualRows && virtualRows.has(rowId)) {
      const virtualInfo = virtualRows.get(rowId);
      const parentDoc = context.documents[virtualInfo.parentRowId];

      // Create unwound document view with the correct unwound value
      const doc = JSON.parse(JSON.stringify(parentDoc)); // Deep clone

      // Handle nested field paths
      if (virtualInfo.fieldName.includes('.')) {
        const parts = virtualInfo.fieldName.split('.');
        let current = doc;

        // Navigate to the parent object
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }

        // Set the final field value
        current[parts[parts.length - 1]] = virtualInfo.arrayValue;
      } else {
        doc[virtualInfo.fieldName] = virtualInfo.arrayValue;
      }

      return doc;
    }

    // Regular row ID
    return context.documents[rowId];
  }

  /**
   * Phase 3: Compile fused $unwind + $group for optimization
   * Avoids repeated materialization by processing arrays directly
   */
  private compileFusedUnwindGroup(
    unwindSpec: any,
    groupSpec: any
  ): CompiledStage {
    const path = typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path;
    const fieldName = path.startsWith('$') ? path.slice(1) : path;

    const compiledStage = (context: HotPathContext): number => {
      const groupMap = new Map<string, any>();

      // Process each document and unwind + group in one pass
      for (let i = 0; i < context.activeCount; i++) {
        const rowId = context.activeRowIds[i];
        const doc = context.documents[rowId];
        const arrayValue = this.getFieldValue(doc, fieldName);

        if (Array.isArray(arrayValue)) {
          for (const element of arrayValue) {
            const unwoundDoc = { ...doc, [fieldName]: element };
            this.processGroupDocument(unwoundDoc, groupSpec, groupMap);
          }
        } else if (arrayValue !== null && arrayValue !== undefined) {
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

    // Add metadata for debugging
    this.stageMetadata.set(compiledStage, { name: '$unwind+$group' });
    return compiledStage;
  }

  /**
   * Process a single document for grouping (helper for fused operations)
   */
  private processGroupDocument(
    doc: Document,
    groupSpec: any,
    groupMap: Map<string, any>
  ): void {
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
          group[field] += typeof value === 'number' ? value : 0;
          break;
        case '$avg':
          if (typeof value === 'number') {
            group[field].sum += value;
            group[field].count++;
          }
          break;
        case '$min':
          if (value !== null && value !== undefined && value < group[field]) {
            group[field] = value;
          }
          break;
        case '$max':
          if (value !== null && value !== undefined && value > group[field]) {
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
          if (value !== null && value !== undefined) {
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
      if (
        accumulatorOp === '$avg' &&
        group[field] &&
        typeof group[field] === 'object' &&
        group[field].count > 0
      ) {
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
