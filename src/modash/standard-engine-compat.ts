/**
 * Standard Aggregation Engine Compatibility Shim
 *
 * Minimal wrapper around the original standard aggregation engine.
 * Used only for explicit fallback cases where streaming engine cannot handle
 * operators that break IVM invariants or require side effects.
 *
 * Supported fallback cases:
 * - Advanced $lookup with let/pipeline
 * - $function (arbitrary JS execution)
 * - $where (arbitrary JS execution)
 * - $merge (side-effect stage)
 * - $out (side-effect stage)
 */

import { aggregate as originalAggregate } from './aggregation';
import { recordStandardEngineFallback } from './debug';
import type { Collection, Document } from './expressions';
import type { Pipeline } from '../index';

/**
 * Minimal standard aggregation engine for compatibility
 *
 * This function serves as a shim around the original aggregation engine,
 * providing explicit logging and tracking when fallback occurs.
 */
export function standardEngineCompat<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline,
  fallbackReason: string,
  stage?: { index: number; type: string }
): Collection<T> {
  // Record the fallback for tracking and debugging
  recordStandardEngineFallback(pipeline, fallbackReason, stage);

  // Execute using original standard aggregation engine
  return originalAggregate(collection as any, pipeline as any) as Collection<T>;
}

export default standardEngineCompat;
