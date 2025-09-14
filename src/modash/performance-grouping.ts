/**
 * High-performance grouping implementation for modash.js
 * 
 * Key optimizations:
 * 1. Robin Hood hash table with open addressing
 * 2. Structure of Arrays (SoA) for accumulators
 * 3. Pre-sized hash tables with cardinality estimation
 * 4. Specialized accumulator implementations
 * 5. Efficient key hashing and comparison
 */

import type { Document, DocumentValue, Collection } from './expressions.js';
import type { Expression } from '../index.js';
import { compileExpression, type CompiledExpression, type CompilationContext } from './performance-compiler.js';
import { perfCounters } from '../../benchmarks/operators.js';

// Hash function constants
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Fast FNV-1a hash function for grouping keys
 */
function fnvHash(key: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0; // Convert to unsigned 32-bit
}

/**
 * Robin Hood hash table entry
 */
interface HashEntry {
  key: string;
  keyHash: number;
  groupIndex: number;
  distance: number; // Distance from ideal position (for Robin Hood)
}

/**
 * Structure of Arrays (SoA) accumulator storage for better cache locality
 */
interface AccumulatorArrays {
  // Common accumulators
  count: Uint32Array;
  sum: Float64Array;
  
  // For average calculation
  sumSquares: Float64Array; // For potential variance calculations
  
  // For min/max (using separate arrays for better performance)
  min: Float64Array;
  max: Float64Array;
  
  // For first/last
  first: any[];
  last: any[];
  
  // For push/addToSet (sparse - only allocated when needed)
  arrays?: Map<number, any[]>;
  sets?: Map<number, Set<any>>;
  
  // Size tracking
  capacity: number;
  size: number;
}

/**
 * High-performance hash table with Robin Hood hashing
 */
class RobinHoodHashTable {
  private entries: (HashEntry | null)[];
  private capacity: number;
  private size: number;
  private maxDistance: number;
  
  constructor(initialCapacity: number = 16) {
    // Ensure power of 2 for fast modulo
    this.capacity = Math.pow(2, Math.ceil(Math.log2(initialCapacity)));
    this.entries = new Array(this.capacity).fill(null);
    this.size = 0;
    this.maxDistance = 0;
  }
  
  private getIdealPosition(hash: number): number {
    return hash & (this.capacity - 1); // Fast modulo for power of 2
  }
  
  private needsResize(): boolean {
    return this.size >= this.capacity * 0.75 || this.maxDistance > 8;
  }
  
  private resize(): void {
    const oldEntries = this.entries;
    const oldCapacity = this.capacity;
    
    this.capacity *= 2;
    this.entries = new Array(this.capacity).fill(null);
    this.size = 0;
    this.maxDistance = 0;
    
    // Rehash all entries
    for (let i = 0; i < oldCapacity; i++) {
      const entry = oldEntries[i];
      if (entry !== null) {
        this.insertWithoutResize(entry.key, entry.keyHash, entry.groupIndex);
      }
    }
    
    perfCounters.recordAllocation(this.capacity * 8); // Rough size estimate
  }
  
  private insertWithoutResize(key: string, keyHash: number, groupIndex: number): void {
    let position = this.getIdealPosition(keyHash);
    let distance = 0;
    let entry: HashEntry = { key, keyHash, groupIndex, distance };
    
    while (this.entries[position] !== null) {
      const existing = this.entries[position]!;
      
      if (existing.keyHash === keyHash && existing.key === key) {
        // Key already exists, update group index
        existing.groupIndex = groupIndex;
        return;
      }
      
      // Robin Hood: if existing entry is closer to its ideal position, swap
      if (distance > existing.distance) {
        const temp = existing;
        this.entries[position] = entry;
        entry = temp;
        distance = existing.distance;
      }
      
      distance++;
      position = (position + 1) & (this.capacity - 1);
    }
    
    entry.distance = distance;
    this.entries[position] = entry;
    this.size++;
    this.maxDistance = Math.max(this.maxDistance, distance);
  }
  
