/**
 * Implementation of crossfilter-inspired data structures and algorithms
 */

import type {
  RowId,
  ColumnType,
  LiveSet,
  Dimension,
  RefCountedMultiSet,
  OrderStatNode,
  OrderStatTree,
  GroupState,
} from './crossfilter-ivm';
import type { Document, DocumentValue } from './expressions';
import type { AccumulatorExpression, Expression } from '../index';

/**
 * Implementation of RefCountedMultiSet with efficient min/max operations
 */
export class RefCountedMultiSetImpl<T> implements RefCountedMultiSet<T> {
  readonly values = new Map<T, number>();
  readonly sortedKeys: T[] = [];
  size = 0;

  add(value: T): void {
    const currentCount = this.values.get(value) || 0;
    if (currentCount === 0) {
      // New value, insert into sorted position
      this.insertSorted(value);
    }

    this.values.set(value, currentCount + 1);
    this.size++;
  }

  remove(value: T): boolean {
    const currentCount = this.values.get(value);
    if (!currentCount || currentCount <= 0) {
      return false;
    }

    if (currentCount === 1) {
      // Last occurrence, remove from map and sorted array
      this.values.delete(value);
      const index = this.sortedKeys.indexOf(value);
      if (index >= 0) {
        this.sortedKeys.splice(index, 1);
      }
    } else {
      this.values.set(value, currentCount - 1);
    }

    this.size--;
    return true;
  }

  getMin(): T | undefined {
    return this.sortedKeys.length > 0 ? this.sortedKeys[0] : undefined;
  }

  getMax(): T | undefined {
    return this.sortedKeys.length > 0
      ? this.sortedKeys[this.sortedKeys.length - 1]
      : undefined;
  }

  clear(): void {
    this.values.clear();
    this.sortedKeys.length = 0;
    this.size = 0;
  }

  private insertSorted(value: T): void {
    if (this.sortedKeys.length === 0) {
      this.sortedKeys.push(value);
      return;
    }

    // Binary search for insertion point
    let left = 0;
    let right = this.sortedKeys.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.compareValues(this.sortedKeys[mid], value) < 0) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    this.sortedKeys.splice(left, 0, value);
  }

  private compareValues(a: T, b: T): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
}

/**
 * AVL Tree implementation for order statistics
 */
export class OrderStatTreeImpl<T> implements OrderStatTree<T> {
  root?: OrderStatNode<T>;
  size = 0;

  insert(key: T, value: any, rowId: RowId): void {
    this.root = this.insertNode(this.root, key, value, rowId);
    this.size++;
  }

  remove(key: T, rowId: RowId): boolean {
    const initialSize = this.size;
    const newRoot = this.removeNode(this.root, key, rowId);
    if (newRoot === undefined) {
      delete this.root;
    } else {
      this.root = newRoot;
    }
    return this.size < initialSize;
  }

  kth(k: number): OrderStatNode<T> | undefined {
    if (k < 0 || k >= this.size) return undefined;
    return this.selectKth(this.root, k);
  }

  rank(key: T, rowId: RowId): number {
    return this.getRank(this.root, key, rowId, 0);
  }

  clear(): void {
    delete this.root;
    this.size = 0;
  }

  private insertNode(
    node: OrderStatNode<T> | undefined,
    key: T,
    value: any,
    rowId: RowId
  ): OrderStatNode<T> {
    // Standard BST insertion
    if (!node) {
      return {
        key,
        value,
        rowId,
        size: 1,
        height: 1,
        left: undefined,
        right: undefined,
      };
    }

    const cmp = this.compareNodes(key, rowId, node.key, node.rowId);

    if (cmp < 0) {
      node.left = this.insertNode(node.left, key, value, rowId);
    } else if (cmp > 0) {
      node.right = this.insertNode(node.right, key, value, rowId);
    } else {
      // Equal key and rowId, update value
      node.value = value;
      return node;
    }

    // Update height and size
    this.updateNode(node);

    // Perform AVL rotations if needed
    return this.balance(node);
  }

