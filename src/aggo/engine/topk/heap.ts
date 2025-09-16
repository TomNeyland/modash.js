/**
 * Phase 10: Top-K Heap Implementation
 * 
 * Stable binary heap for Top-K operations:
 * - O(n log k) complexity replacing sort+limit
 * - Compare on keys only with late materialization for payloads
 * - Pluggable tie-breakers for stable sorting
 * - Global and per-group heap support
 */

export interface TopKItem<T> {
  key: any;
  payload: T;
  insertionOrder: number;
}

export interface TieBreaker {
  compare(a: TopKItem<any>, b: TopKItem<any>): number;
}

export interface TopKStats {
  insertsProcessed: number;
  heapResizes: number;
  comparisons: number;
  tieBreaksUsed: number;
}

/**
 * Default tie breaker based on insertion order (stable sort)
 */
export class InsertionOrderTieBreaker implements TieBreaker {
  compare(a: TopKItem<any>, b: TopKItem<any>): number {
    return a.insertionOrder - b.insertionOrder;
  }
}

/**
 * Payload-aware tie breaker (can access full payload for comparison)
 */
export class PayloadTieBreaker implements TieBreaker {
  constructor(private payloadComparer: (a: any, b: any) => number) {}
  
  compare(a: TopKItem<any>, b: TopKItem<any>): number {
    return this.payloadComparer(a.payload, b.payload);
  }
}

/**
 * Stable binary heap implementation for Top-K operations
 */
export class TopKHeap<T> {
  private heap: TopKItem<T>[] = [];
  private readonly k: number;
  private readonly isMaxHeap: boolean;
  private readonly tieBreaker: TieBreaker;
  private insertionCounter: number = 0;
  
  private stats: TopKStats = {
    insertsProcessed: 0,
    heapResizes: 0,
    comparisons: 0,
    tieBreaksUsed: 0
  };
  
  constructor(k: number, isMaxHeap: boolean = false, tieBreaker?: TieBreaker) {
    this.k = k;
    this.isMaxHeap = isMaxHeap;
    this.tieBreaker = tieBreaker || new InsertionOrderTieBreaker();
  }
  
  /**
   * Insert item into Top-K heap
   * Returns true if item was inserted, false if rejected
   */
  insert(key: any, payload: T): boolean {
    this.stats.insertsProcessed++;
    
    const item: TopKItem<T> = {
      key,
      payload,
      insertionOrder: this.insertionCounter++
    };
    
    // If heap is not full, always insert
    if (this.heap.length < this.k) {
      this.heap.push(item);
      this.heapifyUp(this.heap.length - 1);
      return true;
    }
    
    // Check if new item should replace the root
    const rootItem = this.heap[0];
    const comparison = this.compareItems(item, rootItem);
    
    if (this.shouldReplace(comparison)) {
      this.heap[0] = item;
      this.heapifyDown(0);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get all items in sorted order (materialized)
   */
  getSorted(): T[] {
    // Create a copy of the heap for sorting
    const heapCopy = [...this.heap];
    const result: T[] = [];
    
    // Extract all items in order
    while (heapCopy.length > 0) {
      const min = this.extractMinFromArray(heapCopy);
      if (this.isMaxHeap) {
        result.unshift(min.payload); // For max heap, insert at beginning
      } else {
        result.push(min.payload); // For min heap, insert at end
      }
    }
    
    return result;
  }
  
  /**
   * Get top K items without materializing payloads (keys only)
   */
  getKeys(): any[] {
    const sorted = this.getSortedItems();
    return sorted.map(item => item.key);
  }
  
  /**
   * Get current size of heap
   */
  size(): number {
    return this.heap.length;
  }
  
  /**
   * Check if heap is full
   */
  isFull(): boolean {
    return this.heap.length >= this.k;
  }
  
  /**
   * Get the threshold value (root of heap)
   */
  getThreshold(): any {
    return this.heap.length > 0 ? this.heap[0].key : null;
  }
  
  /**
   * Clear the heap
   */
  clear() {
    this.heap.length = 0;
    this.insertionCounter = 0;
  }
  
  private getSortedItems(): TopKItem<T>[] {
    const heapCopy = [...this.heap];
    const result: TopKItem<T>[] = [];
    
    while (heapCopy.length > 0) {
      const min = this.extractMinFromArray(heapCopy);
      if (this.isMaxHeap) {
        result.unshift(min);
      } else {
        result.push(min);
      }
    }
    
    return result;
  }
  
  private extractMinFromArray(arr: TopKItem<T>[]): TopKItem<T> {
    if (arr.length === 0) throw new Error('Empty heap');
    
    const min = arr[0];
    const last = arr.pop()!;
    
    if (arr.length > 0) {
      arr[0] = last;
      this.heapifyDownArray(arr, 0);
    }
    
    return min;
  }
  
  private compareItems(a: TopKItem<T>, b: TopKItem<T>): number {
    this.stats.comparisons++;
    
    // Primary comparison on keys
    let result: number;
    if (a.key < b.key) {
      result = -1;
    } else if (a.key > b.key) {
      result = 1;
    } else {
      // Keys are equal, use tie breaker
      this.stats.tieBreaksUsed++;
      result = this.tieBreaker.compare(a, b);
    }
    
    // Invert for max heap
    return this.isMaxHeap ? -result : result;
  }
  
  private shouldReplace(comparison: number): boolean {
    // For min heap: replace if new item is larger than root
    // For max heap: replace if new item is smaller than root
    return comparison > 0;
  }
  
  private heapifyUp(index: number) {
    if (index === 0) return;
    
    const parentIndex = Math.floor((index - 1) / 2);
    const parentItem = this.heap[parentIndex];
    const currentItem = this.heap[index];
    
    if (this.compareItems(currentItem, parentItem) < 0) {
      // Swap with parent
      this.heap[parentIndex] = currentItem;
      this.heap[index] = parentItem;
      this.heapifyUp(parentIndex);
    }
  }
  
  private heapifyDown(index: number) {
    this.heapifyDownArray(this.heap, index);
  }
  
  private heapifyDownArray(arr: TopKItem<T>[], index: number) {
    const leftChild = 2 * index + 1;
    const rightChild = 2 * index + 2;
    let smallest = index;
    
    if (leftChild < arr.length && this.compareItemsInArray(arr, leftChild, smallest) < 0) {
      smallest = leftChild;
    }
    
    if (rightChild < arr.length && this.compareItemsInArray(arr, rightChild, smallest) < 0) {
      smallest = rightChild;
    }
    
    if (smallest !== index) {
      // Swap
      const temp = arr[index];
      arr[index] = arr[smallest];
      arr[smallest] = temp;
      
      this.heapifyDownArray(arr, smallest);
    }
  }
  
  private compareItemsInArray(arr: TopKItem<T>[], indexA: number, indexB: number): number {
    return this.compareItems(arr[indexA], arr[indexB]);
  }
  
  /**
   * Get heap statistics
   */
  getStats(): TopKStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      insertsProcessed: 0,
      heapResizes: 0,
      comparisons: 0,
      tieBreaksUsed: 0
    };
  }
}

