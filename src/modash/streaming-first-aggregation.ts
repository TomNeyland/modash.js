/**
 * Streaming-First Aggregation Engine
 *
 * Implements the new streaming-first execution model:
 * 1. Default to IVM/streaming engine for all pipelines
 * 2. Explicit fallback only for unsupported operators
 * 3. Clear DEBUG_IVM logging when fallback occurs
 */

import { ZeroAllocEngine } from './zero-alloc-engine';
import { standardEngineCompat } from './standard-engine-compat';
import { requiresStandardEngine, DEBUG, logPipelineExecution } from './debug';
import type { Collection, Document } from './expressions';
import type { Pipeline } from '../index';

/**
 * Singleton streaming engine (IVM/zero-allocation)
 */
const streamingEngine = new ZeroAllocEngine();

/**
 * Performance counters for streaming-first model
 */
interface StreamingFirstCounters {
  streamingSuccesses: number;
  standardFallbacks: number;
  totalOperations: number;
  streamingThroughput: number;
  standardThroughput: number;
}

const counters: StreamingFirstCounters = {
  streamingSuccesses: 0,
  standardFallbacks: 0,
  totalOperations: 0,
  streamingThroughput: 0,
  standardThroughput: 0,
};

/**
 * Streaming-first aggregation function
 *
 * This is the new default aggregation that prioritizes the streaming engine
 * and only falls back to standard aggregation for explicitly unsupported operators.
 */
export function streamingFirstAggregate<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline
): Collection<T> {
  counters.totalOperations++;

  // Handle null/undefined collections gracefully
  if (!collection || !Array.isArray(collection)) {
    return [];
  }

  // Validate pipeline is an array
  if (!Array.isArray(pipeline)) {
    if (DEBUG) {
      logPipelineExecution(
        'STREAMING_FIRST',
        `❌ Pipeline validation failed: not an array (${typeof pipeline})`,
        { pipeline }
      );
    }
    // Try standard engine as last resort
    counters.standardFallbacks++;
    return standardEngineCompat(
      collection as any,
      pipeline as any,
      `Pipeline is not an array: ${typeof pipeline}`
    ) as Collection<T>;
  }

  const startTime = Date.now();
  let result: Collection<T>;

  // Check if pipeline contains operators that fundamentally require standard engine
  const standardRequired = requiresStandardEngine(pipeline);

  if (standardRequired.required) {
    // Explicit fallback to standard engine with clear reason
    if (DEBUG) {
      logPipelineExecution(
        'STREAMING_FIRST',
        `🔄 Explicit standard engine fallback: ${standardRequired.reason}`,
        {
          pipeline,
          stage: standardRequired.stage,
        }
      );
    }

    counters.standardFallbacks++;
    result = standardEngineCompat(
      collection as any,
      pipeline as any,
      standardRequired.reason!,
      standardRequired.stage
    ) as Collection<T>;

    const duration = Date.now() - startTime;
    counters.standardThroughput =
      (collection.length / Math.max(duration, 1)) * 1000;
  } else {
    // Try streaming engine first (default path)
    try {
      if (DEBUG) {
        logPipelineExecution(
          'STREAMING_FIRST',
          `🚀 Using streaming engine (default path)`,
          {
            pipelineLength: pipeline.length,
            stages: pipeline.map(s => Object.keys(s)[0]),
          }
        );
      }

      result = streamingEngine.execute(collection, pipeline) as Collection<T>;

      // Only increment success counter if execution actually succeeded
      counters.streamingSuccesses++;

      const duration = Date.now() - startTime;
      counters.streamingThroughput =
        (collection.length / Math.max(duration, 1)) * 1000;
    } catch (error) {
      // Fallback to standard engine if streaming fails
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (DEBUG) {
        logPipelineExecution(
          'STREAMING_FIRST',
          `🔄 Streaming engine failed, fallback to standard: ${errorMessage}`,
          {
            pipeline,
            error: errorMessage,
          }
        );
      }

      counters.standardFallbacks++;
      result = standardEngineCompat(
        collection as any,
        pipeline as any,
        `Streaming engine execution failed: ${errorMessage}`
      ) as Collection<T>;

      const duration = Date.now() - startTime;
      counters.standardThroughput =
        (collection.length / Math.max(duration, 1)) * 1000;
    }
  }

  return result;
}

/**
 * Get performance statistics for streaming-first model
 */
export function getStreamingFirstStats(): StreamingFirstCounters & {
  streamingSuccessRate: number;
  standardFallbackRate: number;
} {
  const streamingSuccessRate =
    counters.totalOperations > 0
      ? (counters.streamingSuccesses / counters.totalOperations) * 100
      : 0;

  const standardFallbackRate =
    counters.totalOperations > 0
      ? (counters.standardFallbacks / counters.totalOperations) * 100
      : 0;

  return {
    ...counters,
    streamingSuccessRate,
    standardFallbackRate,
  };
}

/**
 * Reset performance counters
 */
export function resetStreamingFirstStats(): void {
  counters.streamingSuccesses = 0;
  counters.standardFallbacks = 0;
  counters.totalOperations = 0;
  counters.streamingThroughput = 0;
  counters.standardThroughput = 0;
}

/**
 * Clear streaming engine caches
 */
export function clearStreamingFirstCache(): void {
  streamingEngine.clearCache();
}

export default streamingFirstAggregate;
