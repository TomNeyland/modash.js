/**
 * Phase 9: Columnar Operator ABI for Zero-Allocation IVM Engine
 *
 * Defines the operator lifecycle: init(schema, hints) → push(batch) → flush() → close()
 * Implements vectorized operations on columnar batches with selection vectors
 */

import {
  ColumnarBatch,
  SelectionVector,
  ColumnarSchema,
} from './columnar-vectors';
import { DocumentValue } from './expressions';

/**
 * Optimization hints for operators
 */
export interface OperatorHints {
  expectedBatchSize?: number;
  isStreamingMode?: boolean;
  selectivity?: number; // Expected fraction of rows that pass through
  distinctValues?: number; // Expected distinct values for grouping
  sortedFields?: string[]; // Fields that are known to be sorted
  memoryBudget?: number; // Memory budget in bytes
  // Callback to record transformed fields for late materialization
  onTransform?: (rowId: number, field: string, value: DocumentValue) => void;
}

/**
 * Result of operator execution
 */
export interface OperatorResult {
  outputBatch: ColumnarBatch;
  selection: SelectionVector;
  metadata?: {
    rowsProcessed: number;
    rowsOutput: number;
    selectivity: number;
    processingTimeMs: number;
  };
}

/**
 * Base interface for all columnar operators
 */
export interface ColumnarOperator {
  /**
   * Initialize operator with schema and optimization hints
   * Called once before processing begins
   */
  init(schema: ColumnarSchema, hints: OperatorHints): void;

  /**
   * Process a batch of data
   * Returns result batch with selection vector
   */
  push(batch: ColumnarBatch): OperatorResult;

  /**
   * Flush any buffered data (for blocking operators like $group, $sort)
   * Returns final results
   */
  flush(): OperatorResult | null;

  /**
   * Clean up resources
   * Called once after processing completes
   */
  close(): void;

  /**
   * Get operator statistics
   */
  getStats(): OperatorStats;
}

/**
 * Operator performance statistics
 */
export interface OperatorStats {
  totalBatchesProcessed: number;
  totalRowsProcessed: number;
  totalRowsOutput: number;
  totalProcessingTimeMs: number;
  averageSelectivity: number;
  peakMemoryUsage: number;
}

/**
 * Base operator implementation with common functionality
 */
export abstract class BaseColumnarOperator implements ColumnarOperator {
  protected schema: ColumnarSchema = { fields: new Map() };
  protected hints: OperatorHints = {};
  protected stats: OperatorStats = {
    totalBatchesProcessed: 0,
    totalRowsProcessed: 0,
    totalRowsOutput: 0,
    totalProcessingTimeMs: 0,
    averageSelectivity: 1.0,
    peakMemoryUsage: 0,
  };

  init(schema: ColumnarSchema, hints: OperatorHints): void {
    this.schema = schema;
    this.hints = hints;
    this.initializeOperator();
  }

  abstract push(batch: ColumnarBatch): OperatorResult;

  flush(): OperatorResult | null {
    return null; // Most operators don't need flushing
  }

  close(): void {
    this.cleanupOperator();
  }

  getStats(): OperatorStats {
    return { ...this.stats };
  }

  protected updateStats(
    rowsProcessed: number,
    rowsOutput: number,
    timeMs: number
  ): void {
    this.stats.totalBatchesProcessed++;
    this.stats.totalRowsProcessed += rowsProcessed;
    this.stats.totalRowsOutput += rowsOutput;
    this.stats.totalProcessingTimeMs += timeMs;

    if (this.stats.totalRowsProcessed > 0) {
      this.stats.averageSelectivity =
        this.stats.totalRowsOutput / this.stats.totalRowsProcessed;
    }
  }

  protected abstract initializeOperator(): void;
  protected abstract cleanupOperator(): void;
}

/**
 * Columnar $match operator - filters rows based on predicates
 */
export class ColumnarMatchOperator extends BaseColumnarOperator {
  private predicate: (row: Map<string, DocumentValue>) => boolean = () => true;
  private compiledPredicate?: (
    batch: ColumnarBatch,
    selection: SelectionVector
  ) => SelectionVector;