  private removeNode(
    node: OrderStatNode<T> | undefined,
    key: T,
    rowId: RowId
  ): OrderStatNode<T> | undefined {
    if (!node) return undefined;

    const cmp = this.compareNodes(key, rowId, node.key, node.rowId);

    if (cmp < 0) {
      node.left = this.removeNode(node.left, key, rowId);
    } else if (cmp > 0) {
      node.right = this.removeNode(node.right, key, rowId);
    } else {
      // Found node to delete
      this.size--;

      if (!node.left && !node.right) {
        return undefined;
      } else if (!node.left) {
        return node.right;
      } else if (!node.right) {
        return node.left;
      } else {
        // Node has two children, find successor
        const successor = this.findMin(node.right);
        node.key = successor.key;
        node.value = successor.value;
        node.rowId = successor.rowId;
        node.right = this.removeNode(
          node.right,
          successor.key,
          successor.rowId
        );
      }
    }

    this.updateNode(node);
    return this.balance(node);
  }

  private selectKth(
    node: OrderStatNode<T> | undefined,
    k: number
  ): OrderStatNode<T> | undefined {
    if (!node) return undefined;

    const leftSize = node.left?.size || 0;

    if (k < leftSize) {
      return this.selectKth(node.left, k);
    } else if (k === leftSize) {
      return node;
    } else {
      return this.selectKth(node.right, k - leftSize - 1);
    }
  }

  private getRank(
    node: OrderStatNode<T> | undefined,
    key: T,
    rowId: RowId,
    rank: number
  ): number {
    if (!node) return -1;

    const cmp = this.compareNodes(key, rowId, node.key, node.rowId);

    if (cmp < 0) {
      return this.getRank(node.left, key, rowId, rank);
    } else if (cmp > 0) {
      const leftSize = node.left?.size || 0;
      return this.getRank(node.right, key, rowId, rank + leftSize + 1);
    } else {
      // Found the node
      const leftSize = node.left?.size || 0;
      return rank + leftSize;
    }
  }

  private compareNodes(key1: T, rowId1: RowId, key2: T, rowId2: RowId): number {
    // Primary comparison by key
    if (key1 < key2) return -1;
    if (key1 > key2) return 1;

    // Tie-break by rowId for stable ordering
    // Handle both numeric and string rowIds
    if (typeof rowId1 === 'number' && typeof rowId2 === 'number') {
      return rowId1 - rowId2;
    }
    // For string rowIds or mixed types, use string comparison
    return String(rowId1).localeCompare(String(rowId2));
  }

  private updateNode(node: OrderStatNode<T>): void {
    const leftHeight = node.left?.height || 0;
    const rightHeight = node.right?.height || 0;
    const leftSize = node.left?.size || 0;
    const rightSize = node.right?.size || 0;

    node.height = Math.max(leftHeight, rightHeight) + 1;
    node.size = leftSize + rightSize + 1;
  }

  private balance(node: OrderStatNode<T>): OrderStatNode<T> {
    const leftHeight = node.left?.height || 0;
    const rightHeight = node.right?.height || 0;
    const balanceFactor = leftHeight - rightHeight;

    // Left heavy
    if (balanceFactor > 1) {
      const leftLeftHeight = node.left?.left?.height || 0;
      const leftRightHeight = node.left?.right?.height || 0;

      if (leftRightHeight > leftLeftHeight) {
        // Left-Right case
        node.left = this.rotateLeft(node.left!);
      }
      // Left-Left case
      return this.rotateRight(node);
    }

    // Right heavy
    if (balanceFactor < -1) {
      const rightLeftHeight = node.right?.left?.height || 0;
      const rightRightHeight = node.right?.right?.height || 0;

      if (rightLeftHeight > rightRightHeight) {
        // Right-Left case
        node.right = this.rotateRight(node.right!);
      }
      // Right-Right case
      return this.rotateLeft(node);
    }

    return node;
  }