  insert(key: string, groupIndex: number): void {
    if (this.needsResize()) {
      this.resize();
    }
    
    const keyHash = fnvHash(key);
    this.insertWithoutResize(key, keyHash, groupIndex);
  }
  
  get(key: string): number | null {
    const keyHash = fnvHash(key);
    let position = this.getIdealPosition(keyHash);
    let distance = 0;
    
    while (this.entries[position] !== null && distance <= this.maxDistance) {
      const entry = this.entries[position]!;
      
      if (entry.keyHash === keyHash && entry.key === key) {
        perfCounters.recordCacheHit();
        return entry.groupIndex;
      }
      
      distance++;
      position = (position + 1) & (this.capacity - 1);
    }
    
    perfCounters.recordCacheMiss();
    return null;
  }
  
  getLoadFactor(): number {
    return this.size / this.capacity;
  }
  
  getAverageProbeLength(): number {
    let totalDistance = 0;
    let count = 0;
    
    for (const entry of this.entries) {
      if (entry !== null) {
        totalDistance += entry.distance;
        count++;
      }
    }
    
    return count > 0 ? totalDistance / count : 0;
  }
}

/**
 * Cardinality estimator for pre-sizing hash tables
 */
function estimateCardinality(collection: Collection, idExpression: CompiledExpression): number {
  const sampleSize = Math.min(100, collection.length);
  const seenKeys = new Set<string>();
  
  // Sample documents to estimate cardinality
  const step = Math.max(1, Math.floor(collection.length / sampleSize));
  
  for (let i = 0; i < collection.length; i += step) {
    const doc = collection[i]!;
    const key = JSON.stringify(idExpression(doc, i));
    seenKeys.add(key);
    
    if (seenKeys.size >= sampleSize) break;
  }
  
  // Estimate total cardinality
  const observedCardinality = seenKeys.size;
  const sampledFraction = sampleSize / collection.length;
  
  return Math.ceil(observedCardinality / sampledFraction);
}

/**
 * Accumulator type enumeration for optimized dispatch
 */
enum AccumulatorType {
  COUNT = 1,
  SUM = 2,
  AVG = 3,
  MIN = 4,
  MAX = 5,
  FIRST = 6,
  LAST = 7,
  PUSH = 8,
  ADD_TO_SET = 9,
}

/**
 * Compiled accumulator function for performance
 */
interface CompiledAccumulator {
  type: AccumulatorType;
  expression?: CompiledExpression;
  fieldName: string;
}

/**
 * Compile accumulator expressions into optimized functions
 */
function compileAccumulator(fieldName: string, spec: Expression, ctx: CompilationContext): CompiledAccumulator {
  if (typeof spec === 'object' && spec !== null && !Array.isArray(spec)) {
    const [operator] = Object.keys(spec);
    const args = spec[operator as keyof typeof spec];
    
    switch (operator) {
      case '$sum':
        if (args === 1) {
          return { type: AccumulatorType.COUNT, fieldName };
        } else {
          const expression = compileExpression(args as Expression, ctx);
          return { type: AccumulatorType.SUM, expression, fieldName };
        }
        
      case '$avg':
        const avgExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.AVG, expression: avgExpression, fieldName };
        
      case '$min':
        const minExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.MIN, expression: minExpression, fieldName };
        
      case '$max':
        const maxExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.MAX, expression: maxExpression, fieldName };
        
      case '$first':
        const firstExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.FIRST, expression: firstExpression, fieldName };
        
      case '$last':
        const lastExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.LAST, expression: lastExpression, fieldName };
        
      case '$push':
        const pushExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.PUSH, expression: pushExpression, fieldName };
        
      case '$addToSet':
        const setExpression = compileExpression(args as Expression, ctx);
        return { type: AccumulatorType.ADD_TO_SET, expression: setExpression, fieldName };
        
      default:
        throw new Error(`Unsupported accumulator: ${operator}`);
    }
  }
  
  throw new Error('Invalid accumulator specification');
}