  constructor(private matchExpression: any) {
    super();
  }

  protected initializeOperator(): void {
    // Try to compile predicate for vectorized execution
    const compiled = this.compilePredicate(this.matchExpression);
    if (compiled) {
      this.compiledPredicate = compiled;
    }
  }

  protected cleanupOperator(): void {
    // No cleanup needed
  }

  push(batch: ColumnarBatch): OperatorResult {
    const startTime = performance.now();
    const inputSelection = batch.getSelection();
    const outputSelection = new SelectionVector(batch.batchSize);

    if (this.compiledPredicate) {
      // Use vectorized execution
      const result = this.compiledPredicate(batch, inputSelection);
      outputSelection.copyFrom(result);
    } else {
      // Fallback to row-by-row processing
      this.processRowByRow(batch, inputSelection, outputSelection);
    }

    const endTime = performance.now();
    this.updateStats(
      inputSelection.length,
      outputSelection.length,
      endTime - startTime
    );

    return {
      outputBatch: batch,
      selection: outputSelection,
      metadata: {
        rowsProcessed: inputSelection.length,
        rowsOutput: outputSelection.length,
        selectivity:
          inputSelection.length > 0
            ? outputSelection.length / inputSelection.length
            : 0,
        processingTimeMs: endTime - startTime,
      },
    };
  }

  private processRowByRow(
    batch: ColumnarBatch,
    input: SelectionVector,
    output: SelectionVector
  ): void {
    const fields = batch.getFields();

    for (let i = 0; i < input.length; i++) {
      const rowId = input.get(i);
      const row = new Map<string, DocumentValue>();

      // Materialize row for predicate evaluation
      for (const field of fields) {
        row.set(field, batch.getValue(rowId, field));
      }

      if (this.predicate(row)) {
        output.push(rowId);
      }
    }
  }

  private compilePredicate(
    expression: any
  ):
    | ((batch: ColumnarBatch, selection: SelectionVector) => SelectionVector)
    | undefined {
    // Simple compilation for common cases
    if (expression && typeof expression === 'object') {
      const keys = Object.keys(expression);

      // Handle simple equality: { field: value }
      if (keys.length === 1 && typeof expression[keys[0]] !== 'object') {
        const field = keys[0];
        const value = expression[field];

        return (batch: ColumnarBatch, selection: SelectionVector) => {
          const result = new SelectionVector(batch.batchSize);
          const vector = batch.getVector(field);

          if (vector) {
            for (let i = 0; i < selection.length; i++) {
              const rowId = selection.get(i);
              if (vector.get(rowId) === value) {
                result.push(rowId);
              }
            }
          }

          return result;
        };
      }

      // Handle field with comparison operators: { field: { $lt: value } }
      if (keys.length === 1 && typeof expression[keys[0]] === 'object') {
        const field = keys[0];
        const condition = expression[field];

        if (condition && typeof condition === 'object') {
          const operators = Object.keys(condition);

          // Handle single comparison operator
          if (operators.length === 1) {
            const op = operators[0];
            const value = condition[op];

            return (batch: ColumnarBatch, selection: SelectionVector) => {
              const result = new SelectionVector(batch.batchSize);
              const vector = batch.getVector(field);

              if (vector) {
                for (let i = 0; i < selection.length; i++) {
                  const rowId = selection.get(i);
                  const docValue = vector.get(rowId);

                  let matches = false;
                  switch (op) {
                    case '$eq':
                      matches = docValue === value;
                      break;
                    case '$ne':
                      matches = docValue !== value;
                      break;
                    case '$lt':
                      matches = docValue !== null && docValue < value;
                      break;
                    case '$lte':
                      matches = docValue !== null && docValue <= value;
                      break;
                    case '$gt':
                      matches = docValue !== null && docValue > value;
                      break;
                    case '$gte':
                      matches = docValue !== null && docValue >= value;
                      break;
                    case '$in':
                      matches =
                        Array.isArray(value) && value.includes(docValue);
                      break;
                    case '$nin':
                      matches =
                        Array.isArray(value) && !value.includes(docValue);
                      break;
                  }

                  if (matches) {
                    result.push(rowId);
                  }
                }
              }

              return result;
            };
          }
        }
      }
    }

    return undefined; // Fall back to row-by-row
  }
}

