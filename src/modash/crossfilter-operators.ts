/**
 * IVM Operators for MongoDB aggregation stages
 * Enhanced with performance optimizations for hot path processing
 */

import type {
  RowId,
  Delta,
  IVMOperator,
  IVMContext,
  CrossfilterStore,
  IVMOperatorFactory,
} from './crossfilter-ivm.js';
import type { Document, DocumentValue } from './expressions.js';
import { DimensionImpl, GroupStateImpl } from './crossfilter-impl.js';
import { ExpressionCompilerImpl } from './crossfilter-compiler.js';
import {
  OptimizedExpressionCompiler,
  FusedMatchProjectOperator,
  DeltaBatchProcessor,
} from './performance-optimized-engine.js';
import { optimizedSortLimit } from './topk-heap.js';

/**
 * Performance-optimized $match operator with hot path compilation
 */
export class OptimizedMatchOperator implements IVMOperator {
  readonly type = '$match';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private compiledExpr: (doc: Document, rowId: RowId) => boolean;
  private optimizedCompiler: OptimizedExpressionCompiler;

  constructor(
    private matchExpr: any,
    compiler: ExpressionCompilerImpl | OptimizedExpressionCompiler
  ) {
    // Use optimized compiler if available, otherwise fallback
    if (compiler instanceof OptimizedExpressionCompiler) {
      this.optimizedCompiler = compiler;
      this.compiledExpr = compiler.compileMatchExpression(matchExpr);
    } else {
      this.optimizedCompiler = new OptimizedExpressionCompiler();
      this.compiledExpr =
        this.optimizedCompiler.compileMatchExpression(matchExpr);
    }
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Hot path: use compiled expression
    if (this.compiledExpr(doc, _delta.rowId)) {
      return [_delta]; // Document passes filter, propagate
    }

    return []; // Document filtered out
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== -1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Hot path: use compiled expression
    if (this.compiledExpr(doc, _delta.rowId)) {
      return [_delta]; // Propagate removal
    }

    return []; // Document wasn't in result set anyway
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    const result: RowId[] = [];

    // Enforce no liveSet scan in snapshots
    const sourceIds = _context.upstreamActiveIds;
    if (!sourceIds) {
      throw new Error(
        '[IVM INVARIANT] Match.snapshot missing upstreamActiveIds'
      );
    }

    // Hot path: batch process for better cache locality
    for (const rowId of sourceIds) {
      // Get effective document from upstream or store
      const doc = _context.getEffectiveUpstreamDocument
        ? _context.getEffectiveUpstreamDocument(rowId)
        : _store.documents[rowId];

      if (doc && this.compiledExpr(doc, rowId)) {
        result.push(rowId);
      }
    }

    return result;
  }

  // Passthrough to upstream - match doesn't transform documents
  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null => {
    const upstream = context.getEffectiveUpstreamDocument?.(rowId) || null;
    if (!upstream && process.env.DEBUG_IVM === '1' && context.stageIndex > 0) {
      throw new Error(
        '[IVM INVARIANT] Store fallback in getEffectiveDocument beyond stage 0'
      );
    }
    return upstream || store.documents[rowId] || null;
  };

  estimateComplexity(): string {
    return 'O(n)'; // Linear scan for match
  }

  getInputFields(): string[] {
    return this.extractFieldsFromMatch(this.matchExpr);
  }

  getOutputFields(): string[] {
    return []; // Match doesn't change fields
  }

  private extractFieldsFromMatch(expr: any): string[] {
    const fields = new Set<string>();

    if (typeof expr !== 'object' || expr === null) return [];

    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) {
        if (field === '$and' || field === '$or') {
          const conditions = condition as any[];
          for (const cond of conditions) {
            this.extractFieldsFromMatch(cond).forEach(f => fields.add(f));
          }
        }
      } else {
        fields.add(field);
      }
    }

    return Array.from(fields);
  }

  private getEffectiveDocument(
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null {
    // Check if there are projected documents from upstream stages
    // Look backwards through stages to find the most recent projection
    for (
      let stageIndex = _context.stageIndex - 1;
      stageIndex >= 0;
      stageIndex--
    ) {
      const projectedDocsKey = `projected_docs_stage_${stageIndex}`;
      const projectedDocs = _context.tempState.get(projectedDocsKey);
      if (projectedDocs && projectedDocs.has(rowId)) {
        return projectedDocs.get(rowId);
      }
    }

    // Fallback to original document
    return _store.documents[rowId] || null;
  }
}

/**
 * $group operator with incremental aggregation
 */
export class GroupOperator implements IVMOperator {
  readonly type = '$group';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private compiledGroup: {
    getGroupKey: (doc: Document, rowId: RowId) => DocumentValue;
    accumulators: Array<{
      field: string;
      type: string;
      getValue: (doc: Document, rowId: RowId) => DocumentValue;
    }>;
  };

  private dimensionKey: string;
  private groupsKey: string;

  constructor(
    private groupExpr: any,
    private compiler: ExpressionCompilerImpl
  ) {
    this.compiledGroup = compiler.compileGroupExpr(groupExpr);
    this.dimensionKey = this.extractGroupDimension(groupExpr._id);
    this.groupsKey = `group_${JSON.stringify(groupExpr)}`;
  }

