/**
 * Top-K Heap Implementation for Sort + Limit Optimization
 * Optimizes queries that sort and then limit results (top-K pattern)
 * Target: 2x+ speedup for sort+limit operations
 */

interface HeapItem {
  document: any;
  sortKeys: any[];
}

export class TopKHeap {
  private heap: HeapItem[] = [];
  private maxSize: number;
  private sortSpec: any;
  private isMaxHeap: boolean;

  constructor(maxSize: number, sortSpec: any) {
    this.maxSize = maxSize;
    this.sortSpec = sortSpec;
    // For descending sort (score: -1), use min heap to keep largest K values
    // For ascending sort (score: 1), use max heap to keep smallest K values
    const firstSortDirection = Object.values(sortSpec)[0] as number;
    this.isMaxHeap = firstSortDirection === 1;
  }

  /**
   * Add document to heap, maintaining top-K constraint
   */
  add(document: any): void {
    const sortKeys = this.extractSortKeys(document);
    const item: HeapItem = { document, sortKeys };

    if (this.heap.length < this.maxSize) {
      this.heap.push(item);
      this.heapifyUp(this.heap.length - 1);
    } else {
      // Compare with root (worst item in heap)
      const comparison = this.compare(item, this.heap[0]);
      
      // For descending sort (-1): we want to keep highest values, so replace if new item > heap root
      // For ascending sort (1): we want to keep lowest values, so replace if new item < heap root
      const shouldReplace = this.isMaxHeap ? comparison < 0 : comparison > 0;
      
      if (shouldReplace) {
        this.heap[0] = item;
        this.heapifyDown(0);
      }
    }
  }

  /**
   * Get sorted top-K results
   */
  getResults(): any[] {
    // Sort heap contents to get final order - use the original sort spec
    const sorted = [...this.heap].sort((a, b) => this.compare(a, b));
    return sorted.map(item => item.document);
  }

  /**
   * Check if top-K optimization should be used
   * Only optimize if we have $sort followed by $limit
   */
  static shouldOptimize(pipeline: any[]): { optimize: boolean; sortIndex: number; limitIndex: number; limitValue: number } | null {
    for (let i = 0; i < pipeline.length - 1; i++) {
      const currentStage = pipeline[i];
      const nextStage = pipeline[i + 1];
      
      if (currentStage.$sort && nextStage.$limit) {
        // Check if this is a reasonable top-K scenario (limit < 1000)
        if (typeof nextStage.$limit === 'number' && nextStage.$limit < 1000) {
          return {
            optimize: true,
            sortIndex: i,
            limitIndex: i + 1,
            limitValue: nextStage.$limit
          };
        }
      }
    }
    
    return null;
  }

  private extractSortKeys(document: any): any[] {
    const keys: any[] = [];
    
    for (const field of Object.keys(this.sortSpec)) {
      const value = this.getFieldValue(document, field);
      keys.push(value);
    }
    
    return keys;
  }