/**
 * Columnar $project operator - selects and transforms fields
 */
export class ColumnarProjectOperator extends BaseColumnarOperator {
  private projection: Map<string, any> = new Map();
  private outputBatch: ColumnarBatch | undefined;

  constructor(private projectExpression: any) {
    super();
  }

  protected initializeOperator(): void {
    // Parse projection specification
    for (const [field, spec] of Object.entries(this.projectExpression)) {
      this.projection.set(field, spec);
    }

    // Create output batch with appropriate vectors
    this.outputBatch = new ColumnarBatch(this.hints.expectedBatchSize || 1024);
  }

  protected cleanupOperator(): void {
    this.outputBatch = undefined;
  }

  push(batch: ColumnarBatch): OperatorResult {
    const startTime = performance.now();
    const inputSelection = batch.getSelection();
    const outputSelection = new SelectionVector(batch.batchSize);

    if (!this.outputBatch) {
      throw new Error('Operator not initialized');
    }

    this.outputBatch.clear();

    // Process each selected row
    for (let i = 0; i < inputSelection.length; i++) {
      const rowId = inputSelection.get(i);
      this.projectRow(batch, rowId, this.outputBatch, i);
      // Preserve original row identity to enable late materialization
      outputSelection.push(rowId);
    }

    const endTime = performance.now();
    this.updateStats(
      inputSelection.length,
      outputSelection.length,
      endTime - startTime
    );

    return {
      outputBatch: this.outputBatch,
      selection: outputSelection,
      metadata: {
        rowsProcessed: inputSelection.length,
        rowsOutput: outputSelection.length,
        selectivity: 1.0, // Project doesn't filter
        processingTimeMs: endTime - startTime,
      },
    };
  }

  private projectRow(
    inputBatch: ColumnarBatch,
    inputRowId: number,
    outputBatch: ColumnarBatch,
    outputRowId: number
  ): void {
    for (const [field, spec] of this.projection) {
      let value: DocumentValue;

      if (spec === 1 || spec === true) {
        // Include field as-is
        value = inputBatch.getValue(inputRowId, field);
      } else if (spec === 0 || spec === false) {
        // Exclude field (skip)
        continue;
      } else {
        // Expression evaluation (simplified for now)
        value = this.evaluateExpression(spec, inputBatch, inputRowId);
      }

      outputBatch.setValue(outputRowId, field, value);
      // Record transformation for late materialization fallback
      this.hints.onTransform?.(inputRowId, field, value);
    }
  }

  private evaluateExpression(
    expression: any,
    batch: ColumnarBatch,
    rowId: number
  ): DocumentValue {
    // Simplified expression evaluation
    if (typeof expression === 'string' && expression.startsWith('$')) {
      // Field reference
      const fieldName = expression.substring(1);
      return batch.getValue(rowId, fieldName);
    }

    if (typeof expression === 'object' && expression !== null) {
      // Handle operators like { $add: ["$field1", "$field2"] }
      const operators = Object.keys(expression);
      if (operators.length === 1) {
        const op = operators[0];
        const args = expression[op];

        switch (op) {
          case '$add':
            if (Array.isArray(args)) {
              return args.reduce((sum, arg) => {
                const val = this.evaluateExpression(arg, batch, rowId);
                return (sum as number) + (val as number);
              }, 0);
            }
            break;
          // Add more operators as needed
        }
      }
    }

    // Literal value
    return expression;
  }
}

/**
 * Virtual RowID manager for $unwind operations
 * Generates virtual row IDs for array elements while maintaining original row references
 */
export class VirtualRowIdManager {
  private virtualToOriginal: Map<number, number> = new Map();
  private virtualToArrayIndex: Map<number, number> = new Map();
  private virtualToField: Map<number, string> = new Map();
  private nextVirtualId: number = 0x80000000; // Start with high bit set to distinguish from real IDs

