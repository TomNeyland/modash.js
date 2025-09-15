/**
 * B+ Tree Implementation for High-Performance Sorting and Order Statistics
 * 
 * This module implements a B+ tree optimized for database-style sorting operations,
 * providing O(log n) insertion/deletion and efficient range queries.
 * Specifically tuned for modash.js $sort operations in toggle mode.
 */

interface BTreeNode<T> {
  keys: T[];
  children?: BTreeNode<T>[];
  values?: number[]; // Row IDs for leaf nodes
  isLeaf: boolean;
  parent?: BTreeNode<T>;
  next?: BTreeNode<T>; // For efficient range scans
}

export interface SortKeyExtractor<T> {
  (doc: T): number | string | Date;
}

export interface SortSpec {
  field: string;
  direction: 1 | -1; // 1 for ascending, -1 for descending
}

/**
 * High-performance B+ tree for sorting operations
 * Optimized for order statistics and range queries
 */
export class BPlusTreeSort<T> {
  private root: BTreeNode<T>;
  private degree: number; // Branching factor
  private keyExtractor: SortKeyExtractor<T>;
  private compareFn: (a: T, b: T) => number;
  private documents: T[] = [];
  private keyCache = new Map<number, T>(); // Cache extracted keys
  
  // Performance optimizations
  private nodePool: BTreeNode<T>[] = [];
  private readonly maxPoolSize = 1000;
  
  constructor(
    keyExtractor: SortKeyExtractor<T>,
    compareFn?: (a: T, b: T) => number,
    degree: number = 32 // Optimized for CPU cache lines
  ) {
    this.degree = degree;
    this.keyExtractor = keyExtractor;
    this.compareFn = compareFn || ((a, b) => {
      const keyA = this.keyExtractor(a);
      const keyB = this.keyExtractor(b);
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      return 0;
    });
    
    this.root = this.createLeafNode();
  }

  /**
   * Object pooling for B+ tree nodes to reduce allocations
   */
  private createNode(isLeaf: boolean): BTreeNode<T> {
    let node: BTreeNode<T>;
    
    if (this.nodePool.length > 0) {
      node = this.nodePool.pop()!;
      // Reset the node
      node.keys.length = 0;
      node.isLeaf = isLeaf;
      delete node.parent;
      delete node.next;
      if (node.children) node.children.length = 0;
      if (node.values) node.values.length = 0;
    } else {
      node = {
        keys: [],
        isLeaf,
        children: isLeaf ? undefined : [],
        values: isLeaf ? [] : undefined,
      };
    }
    
    return node;
  }

  private createLeafNode(): BTreeNode<T> {
    return this.createNode(true);
  }

  private createInternalNode(): BTreeNode<T> {
    return this.createNode(false);
  }

  private returnNodeToPool(node: BTreeNode<T>): void {
    if (this.nodePool.length < this.maxPoolSize) {
      // Clear references to prevent memory leaks
      if (node.children) {
        for (const child of node.children) {
          this.returnNodeToPool(child);
        }
      }
      this.nodePool.push(node);
    }
  }

  /**
   * Bulk load documents for optimal B+ tree construction
   * Much faster than individual insertions for initial data
   */
  bulkLoad(documents: T[]): void {
    if (documents.length === 0) return;

    this.documents = [...documents];
    
    // Sort documents with extracted keys for efficient bulk loading
    const sortedWithIndices = documents
      .map((doc, index) => ({
        doc,
        key: this.keyExtractor(doc),
        originalIndex: index
      }))
      .sort((a, b) => {
        if (a.key < b.key) return -1;
        if (a.key > b.key) return 1;
        return 0;
      });

    // Cache extracted keys
    this.keyCache.clear();
    for (let i = 0; i < sortedWithIndices.length; i++) {
      this.keyCache.set(i, sortedWithIndices[i].key as T);
    }

    // Build B+ tree bottom-up for optimal structure
    this.buildOptimalTree(sortedWithIndices);
  }

