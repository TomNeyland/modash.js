/**
 * IVM Operators for MongoDB aggregation stages
 */

import type {
  RowId,
  Delta,
  IVMOperator,
  IVMContext,
  CrossfilterStore,
  IVMOperatorFactory,
} from './crossfilter-ivm.js';
import type { Document, DocumentValue, Collection } from './expressions.js';
import { DimensionImpl, GroupStateImpl } from './crossfilter-impl.js';
import { ExpressionCompilerImpl } from './crossfilter-compiler.js';

/**
 * $match operator with incremental filtering
 */
export class MatchOperator implements IVMOperator {
  readonly type = '$match';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private compiledExpr: (doc: Document, rowId: RowId) => boolean;

  constructor(
    private matchExpr: any,
    private compiler: ExpressionCompilerImpl
  ) {
    this.compiledExpr = compiler.compileMatchExpr(matchExpr);
  }

  onAdd(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    if (delta.sign !== 1) return [];
    
    const doc = store.documents[delta.rowId];
    if (!doc) return [];
    
    // Apply match filter
    if (this.compiledExpr(doc, delta.rowId)) {
      return [delta]; // Document passes filter, propagate
    }
    
    return []; // Document filtered out
  }

  onRemove(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    if (delta.sign !== -1) return [];
    
    const doc = store.documents[delta.rowId];
    if (!doc) return [];
    
    // If document was previously matched, it should be removed from result
    if (this.compiledExpr(doc, delta.rowId)) {
      return [delta]; // Propagate removal
    }
    
    return []; // Document wasn't in result set anyway
  }

  snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
    const result: Document[] = [];
    
    // Iterate through all live documents
    for (const rowId of store.liveSet) {
      const doc = store.documents[rowId];
      if (doc && this.compiledExpr(doc, rowId)) {
        result.push(doc);
      }
    }
    