  /**
   * Generate virtual row IDs for array elements
   */
  generateVirtualRowIds(
    originalRowId: number,
    arrayLength: number,
    fieldPath: string
  ): number[] {
    const virtualIds: number[] = [];

    for (let i = 0; i < arrayLength; i++) {
      const virtualId = this.nextVirtualId++;
      this.virtualToOriginal.set(virtualId, originalRowId);
      this.virtualToArrayIndex.set(virtualId, i);
      this.virtualToField.set(virtualId, fieldPath);
      virtualIds.push(virtualId);
    }

    return virtualIds;
  }

  /**
   * Get original row ID from virtual ID
   */
  getOriginalRowId(virtualId: number): number {
    return this.virtualToOriginal.get(virtualId) ?? virtualId;
  }

  /**
   * Get array index from virtual ID
   */
  getArrayIndex(virtualId: number): number {
    return this.virtualToArrayIndex.get(virtualId) ?? 0;
  }

  /**
   * Get the unwind field path for this virtual row
   */
  getUnwindField(virtualId: number): string | undefined {
    return this.virtualToField.get(virtualId);
  }

  /**
   * Check if row ID is virtual
   */
  isVirtualRowId(rowId: number): boolean {
    return rowId >= 0x80000000;
  }

  /**
   * Clear all virtual mappings
   */
  clear(): void {
    this.virtualToOriginal.clear();
    this.virtualToArrayIndex.clear();
    this.virtualToField.clear();
    this.nextVirtualId = 0x80000000;
  }
}

/**
 * Columnar $unwind operator using virtual row IDs
 */
export class ColumnarUnwindOperator extends BaseColumnarOperator {
  private virtualRowManager = new VirtualRowIdManager();
  private unwindField: string = '';
  private preserveNullAndEmptyArrays = false;

  constructor(private unwindSpec: any) {
    super();
  }

  protected initializeOperator(): void {
    if (typeof this.unwindSpec === 'string') {
      this.unwindField = this.unwindSpec.startsWith('$')
        ? this.unwindSpec.substring(1)
        : this.unwindSpec;
    } else if (typeof this.unwindSpec === 'object') {
      this.unwindField = this.unwindSpec.path?.startsWith('$')
        ? this.unwindSpec.path.substring(1)
        : this.unwindSpec.path;
      this.preserveNullAndEmptyArrays =
        this.unwindSpec.preserveNullAndEmptyArrays || false;
    }
  }

  protected cleanupOperator(): void {
    this.virtualRowManager.clear();
  }

  push(batch: ColumnarBatch): OperatorResult {
    const startTime = performance.now();
    const inputSelection = batch.getSelection();
    const outputSelection = new SelectionVector(batch.batchSize * 4); // Estimate expansion

    const unwindVector = batch.getVector(this.unwindField);
    if (!unwindVector) {
      // Field doesn't exist, return empty or preserve based on settings
      const endTime = performance.now();
      this.updateStats(inputSelection.length, 0, endTime - startTime);

      return {
        outputBatch: batch,
        selection: new SelectionVector(),
        metadata: {
          rowsProcessed: inputSelection.length,
          rowsOutput: 0,
          selectivity: 0,
          processingTimeMs: endTime - startTime,
        },
      };
    }

    // Process each row and unwind arrays
    for (let i = 0; i < inputSelection.length; i++) {
      const rowId = inputSelection.get(i);
      const value = unwindVector.get(rowId);

      if (Array.isArray(value) && value.length > 0) {
        // Generate virtual row IDs for array elements
        const virtualIds = this.virtualRowManager.generateVirtualRowIds(
          rowId,
          value.length,
          this.unwindField
        );

        for (const virtualId of virtualIds) {
          outputSelection.push(virtualId);
        }
      } else if (this.preserveNullAndEmptyArrays) {
        // Include original row for null/empty arrays
        outputSelection.push(rowId);
      }
    }

    const endTime = performance.now();
    this.updateStats(
      inputSelection.length,
      outputSelection.length,
      endTime - startTime
    );

    return {
      outputBatch: batch, // Same batch, but with virtual row IDs
      selection: outputSelection,
      metadata: {
        rowsProcessed: inputSelection.length,
        rowsOutput: outputSelection.length,
        selectivity:
          inputSelection.length > 0
            ? outputSelection.length / inputSelection.length
            : 0,
        processingTimeMs: endTime - startTime,
      },
    };
  }
}

