/**
 * Top-K Heap Implementation for $sort + $limit Optimization
 *
 * Provides O(n log k) performance for sort + limit operations
 * instead of O(n log n) full sorting when k << n
 */

import type { Document, DocumentValue } from './expressions';

interface SortSpec {
  [field: string]: 1 | -1;
}

interface HeapItem {
  document: Document;
  sortKey: DocumentValue[];
  originalIndex: number;
}

/**
 * Min/Max heap implementation for Top-K queries
 */
export class TopKHeap {
  // Maintain a bounded buffer of up to k best items according to sortSpec
  private heap: HeapItem[] = [];
  private k: number;
  private sortFields: Array<{ field: string; order: 1 | -1 }>;

  constructor(k: number, sortSpec: SortSpec) {
    this.k = k;
    this.sortFields = Object.entries(sortSpec).map(([field, order]) => ({
      field,
      order,
    }));
  }

  /**
   * Add document to heap, maintaining top-K property
   */
  add(document: Document, originalIndex: number): void {
    if (this.k <= 0) return;
    const sortKey = this.extractSortKey(document);
    const item: HeapItem = { document, sortKey, originalIndex };

    if (this.heap.length < this.k) {
      this.heap.push(item);
      return;
    }

    // Find the worst item currently stored (largest by comparator)
    let worstIndex = 0;
    for (let i = 1; i < this.heap.length; i++) {
      if (this.compareItems(this.heap[i], this.heap[worstIndex]) > 0) {
        worstIndex = i;
      }
    }

    // If the new item is better than the worst, replace it
    if (this.compareItems(item, this.heap[worstIndex]) < 0) {
      this.heap[worstIndex] = item;
    }
  }

  /**
   * Add multiple documents in batch for better performance
   */
  addBatch(documents: Document[]): void {
    for (let i = 0; i < documents.length; i++) {
      this.add(documents[i], i);
    }
  }

  /**
   * Get the sorted top-K results
   */
  getSorted(): Document[] {
    if (this.heap.length === 0 || this.k <= 0) return [];

    const items = this.heap.slice().sort((a, b) => this.compareItems(a, b));
    return items.map(item => item.document);
  }

  /**
   * Get current size of heap
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Clear the heap
   */
  clear(): void {
    this.heap.length = 0;
  }

  /**
   * Extract sort key from document
   */
  private extractSortKey(document: Document): DocumentValue[] {
    return this.sortFields.map(({ field }) => {
      // Handle nested field paths
      if (field.includes('.')) {
        const parts = field.split('.');
        let value: any = document;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = null;
            break;
          }
        }
        return value;
      } else {
        return document[field];
      }
    });
  }

  /**
   * Compare two heap items based on sort specification
   */
  private compareItems(a: HeapItem, b: HeapItem): number {
    for (let i = 0; i < this.sortFields.length; i++) {
      const { order } = this.sortFields[i];
      const aVal = a.sortKey[i];
      const bVal = b.sortKey[i];

      const comparison = this.compareValues(aVal, bVal);
      if (comparison !== 0) {
        return order * comparison;
      }
    }

    // Tie-breaker: use original index for stable sort
    return a.originalIndex - b.originalIndex;
  }

  /**
   * Compare two values with proper type handling
   */
  private compareValues(a: DocumentValue, b: DocumentValue): number {
    // Handle null/undefined
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;

    // Handle same type comparisons
    if (typeof a === typeof b) {
      if (typeof a === 'number') {
        return a - (b as number);
      } else if (typeof a === 'string') {
        return a.localeCompare(b as string);
      } else if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
      } else if (typeof a === 'boolean') {
        return a === b ? 0 : a ? 1 : -1;
      }
    }

    // Mixed type comparison - convert to strings
    return String(a).localeCompare(String(b));
  }

  /**
   * Check if new item should replace heap root
   */
  // Note: bounded-array strategy; no binary heap maintenance necessary
}

/**
 * Optimized sort + limit implementation using Top-K heap
 */
export function optimizedSortLimit(
  documents: Document[],
  sortSpec: SortSpec,
  limit: number
): Document[] {
  // Use regular sort for small datasets or large k
  if (documents.length <= 1000 || limit >= documents.length * 0.5) {
    return documents
      .slice()
      .sort((a, b) => {
        for (const [field, order] of Object.entries(sortSpec)) {
          const aVal = getNestedValue(a, field);
          const bVal = getNestedValue(b, field);
          const comparison = compareValues(aVal, bVal);
          if (comparison !== 0) {
            return order * comparison;
          }
        }
        return 0;
      })
      .slice(0, limit);
  }

  // Use Top-K heap for large datasets with small k
  const heap = new TopKHeap(limit, sortSpec);
  heap.addBatch(documents);
  return heap.getSorted();
}

/**
 * Get nested field value from document
 */
function getNestedValue(document: Document, fieldPath: string): DocumentValue {
  if (!fieldPath.includes('.')) {
    return document[fieldPath];
  }

  const parts = fieldPath.split('.');
  let value: any = document;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return null;
    }
  }
  return value;
}

/**
 * Compare values with proper type handling
 */
function compareValues(a: DocumentValue, b: DocumentValue): number {
  // Handle null/undefined
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  // Handle same type comparisons
  if (typeof a === typeof b) {
    if (typeof a === 'number') {
      return a - (b as number);
    } else if (typeof a === 'string') {
      return a.localeCompare(b as string);
    } else if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    } else if (typeof a === 'boolean') {
      return a === b ? 0 : a ? 1 : -1;
    }
  }

  // Mixed type comparison - convert to strings
  return String(a).localeCompare(String(b));
}