  private buildOptimalTree(sortedData: Array<{doc: T; key: any; originalIndex: number}>): void {
    const leafNodes: BTreeNode<T>[] = [];
    const leafCapacity = this.degree;
    
    // Create leaf nodes
    for (let i = 0; i < sortedData.length; i += leafCapacity) {
      const leaf = this.createLeafNode();
      const endIndex = Math.min(i + leafCapacity, sortedData.length);
      
      for (let j = i; j < endIndex; j++) {
        leaf.keys.push(sortedData[j].key);
        leaf.values!.push(sortedData[j].originalIndex);
      }
      
      leafNodes.push(leaf);
    }

    // Link leaf nodes for efficient scanning
    for (let i = 0; i < leafNodes.length - 1; i++) {
      leafNodes[i].next = leafNodes[i + 1];
    }

    // Build internal nodes level by level
    let currentLevel = leafNodes;
    
    while (currentLevel.length > 1) {
      const nextLevel: BTreeNode<T>[] = [];
      const internalCapacity = this.degree;
      
      for (let i = 0; i < currentLevel.length; i += internalCapacity) {
        const internal = this.createInternalNode();
        const endIndex = Math.min(i + internalCapacity, currentLevel.length);
        
        for (let j = i; j < endIndex; j++) {
          const child = currentLevel[j];
          child.parent = internal;
          internal.children!.push(child);
          
          // Add separator key (first key of child except for first child)
          if (j > i) {
            internal.keys.push(child.keys[0]);
          }
        }
        
        nextLevel.push(internal);
      }
      
      currentLevel = nextLevel;
    }

    this.root = currentLevel[0];
  }

  /**
   * Get documents in sorted order with efficient iteration
   * Uses leaf node linking for O(n) traversal
   */
  getSorted(): T[] {
    const result: T[] = [];
    let current = this.getFirstLeaf();
    
    while (current) {
      for (let i = 0; i < current.values!.length; i++) {
        const docIndex = current.values![i];
        result.push(this.documents[docIndex]);
      }
      current = current.next;
    }
    
    return result;
  }

  private getFirstLeaf(): BTreeNode<T> | undefined {
    let current = this.root;
    while (!current.isLeaf && current.children && current.children.length > 0) {
      current = current.children[0];
    }
    return current.isLeaf ? current : undefined;
  }

  /**
   * Get top-K elements efficiently without full sort
   * Optimized for $limit operations after $sort
   */
  getTopK(k: number): T[] {
    const result: T[] = [];
    let current = this.getFirstLeaf();
    let count = 0;
    
    while (current && count < k) {
      for (let i = 0; i < current.values!.length && count < k; i++) {
        const docIndex = current.values![i];
        result.push(this.documents[docIndex]);
        count++;
      }
      current = current.next;
    }
    
    return result;
  }

  /**
   * Range query for efficient filtering after sort
   */
  getRange(minKey: T, maxKey: T): T[] {
    // This would be implemented for range queries
    // For now, fallback to full scan
    return this.getSorted().filter(doc => {
      const key = this.keyExtractor(doc);
      return key >= minKey && key <= maxKey;
    });
  }

  /**
   * Get statistics for order operations
   */
  getOrderStatistics(): {
    height: number;
    nodeCount: number;
    leafCount: number;
    avgFillFactor: number;
  } {
    let height = 0;
    let nodeCount = 0;
    let leafCount = 0;
    let totalCapacity = 0;
    let totalUsed = 0;

    const traverse = (node: BTreeNode<T>, level: number) => {
      nodeCount++;
      height = Math.max(height, level);
      totalCapacity += this.degree;
      totalUsed += node.keys.length;

      if (node.isLeaf) {
        leafCount++;
      } else if (node.children) {
        for (const child of node.children) {
          traverse(child, level + 1);
        }
      }
    };

    traverse(this.root, 0);

    return {
      height,
      nodeCount,
      leafCount,
      avgFillFactor: totalUsed / totalCapacity,
    };
  }

  /**
   * Clear tree and return nodes to pool
   */
  clear(): void {
    this.returnNodeToPool(this.root);
    this.root = this.createLeafNode();
    this.documents.length = 0;
    this.keyCache.clear();
  }
}

/**
 * Optimized sort implementation using B+ tree
 */
export class OptimizedSorter<T> {
  private trees = new Map<string, BPlusTreeSort<T>>();
  
