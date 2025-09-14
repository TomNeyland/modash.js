/**
 * High-performance sorting implementation for modash.js
 *
 * Key optimizations:
 * 1. Top-K heap for $sort + $limit operations
 * 2. Specialized comparators for different data types
 * 3. Multi-field sorting with optimized key generation
 * 4. Stable sorting with row ID tie-breakers
 */

import type { Document, DocumentValue, Collection } from './expressions.js';
import type { SortStage } from '../index.js';
import {
  compileFieldAccess,
  type CompilationContext,
} from './performance-compiler.js';
import { perfCounters } from '../../benchmarks/operators.js';

/**
 * Compiled sort key extractor for performance
 */
interface CompiledSortKey {
  fieldPath: string;
  direction: 1 | -1;
  getter: (doc: Document) => DocumentValue;
  type: 'number' | 'string' | 'date' | 'mixed';
}

/**
 * Heap node for Top-K implementation
 */
interface HeapNode {
  document: Document;
  sortKey: any[]; // Precomputed sort key
  rowId: number; // For stable sorting
}

/**
 * Min/Max heap implementation for Top-K sorting
 */
class TopKHeap {
  private heap: HeapNode[];
  private capacity: number;
  private isMaxHeap: boolean; // true for finding top K largest, false for top K smallest
  private compareFn: (a: HeapNode, b: HeapNode) => number;

  constructor(
    k: number,
    compareFn: (a: HeapNode, b: HeapNode) => number,
    findMax: boolean = true
  ) {
    this.capacity = k;
    this.heap = [];
    this.isMaxHeap = findMax;
    this.compareFn = findMax
      ? (a, b) => -compareFn(a, b) // Reverse for max heap (use min heap to find top K largest)
      : compareFn;
  }

  private parent(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  private leftChild(index: number): number {
    return 2 * index + 1;
  }

  private rightChild(index: number): number {
    return 2 * index + 2;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j]!;
    this.heap[j] = temp!;
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = this.parent(index);
      if (this.compareFn(this.heap[index]!, this.heap[parentIndex]!) >= 0)
        break;

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    while (this.leftChild(index) < this.heap.length) {
      const leftChild = this.leftChild(index);
      const rightChild = this.rightChild(index);

      let smallestChild = leftChild;
      if (
        rightChild < this.heap.length &&
        this.compareFn(this.heap[rightChild]!, this.heap[leftChild]!) < 0
      ) {
        smallestChild = rightChild;
      }

      if (this.compareFn(this.heap[index]!, this.heap[smallestChild]!) <= 0)
        break;

      this.swap(index, smallestChild);
      index = smallestChild;
    }
  }

  insert(node: HeapNode): void {
    if (this.heap.length < this.capacity) {
      // Heap not full, just add
      this.heap.push(node);
      this.heapifyUp(this.heap.length - 1);
    } else {
      // Heap is full, check if new node should replace root
      if (this.compareFn(node, this.heap[0]!) > 0) {
        this.heap[0] = node;
        this.heapifyDown(0);
      }
    }
  }

  extractSorted(): HeapNode[] {
    // Convert heap to sorted array
    const sorted: HeapNode[] = [];

    while (this.heap.length > 0) {
      sorted.push(this.heap[0]!);
      this.heap[0] = this.heap[this.heap.length - 1]!;
      this.heap.pop();
      if (this.heap.length > 0) {
        this.heapifyDown(0);
      }
    }

    // Reverse if we used a min heap to find max elements
    if (this.isMaxHeap) {
      sorted.reverse();
    }

    return sorted;
  }

  size(): number {
    return this.heap.length;
  }
}

/**
 * Analyze sort specification to determine optimal data types and comparators
 */
function analyzeSortSpec(
  collection: Collection,
  sortSpec: SortStage['$sort'],
  ctx: CompilationContext
): CompiledSortKey[] {
  const compiledKeys: CompiledSortKey[] = [];

  for (const [fieldPath, direction] of Object.entries(sortSpec)) {
    const getter = compileFieldAccess(fieldPath, ctx);
    ctx.hotFields.add(fieldPath);

    // Sample data to determine predominant type
    let numberCount = 0;
    let stringCount = 0;
    let dateCount = 0;
    const sampleSize = Math.min(100, collection.length);

    for (let i = 0; i < sampleSize; i++) {
      const value = getter(collection[i]!);
      if (typeof value === 'number') numberCount++;
      else if (typeof value === 'string') stringCount++;
      else if (value instanceof Date) dateCount++;
    }

    // Determine predominant type
    let type: 'number' | 'string' | 'date' | 'mixed';
    if (numberCount > sampleSize * 0.8) type = 'number';
    else if (stringCount > sampleSize * 0.8) type = 'string';
    else if (dateCount > sampleSize * 0.8) type = 'date';
    else type = 'mixed';

    compiledKeys.push({
      fieldPath,
      direction: direction as 1 | -1,
      getter,
      type,
    });
  }

  return compiledKeys;
}

/**
 * Create optimized comparison function for sort keys
 */
