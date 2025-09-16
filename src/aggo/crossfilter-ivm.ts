/**
 * Crossfilter-Inspired Incremental View Maintenance (IVM) System
 *
 * Provides comprehensive incremental processing for MongoDB aggregation pipelines
 * with multi-dimensional indexing and true add/remove support.
 *
 * Architecture inspired by crossfilter.js concepts but adapted for MongoDB syntax.
 */

import type { Collection, Document, DocumentValue } from './expressions';
import type { Pipeline } from '../index';

/**
 * Stable row identifier for tracking documents across operations
 * - number: for regular document rows
 * - string: for virtual rows (e.g., group results, unwind child rows)
 */
export type PhysicalRowId = number;
export type VirtualRowId = string;
export type RowId = PhysicalRowId | VirtualRowId;

/**
 * Delta represents a change to the dataset: add (+1) or remove (-1)
 */
export interface Delta {
  rowId: RowId;
  sign: 1 | -1;
}

/**
 * Data types supported by the columnar store
 */
export type ColumnType = 'number' | 'string' | 'boolean' | 'object' | 'null';

/**
 * Columnar field storage for efficient operations
 * Structure of Arrays (SoA) for better cache locality
 */
export interface ColumnStore {
  type: ColumnType;
  values: any[]; // Typed array for primitives, regular array for objects
  nullMask: Uint8Array; // Bit mask for null/undefined values
  length: number;
}

/**
 * Live document tracking - which rows are currently active
 */
export interface LiveSet {
  bitset: Uint32Array; // Compact bitset for membership
  count: number; // Number of live documents
  maxRowId: number; // Highest assigned row ID (physical rows only)

  set(rowId: number): void;
  unset(rowId: number): boolean;
  isSet(rowId: number): boolean;
  clear(): void;
  [Symbol.iterator](): IterableIterator<PhysicalRowId>;
}

/**
 * Crossfilter-style dimension for efficient filtering and grouping
 * Provides indexed access to documents by field values
 */
export interface Dimension {
  readonly fieldPath: string;
  readonly valueIndex: Map<DocumentValue, Set<RowId>>; // value -> rowIds
  readonly sortedValues: DocumentValue[]; // All values in sorted order
  readonly rowToValue: Map<RowId, DocumentValue>; // rowId -> value
  type: ColumnType;

  // Statistics for optimization
  cardinality: number; // Number of distinct values
  selectivity: number; // Estimated selectivity (0-1)

  addDocument(doc: Document, rowId: RowId): void;
  removeDocument(rowId: RowId): boolean;
  getDocumentsByValue(value: DocumentValue): Set<RowId>;
  getDocumentsByRange(min: DocumentValue, max: DocumentValue): Set<RowId>;
}

/**
 * Multi-set for tracking value frequencies with deletion support
 * Used for min/max operations that need to handle removal
 */
export interface RefCountedMultiSet<T> {
  readonly values: Map<T, number>; // value -> count
  readonly sortedKeys: T[]; // Keys in sorted order
  size: number; // Total number of items (sum of counts)

  add(value: T): void;
  remove(value: T): boolean; // Returns true if value was present
  getMin(): T | undefined;
  getMax(): T | undefined;
  clear(): void;
}

/**
 * Order-statistics tree node for efficient ranking and selection
 */
export interface OrderStatNode<T> {
  key: T;
  value: any;
  rowId: RowId;
  size: number; // Size of subtree
  // exactOptionalPropertyTypes: allow explicit undefined assignments
  left: OrderStatNode<T> | undefined;
  right: OrderStatNode<T> | undefined;
  height: number; // For AVL balancing
}

/**
 * Order-statistics tree for efficient sorting and top-k operations
 */
export interface OrderStatTree<T> {
  root?: OrderStatNode<T>;
  size: number;

  insert(key: T, value: any, rowId: RowId): void;
  remove(key: T, rowId: RowId): boolean;
  kth(k: number): OrderStatNode<T> | undefined; // 0-indexed
  rank(key: T, rowId: RowId): number; // 0-indexed position
  clear(): void;
}

/**
 * Group state for aggregation operations with incremental support
 */
export interface GroupState {
  readonly groupKey: DocumentValue;

  // Basic counters
  count: number;

  // Sum aggregations
  sums: Map<string, number>;

  // Min/Max with deletion support
  mins: Map<string, RefCountedMultiSet<DocumentValue>>;
  maxs: Map<string, RefCountedMultiSet<DocumentValue>>;

  // Average tracking (sum + count for precision)
  avgData: Map<string, { sum: number; count: number }>;

  // Array accumulations
  pushArrays: Map<string, DocumentValue[]>;
  addToSets: Map<string, Set<DocumentValue>>;

  // Document tracking for removal
  contributingDocs: Set<RowId>;

  // First/Last with ordering support
  firstLast: Map<string, OrderStatTree<DocumentValue>>;

  addDocument(rowId: RowId, doc: Document, accumulators: any): void;
  removeDocument(rowId: RowId, doc: Document, accumulators: any): boolean;
  materializeResult(): Document;
}

/**
 * Compiled aggregation stage for efficient execution
 */
export interface CompiledStage {
  type: string; // $match, $group, etc.
  canIncrement: boolean;
  canDecrement: boolean;

  // Compiled expressions/predicates
  compiledExpr?: (doc: Document, rowId: RowId) => any;

  // Field dependencies
  inputFields: string[];
  outputFields: string[];

  // Stage-specific data
  stageData: any;
}