  private rotateLeft(node: OrderStatNode<T>): OrderStatNode<T> {
    const newRoot = node.right!;
    node.right = newRoot.left;
    newRoot.left = node;

    this.updateNode(node);
    this.updateNode(newRoot);

    return newRoot;
  }

  private rotateRight(node: OrderStatNode<T>): OrderStatNode<T> {
    const newRoot = node.left!;
    node.left = newRoot.right;
    newRoot.right = node;

    this.updateNode(node);
    this.updateNode(newRoot);

    return newRoot;
  }

  private findMin(node: OrderStatNode<T>): OrderStatNode<T> {
    while (node.left) {
      node = node.left;
    }
    return node;
  }
}

/**
 * Live set implementation using compact bitsets
 */
export class LiveSetImpl implements LiveSet {
  bitset: Uint32Array;
  count = 0;
  maxRowId: number = -1;

  constructor(initialCapacity = 1024) {
    // Each Uint32 can store 32 bits
    this.bitset = new Uint32Array(Math.ceil(initialCapacity / 32));
  }

  set(rowId: number): void {
    this.ensureCapacity(rowId);

    const wordIndex = Math.floor(rowId / 32);
    const bitIndex = rowId % 32;
    const mask = 1 << bitIndex;

    if (!(this.bitset[wordIndex] & mask)) {
      this.bitset[wordIndex] |= mask;
      this.count++;
      this.maxRowId = Math.max(this.maxRowId, rowId);
    }
  }

  unset(rowId: number): boolean {
    if (rowId > this.maxRowId) return false;

    const wordIndex = Math.floor(rowId / 32);
    const bitIndex = rowId % 32;
    const mask = 1 << bitIndex;

    if (this.bitset[wordIndex] & mask) {
      this.bitset[wordIndex] &= ~mask;
      this.count--;
      return true;
    }

    return false;
  }

  isSet(rowId: number): boolean {
    if (rowId > this.maxRowId) return false;

    const wordIndex = Math.floor(rowId / 32);
    const bitIndex = rowId % 32;
    const mask = 1 << bitIndex;

    return !!(this.bitset[wordIndex] & mask);
  }

  clear(): void {
    this.bitset.fill(0);
    this.count = 0;
    this.maxRowId = -1;
  }

  private ensureCapacity(rowId: number): void {
    const requiredWords = Math.ceil((rowId + 1) / 32);

    if (requiredWords > this.bitset.length) {
      const newBitset = new Uint32Array(requiredWords * 2); // Grow by 2x
      newBitset.set(this.bitset);
      this.bitset = newBitset;
    }
  }

  *[Symbol.iterator](): IterableIterator<number> {
    for (let wordIndex = 0; wordIndex < this.bitset.length; wordIndex++) {
      const word = this.bitset[wordIndex];
      if (word === 0) continue;

      for (let bitIndex = 0; bitIndex < 32; bitIndex++) {
        if (word & (1 << bitIndex)) {
          yield wordIndex * 32 + bitIndex;
        }
      }
    }
  }
}

/**
 * Dimension implementation for crossfilter-style multi-dimensional indexing
 */
export class DimensionImpl implements Dimension {
  readonly fieldPath: string;
  readonly valueIndex = new Map<DocumentValue, Set<RowId>>();
  readonly sortedValues: DocumentValue[] = [];
  readonly rowToValue = new Map<RowId, DocumentValue>();
  type: ColumnType = 'object';
  cardinality = 0;
  selectivity = 0;

  constructor(fieldPath: string) {
    this.fieldPath = fieldPath;
  }

  addDocument(doc: Document, rowId: RowId): void {
    const value = this.getFieldValue(doc, this.fieldPath);

    // Remove old value if it exists
    const oldValue = this.rowToValue.get(rowId);
    if (oldValue !== undefined) {
      this.removeValue(oldValue, rowId);
    }

    // Add new value
    this.addValue(value, rowId);
    this.rowToValue.set(rowId, value);

    // Update type information
    this.updateType(value);
  }