/**
 * Multi-group Top-K manager
 * Manages separate Top-K heaps for different groups
 */
export class GroupedTopKManager<T> {
  private groups = new Map<string, TopKHeap<T>>();
  private readonly k: number;
  private readonly isMaxHeap: boolean;
  private readonly tieBreaker?: TieBreaker;
  
  constructor(k: number, isMaxHeap: boolean = false, tieBreaker?: TieBreaker) {
    this.k = k;
    this.isMaxHeap = isMaxHeap;
    this.tieBreaker = tieBreaker;
  }
  
  /**
   * Insert item into specific group's Top-K heap
   */
  insert(groupKey: string, key: any, payload: T): boolean {
    let heap = this.groups.get(groupKey);
    
    if (!heap) {
      heap = new TopKHeap<T>(this.k, this.isMaxHeap, this.tieBreaker);
      this.groups.set(groupKey, heap);
    }
    
    return heap.insert(key, payload);
  }
  
  /**
   * Get Top-K results for specific group
   */
  getGroupResults(groupKey: string): T[] {
    const heap = this.groups.get(groupKey);
    return heap ? heap.getSorted() : [];
  }
  
  /**
   * Get all group results
   */
  getAllResults(): Map<string, T[]> {
    const results = new Map<string, T[]>();
    
    for (const [groupKey, heap] of this.groups) {
      results.set(groupKey, heap.getSorted());
    }
    
    return results;
  }
  
  /**
   * Get total number of groups
   */
  getGroupCount(): number {
    return this.groups.size;
  }
  
  /**
   * Get combined statistics across all groups
   */
  getCombinedStats(): TopKStats {
    const combined: TopKStats = {
      insertsProcessed: 0,
      heapResizes: 0,
      comparisons: 0,
      tieBreaksUsed: 0
    };
    
    for (const heap of this.groups.values()) {
      const stats = heap.getStats();
      combined.insertsProcessed += stats.insertsProcessed;
      combined.heapResizes += stats.heapResizes;
      combined.comparisons += stats.comparisons;
      combined.tieBreaksUsed += stats.tieBreaksUsed;
    }
    
    return combined;
  }
  
  /**
   * Clear all groups
   */
  clear() {
    this.groups.clear();
  }
  
  /**
   * Clear specific group
   */
  clearGroup(groupKey: string) {
    this.groups.delete(groupKey);
  }
}

/**
 * Top-K operation implementations for common use cases
 */
export class TopKOperations {
  /**
   * Extract Top-K from array using heap (O(n log k))
   */
  static topK<T>(
    items: T[],
    k: number,
    keyExtractor: (item: T) => any,
    isMaxHeap: boolean = false,
    tieBreaker?: TieBreaker
  ): T[] {
    const heap = new TopKHeap<T>(k, isMaxHeap, tieBreaker);
    
    for (const item of items) {
      const key = keyExtractor(item);
      heap.insert(key, item);
    }
    
    return heap.getSorted();
  }
  
  /**
   * Extract Top-K with custom comparison function
   */
  static topKWithComparator<T>(
    items: T[],
    k: number,
    compareFn: (a: T, b: T) => number
  ): T[] {
    const heap = new TopKHeap<T>(k, false, new PayloadTieBreaker(compareFn));
    
    for (const item of items) {
      // Use the item itself as the key for custom comparison
      heap.insert(item, item);
    }
    
    return heap.getSorted();
  }
  
  /**
   * Merge multiple Top-K heaps into single Top-K result
   */
  static mergeTopK<T>(
    heaps: TopKHeap<T>[],
    k: number,
    isMaxHeap: boolean = false
  ): T[] {
    const mergedHeap = new TopKHeap<T>(k, isMaxHeap);
    
    for (const heap of heaps) {
      const items = heap.getSortedItems();
      for (const item of items) {
        mergedHeap.insert(item.key, item.payload);
      }
    }
    
    return mergedHeap.getSorted();
  }
}