/**
 * Pipeline execution plan with optimization metadata
 */
export interface ExecutionPlan {
  readonly stages: CompiledStage[];
  canIncrement: boolean;
  canDecrement: boolean;
  estimatedComplexity: string;
  primaryDimensions: string[];

  // Optimization hints
  optimizations: {
    hasSort: boolean;
    hasSortLimit: boolean; // Sort followed by limit (top-k optimization)
    hasGroupBy: boolean;
    canUseTopK: boolean;
    canVectorize: boolean;
  };
}

/**
 * Main crossfilter-inspired data store with IVM capabilities
 */
export interface CrossfilterStore {
  // Core data storage
  documents: Document[]; // Raw document storage (internal mutable)
  readonly liveSet: LiveSet; // Which documents are currently active
  readonly columns: Map<string, ColumnStore>; // Columnar field storage
  readonly rowIdCounter: { current: number }; // Stable ID assignment (physical rows)

  // Multi-dimensional indexing (crossfilter concept)
  readonly dimensions: Map<string, Dimension>;

  // Aggregation state
  readonly groups: Map<string, Map<DocumentValue, GroupState>>; // dimensionKey -> groupKey -> state

  // Performance tracking
  readonly stats: {
    totalDocs: number;
    liveDocs: number;
    dimensionsCreated: number;
    groupsActive: number;
  };
}

/**
 * Incremental aggregation operator with delta processing
 */
export interface IVMOperator {
  readonly type: string;
  readonly canIncrement: boolean;
  readonly canDecrement: boolean;

  // Delta processing
  onAdd(_delta: Delta, _store: CrossfilterStore, _context: IVMContext): Delta[];
  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[];

  // Result materialization - returns active rowIds after this stage
  snapshot(_store: CrossfilterStore, _context: IVMContext): RowId[];

  // Optional: Get the effective document for a rowId after this stage's transformations
  getEffectiveDocument?(
    rowId: RowId,
    store: CrossfilterStore,
    context: IVMContext
  ): Document | null;

  // Optimization
  estimateComplexity(): string;
  getInputFields(): string[];
  getOutputFields(): string[];
}

/**
 * Context for IVM operator execution
 */
export interface IVMContext {
  pipeline: Pipeline;
  stageIndex: number;
  compiledStage: CompiledStage;
  executionPlan: ExecutionPlan;

  // Upstream active rowIds - the engine owns this
  upstreamActiveIds?: RowId[];

  // Temporary state
  tempState: Map<string, any>;

  // Helper to get effective document from upstream stage
  getEffectiveUpstreamDocument?(rowId: RowId): Document | null;
}

/**
 * Expression compiler for JIT optimization
 */
export interface ExpressionCompiler {
  // Compile MongoDB expressions to optimized functions
  compileMatchExpr(expr: any): (doc: Document, rowId: RowId) => boolean;
  compileProjectExpr(expr: any): (doc: Document, rowId: RowId) => Document;
  compileGroupExpr(expr: any): {
    getGroupKey: (doc: Document, rowId: RowId) => DocumentValue;
    accumulators: Array<{
      field: string;
      type: string;
      getValue: (doc: Document, rowId: RowId) => DocumentValue;
    }>;
  };

  // Optimization
  canVectorize(expr: any): boolean;
  createVectorizedFn(expr: any): (docs: Document[], rowIds: RowId[]) => any[];
}

/**
 * Performance optimization engine
 */
export interface PerformanceEngine {
  // Memory management
  shouldCompactColumns(): boolean;
  compactColumns(_store: CrossfilterStore): void;

  // Index optimization
  shouldCreateDimension(fieldPath: string, selectivity: number): boolean;
  getOptimalDimensions(pipeline: Pipeline): string[];

  // Query optimization
  optimizePipeline(pipeline: Pipeline): ExecutionPlan;
  reorderStagesForEfficiency(stages: CompiledStage[]): CompiledStage[];
}

/**
 * Factory for creating IVM operators
 */
export interface IVMOperatorFactory {
  createMatchOperator(expr: any): IVMOperator;
  createGroupOperator(expr: any): IVMOperator;
  createSortOperator(expr: any): IVMOperator;
  createProjectOperator(expr: any): IVMOperator;
  createLimitOperator(limit: number): IVMOperator;
  createSkipOperator(skip: number): IVMOperator;
  createUnwindOperator(path: string, options?: any): IVMOperator;
  createLookupOperator(expr: any): IVMOperator;
}

/**
 * Main crossfilter-inspired IVM engine
 */
export interface CrossfilterIVMEngine {
  readonly _store: CrossfilterStore;
  readonly compiler: ExpressionCompiler;
  readonly performance: PerformanceEngine;
  readonly operatorFactory: IVMOperatorFactory;

  // Pipeline management
  compilePipeline(pipeline: Pipeline): ExecutionPlan;

  // Data operations
  addDocument(doc: Document): number;
  addDocuments(docs: Document[]): number[];
  removeDocument(rowId: RowId): boolean;
  removeDocuments(rowIds: RowId[]): number;

  // Incremental processing
  applyDelta(_delta: Delta, executionPlan: ExecutionPlan): Collection<Document>;
  applyDeltas(
    deltas: Delta[],
    executionPlan: ExecutionPlan
  ): Collection<Document>;

  // Full materialization
  execute(pipeline: Pipeline): Collection<Document>;

  // Optimization and maintenance
  optimize(): void;
  getStatistics(): any;
  getStats?(): any;
  clear(): void;
}