  removeDocument(rowId: RowId): boolean {
    const value = this.rowToValue.get(rowId);
    if (value === undefined) return false;

    this.removeValue(value, rowId);
    this.rowToValue.delete(rowId);

    return true;
  }

  getDocumentsByValue(value: DocumentValue): Set<RowId> {
    return this.valueIndex.get(value) || new Set();
  }

  getDocumentsByRange(min: DocumentValue, max: DocumentValue): Set<RowId> {
    const result = new Set<RowId>();

    for (const value of this.sortedValues) {
      if (
        // eslint-disable-next-line eqeqeq
        value != null &&
        // eslint-disable-next-line eqeqeq
        min != null &&
        // eslint-disable-next-line eqeqeq
        max != null &&
        value >= min &&
        value <= max
      ) {
        const rowIds = this.valueIndex.get(value);
        if (rowIds) {
          for (const rowId of rowIds) {
            result.add(rowId);
          }
        }
        // eslint-disable-next-line eqeqeq
      } else if (value != null && max != null && value > max) {
        break; // Sorted array, no more matches
      }
    }

    return result;
  }

  private addValue(value: DocumentValue, rowId: RowId): void {
    let rowIds = this.valueIndex.get(value);

    if (!rowIds) {
      rowIds = new Set();
      this.valueIndex.set(value, rowIds);
      this.insertSorted(value);
      this.cardinality++;
    }

    rowIds.add(rowId);
    this.updateSelectivity();
  }

  private removeValue(value: DocumentValue, rowId: RowId): void {
    const rowIds = this.valueIndex.get(value);
    if (!rowIds) return;

    rowIds.delete(rowId);

    if (rowIds.size === 0) {
      this.valueIndex.delete(value);
      const index = this.sortedValues.indexOf(value);
      if (index >= 0) {
        this.sortedValues.splice(index, 1);
      }
      this.cardinality--;
    }

    this.updateSelectivity();
  }

  private insertSorted(value: DocumentValue): void {
    if (this.sortedValues.length === 0) {
      this.sortedValues.push(value);
      return;
    }

    // Binary search for insertion point
    let left = 0;
    let right = this.sortedValues.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midValue = this.sortedValues[mid];
      // eslint-disable-next-line eqeqeq
      if (midValue != null && value != null && midValue < value) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    this.sortedValues.splice(left, 0, value);
  }

  private updateType(value: DocumentValue): void {
    if (value === null || value === undefined) {
      if (this.type === 'object') this.type = 'null';
    } else if (typeof value === 'number') {
      if (this.type === 'object') this.type = 'number';
    } else if (typeof value === 'string') {
      if (this.type === 'object') this.type = 'string';
    } else if (typeof value === 'boolean') {
      if (this.type === 'object') this.type = 'boolean';
    }
    // If we have mixed types, keep 'object'
  }

  private updateSelectivity(): void {
    // Selectivity = unique values / total documents
    // Higher selectivity means more filtering power
    const totalDocs = Array.from(this.valueIndex.values()).reduce(
      (sum, set) => sum + set.size,
      0
    );

    this.selectivity = totalDocs > 0 ? this.cardinality / totalDocs : 0;
  }

  private getFieldValue(doc: Document, fieldPath: string): DocumentValue {
    const parts = fieldPath.split('.');
    let value: any = doc;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }
}

/**
 * Group state implementation for aggregation operations
 */
export class GroupStateImpl implements GroupState {
  readonly groupKey: DocumentValue;
  count = 0;
  readonly sums = new Map<string, number>();
  readonly mins = new Map<string, RefCountedMultiSet<DocumentValue>>();
  readonly maxs = new Map<string, RefCountedMultiSet<DocumentValue>>();
  readonly avgData = new Map<string, { sum: number; count: number }>();
  readonly pushArrays = new Map<string, DocumentValue[]>();
  readonly addToSets = new Map<string, Set<DocumentValue>>();
  readonly contributingDocs = new Set<RowId>();
  readonly firstLast = new Map<string, OrderStatTree<DocumentValue>>();