/**
 * Columnar Hash Group operator - blocking aggregation with hash table
 * Supports simple key types (number, string, boolean, null) and scalar accumulators.
 * Unsupported accumulators (e.g., $push, $addToSet) cause a reason-coded fallback.
 */
export class ColumnarHashGroupOperator extends BaseColumnarOperator {
  private keyFields: string[] = [];
  private accSpecs: Record<string, any> = {};
  private groups = new Map<string, any>();
  private groupRows: Array<{ key: any[]; state: any }> = [];
  private capacityLimit: number = Infinity;

  constructor(private groupSpec: any) {
    super();
  }

  protected initializeOperator(): void {
    // Parse group spec
    // Example: { _id: '$tags', count: { $sum: 1 }, avg: { $avg: '$value' } }
    const spec = this.groupSpec || {};
    const idExpr = spec._id;
    if (idExpr === null || idExpr === undefined) {
      this.keyFields = []; // single global group
    } else if (typeof idExpr === 'string' && idExpr.startsWith('$')) {
      this.keyFields = [idExpr.substring(1)];
    } else if (Array.isArray(idExpr)) {
      // Support array of field paths for composite key
      this.keyFields = idExpr
        .filter((e: any) => typeof e === 'string' && e.startsWith('$'))
        .map((e: string) => e.substring(1));
    } else {
      // For now, only field-path keys supported
      this.keyFields = [];
    }

    // Accumulator specs
    for (const [field, expr] of Object.entries(spec)) {
      if (field === '_id') continue;
      this.accSpecs[field] = expr;
    }

    // Compute capacity limit (rough heuristic)
    // Default to 100k groups; if memoryBudget provided, approximate ~64 bytes per group
    const approxBytesPerGroup = 64;
    if (this.hints.memoryBudget && this.hints.memoryBudget > 0) {
      this.capacityLimit = Math.max(
        1024,
        Math.floor(this.hints.memoryBudget / approxBytesPerGroup)
      );
    } else {
      this.capacityLimit = 100_000;
    }

    // Reject unsupported accumulators ($push/$addToSet) for now in columnar path
    for (const expr of Object.values(this.accSpecs)) {
      if (typeof expr === 'object' && expr !== null) {
        const op = Object.keys(expr)[0];
        if (op === '$push' || op === '$addToSet') {
          throw new Error(
            'UNSUPPORTED_ACCUM: Columnar hash group does not yet support $push/$addToSet'
          );
        }
      }
    }
  }

  protected cleanupOperator(): void {
    this.groups.clear();
    this.groupRows.length = 0;
  }

  push(batch: ColumnarBatch): OperatorResult {
    const start = performance.now();
    const sel = batch.getSelection();

    for (let i = 0; i < sel.length; i++) {
      const rowId = sel.get(i);
      const key = this.readKey(batch, rowId);
      const keyStr = JSON.stringify(key);
      let state = this.groups.get(keyStr);
      if (!state) {
        if (this.groups.size >= this.capacityLimit) {
          throw new Error(
            'CAPACITY: group cardinality exceeded columnar capacity'
          );
        }
        state = this.createAccState(key);
        this.groups.set(keyStr, state);
        this.groupRows.push({ key, state });
      }
      this.updateAccumulators(state, batch, rowId);
    }

    const end = performance.now();
    // Non-outputting until flush; selection mirrors input (no filtering)
    this.updateStats(sel.length, sel.length, end - start);
    return { outputBatch: batch, selection: sel };
  }

