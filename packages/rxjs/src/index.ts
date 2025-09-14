/**
 * @modash/rxjs - RxJS integration for modash.js
 * 
 * Provides Observable-based aggregation pipelines for reactive programming
 * with Angular, React with RxJS, and other frontend frameworks.
 */

import { Observable, map, scan, distinctUntilChanged } from 'rxjs';
import type { Document, Pipeline, Collection } from 'modash';

// Re-export types for convenience
export type { Document, Pipeline, Collection } from 'modash';

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
 * Transforms an Observable stream of documents through a modash aggregation pipeline
 * 
 * @param source$ - Observable stream of documents or document arrays
 * @param pipeline - Modash aggregation pipeline
 * @param options - Configuration options
 * @returns Observable of aggregated results
 * 
 * @example
 * ```typescript
 * import { from } from 'rxjs';
 * import { aggregate } from '@modash/rxjs';
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
        return processWithModash(accumulatedDocs, pipeline);
      } else {
        // Process only the current batch
        return processWithModash(docs, pipeline);
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
 * @param pipeline - Modash aggregation pipeline
 * @param options - Configuration options
 * @returns Observable of accumulated aggregation results
 * 
 * @example
 * ```typescript
 * import { interval, map } from 'rxjs';
 * import { streamingAggregate } from '@modash/rxjs';
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
    map((docs: T[]) => processWithModash(docs, pipeline)),
    distinctUntilChanged((prev, curr) => 
      JSON.stringify(prev) === JSON.stringify(curr)
    )
  );
}

/**
 * Transforms an Observable of collections through a modash pipeline
 * Useful for batch processing scenarios where you receive arrays of documents
 * 
 * @param collections$ - Observable stream of document collections  
 * @param pipeline - Modash aggregation pipeline
 * @param options - Configuration options
 * @returns Observable of processed collections
 * 
 * @example
 * ```typescript
 * import { of } from 'rxjs';
 * import { aggregateCollections } from '@modash/rxjs';
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
    map((collection: Collection<T>) => processWithModash(collection, pipeline))
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
 * @param pipeline - Modash aggregation pipeline  
 * @returns Observable of aggregation results with change detection
 * 
 * @example
 * ```typescript
 * import { BehaviorSubject } from 'rxjs';
 * import { reactiveAggregation } from '@modash/rxjs';
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
    map((collection: Collection<T>) => processWithModash(collection, pipeline)),
    distinctUntilChanged((prev, curr) => 
      JSON.stringify(prev) === JSON.stringify(curr)
    )
  );
}

/**
 * Helper function to process documents with modash
 * This function dynamically imports modash to avoid bundling it as a hard dependency
 */
function processWithModash<T extends Document = Document>(
  collection: Collection<T>, 
  pipeline: Pipeline
): Collection<T> {
  try {
    // Dynamic import to avoid bundling modash when not needed
    // In real usage, this would be: import('modash').then(...)
    // For now, we'll assume modash is available in the environment
    if (typeof globalThis !== 'undefined' && (globalThis as any).Modash) {
      return (globalThis as any).Modash.aggregate(collection, pipeline);
    }
    
    // Fallback error if modash is not available
    throw new Error('Modash is not available. Make sure to install modash as a peer dependency.');
  } catch (error) {
    throw new Error(`Failed to process aggregation pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Utility function to check if modash is properly installed and accessible
 * @returns boolean indicating if modash is available
 */
export function isModashAvailable(): boolean {
  try {
    return typeof globalThis !== 'undefined' && (globalThis as any).Modash !== undefined;
  } catch {
    return false;
  }
}

// Type-only re-exports for better TypeScript experience
export type {
  ReactiveAggregationOptions,
};