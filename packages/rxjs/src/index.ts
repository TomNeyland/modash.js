/**
 * @aggo/rxjs - RxJS integration for aggo.js
 * 
 * Provides Observable-based aggregation pipelines for reactive programming
 * with Angular, React with RxJS, and other frontend frameworks.
 */

import { Observable, map, scan, distinctUntilChanged } from 'rxjs';
import type { Document, Pipeline, Collection } from 'aggo';

// Re-export types for convenience
export type { Document, Pipeline, Collection } from 'aggo';

/**
 * Configuration options for reactive aggregation
 */
export interface ReactiveAggregationOptions {
  /**
   * Whether to emit incremental results on each document
   * @default false
   */
  incremental?: boolean;
  
  /**
   * Debounce time in milliseconds for batching updates
   * @default 0
   */
  debounceMs?: number;
  
  /**
   * Maximum batch size for processing
   * @default 1000
   */
  batchSize?: number;
  
  /**
   * Whether to emit distinct results only
   * @default true
   */
  distinctOnly?: boolean;
}

/**
 * Transforms an Observable stream of documents through a aggo aggregation pipeline
 * 
 * @param source$ - Observable stream of documents or document arrays
 * @param pipeline - Aggo aggregation pipeline
 * @param options - Configuration options
 * @returns Observable of aggregated results
 * 
 * @example
 * ```typescript
 * import { from } from 'rxjs';
 * import { aggregate } from '@aggo/rxjs';
 * 
 * const documents$ = from([
 *   { name: 'Alice', age: 30, city: 'Seattle' },
 *   { name: 'Bob', age: 25, city: 'Portland' }
 * ]);
 * 
 * const results$ = aggregate(documents$, [
 *   { $match: { age: { $gte: 25 } } },
 *   { $project: { name: 1, age: 1 } }
 * ]);
 * 
 * results$.subscribe(result => console.log(result));
 * ```
 */