  flush(): OperatorResult | null {
    // Materialize grouped results into a new columnar batch
    const outLen = this.groupRows.length;
    if (outLen === 0)
      return {
        outputBatch: new ColumnarBatch(0),
        selection: new SelectionVector(0),
      };

    const out = new ColumnarBatch(outLen);
    // Prepare vectors for outputs
    // _id
    const idField = '_id';
    const idType = this.detectType(this.groupRows[0]?.key?.[0]);
    this.addVectorForField(out, idField, idType);

    const fields = Object.keys(this.accSpecs);
    const fieldTypes = new Map<
      string,
      'number' | 'string' | 'boolean' | 'null'
    >();
    for (const f of fields) {
      const sample = this.sampleFieldValue(f, this.groupRows[0]?.state);
      const t = this.detectType(sample);
      fieldTypes.set(f, t);
      this.addVectorForField(out, f, t);
    }

    const sel = new SelectionVector(outLen);
    for (let i = 0; i < outLen; i++) {
      const { key, state } = this.groupRows[i];
      // _id: single or composite
      const idVal = key.length <= 1 ? (key[0] ?? null) : key;
      this.setValue(out, i, idField, idType, idVal);
      for (const f of fields) {
        const val = this.finalizeField(f, state);
        this.setValue(out, i, f, fieldTypes.get(f)!, val as DocumentValue);
      }
      sel.push(i);
    }

    // Clear for potential next flush
    this.groups.clear();
    this.groupRows.length = 0;

    return { outputBatch: out, selection: sel };
  }

  private sampleFieldValue(field: string, state: any): any {
    if (!state) return null;
    const spec = this.accSpecs[field];
    const op =
      typeof spec === 'object' && spec !== null ? Object.keys(spec)[0] : '$sum';
    switch (op) {
      case '$sum':
      case '$avg':
        return 0;
      case '$min':
      case '$max':
      case '$first':
      case '$last':
        return state[field]?.val ?? null;
      default:
        return null;
    }
  }

  private readKey(batch: ColumnarBatch, rowId: number): any[] {
    if (this.keyFields.length === 0) return [null];
    const key: any[] = [];
    for (const f of this.keyFields) {
      let v = batch.getValue(rowId, f);
      if (v === undefined) v = null;
      key.push(v);
    }
    return key;
  }

  private createAccState(key: any[]) {
    const st: any = { _key: key };
    for (const [field, expr] of Object.entries(this.accSpecs)) {
      const op =
        typeof expr === 'object' && expr !== null
          ? Object.keys(expr)[0]
          : '$sum';
      switch (op) {
        case '$sum':
        case '$avg':
          st[field] = { sum: 0, count: 0 };
          break;
        case '$min':
          st[field] = { val: Infinity };
          break;
        case '$max':
          st[field] = { val: -Infinity };
          break;
        case '$first':
          st[field] = { set: false, val: null as any };
          break;
        case '$last':
          st[field] = { val: null as any };
          break;
        default:
          // Unsupported accumulators should have been rejected in initialize
          st[field] = { unsupported: true };
      }
    }
    return st;
  }

  private evalFieldArg(expr: any, batch: ColumnarBatch, rowId: number): any {
    if (expr === 1) return 1;
    if (typeof expr === 'string' && expr.startsWith('$')) {
      return batch.getValue(rowId, expr.substring(1));
    }
    if (typeof expr === 'object' && expr !== null) {
      const op = Object.keys(expr)[0];
      const arg = (expr as any)[op];
      switch (op) {
        case '$add':
          return (Array.isArray(arg) ? arg : [arg]).reduce(
            (s: number, a: any) =>
              s + (Number(this.evalFieldArg(a, batch, rowId)) || 0),
            0
          );
        case '$multiply':
          return (Array.isArray(arg) ? arg : [arg]).reduce(
            (p: number, a: any) =>
              p * (Number(this.evalFieldArg(a, batch, rowId)) || 0),
            1
          );
        case '$subtract':
          if (Array.isArray(arg) && arg.length === 2) {
            const l = Number(this.evalFieldArg(arg[0], batch, rowId)) || 0;
            const r = Number(this.evalFieldArg(arg[1], batch, rowId)) || 0;
            return l - r;
          }
          return 0;
        case '$divide':
          if (Array.isArray(arg) && arg.length === 2) {
            const l = Number(this.evalFieldArg(arg[0], batch, rowId)) || 0;
            const r = Number(this.evalFieldArg(arg[1], batch, rowId)) || 1;
            return r !== 0 ? l / r : null;
          }
          return null;
        default:
          return null;
      }
    }
    return expr;
  }

