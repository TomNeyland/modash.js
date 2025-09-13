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

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Apply match filter
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

    // If document was previously matched, it should be removed from result
    if (this.compiledExpr(doc, _delta.rowId)) {
      return [_delta]; // Propagate removal
    }

    return []; // Document wasn't in result set anyway
  }

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const result: Document[] = [];

    // Iterate through all live documents
    for (const rowId of _store.liveSet) {
      const doc = _store.documents[rowId];
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

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    if (_delta.sign !== 1) return [];

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Get group key for this document
    const groupKey = this.compiledGroup.getGroupKey(doc, _delta.rowId);

    // Serialize group key for consistent Map indexing
    const groupKeyStr = JSON.stringify(groupKey);

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

    const doc = _store.documents[_delta.rowId];
    if (!doc) return [];

    // Get group key for this document
    const groupKey = this.compiledGroup.getGroupKey(doc, _delta.rowId);
    const groupKeyStr = JSON.stringify(groupKey);

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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const groupsMap = _store.groups.get(this.groupsKey);
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
 * $sort operator with order-statistics tree
 */
export class SortOperator implements IVMOperator {
  readonly type = '$sort';
  readonly canIncrement = true;
  readonly canDecrement = true;

  constructor(private sortExpr: any) {}

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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    // Get all live documents and sort them
    const documents: Document[] = [];

    for (const rowId of _store.liveSet) {
      const doc = _store.documents[rowId];
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

  onAdd(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    // Project doesn't filter, just transforms
    return [_delta];
  }

  onRemove(
    _delta: Delta,
    _store: CrossfilterStore,
    _context: IVMContext
  ): Delta[] {
    return [_delta];
  }

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const result: Document[] = [];

    for (const rowId of _store.liveSet) {
      const doc = _store.documents[rowId];
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
      field =>
        this.projectExpr[field] !== 0 && this.projectExpr[field] !== false
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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const result: Document[] = [];
    let count = 0;

    for (const rowId of _store.liveSet) {
      if (count >= this.limitValue) break;

      const doc = _store.documents[rowId];
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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const result: Document[] = [];
    let skipped = 0;

    for (const rowId of _store.liveSet) {
      if (skipped < this.skipValue) {
        skipped++;
        continue;
      }

      const doc = _store.documents[rowId];
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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const result: Document[] = [];

    // Return all unwound child documents
    for (const rowId of _store.liveSet) {
      if (this.childToParent.has(rowId)) {
        const doc = _store.documents[rowId];
        if (doc) {
          result.push(doc);
        }
      }
    }

    return result;
  }

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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    const result: Document[] = [];

    // Perform lookup join for all live documents
    for (const rowId of _store.liveSet) {
      const doc = _store.documents[rowId];
      if (!doc) continue;

      const localValue = this.getFieldValue(doc, this.expr.localField);
      const matches = this.sideIndex.get(localValue) || [];

      const joinedDoc: Document = {
        ...doc,
        [this.expr.as]: matches,
      };

      result.push(joinedDoc);
    }

    return result;
  }

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
    return new UnwindOperator(path, options);
  }

  createLookupOperator(expr: any): IVMOperator {
    return new LookupOperator(expr);
  }

  createTopKOperator(expr: any): IVMOperator {
    // Top-K optimization combining sort + limit
    return new TopKOperator(expr);
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

    const doc = _store.documents[_delta.rowId];
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

  snapshot(
    _store: CrossfilterStore,
    _context: IVMContext
  ): Collection<Document> {
    return this.results.map(item => item.doc);
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