export function aggregate<T extends Document = Document>(
  source$: Observable<T | T[]>,
  pipeline: Pipeline,
  options: ReactiveAggregationOptions = {}
): Observable<Collection<T>> {
  const { incremental = false, distinctOnly = true } = options;
  
  let accumulatedDocs: T[] = [];
  
  const aggregated$ = source$.pipe(
    map((input: T | T[]) => {
      // Handle both single documents and arrays
      const docs = Array.isArray(input) ? input : [input];
      
      if (incremental) {
        // Add new documents to accumulator and process incrementally
        accumulatedDocs = [...accumulatedDocs, ...docs];
        return processWithAggo(accumulatedDocs, pipeline);
      } else {
        // Process only the current batch
        return processWithAggo(docs, pipeline);
      }
    })
  );
  
  if (distinctOnly) {
    return aggregated$.pipe(
      distinctUntilChanged((prev, curr) => 
        JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }
  
  return aggregated$;
}

/**
 * Creates a streaming aggregation Observable that accumulates documents over time
 * 
 * @param source$ - Observable stream of individual documents
 * @param pipeline - Aggo aggregation pipeline
 * @param options - Configuration options
 * @returns Observable of accumulated aggregation results
 * 
 * @example
 * ```typescript
 * import { interval, map } from 'rxjs';
 * import { streamingAggregate } from '@aggo/rxjs';
 * 
 * const documentStream$ = interval(1000).pipe(
 *   map(i => ({ id: i, value: Math.random() * 100 }))
 * );
 * 
 * const results$ = streamingAggregate(documentStream$, [
 *   { $group: { _id: null, avgValue: { $avg: '$value' }, count: { $sum: 1 } } }
 * ]);
 * 
 * results$.subscribe(result => console.log('Current stats:', result));
 * ```
 */
export function streamingAggregate<T extends Document = Document>(
  source$: Observable<T>,
  pipeline: Pipeline,
  options: ReactiveAggregationOptions = {}
): Observable<Collection<T>> {
  const { batchSize = 1000 } = options;
  
  return source$.pipe(
    scan((acc: T[], doc: T) => {
      const newAcc = [...acc, doc];
      // Limit accumulator size to prevent memory issues
      if (newAcc.length > batchSize) {
        return newAcc.slice(-batchSize);
      }
      return newAcc;
    }, []),
    map((docs: T[]) => processWithAggo(docs, pipeline)),
    distinctUntilChanged((prev, curr) => 
      JSON.stringify(prev) === JSON.stringify(curr)
    )
  );
}

/**
 * Transforms an Observable of collections through a aggo pipeline
 * Useful for batch processing scenarios where you receive arrays of documents
 * 
 * @param collections$ - Observable stream of document collections  
 * @param pipeline - Aggo aggregation pipeline
 * @param options - Configuration options
 * @returns Observable of processed collections
 * 
 * @example
 * ```typescript
 * import { of } from 'rxjs';
 * import { aggregateCollections } from '@aggo/rxjs';
 * 
 * const batches$ = of(
 *   [{ category: 'A', value: 10 }, { category: 'B', value: 20 }],
 *   [{ category: 'A', value: 15 }, { category: 'B', value: 25 }]
 * );
 * 
 * const results$ = aggregateCollections(batches$, [
 *   { $group: { _id: '$category', total: { $sum: '$value' } } }
 * ]);
 * ```
 */
export function aggregateCollections<T extends Document = Document>(
  collections$: Observable<Collection<T>>,
  pipeline: Pipeline,
  options: ReactiveAggregationOptions = {}
): Observable<Collection<T>> {
  const { distinctOnly = true } = options;
  
  const processed$ = collections$.pipe(
    map((collection: Collection<T>) => processWithAggo(collection, pipeline))
  );
  
  if (distinctOnly) {
    return processed$.pipe(
      distinctUntilChanged((prev, curr) => 
        JSON.stringify(prev) === JSON.stringify(curr)
      )
    );
  }
  
  return processed$;
}

/**
 * Creates an Observable that emits aggregation results whenever the source data changes
 * Useful for reactive dashboards and real-time analytics
 * 
 * @param source$ - Observable of document collections
 * @param pipeline - Aggo aggregation pipeline  
 * @returns Observable of aggregation results with change detection
 * 
 * @example
 * ```typescript
 * import { BehaviorSubject } from 'rxjs';
 * import { reactiveAggregation } from '@aggo/rxjs';
 * 
 * const dataSubject = new BehaviorSubject([
 *   { product: 'laptop', sales: 100 },
 *   { product: 'mouse', sales: 50 }
 * ]);
 * 
 * const salesSummary$ = reactiveAggregation(dataSubject, [
 *   { $group: { _id: null, totalSales: { $sum: '$sales' } } }
 * ]);
 * 
 * // Add more data dynamically
 * setTimeout(() => {
 *   dataSubject.next([
 *     ...dataSubject.value,
 *     { product: 'keyboard', sales: 75 }
 *   ]);
 * }, 2000);
 * ```
 */
export function reactiveAggregation<T extends Document = Document>(
  source$: Observable<Collection<T>>,
  pipeline: Pipeline
): Observable<Collection<T>> {
  return source$.pipe(
    map((collection: Collection<T>) => processWithAggo(collection, pipeline)),
    distinctUntilChanged((prev, curr) => 
      JSON.stringify(prev) === JSON.stringify(curr)
    )
  );
}

/**
 * Helper function to process documents with aggo
 * This function dynamically imports aggo to avoid bundling it as a hard dependency
 */
function processWithAggo<T extends Document = Document>(
  collection: Collection<T>, 
  pipeline: Pipeline
): Collection<T> {
  try {
    // Dynamic import to avoid bundling aggo when not needed
    // In real usage, this would be: import('aggo').then(...)
    // For now, we'll assume aggo is available in the environment
    if (typeof globalThis !== 'undefined' && (globalThis as any).Aggo) {
      return (globalThis as any).Aggo.aggregate(collection, pipeline);
    }
    
    // Fallback error if aggo is not available
    throw new Error('Aggo is not available. Make sure to install aggo as a peer dependency.');
  } catch (error) {
    throw new Error(`Failed to process aggregation pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Utility function to check if aggo is properly installed and accessible
 * @returns boolean indicating if aggo is available
 */
export function isAggoAvailable(): boolean {
  try {
    return typeof globalThis !== 'undefined' && (globalThis as any).Aggo !== undefined;
  } catch {
    return false;
  }
}

// Type-only re-exports for better TypeScript experience
export type {
  ReactiveAggregationOptions,
};