import {
  aggregate as originalAggregate,
  $project,
  $group,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
} from './aggregation';
import { count } from './count';
import { $expression } from './expressions';
import type {
  Document as PublicDocument,
  Collection as PublicCollection,
  ModashStatic,
  Pipeline,
} from '../index';
import { createStreamingCollection, StreamingCollection } from './streaming';
import { hotPathAggregate } from './hot-path-aggregation';
import { explain, benchmark, fromJSONL } from './api-enhancements';

/**
 * Detect if a pipeline is a simple read-only operation that doesn't benefit from streaming overhead
 * Optimized for minimal overhead - uses fast checks first
 */
function isSimpleReadOnlyPipeline(pipeline: Pipeline): boolean {
  // Fast path: Empty pipeline
  if (!pipeline || !Array.isArray(pipeline) || pipeline.length === 0) {
    return true;
  }

  // Fast path: Single stage pipelines that are read-only  
  if (pipeline.length === 1) {
    const stage = pipeline[0];
    if (!stage || typeof stage !== 'object') return false;
    const stageType = Object.keys(stage)[0];
    
    // Simple filters, projections, sorts, limits, skips are read-only
    return stageType === '$match' || stageType === '$project' || 
           stageType === '$sort' || stageType === '$limit' || stageType === '$skip';
  }

  // Multiple stages but all read-only (no $group which creates incremental value)
  if (pipeline.length <= 3) {
    for (let i = 0; i < pipeline.length; i++) {
      const stage = pipeline[i];
      if (!stage || typeof stage !== 'object') return false;
      const stageType = Object.keys(stage)[0];
      if (stageType !== '$match' && stageType !== '$project' && 
          stageType !== '$sort' && stageType !== '$limit' && stageType !== '$skip') {
        return false;
      }
    }
    return true;
  }

  // Longer pipelines or complex operations should use streaming for potential incremental benefits
  return false;
}

/**
 * Create an optimized streaming collection with minimal overhead for simple operations
 */
function createOptimizedStreamingCollection<T extends PublicDocument = PublicDocument>(
  initialData: PublicCollection<T>
): StreamingCollection<T> {
  // Use lightweight mode for small datasets, memory-conscious mode for large datasets
  const isLargeDataset = Array.isArray(initialData) && initialData.length > 1000;
  
  return createStreamingCollection(initialData, { 
    lightweight: true,
    memoryConscious: isLargeDataset
  });
}

/**
 * High-performance aggregation function with hot path optimization
 */
const optimizedAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T>,
  pipeline: Pipeline
): PublicCollection<T> => {
  // D) Pipeline Input Validation - Check pipeline before routing to hot path
  if (!Array.isArray(pipeline)) {
    // Let the underlying aggregate handle single stages and invalid inputs
    return originalAggregate(collection as any, pipeline as any) as any;
  }

  // Route to hot path for maximum performance
  return hotPathAggregate(
    collection as any,
    pipeline
  ) as unknown as PublicCollection<T>;
};

/**
 * Optimized streaming aggregation function that intelligently chooses
 * between fast path and full streaming based on operation complexity
 * Minimal overhead design for maximum performance
 */
const streamingDefaultAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): PublicCollection<T> => {
  // Fast path: For existing streaming collections, always use streaming path
  if (collection instanceof StreamingCollection) {
    return collection.stream(pipeline) as unknown as PublicCollection<T>;
  }

  // Fast path: Simple read-only operations use hot path with minimal overhead
  // This check is optimized to be very fast for the common case
  if (isSimpleReadOnlyPipeline(pipeline)) {
    // Use hot path for simple operations - much faster than streaming overhead
    return hotPathAggregate(
      collection as any,
      pipeline
    ) as unknown as PublicCollection<T>;
  }

  // Slower path: For complex operations, use optimized streaming collection
  const streamingCollection = createOptimizedStreamingCollection(collection);
  return streamingCollection.stream(pipeline) as unknown as PublicCollection<T>;
};

/**
 * Legacy transparent aggregation function for backward compatibility
 * Uses hot path optimization for regular arrays, streaming for StreamingCollection
 */
const transparentAggregate = <T extends PublicDocument = PublicDocument>(
  collection: PublicCollection<T> | StreamingCollection<T>,
  pipeline: Pipeline
): PublicCollection<T> => {
  // For regular collections, use hot path optimization
  if (!(collection instanceof StreamingCollection)) {
    return optimizedAggregate(
      collection as any,
      pipeline
    ) as PublicCollection<T>;
  }

  // For streaming collections, use streaming path
  return collection.stream(pipeline) as unknown as PublicCollection<T>;
};

/**
 * Modern MongoDB-inspired aggregation library for TypeScript.
 *
 * Provides a clean, elegant API for processing JavaScript arrays using
 * MongoDB aggregation pipeline syntax and operators.
 *
 * Now uses streaming by default - all aggregations automatically 
 * create and use StreamingCollection internally for consistent behavior.
 */
const Modash: ModashStatic = {
  aggregate: streamingDefaultAggregate,
  aggregateStreaming: (collection: any, pipeline: Pipeline) =>
    streamingDefaultAggregate(collection as any, pipeline) as any,
  count,
  $expression,
  $group,
  $project,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
  // Streaming methods for advanced users
  createStreamingCollection,
  // Phase 6: Enhanced DX APIs
  explain,
  benchmark,
  fromJSONL,
};

export default Modash;
export {
  // Export the original aggregate for backwards compatibility if needed
  originalAggregate as aggregateOriginal,
  // Export the old transparent aggregate for comparison benchmarks
  transparentAggregate as aggregateTransparent,
  // Export the new streaming default as the main aggregate
  streamingDefaultAggregate as aggregate,
  count,
  $expression,
  $group,
  $project,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
  // Phase 6: Enhanced DX APIs
  explain,
  benchmark,
  fromJSONL,
};

// Re-export basic types for convenience from the public surface
export type { Collection, Document, QueryExpression } from '../index';

// Re-export streaming capabilities
export { StreamingCollection, createStreamingCollection } from './streaming';

// Re-export streaming types
export type { StreamingEvents, AggregationState } from './streaming';

// Re-export complex types from main index for convenience
export type { Pipeline, ModashStatic } from '../index';