/**
 * High-performance group operation implementation
 */
export function performanceGroup(
  collection: Collection,
  groupSpec: { _id: Expression; [key: string]: Expression },
  ctx: CompilationContext
): Collection {
  
  if (collection.length === 0) {
    return [];
  }
  
  // Compile the _id expression
  const idExpression = groupSpec._id ? compileExpression(groupSpec._id, ctx) : () => null;
  
  // Estimate cardinality for optimal hash table sizing
  const estimatedCardinality = estimateCardinality(collection, idExpression);
  const initialCapacity = Math.max(16, estimatedCardinality * 1.5);
  
  // Initialize hash table and accumulator arrays
  const hashTable = new RobinHoodHashTable(initialCapacity);
  const accumulators: AccumulatorArrays = {
    count: new Uint32Array(initialCapacity),
    sum: new Float64Array(initialCapacity),
    sumSquares: new Float64Array(initialCapacity),
    min: new Float64Array(initialCapacity).fill(Infinity),
    max: new Float64Array(initialCapacity).fill(-Infinity),
    first: new Array(initialCapacity).fill(null),
    last: new Array(initialCapacity).fill(null),
    capacity: initialCapacity,
    size: 0,
  };
  
  // Compile accumulator functions
  const compiledAccumulators: CompiledAccumulator[] = [];
  for (const [fieldName, fieldSpec] of Object.entries(groupSpec)) {
    if (fieldName === '_id') continue;
    
    try {
      const compiledAcc = compileAccumulator(fieldName, fieldSpec, ctx);
      compiledAccumulators.push(compiledAcc);
    } catch (error) {
      perfCounters.recordFallback();
      throw error;
    }
  }
  
  // Process documents and build groups
  let nextGroupIndex = 0;
  const groupKeys: string[] = [];
  const groupIds: DocumentValue[] = [];
  
  for (let i = 0; i < collection.length; i++) {
    const doc = collection[i]!;
    perfCounters.recordAdd();
    
    // Evaluate group key
    const idValue = idExpression(doc, i);
    const key = JSON.stringify(idValue);
    
    // Find or create group
    let groupIndex = hashTable.get(key);
    if (groupIndex === null) {
      groupIndex = nextGroupIndex++;
      hashTable.insert(key, groupIndex);
      groupKeys[groupIndex] = key;
      groupIds[groupIndex] = idValue;
      accumulators.size = Math.max(accumulators.size, groupIndex + 1);
      
      // Resize accumulator arrays if needed
      if (groupIndex >= accumulators.capacity) {
        const newCapacity = accumulators.capacity * 2;
        const resizeArray = (arr: any) => {
          const newArr = new (arr.constructor)(newCapacity);
          newArr.set(arr);
          if (arr === accumulators.min) {
            newArr.fill(Infinity, accumulators.capacity);
          } else if (arr === accumulators.max) {
            newArr.fill(-Infinity, accumulators.capacity);
          }
          return newArr;
        };
        
        accumulators.count = resizeArray(accumulators.count);
        accumulators.sum = resizeArray(accumulators.sum);
        accumulators.sumSquares = resizeArray(accumulators.sumSquares);
        accumulators.min = resizeArray(accumulators.min);
        accumulators.max = resizeArray(accumulators.max);
        accumulators.first.length = newCapacity;
        accumulators.last.length = newCapacity;
        accumulators.capacity = newCapacity;
        
        perfCounters.recordAllocation(newCapacity * 8); // Rough size estimate
      }
    }
    
    // Update accumulators
    for (const accumulator of compiledAccumulators) {
      const value = accumulator.expression ? accumulator.expression(doc, i) : null;
      
      switch (accumulator.type) {
        case AccumulatorType.COUNT:
          accumulators.count[groupIndex]++;
          break;
          
        case AccumulatorType.SUM:
          if (typeof value === 'number' && !isNaN(value)) {
            accumulators.sum[groupIndex] += value;
          }
          break;
          
        case AccumulatorType.AVG:
          if (typeof value === 'number' && !isNaN(value)) {
            accumulators.sum[groupIndex] += value;
            accumulators.count[groupIndex]++;
          }
          break;
          
        case AccumulatorType.MIN:
          if (typeof value === 'number' && !isNaN(value)) {
            accumulators.min[groupIndex] = Math.min(accumulators.min[groupIndex], value);
          }
          break;
          
        case AccumulatorType.MAX:
          if (typeof value === 'number' && !isNaN(value)) {
            accumulators.max[groupIndex] = Math.max(accumulators.max[groupIndex], value);
          }
          break;
          
        case AccumulatorType.FIRST:
          if (accumulators.first[groupIndex] === null) {
            accumulators.first[groupIndex] = value;
          }
          break;
          
        case AccumulatorType.LAST:
          accumulators.last[groupIndex] = value;
          break;
          
        case AccumulatorType.PUSH:
          if (!accumulators.arrays) {
            accumulators.arrays = new Map();
          }
          if (!accumulators.arrays.has(groupIndex)) {
            accumulators.arrays.set(groupIndex, []);
          }
          accumulators.arrays.get(groupIndex)!.push(value);
          break;
          
        case AccumulatorType.ADD_TO_SET:
          if (!accumulators.sets) {
            accumulators.sets = new Map();
          }
          if (!accumulators.sets.has(groupIndex)) {
            accumulators.sets.set(groupIndex, new Set());
          }
          accumulators.sets.get(groupIndex)!.add(value);
          break;
      }
    }
  }
  
  // Build result documents
  const results: Document[] = [];
  for (let groupIndex = 0; groupIndex < accumulators.size; groupIndex++) {
    const result: Record<string, DocumentValue> = {
      _id: groupIds[groupIndex],
    };
    
    for (const accumulator of compiledAccumulators) {
      switch (accumulator.type) {
        case AccumulatorType.COUNT:
          result[accumulator.fieldName] = accumulators.count[groupIndex];
          break;
          
        case AccumulatorType.SUM:
          result[accumulator.fieldName] = accumulators.sum[groupIndex];
          break;
          
        case AccumulatorType.AVG:
          const count = accumulators.count[groupIndex];
          result[accumulator.fieldName] = count > 0 ? accumulators.sum[groupIndex] / count : 0;
          break;
          
        case AccumulatorType.MIN:
          const minVal = accumulators.min[groupIndex];
          result[accumulator.fieldName] = minVal === Infinity ? null : minVal;
          break;
          
        case AccumulatorType.MAX:
          const maxVal = accumulators.max[groupIndex];
          result[accumulator.fieldName] = maxVal === -Infinity ? null : maxVal;
          break;
          
        case AccumulatorType.FIRST:
          result[accumulator.fieldName] = accumulators.first[groupIndex];
          break;
          
        case AccumulatorType.LAST:
          result[accumulator.fieldName] = accumulators.last[groupIndex];
          break;
          
        case AccumulatorType.PUSH:
          result[accumulator.fieldName] = accumulators.arrays?.get(groupIndex) || [];
          break;
          
        case AccumulatorType.ADD_TO_SET:
          const setValues = accumulators.sets?.get(groupIndex);
          result[accumulator.fieldName] = setValues ? Array.from(setValues) : [];
          break;
      }
    }
    
    results.push(result as Document);
  }
  
  // Record performance metrics
  perfCounters.hashTableLoadFactor = hashTable.getLoadFactor();
  perfCounters.averageProbeLength = hashTable.getAverageProbeLength();
  
  return results;
}