    return result;
  }

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

  onAdd(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    if (delta.sign !== 1) return [];
    
    const doc = store.documents[delta.rowId];
    if (!doc) return [];
    
    // Get group key for this document
    const groupKey = this.compiledGroup.getGroupKey(doc, delta.rowId);
    
    // Ensure dimension exists
    this.ensureDimension(store);
    
    // Update dimension
    const dimension = store.dimensions.get(this.dimensionKey)!;
    dimension.addDocument(doc, delta.rowId);
    
    // Get or create group state
    let groupsMap = store.groups.get(this.groupsKey);
    if (!groupsMap) {
      groupsMap = new Map();
      store.groups.set(this.groupsKey, groupsMap);
    }
    
    let groupState = groupsMap.get(groupKey);
    if (!groupState) {
      groupState = new GroupStateImpl(groupKey);
      groupsMap.set(groupKey, groupState);
    }
    
    // Add document to group
    const accumulators: any = {};
    for (const [field, expr] of Object.entries(this.groupExpr)) {
      if (field !== '_id') {
        accumulators[field] = expr;
      }
    }
    
    groupState.addDocument(delta.rowId, doc, accumulators);
    
    return [delta]; // Propagate for further stages
  }

  onRemove(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    if (delta.sign !== -1) return [];
    
    const doc = store.documents[delta.rowId];
    if (!doc) return [];
    
    // Get group key for this document
    const groupKey = this.compiledGroup.getGroupKey(doc, delta.rowId);
    
    // Update dimension
    const dimension = store.dimensions.get(this.dimensionKey);
    if (dimension) {
      dimension.removeDocument(delta.rowId);
    }
    
    // Update group state
    const groupsMap = store.groups.get(this.groupsKey);
    if (groupsMap) {
      const groupState = groupsMap.get(groupKey);
      if (groupState) {
        const accumulators: any = {};
        for (const [field, expr] of Object.entries(this.groupExpr)) {
          if (field !== '_id') {
            accumulators[field] = expr;
          }
        }
        
        const wasRemoved = groupState.removeDocument(delta.rowId, doc, accumulators);
        
        // If group becomes empty, remove it
        if (wasRemoved && groupState.count === 0) {
          groupsMap.delete(groupKey);
        }
      }
    }
    
    return [delta]; // Propagate removal
  }

  snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
    const groupsMap = store.groups.get(this.groupsKey);
    if (!groupsMap || groupsMap.size === 0) {
      return [];
    }
    
    const result: Document[] = [];
    
    for (const groupState of groupsMap.values()) {
      if (groupState.count > 0) {
        result.push(groupState.materializeResult());
      }
    }
    
    return result;
  }

  estimateComplexity(): string {
    return 'O(1)'; // Incremental group operations are O(1) per document
  }

  getInputFields(): string[] {
    const fields = new Set<string>();
    
    // Group by field
    if (typeof this.groupExpr._id === 'string' && this.groupExpr._id.startsWith('$')) {
      fields.add(this.groupExpr._id.substring(1));
    }
    
    // Accumulator fields
    for (const [field, expr] of Object.entries(this.groupExpr)) {
      if (field === '_id') continue;
      
      if (typeof expr === 'object' && expr !== null) {
        for (const [accType, accField] of Object.entries(expr)) {
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

  private extractGroupDimension(idExpr: any): string {
    if (typeof idExpr === 'string' && idExpr.startsWith('$')) {
      return idExpr.substring(1);
    }
    return '_complex_group_key'; // For complex expressions
  }

  private ensureDimension(store: CrossfilterStore): void {
    if (!store.dimensions.has(this.dimensionKey)) {
      store.dimensions.set(this.dimensionKey, new DimensionImpl(this.dimensionKey));
    }
  }
}

/**
 * $sort operator with order-statistics tree
 */
export class SortOperator implements IVMOperator {
  readonly type = '$sort';
  readonly canIncrement = true;
  readonly canDecrement = true;

  constructor(private sortExpr: any) {}

  onAdd(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    // For sort, we need to maintain order but don't filter
    // The ordering is handled in the snapshot() method
    return [delta];
  }

  onRemove(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    return [delta];
  }

  snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
    // Get all live documents and sort them
    const documents: Document[] = [];
    
    for (const rowId of store.liveSet) {
      const doc = store.documents[rowId];
      if (doc) {
        documents.push(doc);
      }
    }
    
    // Sort according to sort specification
    return documents.sort((a, b) => {
      for (const [field, order] of Object.entries(this.sortExpr)) {
        const aVal = this.getFieldValue(a, field);
        const bVal = this.getFieldValue(b, field);
        
        let comparison = 0;
        if (aVal < bVal) comparison = -1;
        else if (aVal > bVal) comparison = 1;
        
        if (comparison !== 0) {
          return (order as number) === 1 ? comparison : -comparison;
        }
      }
      return 0;
    });
  }

  estimateComplexity(): string {
    return 'O(n log n)'; // Sorting complexity
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

/**
 * $project operator
 */
export class ProjectOperator implements IVMOperator {
  readonly type = '$project';
  readonly canIncrement = true;
  readonly canDecrement = true;

  private compiledExpr: (doc: Document, rowId: RowId) => Document;

  constructor(
    private projectExpr: any,
    private compiler: ExpressionCompilerImpl
  ) {
    this.compiledExpr = compiler.compileProjectExpr(projectExpr);
  }

  onAdd(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    // Project doesn't filter, just transforms
    return [delta];
  }

  onRemove(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    return [delta];
  }

  snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
    const result: Document[] = [];
    
    for (const rowId of store.liveSet) {
      const doc = store.documents[rowId];
      if (doc) {
        result.push(this.compiledExpr(doc, rowId));
      }
    }
    
    return result;
  }

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
      field => this.projectExpr[field] !== 0 && this.projectExpr[field] !== false
    );
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

  onAdd(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    // Limit is applied in snapshot, doesn't affect incremental processing
    return [delta];
  }

  onRemove(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    return [delta];
  }

  snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
    const result: Document[] = [];
    let count = 0;
    
    for (const rowId of store.liveSet) {
      if (count >= this.limitValue) break;
      
      const doc = store.documents[rowId];
      if (doc) {
        result.push(doc);
        count++;
      }
    }
    
    return result;
  }

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

  onAdd(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    return [delta];
  }

  onRemove(delta: Delta, store: CrossfilterStore, context: IVMContext): Delta[] {
    return [delta];
  }

  snapshot(store: CrossfilterStore, context: IVMContext): Collection<Document> {
    const result: Document[] = [];
    let skipped = 0;
    
    for (const rowId of store.liveSet) {
      if (skipped < this.skipValue) {
        skipped++;
        continue;
      }
      
      const doc = store.documents[rowId];
      if (doc) {
        result.push(doc);
      }
    }
    
    return result;
  }

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
 * Factory for creating IVM operators
 */
export class IVMOperatorFactoryImpl implements IVMOperatorFactory {
  constructor(private compiler: ExpressionCompilerImpl) {}

  createMatchOperator(expr: any): IVMOperator {
    return new MatchOperator(expr, this.compiler);
  }

  createGroupOperator(expr: any): IVMOperator {
    return new GroupOperator(expr, this.compiler);
  }

  createSortOperator(expr: any): IVMOperator {
    return new SortOperator(expr);
  }

  createProjectOperator(expr: any): IVMOperator {
    return new ProjectOperator(expr, this.compiler);
  }

  createLimitOperator(limit: number): IVMOperator {
    return new LimitOperator(limit);
  }

  createSkipOperator(skip: number): IVMOperator {
    return new SkipOperator(skip);
  }

  createUnwindOperator(path: string, options?: any): IVMOperator {
    // Unwind is complex for IVM, would need special handling
    throw new Error('$unwind operator not yet implemented for IVM');
  }

  createLookupOperator(expr: any): IVMOperator {
    // Lookup requires join logic, complex for IVM
    throw new Error('$lookup operator not yet implemented for IVM');
  }
}