  private serializeGroupKey(key: any): string {
    // Ensure we always have a stable string key for Map indexing
    return key === undefined ? '__modash_undefined__' : JSON.stringify(key);
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    // Get document (preferring projected version from upstream stages)
    const doc =
      _context.getEffectiveUpstreamDocument?.(_delta.rowId) ||
      this.getEffectiveUpstreamDocument(_delta.rowId, _store, _context);
    if (!doc) return [];

    // Get group key for this document
    const groupKey = this.compiledGroup.getGroupKey(doc, _delta.rowId);

    // Serialize group key for consistent Map indexing
    const groupKeyStr = this.serializeGroupKey(groupKey);
    if (process.env.DEBUG_GROUP_KEYS === '1') {
      console.log('[GROUP_KEY]', {
        raw: groupKey,
        serialized: groupKeyStr,
        dimension: this.dimensionKey,
      });
    }

    // Ensure dimension exists
    this.ensureDimension(_store);

    // Update dimension
    const dimension = _store.dimensions.get(this.dimensionKey)!;
    dimension.addDocument(doc, _delta.rowId);

    // Get or create group state
    let groupsMap = _store.groups.get(this.groupsKey);
    if (!groupsMap) {
      groupsMap = new Map();
      _store.groups.set(this.groupsKey, groupsMap);
    }

    let groupState = groupsMap.get(groupKeyStr);
    if (!groupState) {
      groupState = new GroupStateImpl(groupKey); // Store original key for result
      groupsMap.set(groupKeyStr, groupState); // Use serialized key for indexing
    }

    // Add document to group
    const accumulators: any = {};
    for (const [field, expr] of Object.entries(this.groupExpr)) {
      if (field !== '_id') {
        accumulators[field] = expr;
      }
    }

    groupState.addDocument(_delta.rowId, doc, accumulators);

    return [_delta]; // Propagate for further stages
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== -1) return [];

    // Get document (preferring projected version from upstream stages)
    const doc =
      _context.getEffectiveUpstreamDocument?.(_delta.rowId) ||
      this.getEffectiveUpstreamDocument(_delta.rowId, _store, _context);
    if (!doc) return [];

    // Get group key for this document
    const groupKey = this.compiledGroup.getGroupKey(doc, _delta.rowId);
    const groupKeyStr = this.serializeGroupKey(groupKey);

    // Update dimension
    const dimension = _store.dimensions.get(this.dimensionKey);
    if (dimension) {
      dimension.removeDocument(_delta.rowId);
    }

    // Update group state
    const groupsMap = _store.groups.get(this.groupsKey);
    if (groupsMap) {
      const groupState = groupsMap.get(groupKeyStr);
      if (groupState) {
        const accumulators: any = {};
        for (const [field, expr] of Object.entries(this.groupExpr)) {
          if (field !== '_id') {
            accumulators[field] = expr;
          }
        }

        const wasRemoved = groupState.removeDocument(
          _delta.rowId,
          doc,
          accumulators
        );

        // If group becomes empty, remove it
        if (wasRemoved && groupState.count === 0) {
          groupsMap.delete(groupKeyStr);
        }
      }
    }

    return [_delta]; // Propagate removal
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    const groupsMap = _store.groups.get(this.groupsKey);
    if (!groupsMap || groupsMap.size === 0) {
      return [];
    }

    // Collect active groups with their original keys, then sort deterministically
    const activeEntries: Array<[string, any]> = [];
    for (const [groupKeyStr, groupState] of groupsMap.entries()) {
      if (groupState.count > 0) {
        activeEntries.push([groupKeyStr, groupState]);
      }
    }

    // Deterministic ordering to match traditional $group behavior
    // Sort by the JSON string of the original group key
    activeEntries.sort((a, b) => {
      const aKey = JSON.stringify(a[1].groupKey);
      const bKey = JSON.stringify(b[1].groupKey);
      return aKey.localeCompare(bKey);
    });