  private updateAccumulators(
    state: any,
    batch: ColumnarBatch,
    rowId: number
  ): void {
    for (const [field, expr] of Object.entries(this.accSpecs)) {
      const op =
        typeof expr === 'object' && expr !== null
          ? Object.keys(expr)[0]
          : '$sum';
      const arg =
        typeof expr === 'object' && expr !== null ? (expr as any)[op] : expr;
      switch (op) {
        case '$sum': {
          const n = Number(this.evalFieldArg(arg, batch, rowId)) || 0;
          state[field].sum += n;
          break;
        }
        case '$avg': {
          const v = this.evalFieldArg(arg, batch, rowId);
          const n = Number(v);
          if (!Number.isNaN(n)) {
            state[field].sum += n;
            state[field].count += 1;
          }
          break;
        }
        case '$min': {
          const v = this.evalFieldArg(arg, batch, rowId);
          if (v !== null && v !== undefined) {
            if (state[field].val === Infinity || v < state[field].val)
              state[field].val = v;
          }
          break;
        }
        case '$max': {
          const v = this.evalFieldArg(arg, batch, rowId);
          if (v !== null && v !== undefined) {
            if (state[field].val === -Infinity || v > state[field].val)
              state[field].val = v;
          }
          break;
        }
        case '$first': {
          if (!state[field].set) {
            const v = this.evalFieldArg(arg, batch, rowId);
            state[field].val = v;
            state[field].set = true;
          }
          break;
        }
        case '$last': {
          const v = this.evalFieldArg(arg, batch, rowId);
          state[field].val = v;
          break;
        }
        default:
          // Unsupported handled in initialize
          break;
      }
    }
  }

  private finalizeField(field: string, state: any): any {
    const spec = this.accSpecs[field];
    const op =
      typeof spec === 'object' && spec !== null ? Object.keys(spec)[0] : '$sum';
    switch (op) {
      case '$sum':
        return state[field].sum;
      case '$avg':
        return state[field].count > 0
          ? state[field].sum / state[field].count
          : 0;
      case '$min':
        return state[field].val === Infinity ? null : state[field].val;
      case '$max':
        return state[field].val === -Infinity ? null : state[field].val;
      case '$first':
        return state[field].set ? state[field].val : null;
      case '$last':
        return state[field].val;
      default:
        return null;
    }
  }

  private detectType(v: any): 'number' | 'string' | 'boolean' | 'null' {
    if (v === null || v === undefined) return 'null';
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return t as any;
    return 'string';
  }

  private addVectorForField(
    _batch: ColumnarBatch,
    _field: string,
    _kind: 'number' | 'string' | 'boolean' | 'null'
  ) {
    // We cannot import vector classes here; rely on ColumnarBatch.setValue to create length
    // ColumnarBatch requires vectors to be present; use a simple heuristic: store numbers as numbers, others as strings
    // To ensure vectors exist, pre-seed first value at index -1 is not possible; instead, add minimal vectors via reflection is not available.
    // Workaround: We'll set values via setValue after we call addVector with a dummy Utf8Vector/Float64Vector in engine.
    // Since we don't have vector classes here, we'll rely on setValue after a vector is added upstream.
    // No-op here; vectors will be implicitly created by engine schema for output batch size.
    // Note: ColumnarBatch.addVector is required to enable setValue; our engine will use fallback materialization if vectors are missing.
  }

  private setValue(
    out: ColumnarBatch,
    idx: number,
    field: string,
    _kind: 'number' | 'string' | 'boolean' | 'null',
    val: DocumentValue
  ) {
    out.setValue(idx, field, val);
  }
}

/**
 * Columnar $limit operator - selection-slice with stateful remaining counter
 */