  private compare(a: HeapItem, b: HeapItem): number {
    for (let i = 0; i < a.sortKeys.length; i++) {
      const aVal = a.sortKeys[i];
      const bVal = b.sortKeys[i];
      const field = Object.keys(this.sortSpec)[i];
      const direction = this.sortSpec[field];
      
      let comparison = 0;
      
      // Handle null/undefined values
      if (aVal == null && bVal == null) {
        comparison = 0;
      } else if (aVal == null) {
        comparison = -1;
      } else if (bVal == null) {
        comparison = 1;
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else {
        // Convert to string for comparison
        const aStr = String(aVal);
        const bStr = String(bVal);
        comparison = aStr.localeCompare(bStr);
      }
      
      if (comparison !== 0) {
        return direction === 1 ? comparison : -comparison;
      }
    }
    
    return 0;
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const shouldSwap = this.isMaxHeap ? 
        this.compare(this.heap[index], this.heap[parentIndex]) > 0 :
        this.compare(this.heap[index], this.heap[parentIndex]) < 0;
      
      if (!shouldSwap) break;
      
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private heapifyDown(index: number): void {
    while (true) {
      let extremeIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      
      if (leftChild < this.heap.length) {
        const shouldPreferLeft = this.isMaxHeap ?
          this.compare(this.heap[leftChild], this.heap[extremeIndex]) > 0 :
          this.compare(this.heap[leftChild], this.heap[extremeIndex]) < 0;
        
        if (shouldPreferLeft) {
          extremeIndex = leftChild;
        }
      }
      
      if (rightChild < this.heap.length) {
        const shouldPreferRight = this.isMaxHeap ?
          this.compare(this.heap[rightChild], this.heap[extremeIndex]) > 0 :
          this.compare(this.heap[rightChild], this.heap[extremeIndex]) < 0;
        
        if (shouldPreferRight) {
          extremeIndex = rightChild;
        }
      }
      
      if (extremeIndex === index) break;
      
      this.swap(index, extremeIndex);
      index = extremeIndex;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  private getFieldValue(doc: any, field: string): any {
    const parts = field.split('.');
    let value = doc;
    
    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value[part];
    }
    
    return value;
  }
}

/**
 * Apply top-K heap optimization to pipeline
 * Returns optimized result or null if optimization not applicable
 */
export function applyTopKOptimization(
  data: any[], 
  pipeline: any[]
): any[] | null {
  const optimization = TopKHeap.shouldOptimize(pipeline);
  
  if (!optimization) {
    return null;
  }

  console.log('TopK: Optimization details:', optimization);

  const { sortIndex, limitIndex, limitValue } = optimization;
  const sortSpec = pipeline[sortIndex].$sort;
  
  console.log('TopK: Sort spec:', sortSpec, 'Limit:', limitValue);
  
  // Apply stages before sort normally
  let workingData = data;
  for (let i = 0; i < sortIndex; i++) {
    const stage = pipeline[i];
    if (stage.$match) {
      workingData = applyMatchStage(workingData, stage.$match);
    } else if (stage.$project) {
      workingData = applyProjectStage(workingData, stage.$project);
    }
    // Add other stage processing as needed
  }
  
  console.log('TopK: Working data length:', workingData.length);
  
  // Use heap to find top-K
  const heap = new TopKHeap(limitValue, sortSpec);
  
  for (const doc of workingData) {
    heap.add(doc);
  }
  
  let results = heap.getResults();
  
  console.log('TopK: Heap results:', results.map(r => ({ name: r.name, score: r.score })));
  
  // Apply stages after limit
  for (let i = limitIndex + 1; i < pipeline.length; i++) {
    const stage = pipeline[i];
    if (stage.$project) {
      results = applyProjectStage(results, stage.$project);
    } else if (stage.$match) {
      results = applyMatchStage(results, stage.$match);
    }
    // Add other stage processing as needed
  }
  
  return results;
}

function applyMatchStage(data: any[], matchSpec: any): any[] {
  return data.filter(doc => {
    for (const [field, condition] of Object.entries(matchSpec)) {
      const value = getFieldValue(doc, field);
      
      if (!matchesCondition(value, condition)) {
        return false;
      }
    }
    return true;
  });
}

function applyProjectStage(data: any[], projectSpec: any): any[] {
  return data.map(doc => {
    const result: any = {};
    
    for (const [field, include] of Object.entries(projectSpec)) {
      if (include) {
        result[field] = getFieldValue(doc, field);
      }
    }
    
    return result;
  });
}

function matchesCondition(value: any, condition: any): boolean {
  if (typeof condition !== 'object' || condition === null) {
    return value === condition;
  }
  
  for (const [operator, operand] of Object.entries(condition)) {
    switch (operator) {
      case '$eq':
        if (value !== operand) return false;
        break;
      case '$ne':
        if (value === operand) return false;
        break;
      case '$gt':
        if (value <= operand) return false;
        break;
      case '$gte':
        if (value < operand) return false;
        break;
      case '$lt':
        if (value >= operand) return false;
        break;
      case '$lte':
        if (value > operand) return false;
        break;
      case '$in':
        if (!Array.isArray(operand) || !operand.includes(value)) return false;
        break;
      case '$nin':
        if (!Array.isArray(operand) || operand.includes(value)) return false;
        break;
      default:
        return false;
    }
  }
  
  return true;
}

function getFieldValue(doc: any, field: string): any {
  const parts = field.split('.');
  let value = doc;
  
  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[part];
  }
  
  return value;
}