  constructor(groupKey: DocumentValue) {
    this.groupKey = groupKey;
  }

  addDocument(
    rowId: RowId,
    doc: Document,
    accumulators: Record<string, AccumulatorExpression | Expression>
  ): void {
    if (this.contributingDocs.has(rowId)) return; // Already added

    this.contributingDocs.add(rowId);
    this.count++;

    for (const [field, accumExpr] of Object.entries(accumulators)) {
      this.updateAccumulator(field, accumExpr, doc, rowId, 1);
    }
  }

  removeDocument(
    rowId: RowId,
    doc: Document,
    accumulators: Record<string, AccumulatorExpression | Expression>
  ): boolean {
    if (!this.contributingDocs.has(rowId)) return false;

    this.contributingDocs.delete(rowId);
    this.count--;

    for (const [field, accumExpr] of Object.entries(accumulators)) {
      this.updateAccumulator(field, accumExpr, doc, rowId, -1);
    }

    return true;
  }

  private updateAccumulator(
    field: string,
    accumExpr: any,
    doc: Document,
    rowId: RowId,
    sign: 1 | -1
  ): void {
    if (typeof accumExpr !== 'object' || accumExpr === null) return;

    for (const [accType, accField] of Object.entries(accumExpr)) {
      const value = this.getAccumulatorValue(accField, doc);

      switch (accType) {
        case '$sum':
          this.updateSum(field, value, sign);
          break;

        case '$min':
          this.updateMin(field, value, sign);
          break;

        case '$max':
          this.updateMax(field, value, sign);
          break;

        case '$avg':
          this.updateAvg(field, value, sign);
          break;

        case '$push':
          this.updatePush(field, value, sign);
          break;

        case '$addToSet':
          this.updateAddToSet(field, value, sign);
          break;

        case '$first':
        case '$last':
          this.updateFirstLast(field, accType, value, rowId, sign);
          break;
      }
    }
  }

  private updateSum(field: string, value: DocumentValue, sign: 1 | -1): void {
    const numValue = Number(value) || 0;
    const current = this.sums.get(field) || 0;
    this.sums.set(field, current + numValue * sign);
  }

  private updateMin(field: string, value: DocumentValue, sign: 1 | -1): void {
    let multiset = this.mins.get(field);
    if (!multiset) {
      multiset = new RefCountedMultiSetImpl();
      this.mins.set(field, multiset);
    }

    if (sign === 1) {
      multiset.add(value);
    } else {
      multiset.remove(value);
    }
  }

  private updateMax(field: string, value: DocumentValue, sign: 1 | -1): void {
    let multiset = this.maxs.get(field);
    if (!multiset) {
      multiset = new RefCountedMultiSetImpl();
      this.maxs.set(field, multiset);
    }

    if (sign === 1) {
      multiset.add(value);
    } else {
      multiset.remove(value);
    }
  }

  private updateAvg(field: string, value: DocumentValue, sign: 1 | -1): void {
    const numValue = Number(value) || 0;
    let avgData = this.avgData.get(field);

    if (!avgData) {
      avgData = { sum: 0, count: 0 };
      this.avgData.set(field, avgData);
    }

    avgData.sum += numValue * sign;
    avgData.count += sign;
  }

  private updatePush(field: string, value: DocumentValue, sign: 1 | -1): void {
    let arr = this.pushArrays.get(field);
    if (!arr) {
      arr = [];
      this.pushArrays.set(field, arr);
    }

    if (sign === 1) {
      arr.push(value);
    } else {
      // For removal, we'd need to track insertion order which is complex
      // For now, fall back to full recalculation for $push with removals
      const index = arr.lastIndexOf(value);
      if (index >= 0) {
        arr.splice(index, 1);
      }
    }
  }