export class ColumnarLimitOperator extends BaseColumnarOperator {
  private remaining: number;

  constructor(private count: number) {
    super();
    this.remaining = count;
  }

  protected initializeOperator(): void {
    this.remaining = this.count;
  }

  protected cleanupOperator(): void {
    // no-op
  }

  push(batch: ColumnarBatch): OperatorResult {
    const start = performance.now();
    const inputSel = batch.getSelection();
    const outSel = new SelectionVector(
      Math.min(inputSel.length, this.remaining)
    );

    const take = Math.min(this.remaining, inputSel.length);
    for (let i = 0; i < take; i++) {
      outSel.push(inputSel.get(i));
    }
    this.remaining -= take;

    const end = performance.now();
    this.updateStats(inputSel.length, outSel.length, end - start);

    return {
      outputBatch: batch,
      selection: outSel,
      metadata: {
        rowsProcessed: inputSel.length,
        rowsOutput: outSel.length,
        selectivity: inputSel.length ? outSel.length / inputSel.length : 0,
        processingTimeMs: end - start,
      },
    };
  }

  flush(): OperatorResult | null {
    // Once remaining reaches 0, subsequent batches produce empty selection
    return null;
  }
}

/**
 * Columnar pipeline executor
 * Manages the flow of batches through multiple operators
 */
export class ColumnarPipelineExecutor {
  private operators: ColumnarOperator[] = [];
  private _schema: ColumnarSchema = { fields: new Map() };

  constructor() {}

  /**
   * Add operator to pipeline
   */
  addOperator(operator: ColumnarOperator): void {
    this.operators.push(operator);
  }

  /**
   * Initialize all operators with schema
   */
  init(schema: ColumnarSchema, hints: OperatorHints): void {
    this._schema = schema;

    for (const operator of this.operators) {
      operator.init(schema, hints);
    }
  }

  /**
   * Execute pipeline on a batch
   */
  execute(batch: ColumnarBatch): ColumnarBatch {
    let currentBatch = batch;
    let currentSelection = batch.getSelection();

    // Flow batch through each operator
    for (const operator of this.operators) {
      // Set selection on current batch
      currentBatch.getSelection().copyFrom(currentSelection);

      const result = operator.push(currentBatch);
      currentBatch = result.outputBatch;
      currentSelection = result.selection;
    }

    // Set final selection
    currentBatch.getSelection().copyFrom(currentSelection);
    return currentBatch;
  }

  /**
   * Flush all operators (for blocking operators)
   */
  flush(): ColumnarBatch[] {
    const results: ColumnarBatch[] = [];

    for (const operator of this.operators) {
      const result = operator.flush();
      if (result && result.outputBatch) {
        result.outputBatch.getSelection().copyFrom(result.selection);
        results.push(result.outputBatch);
      }
    }

    return results;
  }

  /**
   * Close all operators
   */
  close(): void {
    for (const operator of this.operators) {
      operator.close();
    }
  }

  /**
   * Get aggregated statistics from all operators
   */
  getStats(): { operatorStats: OperatorStats[]; pipelineStats: OperatorStats } {
    const operatorStats = this.operators.map(op => op.getStats());

    const pipelineStats: OperatorStats = {
      totalBatchesProcessed: Math.max(
        ...operatorStats.map(s => s.totalBatchesProcessed)
      ),
      totalRowsProcessed: operatorStats[0]?.totalRowsProcessed || 0,
      totalRowsOutput:
        operatorStats[operatorStats.length - 1]?.totalRowsOutput || 0,
      totalProcessingTimeMs: operatorStats.reduce(
        (sum, s) => sum + s.totalProcessingTimeMs,
        0
      ),
      averageSelectivity:
        operatorStats.reduce((sum, s) => sum + s.averageSelectivity, 0) /
        Math.max(operatorStats.length, 1),
      peakMemoryUsage: Math.max(...operatorStats.map(s => s.peakMemoryUsage)),
    };

    return { operatorStats, pipelineStats };
  }

  /**
   * Get current schema
   */
  getSchema(): ColumnarSchema {
    return this._schema;
  }
}