function createComparator(
  compiledKeys: CompiledSortKey[]
): (a: HeapNode, b: HeapNode) => number {
  return (a: HeapNode, b: HeapNode): number => {
    for (let i = 0; i < compiledKeys.length; i++) {
      const key = compiledKeys[i]!;
      const valueA = a.sortKey[i];
      const valueB = b.sortKey[i];

      // Handle null/undefined (MongoDB behavior: null < any value)
      if (valueA == null && valueB == null) continue;
      if (valueA == null) return -key.direction;
      if (valueB == null) return key.direction;

      let comparison = 0;

      // Type-specific comparison for performance
      switch (key.type) {
        case 'number':
          if (typeof valueA === 'number' && typeof valueB === 'number') {
            comparison = valueA - valueB;
          } else {
            // Fallback to string comparison
            comparison = String(valueA).localeCompare(String(valueB));
          }
          break;

        case 'string':
          if (typeof valueA === 'string' && typeof valueB === 'string') {
            comparison = valueA.localeCompare(valueB);
          } else {
            comparison = String(valueA).localeCompare(String(valueB));
          }
          break;

        case 'date':
          if (valueA instanceof Date && valueB instanceof Date) {
            comparison = valueA.getTime() - valueB.getTime();
          } else {
            comparison = String(valueA).localeCompare(String(valueB));
          }
          break;

        case 'mixed':
        default:
          // Generic comparison
          if (typeof valueA === typeof valueB) {
            if (typeof valueA === 'number') {
              comparison = valueA - valueB;
            } else if (typeof valueA === 'string') {
              comparison = valueA.localeCompare(valueB);
            } else if (valueA instanceof Date && valueB instanceof Date) {
              comparison = valueA.getTime() - valueB.getTime();
            } else {
              comparison = String(valueA).localeCompare(String(valueB));
            }
          } else {
            // Different types - use string comparison
            comparison = String(valueA).localeCompare(String(valueB));
          }
          break;
      }

      if (comparison !== 0) {
        return comparison * key.direction;
      }
    }

    // Tie-breaker: use row ID for stable sorting
    return a.rowId - b.rowId;
  };
}

/**
 * Precompute sort key for a document
 */
function computeSortKey(
  doc: Document,
  compiledKeys: CompiledSortKey[],
  rowId: number
): any[] {
  const sortKey: any[] = [];

  for (const key of compiledKeys) {
    const value = key.getter(doc);
    sortKey.push(value);
  }

  return sortKey;
}

/**
 * High-performance Top-K sorting (when $sort is followed by $limit)
 */
export function performanceTopK(
  collection: Collection,
  sortSpec: SortStage['$sort'],
  limit: number,
  ctx: CompilationContext
): Collection {
  if (collection.length === 0 || limit <= 0) {
    return [];
  }

  // If limit is larger than collection, use regular sort
  if (limit >= collection.length) {
    return performanceSort(collection, sortSpec, ctx);
  }

  perfCounters.recordAdd(); // Record that we're using the optimized path

  // Analyze sort specification
  const compiledKeys = analyzeSortSpec(collection, sortSpec, ctx);

  // Determine if we need max heap (for descending first key) or min heap
  const firstKeyDirection = compiledKeys[0]?.direction ?? 1;
  const useMaxHeap = firstKeyDirection === -1;

  // Create comparator and heap
  const compareFn = createComparator(compiledKeys);
  const heap = new TopKHeap(limit, compareFn, useMaxHeap);

  // Process documents
  for (let i = 0; i < collection.length; i++) {
    const doc = collection[i]!;
    const sortKey = computeSortKey(doc, compiledKeys, i);

    const node: HeapNode = {
      document: doc,
      sortKey,
      rowId: i,
    };

    heap.insert(node);
    perfCounters.recordAdd();
  }

  // Extract results
  const sortedNodes = heap.extractSorted();
  return sortedNodes.map(node => node.document);
}

/**
 * High-performance sorting for general case
 */
export function performanceSort(
  collection: Collection,
  sortSpec: SortStage['$sort'],
  ctx: CompilationContext
): Collection {
  if (collection.length === 0) {
    return [];
  }

  // Analyze sort specification
  const compiledKeys = analyzeSortSpec(collection, sortSpec, ctx);

  // Create nodes with precomputed sort keys
  const nodes: HeapNode[] = [];
  for (let i = 0; i < collection.length; i++) {
    const doc = collection[i]!;
    const sortKey = computeSortKey(doc, compiledKeys, i);

    nodes.push({
      document: doc,
      sortKey,
      rowId: i,
    });

    perfCounters.recordAdd();
  }

  // Create comparator and sort
  const compareFn = createComparator(compiledKeys);
  nodes.sort(compareFn);

  // Extract documents
  return nodes.map(node => node.document);
}

/**
 * Detect if a pipeline stage sequence can use Top-K optimization
 */
export function canUseTopK(
  pipeline: any[],
  startIndex: number
): { canUse: boolean; limit?: number } {
  if (startIndex >= pipeline.length - 1) {
    return { canUse: false };
  }

  const currentStage = pipeline[startIndex];
  const nextStage = pipeline[startIndex + 1];

  // Check if current stage is $sort and next is $limit
  if (
    currentStage &&
    '$sort' in currentStage &&
    nextStage &&
    '$limit' in nextStage
  ) {
    const limit = nextStage.$limit;

    // Only use Top-K for reasonably sized limits
    if (typeof limit === 'number' && limit > 0 && limit <= 10000) {
      return { canUse: true, limit };
    }
  }

  return { canUse: false };
}

/**
 * Auto-detect and apply the best sorting strategy
 */
export function optimizedSort(
  collection: Collection,
  sortSpec: SortStage['$sort'],
  limit?: number,
  ctx?: CompilationContext
): Collection {
  // Use provided context or create a new one
  const compilationContext = ctx ?? {
    cache: {
      simpleFields: new Set(),
      compiledGetters: new Map(),
      regexPatterns: new Map(),
    },
    constants: new Map(),
    hotFields: new Set(),
  };

  if (limit && limit < collection.length) {
    // Use Top-K heap optimization
    return performanceTopK(collection, sortSpec, limit, compilationContext);
  } else {
    // Use regular optimized sort
    return performanceSort(collection, sortSpec, compilationContext);
  }
}