  private updateAddToSet(
    field: string,
    value: DocumentValue,
    sign: 1 | -1
  ): void {
    let set = this.addToSets.get(field);
    if (!set) {
      set = new Set();
      this.addToSets.set(field, set);
    }

    if (sign === 1) {
      set.add(value);
    } else {
      set.delete(value);
    }
  }

  private updateFirstLast(
    field: string,
    _accType: string,
    value: DocumentValue,
    rowId: RowId,
    sign: 1 | -1
  ): void {
    let tree = this.firstLast.get(field);
    if (!tree) {
      tree = new OrderStatTreeImpl();
      this.firstLast.set(field, tree);
    }

    if (sign === 1) {
      tree.insert(rowId, value, rowId); // Use rowId as both key and tie-breaker
    } else {
      tree.remove(rowId, rowId);
    }
  }

  private getAccumulatorValue(accField: any, doc: Document): DocumentValue {
    if (accField === 1) {
      return 1; // Count
    } else if (accField === '$$ROOT') {
      return doc; // Return the entire document
    } else if (typeof accField === 'string' && accField.startsWith('$')) {
      // Field reference
      return this.getFieldValue(doc, accField.substring(1));
    } else if (typeof accField === 'object' && accField !== null) {
      // Complex expression - handle basic operators
      if (accField.$multiply && Array.isArray(accField.$multiply)) {
        const values = accField.$multiply.map((field: any) =>
          this.getAccumulatorValue(field, doc)
        );
        return values.reduce(
          (a: any, b: any) => (Number(a) || 0) * (Number(b) || 0),
          1
        );
      }
      if (accField.$add && Array.isArray(accField.$add)) {
        const values = accField.$add.map((field: any) =>
          this.getAccumulatorValue(field, doc)
        );
        return values.reduce(
          (a: any, b: any) => (Number(a) || 0) + (Number(b) || 0),
          0
        );
      }
      if (
        accField.$subtract &&
        Array.isArray(accField.$subtract) &&
        accField.$subtract.length === 2
      ) {
        const [left, right] = accField.$subtract;
        const leftVal = this.getAccumulatorValue(left, doc);
        const rightVal = this.getAccumulatorValue(right, doc);
        return (Number(leftVal) || 0) - (Number(rightVal) || 0);
      }
      if (
        accField.$divide &&
        Array.isArray(accField.$divide) &&
        accField.$divide.length === 2
      ) {
        const [left, right] = accField.$divide;
        const leftVal = this.getAccumulatorValue(left, doc);
        const rightVal = this.getAccumulatorValue(right, doc);
        const rightNum = Number(rightVal);
        return rightNum !== 0 ? (Number(leftVal) || 0) / rightNum : null;
      }
      // For other complex expressions, return the literal value for now
      return accField;
    } else {
      return accField; // Literal value
    }
  }

  private getFieldValue(doc: Document, fieldPath: string): DocumentValue {
    const parts = fieldPath.split('.');
    let value: any = doc;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  materializeResult(): Document {
    const result: Document = { _id: this.groupKey };

    // Add count-based sums
    for (const [field, sum] of this.sums.entries()) {
      result[field] = sum;
    }

    // Add mins
    for (const [field, multiset] of this.mins.entries()) {
      result[field] = multiset.getMin() ?? null;
    }

    // Add maxs
    for (const [field, multiset] of this.maxs.entries()) {
      result[field] = multiset.getMax() ?? null;
    }

    // Add averages
    for (const [field, avgData] of this.avgData.entries()) {
      result[field] = avgData.count > 0 ? avgData.sum / avgData.count : 0;
    }

    // Add arrays
    for (const [field, arr] of this.pushArrays.entries()) {
      result[field] = [...arr]; // Copy array
    }

    // Add sets
    for (const [field, set] of this.addToSets.entries()) {
      result[field] = Array.from(set);
    }

    // Add first/last
    for (const [field, tree] of this.firstLast.entries()) {
      if (tree.size > 0) {
        const first = tree.kth(0);
        result[field] = first?.value;
      }
    }

    return result;
  }
}