    // Return the serialized keys in sorted order as virtual RowIds
    return activeEntries.map(([groupKeyStr]) => groupKeyStr);
  }

  /**
   * Get the effective document for a group virtual RowId
   */
  getEffectiveDocument = (
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null => {
    // For group operations, rowId is the serialized group key
    const groupsMap = _store.groups.get(this.groupsKey);
    if (!groupsMap) {
      return null;
    }

    const groupState = groupsMap.get(String(rowId));
    if (!groupState || groupState.count === 0) {
      return null;
    }

    return groupState.materializeResult();
  };

  estimateComplexity(): string {
    return 'O(1)'; // Incremental group operations are O(1) per document
  }

  getInputFields(): string[] {
    const fields = new Set<string>();

    // Group by field
    if (
      typeof this.groupExpr._id === 'string' &&
      this.groupExpr._id.startsWith('$')
    ) {
      fields.add(this.groupExpr._id.substring(1));
    }

    // Accumulator fields
    for (const [field, expr] of Object.entries(this.groupExpr)) {
      if (field === '_id') continue;

      if (typeof expr === 'object' && expr !== null) {
        for (const [_accType, accField] of Object.entries(expr)) {
          if (typeof accField === 'string' && accField.startsWith('$')) {
            fields.add(accField.substring(1));
          }
        }
      }
    }

    return Array.from(fields);
  }

  getOutputFields(): string[] {
    return Object.keys(this.groupExpr);
  }

  private getEffectiveUpstreamDocument(
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null {
    // Check if there are projected documents from upstream stages
    // Look backwards through stages to find the most recent projection
    for (
      let stageIndex = _context.stageIndex - 1;
      stageIndex >= 0;
      stageIndex--
    ) {
      const projectedDocsKey = `projected_docs_stage_${stageIndex}`;
      const projectedDocs = _context.tempState.get(projectedDocsKey);
      if (projectedDocs && projectedDocs.has(rowId)) {
        return projectedDocs.get(rowId);
      }
    }

    // Fallback to original document
    return _store.documents[rowId] || null;
  }

  private extractGroupDimension(idExpr: any): string {
    if (typeof idExpr === 'string' && idExpr.startsWith('$')) {
      return idExpr.substring(1);
    }
    return '_complex_group_key'; // For complex expressions
  }

  private ensureDimension(_store: CrossfilterStore): void {
    if (!_store.dimensions.has(this.dimensionKey)) {
      _store.dimensions.set(
        this.dimensionKey,
        new DimensionImpl(this.dimensionKey)
      );
    }
  }
}

/**
 * Optimized $sort operator with Top-K heap for $sort + $limit fusion
 */
export class OptimizedSortOperator implements IVMOperator {
  readonly type = '$sort';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private limit?: number;
  private useTopKHeap: boolean;

  constructor(
    private sortExpr: any,
    limit?: number
  ) {
    this.limit = limit;
    // Use Top-K heap when limit is specified and beneficial
    this.useTopKHeap = limit !== undefined && limit <= 1000;
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // For sort, we need to maintain order but don't filter
    // The ordering is handled in the snapshot() method
    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    return [_delta];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    // Use upstreamActiveIds from context
    const sourceRowIds = _context.upstreamActiveIds;
    if (!sourceRowIds) {
      throw new Error(
        '[IVM INVARIANT] Sort.snapshot missing upstreamActiveIds'
      );
    }

    // Collect documents with their rowIds for sorting
    const docsWithIds: Array<{ rowId: RowId; doc: Document }> = [];

    for (const rowId of sourceRowIds) {
      // Get document from upstream stage if it was transformed
      const doc = _context.getEffectiveUpstreamDocument?.(rowId) || null;
      if (!doc && process.env.DEBUG_IVM === '1' && _context.stageIndex > 0) {
        throw new Error(
          '[IVM INVARIANT] $sort attempted store fallback beyond stage 0'
        );
      }
      const eff = doc || _store.documents[rowId];
      if (eff) {
        docsWithIds.push({ rowId, doc: eff });
      }
    }

    // Use Top-K heap optimization when beneficial
    if (this.useTopKHeap && this.limit && docsWithIds.length > 1000) {
      const documents = docsWithIds.map(item => item.doc);
      const sortedDocs = optimizedSortLimit(
        documents,
        this.sortExpr,
        this.limit
      );

      // Map back to rowIds (this is the limitation - need to find original rowIds)
      // For now, fallback to regular sort with limit
      docsWithIds.sort((a, b) => this.compareDocuments(a.doc, b.doc));
      return docsWithIds.slice(0, this.limit).map(item => item.rowId);
    }

    // Regular sort
    docsWithIds.sort((a, b) => this.compareDocuments(a.doc, b.doc));

    // Apply limit if specified
    if (this.limit && docsWithIds.length > this.limit) {
      return docsWithIds.slice(0, this.limit).map(item => item.rowId);
    }

    // Return sorted rowIds
    return docsWithIds.map(item => item.rowId);
  }

  private compareDocuments(a: Document, b: Document): number {
    for (const [field, order] of Object.entries(this.sortExpr)) {
      const aVal = this.getFieldValue(a, field);
      const bVal = this.getFieldValue(b, field);

      let comparison = 0;

      // Handle nulls
      if (aVal == null && bVal == null) continue;
      if (aVal == null) comparison = -1;
      else if (bVal == null) comparison = 1;
      // Handle same type comparisons
      else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        // Mixed type - convert to string
        comparison = String(aVal).localeCompare(String(bVal));
      }

      if (comparison !== 0) {
        return (order as number) === 1 ? comparison : -comparison;
      }
    }
    return 0;
  }

  // Passthrough to upstream - sort doesn't transform documents
  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null => {
    // Get document from upstream stage if it was transformed
    return (
      context.getEffectiveUpstreamDocument?.(rowId) || store.documents[rowId]
    );
  };

  estimateComplexity(): string {
    if (this.useTopKHeap && this.limit) {
      return `O(n log ${this.limit})`; // Top-K heap complexity
    }
    return 'O(n log n)'; // Regular sorting complexity
  }

  getInputFields(): string[] {
    return Object.keys(this.sortExpr);
  }

  getOutputFields(): string[] {
    return []; // Sort doesn't change fields
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

// Global operator instance counter for debugging
let OP_ID_COUNTER = 0;

/**
 * $project operator
 */
export class ProjectOperator implements IVMOperator {
  readonly type = '$project';
  readonly canIncrement = true;
  readonly canDecrement = true;
  readonly __id = ++OP_ID_COUNTER; // Unique instance ID

  private compiledExpr: (doc: Document, rowId: RowId) => Document;
  private cache = new Map<RowId, Document>();

  constructor(
    private projectExpr: any,
    private compiler: ExpressionCompilerImpl
  ) {
    this.compiledExpr = compiler.compileProjectExpr(projectExpr);
    if (process.env.DEBUG_IVM) {
      console.log(`[ProjectOperator#${this.__id}] Created new instance`);
    }
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // Transform and cache document for downstream stages
    if (_delta.sign === 1) {
      const doc =
        _context.getEffectiveUpstreamDocument?.(_delta.rowId) ||
        _store.documents[_delta.rowId];
      if (doc) {
        const projectedDoc = this.compiledExpr(doc, _delta.rowId);
        this.cache.set(_delta.rowId, projectedDoc);
      }
    }

    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // Don't immediately remove cached projected document - downstream operators may need it
    // The cache will be cleaned up during the next snapshot or when the document is truly no longer needed
    return [_delta];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    const result: RowId[] = [];

    // Use upstreamActiveIds from context, not store.liveSet
    const sourceRowIds = _context.upstreamActiveIds;
    if (!sourceRowIds) {
      if (process.env.DEBUG_IVM === '1') {
        throw new Error(
          '[IVM INVARIANT] Project.snapshot missing upstreamActiveIds'
        );
      }
      return result;
    }

    if (process.env.DEBUG_IVM) {
      console.log(
        `[ProjectOperator#${this.__id}.snapshot] Processing ${sourceRowIds.length} upstream IDs`
      );
    }

    // Clear and rebuild cache for active documents
    this.cache.clear();

    for (const rowId of sourceRowIds) {
      // Get document from upstream stage if it was transformed
      const doc =
        _context.getEffectiveUpstreamDocument?.(rowId) ||
        _store.documents[rowId];
      if (doc) {
        const projectedDoc = this.compiledExpr(doc, rowId);
        this.cache.set(rowId, projectedDoc);
        result.push(rowId);

        if (process.env.DEBUG_IVM) {
          console.log(
            `[ProjectOperator#${this.__id}.snapshot] Cached rowId ${rowId}:`,
            JSON.stringify(projectedDoc)
          );
        }
      }
    }

    if (process.env.DEBUG_IVM) {
      console.log(
        `[ProjectOperator#${this.__id}.snapshot] Cache size after snapshot: ${this.cache.size}`
      );
    }

    return result;
  }

  // Use arrow function to ensure `this` is bound correctly
  getEffectiveDocument = (
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null => {
    // Return cached projected document
    const cached = this.cache.get(rowId);

    if (process.env.DEBUG_IVM) {
      console.log(
        `[ProjectOperator#${this.__id}.getEffectiveDocument] rowId=${rowId}, cache.has=${this.cache.has(rowId)}, cache.size=${this.cache.size}`
      );
      if (cached) {
        console.log(
          `[ProjectOperator#${this.__id}.getEffectiveDocument] Returning cached doc:`,
          cached
        );
      } else {
        console.log(
          `[ProjectOperator#${this.__id}.getEffectiveDocument] NO CACHE ENTRY! Cache keys:`,
          Array.from(this.cache.keys())
        );
      }
    }

    // CRITICAL: Never fall back to store - return only the projected view
    return cached || null;
  };

  estimateComplexity(): string {
    return 'O(n)'; // Linear transformation
  }

  getInputFields(): string[] {
    const fields = new Set<string>();

    for (const [field, expr] of Object.entries(this.projectExpr)) {
      if (expr === 1 || expr === true) {
        fields.add(field);
      } else if (typeof expr === 'string' && expr.startsWith('$')) {
        fields.add(expr.substring(1));
      }
    }

    return Array.from(fields);
  }

  getOutputFields(): string[] {
    return Object.keys(this.projectExpr).filter(
      field =>
        this.projectExpr[field] !== 0 && this.projectExpr[field] !== false
    );
  }

  private getEffectiveDocument(
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null {
    // Check if there are projected documents from upstream stages
    // Look backwards through stages to find the most recent projection
    for (
      let stageIndex = _context.stageIndex - 1;
      stageIndex >= 0;
      stageIndex--
    ) {
      const projectedDocsKey = `projected_docs_stage_${stageIndex}`;
      const projectedDocs = _context.tempState.get(projectedDocsKey);
      if (projectedDocs && projectedDocs.has(rowId)) {
        return projectedDocs.get(rowId);
      }
    }

    // Fallback to original document
    return _store.documents[rowId] || null;
  }
}

/**
 * $limit operator
 */
export class LimitOperator implements IVMOperator {
  readonly type = '$limit';
  readonly canIncrement = true;
  readonly canDecrement = true;

  constructor(private limitValue: number) {}

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // Limit is applied in snapshot, doesn't affect incremental processing
    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    return [_delta];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    // Pure rowId slicer - just take first N from upstream
    const sourceRowIds = _context.upstreamActiveIds;
    if (!sourceRowIds) {
      throw new Error(
        '[IVM INVARIANT] Limit.snapshot missing upstreamActiveIds'
      );
    }
    return sourceRowIds.slice(0, this.limitValue);
  }

  // Passthrough to upstream - limit doesn't transform documents
  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null => {
    const upstream = context.getEffectiveUpstreamDocument?.(rowId) || null;
    if (!upstream && process.env.DEBUG_IVM === '1' && context.stageIndex > 0) {
      throw new Error(
        '[IVM INVARIANT] Store fallback in getEffectiveDocument beyond stage 0'
      );
    }
    return upstream || store.documents[rowId] || null;
  };

  estimateComplexity(): string {
    return 'O(k)'; // Where k is the limit value
  }

  getInputFields(): string[] {
    return [];
  }

  getOutputFields(): string[] {
    return [];
  }
}

/**
 * $skip operator
 */
export class SkipOperator implements IVMOperator {
  readonly type = '$skip';
  readonly canIncrement = true;
  readonly canDecrement = true;

  constructor(private skipValue: number) {}

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    return [_delta];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    // Pure rowId slicer - skip first N from upstream
    const sourceRowIds = _context.upstreamActiveIds;
    if (!sourceRowIds) {
      throw new Error(
        '[IVM INVARIANT] Skip.snapshot missing upstreamActiveIds'
      );
    }
    return sourceRowIds.slice(this.skipValue);
  }

  // Passthrough to upstream - skip doesn't transform documents
  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null => {
    return (
      context.getEffectiveUpstreamDocument?.(rowId) || store.documents[rowId]
    );
  };

  estimateComplexity(): string {
    return 'O(n)'; // May need to scan all documents
  }

  getInputFields(): string[] {
    return [];
  }

  getOutputFields(): string[] {
    return [];
  }
}

/**
 * $unwind operator with parent-children mapping
 */
export class UnwindOperator implements IVMOperator {
  readonly type = '$unwind';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private parentToChildren = new Map<RowId, RowId[]>();
  private childToParent = new Map<RowId, RowId>();
  private nextChildId = 1000000; // Start child IDs from high numbers to avoid conflicts

  constructor(
    private path: string,
    private options?: {
      includeArrayIndex?: string;
      preserveNullAndEmptyArrays?: boolean;
    }
  ) {
    // Remove $ prefix if present
    if (this.path.startsWith('$')) {
      this.path = this.path.substring(1);
    }
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    const arrayValue = this.getFieldValue(doc, this.path);
    const deltas: Delta[] = [];

    if (Array.isArray(arrayValue) && arrayValue.length > 0) {
      // Create child documents for each array element
      const childIds: RowId[] = [];

      arrayValue.forEach((element, index) => {
        const childId = this.nextChildId++;
        const childDoc = { ...doc };

        // Set the unwound field to the array element
        this.setFieldValue(childDoc, this.path, element);

        // Add array index if requested
        if (this.options?.includeArrayIndex) {
          childDoc[this.options.includeArrayIndex] = index;
        }

        // Store the child document
        _store.documents[childId] = childDoc;
        _store.liveSet.set(childId);

        childIds.push(childId);
        this.childToParent.set(childId, _delta.rowId);

        deltas.push({ rowId: childId, sign: 1 });
      });

      this.parentToChildren.set(_delta.rowId, childIds);
    } else if (this.options?.preserveNullAndEmptyArrays) {
      // Keep the document but set the unwound field to null
      const childDoc = { ...doc };
      this.setFieldValue(childDoc, this.path, null);

      // Add array index if requested
      if (this.options?.includeArrayIndex) {
        childDoc[this.options.includeArrayIndex] = null;
      }

      const childId = this.nextChildId++;
      _store.documents[childId] = childDoc;
      _store.liveSet.set(childId);

      this.parentToChildren.set(_delta.rowId, [childId]);
      this.childToParent.set(childId, _delta.rowId);

      deltas.push({ rowId: childId, sign: 1 });
    }

    return deltas;
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== -1) return [];

    const childIds = this.parentToChildren.get(_delta.rowId);
    if (!childIds) return [];

    const deltas: Delta[] = [];

    // Remove all child documents
    childIds.forEach(childId => {
      if (_store.liveSet.isSet(childId)) {
        _store.liveSet.unset(childId);
        delete _store.documents[childId];
        this.childToParent.delete(childId);

        deltas.push({ rowId: childId, sign: -1 });
      }
    });

    this.parentToChildren.delete(_delta.rowId);
    return deltas;
  }

  /**
   * Handle array replacement for streaming delta symmetry
   * This addresses the edge case: tags: ['a'] → ['b','c']
   * Should generate proper remove+add events for virtual rows
   */
  onUpdate(
    _oldDoc: Document,
    newDoc: Document,
    parentRowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    const newArrayValue = this.getFieldValue(newDoc, this.path);

    const deltas: Delta[] = [];

    // First, remove all existing child documents
    const existingChildIds = this.parentToChildren.get(parentRowId);
    if (existingChildIds) {
      existingChildIds.forEach(childId => {
        if (_store.liveSet.isSet(childId)) {
          _store.liveSet.unset(childId);
          delete _store.documents[childId];
          this.childToParent.delete(childId);
          deltas.push({ rowId: childId, sign: -1 });
        }
      });
      this.parentToChildren.delete(parentRowId);
    }

    // Then, add new child documents based on new array
    if (Array.isArray(newArrayValue) && newArrayValue.length > 0) {
      const childIds: RowId[] = [];

      newArrayValue.forEach((element, index) => {
        const childId = this.nextChildId++;
        const childDoc = { ...newDoc };

        // Set the unwound field to the array element
        this.setFieldValue(childDoc, this.path, element);

        // Add array index if requested
        if (this.options?.includeArrayIndex) {
          childDoc[this.options.includeArrayIndex] = index;
        }

        // Store the child document
        _store.documents[childId] = childDoc;
        _store.liveSet.set(childId);

        childIds.push(childId);
        this.childToParent.set(childId, parentRowId);

        deltas.push({ rowId: childId, sign: 1 });
      });

      this.parentToChildren.set(parentRowId, childIds);
    } else if (this.options?.preserveNullAndEmptyArrays) {
      // Keep the document but set the unwound field to null
      const childDoc = { ...newDoc };
      this.setFieldValue(childDoc, this.path, null);

      // Add array index if requested
      if (this.options?.includeArrayIndex) {
        childDoc[this.options.includeArrayIndex] = null;
      }

      const childId = this.nextChildId++;
      _store.documents[childId] = childDoc;
      _store.liveSet.set(childId);

      this.parentToChildren.set(parentRowId, [childId]);
      this.childToParent.set(childId, parentRowId);

      deltas.push({ rowId: childId, sign: 1 });
    }

    return deltas;
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    const result: RowId[] = [];

    // Use upstream active IDs
    const sourceRowIds = _context.upstreamActiveIds || [];

    // Return child IDs for all active parent documents
    for (const parentId of sourceRowIds) {
      const childIds = this.parentToChildren.get(parentId);
      if (childIds) {
        result.push(...childIds);
      }
    }

    return result;
  }

  /**
   * Get the effective document for a virtual row ID created by $unwind
   */
  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    _context: IVMContext
  ): Document | null => {
    // For $unwind, rowId refers to the child document (virtual row)
    // that was created and stored in store.documents during onAdd
    return store.documents[rowId] || null;
  };

  estimateComplexity(): string {
    return 'O(n*m)'; // Where n is documents and m is average array length
  }

  getInputFields(): string[] {
    return [this.path];
  }

  getOutputFields(): string[] {
    const fields = [this.path];
    if (this.options?.includeArrayIndex) {
      fields.push(this.options.includeArrayIndex);
    }
    return fields;
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

  private setFieldValue(doc: Document, fieldPath: string, value: any): void {
    const parts = fieldPath.split('.');
    let current = doc;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }
}

/**
 * $lookup operator with stream→static join support
 */
export class LookupOperator implements IVMOperator {
  readonly type = '$lookup';
  readonly canIncrement = true; // Support incremental joins
  readonly canDecrement = true;

  private sideIndex: Map<DocumentValue, Document[]> = new Map();
  private joinResultsKey: string;

  constructor(private expr: any) {
    this.joinResultsKey = `lookup_${JSON.stringify(expr)}`;
    this.buildSideIndex();
  }

  private buildSideIndex(): void {
    // In a real implementation, this would load the lookup collection
    // For now, this is a stub that can be extended
    if (this.expr.from && Array.isArray(this.expr.from)) {
      // If lookup collection is provided as array (for testing)
      this.expr.from.forEach((doc: Document) => {
        const key = this.getFieldValue(doc, this.expr.foreignField);
        if (!this.sideIndex.has(key)) {
          this.sideIndex.set(key, []);
        }
        this.sideIndex.get(key)!.push(doc);
      });
    }
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Perform lookup join
    const localValue = this.getFieldValue(doc, this.expr.localField);
    const matches = this.sideIndex.get(localValue) || [];

    // Create new document with joined data
    const joinedDoc: Document = {
      ...doc,
      [this.expr.as]: matches,
    };

    // Update the document in store
    _store.documents[_delta.rowId] = joinedDoc;

    return [_delta]; // Propagate the joined document
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== -1) return [];

    // For removals, just propagate the delta
    // The document is already marked for removal in the store
    return [_delta];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    // Use upstream active IDs
    const sourceRowIds = _context.upstreamActiveIds || [];

    // For now, just return the same rowIds - documents are enhanced via getEffectiveDocument
    return sourceRowIds;
  }

  // Transform documents by adding lookup results
  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null => {
    const doc =
      context.getEffectiveUpstreamDocument?.(rowId) || store.documents[rowId];
    if (!doc) return null;

    const localValue = this.getFieldValue(doc, this.expr.localField);
    const matches = this.sideIndex.get(localValue) || [];

    return {
      ...doc,
      [this.expr.as]: matches,
    };
  };

  estimateComplexity(): string {
    return 'O(n)'; // Linear with pre-built index
  }

  getInputFields(): string[] {
    return this.expr.localField ? [this.expr.localField] : [];
  }

  getOutputFields(): string[] {
    return this.expr.as ? [this.expr.as] : [];
  }

  private getFieldValue(doc: Document, fieldPath: string): any {
    if (!fieldPath) return undefined;

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
 * Performance-optimized factory for creating IVM operators
 */
export class OptimizedIVMOperatorFactory implements IVMOperatorFactory {
  private optimizedCompiler: OptimizedExpressionCompiler;

  constructor(private compiler: ExpressionCompilerImpl) {
    this.optimizedCompiler = new OptimizedExpressionCompiler();
  }

  createMatchOperator(expr: any): IVMOperator {
    return new OptimizedMatchOperator(expr, this.optimizedCompiler);
  }

  createGroupOperator(expr: any): IVMOperator {
    return new GroupOperator(expr, this.compiler);
  }

  createSortOperator(expr: any, limit?: number): IVMOperator {
    return new OptimizedSortOperator(expr, limit);
  }

  createProjectOperator(expr: any): IVMOperator {
    return new ProjectOperator(expr, this.compiler);
  }

  createAddFieldsOperator(expr: any): IVMOperator {
    return new AddFieldsOperator(expr, this.compiler);
  }

  createLimitOperator(limit: number): IVMOperator {
    return new LimitOperator(limit);
  }

  createSkipOperator(skip: number): IVMOperator {
    return new SkipOperator(skip);
  }

  createUnwindOperator(pathOrSpec: string | any, options?: any): IVMOperator {
    // Handle both string path and object specification
    if (typeof pathOrSpec === 'string') {
      return new UnwindOperator(pathOrSpec, options);
    } else {
      // Object spec with path and options
      const { path, ...opts } = pathOrSpec;
      return new UnwindOperator(path, opts);
    }
  }

  createLookupOperator(expr: any): IVMOperator {
    return new LookupOperator(expr);
  }

  createTopKOperator(expr: any): IVMOperator {
    // Top-K optimization combining sort + limit
    return new TopKOperator(expr);
  }

  /**
   * Create fused operator for $match + $project combination
   */
  createFusedMatchProjectOperator(
    matchExpr: any,
    projectExpr: any
  ): IVMOperator {
    return new FusedOperator(matchExpr, projectExpr, this.optimizedCompiler);
  }

  /**
   * Detect if pipeline stages can be fused for optimization
   */
  canFuseStages(stage1: any, stage2: any): boolean {
    // Check for $match + $project fusion safety
    if (stage1.$match && stage2.$project) {
      // Safe to fuse if:
      // 1. No field name collisions in projection
      // 2. No computed fields dependency on match results
      return this.isSafeMatchProjectFusion(stage1.$match, stage2.$project);
    }

    return false;
  }

  private isSafeMatchProjectFusion(matchExpr: any, projectExpr: any): boolean {
    // Extract fields used in match
    const matchFields = this.extractFieldsFromExpression(matchExpr);

    // Extract fields projected and computed
    const projectedFields = new Set<string>();
    const computedFields = new Set<string>();

    for (const [field, spec] of Object.entries(projectExpr)) {
      projectedFields.add(field);
      if (typeof spec === 'object' && spec !== null) {
        computedFields.add(field);
      }
    }

    // Check for conflicts
    // 1. Match fields should not be transformed by projection computed fields
    for (const matchField of matchFields) {
      if (computedFields.has(matchField)) {
        return false; // Unsafe - match depends on field that gets computed
      }
    }

    // 2. No circular dependencies in projections
    for (const [field, spec] of Object.entries(projectExpr)) {
      if (typeof spec === 'object' && spec !== null) {
        const dependentFields = this.extractFieldsFromExpression(spec);
        if (dependentFields.includes(field)) {
          return false; // Circular dependency
        }
      }
    }

    return true; // Safe to fuse
  }

  private extractFieldsFromExpression(expr: any): string[] {
    const fields = new Set<string>();

    if (typeof expr === 'string' && expr.startsWith('$')) {
      fields.add(expr.slice(1));
    } else if (typeof expr === 'object' && expr !== null) {
      if (Array.isArray(expr)) {
        for (const item of expr) {
          this.extractFieldsFromExpression(item).forEach(f => fields.add(f));
        }
      } else {
        for (const [key, value] of Object.entries(expr)) {
          if (key.startsWith('$')) {
            // Operator - check operands
            this.extractFieldsFromExpression(value).forEach(f => fields.add(f));
          } else {
            // Field name
            fields.add(key);
            this.extractFieldsFromExpression(value).forEach(f => fields.add(f));
          }
        }
      }
    }

    return Array.from(fields);
  }
}

/**
 * Fused $match + $project operator for optimal performance
 */
export class FusedOperator implements IVMOperator {
  readonly type = '$match+$project';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private fusedFunction: FusedMatchProjectOperator;

  constructor(
    private matchExpr: any,
    private projectExpr: any,
    compiler: OptimizedExpressionCompiler
  ) {
    this.fusedFunction = new FusedMatchProjectOperator(
      matchExpr,
      projectExpr,
      compiler
    );
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Apply fused match + project in single pass
    const result = this.fusedFunction.apply(doc, _delta.rowId);
    if (result === null) {
      return []; // Filtered out by match
    }

    // Store projected document for downstream stages
    const projectedDocsKey = `projected_docs_stage_${_context.stageIndex}`;
    let projectedDocs = _context.tempState.get(projectedDocsKey);
    if (!projectedDocs) {
      projectedDocs = new Map<RowId, Document>();
      _context.tempState.set(projectedDocsKey, projectedDocs);
    }
    projectedDocs.set(_delta.rowId, result);

    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== -1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Check if document would have matched
    const result = this.fusedFunction.apply(doc, _delta.rowId);
    if (result === null) {
      return []; // Wasn't in result set
    }

    // Remove from projected docs
    const projectedDocsKey = `projected_docs_stage_${_context.stageIndex}`;
    const projectedDocs = _context.tempState.get(projectedDocsKey);
    if (projectedDocs) {
      projectedDocs.delete(_delta.rowId);
    }

    return [_delta];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    const result: RowId[] = [];
    const sourceIds = _context.upstreamActiveIds || Array.from(_store.liveSet);

    // Store projected documents for downstream stages
    const projectedDocsKey = `projected_docs_stage_${_context.stageIndex}`;
    const projectedDocs = new Map<RowId, Document>();
    _context.tempState.set(projectedDocsKey, projectedDocs);

    for (const rowId of sourceIds) {
      const doc = _context.getEffectiveUpstreamDocument
        ? _context.getEffectiveUpstreamDocument(rowId)
        : _store.documents[rowId];

      if (doc) {
        const projectedDoc = this.fusedFunction.apply(doc, rowId);
        if (projectedDoc !== null) {
          result.push(rowId);
          projectedDocs.set(rowId, projectedDoc);
        }
      }
    }

    return result;
  }

  getEffectiveDocument = (
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null => {
    const projectedDocsKey = `projected_docs_stage_${context.stageIndex}`;
    const projectedDocs = context.tempState.get(projectedDocsKey);
    return projectedDocs?.get(rowId) || null;
  };

  estimateComplexity(): string {
    return 'O(n)'; // Single pass for both match and project
  }

  getInputFields(): string[] {
    const matchFields = this.extractFieldsFromMatch(this.matchExpr);
    const projectFields = this.extractFieldsFromProject(this.projectExpr);
    return [...new Set([...matchFields, ...projectFields])];
  }

  getOutputFields(): string[] {
    return Object.keys(this.projectExpr);
  }

  private extractFieldsFromMatch(expr: any): string[] {
    // Same logic as OptimizedMatchOperator
    const fields = new Set<string>();

    if (typeof expr !== 'object' || expr === null) return [];

    for (const [field, condition] of Object.entries(expr)) {
      if (field.startsWith('$')) {
        if (field === '$and' || field === '$or') {
          const conditions = condition as any[];
          for (const cond of conditions) {
            this.extractFieldsFromMatch(cond).forEach(f => fields.add(f));
          }
        }
      } else {
        fields.add(field);
      }
    }

    return Array.from(fields);
  }

  private extractFieldsFromProject(expr: any): string[] {
    const fields = new Set<string>();

    for (const [field, spec] of Object.entries(expr)) {
      if (typeof spec === 'object' && spec !== null) {
        // Extract fields from computed expressions
        this.extractFieldsFromExpression(spec).forEach(f => fields.add(f));
      } else {
        fields.add(field);
      }
    }

    return Array.from(fields);
  }

  private extractFieldsFromExpression(expr: any): string[] {
    const fields = new Set<string>();

    if (typeof expr === 'string' && expr.startsWith('$')) {
      fields.add(expr.slice(1));
    } else if (typeof expr === 'object' && expr !== null) {
      if (Array.isArray(expr)) {
        for (const item of expr) {
          this.extractFieldsFromExpression(item).forEach(f => fields.add(f));
        }
      } else {
        for (const value of Object.values(expr)) {
          this.extractFieldsFromExpression(value).forEach(f => fields.add(f));
        }
      }
    }

    return Array.from(fields);
  }
}

/**
 * $addFields operator - adds or updates fields while preserving existing ones
 */
export class AddFieldsOperator implements IVMOperator {
  readonly type = '$addFields';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private compiledExpr: (doc: Document, _rowId: RowId) => Document;
  private cache = new Map<RowId, Document>();

  constructor(
    private addFieldsExpr: any,
    compiler: ExpressionCompilerImpl
  ) {
    // Compile the addFields expression
    this.compiledExpr = compiler.compileProjectExpr(addFieldsExpr);
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // Transform and cache document for downstream stages
    if (_delta.sign === 1) {
      const doc =
        _context.getEffectiveUpstreamDocument?.(_delta.rowId) ||
        _store.documents[_delta.rowId];
      if (doc) {
        // Compute new fields
        const newFields = this.compiledExpr(doc, _delta.rowId);
        // Merge with existing document (preserving all original fields)
        const mergedDoc = { ...doc, ...newFields };
        this.cache.set(_delta.rowId, mergedDoc);
      }
    }

    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // Clear cached document
    if (_delta.sign === -1) {
      this.cache.delete(_delta.rowId);
    }
    return [_delta];
  }

  getEffectiveDocument(
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null {
    // Return cached merged document
    return this.cache.get(rowId) || null;
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    const result: RowId[] = [];

    // Use upstreamActiveIds from context
    const sourceRowIds = _context.upstreamActiveIds || [];

    // Clear and rebuild cache for active documents
    this.cache.clear();

    for (const rowId of sourceRowIds) {
      // Get document from upstream stage if it was transformed
      const doc =
        _context.getEffectiveUpstreamDocument?.(rowId) ||
        _store.documents[rowId];
      if (doc) {
        // Compute new fields and merge
        const newFields = this.compiledExpr(doc, rowId);
        const mergedDoc = { ...doc, ...newFields };
        this.cache.set(rowId, mergedDoc);
        result.push(rowId);
      }
    }

    return result;
  }

  estimateComplexity(): string {
    return 'O(n)';
  }

  getInputFields(): string[] {
    // Would need to analyze expression to determine input fields
    return [];
  }

  getOutputFields(): string[] {
    return Object.keys(this.addFieldsExpr);
  }
}

/**
 * $topK operator for efficient top-k operations (sort + limit fusion)
 */
export class TopKOperator implements IVMOperator {
  readonly type = '$topK';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private sortKeys: Array<{ field: string; direction: 1 | -1 }> = [];
  private limit: number;
  private results: Array<{ doc: Document; rowId: RowId }> = [];

  constructor(private expr: any) {
    // Parse sort expression
    const sortExpr = expr.sort || {};
    for (const [field, direction] of Object.entries(sortExpr)) {
      this.sortKeys.push({
        field,
        direction: direction === -1 ? -1 : 1,
      });
    }

    this.limit = expr.limit || 10;
  }

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    // Get effective document from upstream stages
    const doc =
      _context.getEffectiveUpstreamDocument?.(_delta.rowId) ||
      _store.documents[_delta.rowId];
    if (!doc) return [];

    // Insert into sorted results maintaining top-k
    const newItem = { doc, rowId: _delta.rowId };

    if (this.results.length < this.limit) {
      this.results.push(newItem);
      this.results.sort((a, b) => this.compareDocuments(a.doc, b.doc));
    } else {
      // Check if this item should replace the worst item
      const comparison = this.compareDocuments(
        doc,
        this.results[this.results.length - 1].doc
      );
      if (comparison < 0) {
        this.results[this.results.length - 1] = newItem;
        this.results.sort((a, b) => this.compareDocuments(a.doc, b.doc));
      }
    }

    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== -1) return [];

    // Remove from results if present
    const index = this.results.findIndex(item => item.rowId === _delta.rowId);
    if (index >= 0) {
      this.results.splice(index, 1);
      return [_delta];
    }

    return [];
  }

  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[] {
    return this.results.map(item => item.rowId);
  }

  estimateComplexity(): string {
    return 'O(k log k)'; // Where k is the limit
  }

  getInputFields(): string[] {
    return this.sortKeys.map(key => key.field);
  }

  getOutputFields(): string[] {
    return []; // TopK doesn't add fields
  }

  /**
   * TopK is a passthrough operator - delegate to upstream for document transformation
   */
  getEffectiveDocument = (
    rowId: RowId,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Document | null => {
    // TopK doesn't transform documents, just reorders and limits them
    // Always delegate to upstream for the actual document content
    return (
      _context.getEffectiveUpstreamDocument?.(rowId) ||
      _store.documents[rowId] ||
      null
    );
  };

  private compareDocuments(a: Document, b: Document): number {
    for (const sortKey of this.sortKeys) {
      const aVal = this.getFieldValue(a, sortKey.field);
      const bVal = this.getFieldValue(b, sortKey.field);

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      else if (aVal > bVal) comparison = 1;

      if (comparison !== 0) {
        return comparison * sortKey.direction;
      }
    }
    return 0;
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