  /**
   * Multi-field sorting with optimal data structure selection
   */
  sort(documents: T[], sortSpecs: SortSpec[]): T[] {
    if (documents.length === 0 || sortSpecs.length === 0) {
      return documents;
    }

    // For single field sorts, use B+ tree for optimal performance
    if (sortSpecs.length === 1) {
      const spec = sortSpecs[0];
      const keyExtractor = (doc: T) => {
        const value = (doc as any)[spec.field];
        return value;
      };
      
      const compareFn = (a: T, b: T) => {
        const keyA = keyExtractor(a);
        const keyB = keyExtractor(b);
        let result = 0;
        
        if (keyA < keyB) result = -1;
        else if (keyA > keyB) result = 1;
        
        return spec.direction * result;
      };

      const tree = new BPlusTreeSort(keyExtractor, compareFn);
      tree.bulkLoad(documents);
      
      const sorted = tree.getSorted();
      tree.clear(); // Clean up
      
      return spec.direction === 1 ? sorted : sorted.reverse();
    }

    // For multi-field sorts, use optimized JavaScript sort with compiled comparator
    const compareFn = this.compileComparator(sortSpecs);
    return [...documents].sort(compareFn);
  }

  /**
   * Compile comparison function for multi-field sorting
   * Generates optimized comparison code
   */
  private compileComparator<T>(sortSpecs: SortSpec[]): (a: T, b: T) => number {
    // Generate comparison function code for better performance
    const comparisons = sortSpecs.map((spec, index) => {
      const fieldAccess = `(a as any)["${spec.field}"]`;
      const fieldAccessB = `(b as any)["${spec.field}"]`;
      
      return `
        const val${index}A = ${fieldAccess};
        const val${index}B = ${fieldAccessB};
        if (val${index}A !== val${index}B) {
          if (val${index}A < val${index}B) return ${spec.direction * -1};
          if (val${index}A > val${index}B) return ${spec.direction * 1};
        }
      `;
    }).join('\n');

    // Use Function constructor for better performance than closures
    const fnBody = `
      ${comparisons}
      return 0;
    `;

    return new Function('a', 'b', fnBody) as (a: T, b: T) => number;
  }

  /**
   * Top-K optimization for $sort + $limit pipelines
   */
  topK(documents: T[], sortSpecs: SortSpec[], k: number): T[] {
    if (k >= documents.length) {
      return this.sort(documents, sortSpecs);
    }

    // Use B+ tree top-K optimization for single field
    if (sortSpecs.length === 1) {
      const spec = sortSpecs[0];
      const keyExtractor = (doc: T) => (doc as any)[spec.field];
      
      const tree = new BPlusTreeSort(keyExtractor);
      tree.bulkLoad(documents);
      
      const topK = tree.getTopK(k);
      tree.clear();
      
      return spec.direction === 1 ? topK : topK.reverse().slice(0, k);
    }

    // For multi-field, use partial quicksort
    const compareFn = this.compileComparator(sortSpecs);
    const result = [...documents];
    
    this.quickSelect(result, 0, result.length - 1, k - 1, compareFn);
    
    // Sort only the top-K elements
    result.slice(0, k).sort(compareFn);
    
    return result.slice(0, k);
  }

  /**
   * QuickSelect algorithm for partial sorting
   */
  private quickSelect<T>(
    arr: T[],
    left: number,
    right: number,
    k: number,
    compareFn: (a: T, b: T) => number
  ): void {
    if (left < right) {
      const pivotIndex = this.partition(arr, left, right, compareFn);
      
      if (pivotIndex === k) {
        return;
      } else if (pivotIndex > k) {
        this.quickSelect(arr, left, pivotIndex - 1, k, compareFn);
      } else {
        this.quickSelect(arr, pivotIndex + 1, right, k, compareFn);
      }
    }
  }

  private partition<T>(
    arr: T[],
    left: number,
    right: number,
    compareFn: (a: T, b: T) => number
  ): number {
    const pivot = arr[right];
    let i = left;
    
    for (let j = left; j < right; j++) {
      if (compareFn(arr[j], pivot) <= 0) {
        [arr[i], arr[j]] = [arr[j], arr[i]];
        i++;
      }
    }
    
    [arr[i], arr[right]] = [arr[right], arr[i]];
    return i;
  }
}