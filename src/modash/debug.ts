/**
 * Minimal debug infrastructure for IVM fallback diagnosis
 * Phase 3.5: Enhanced with text and regex prefiltering metrics
 */

export const DEBUG =
  process.env.DEBUG_IVM === 'true' ||
  process.env.DEBUG_IVM === '1' ||
  process.env.NODE_ENV === 'test';

// Fallback tracking
let fallbackCount = 0;
const fallbackErrors: Array<{ pipeline: any; error: string; stack?: string }> =
  [];

// Phase 3.5: Text and regex prefiltering metrics
interface PrefilterMetrics {
  textSearchQueries: number;
  regexSearchQueries: number;
  bloomFilterHits: number;
  candidateReductions: number;
  averageReductionRate: number;
  falsePositiveRate: number;
}

let prefilterMetrics: PrefilterMetrics = {
  textSearchQueries: 0,
  regexSearchQueries: 0,
  bloomFilterHits: 0,
  candidateReductions: 0,
  averageReductionRate: 0,
  falsePositiveRate: 0,
};

export function resetFallbackTracking(): void {
  fallbackCount = 0;
  fallbackErrors.length = 0;
}

export function recordFallback(
  pipeline: any,
  error: Error | string,
  meta?: { code?: string; details?: any }
): void {
  fallbackCount++;
  const payload: any = {
    pipeline,
    error: typeof error === 'string' ? error : error.message,
    stack: error instanceof Error ? error.stack : undefined,
  };
  if (meta && (meta.code || meta.details)) {
    payload.code = meta.code;
    payload.details = meta.details;
  }
  fallbackErrors.push(payload);
}

/**
 * Record when pipeline falls back to standard aggregation engine
 * with clear reason for streaming-first execution model
 */
export function recordStandardEngineFallback(
  pipeline: any,
  reason: string,
  stage?: { index: number; type: string }
): void {
  fallbackCount++;

  const payload: any = {
    pipeline,
    error: `Standard engine fallback: ${reason}`,
    fallbackType: 'standard_engine',
    reason,
  };

  if (stage) {
    payload.stageIndex = stage.index;
    payload.stageType = stage.type;
  }

  fallbackErrors.push(payload);

  // Always log when DEBUG_IVM is enabled for explicit visibility
  if (
    DEBUG ||
    process.env.DEBUG_IVM === '1' ||
    process.env.DEBUG_IVM === 'true'
  ) {
    console.warn(`🔥 DEBUG_IVM: Standard aggregation fallback - ${reason}`);
    if (stage) {
      console.warn(`   → Stage ${stage.index}: ${stage.type}`);
    }
    console.warn(`   → Pipeline: ${JSON.stringify(pipeline)}`);
  }
}

/**
 * Check if pipeline contains operators that fundamentally require standard aggregation engine
 * These are operators that break IVM invariants or require side effects
 */
export function requiresStandardEngine(pipeline: any[]): {
  required: boolean;
  reason?: string;
  stage?: { index: number; type: string };
} {
  if (!Array.isArray(pipeline)) {
    return { required: false };
  }

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    const stageType = Object.keys(stage)[0];

    switch (stageType) {
      case '$lookup':
        // All $lookup operations require standard engine since streaming engine doesn't support them
        return {
          required: true,
          reason:
            '$lookup operations require standard aggregation engine (multi-collection joins)',
          stage: { index: i, type: stageType },
        };

      case '$function':
        return {
          required: true,
          reason:
            '$function operator requires standard aggregation engine (arbitrary JS execution)',
          stage: { index: i, type: stageType },
        };

      case '$where':
        return {
          required: true,
          reason:
            '$where operator requires standard aggregation engine (arbitrary JS execution)',
          stage: { index: i, type: stageType },
        };

      case '$merge':
        return {
          required: true,
          reason:
            '$merge operator requires standard aggregation engine (side-effect stage)',
          stage: { index: i, type: stageType },
        };

      case '$out':
        return {
          required: true,
          reason:
            '$out operator requires standard aggregation engine (side-effect stage)',
          stage: { index: i, type: stageType },
        };
    }
  }

  return { required: false };
}

export function getFallbackCount(): number {
  return fallbackCount;
}

export function getFallbackErrors(): typeof fallbackErrors {
  return [...fallbackErrors];
}

/**
 * Phase 3.5: Record text search prefiltering metrics
 */
export function recordTextSearchMetrics(
  candidatesBefore: number,
  candidatesAfter: number,
  actualMatches: number,
  prefilterUsed: boolean
): void {
  prefilterMetrics.textSearchQueries++;

  if (prefilterUsed) {
    prefilterMetrics.bloomFilterHits++;
    prefilterMetrics.candidateReductions += candidatesBefore - candidatesAfter;

    const reductionRate =
      candidatesBefore > 0
        ? (candidatesBefore - candidatesAfter) / candidatesBefore
        : 0;
    prefilterMetrics.averageReductionRate =
      (prefilterMetrics.averageReductionRate *
        (prefilterMetrics.bloomFilterHits - 1) +
        reductionRate) /
      prefilterMetrics.bloomFilterHits;

    if (candidatesAfter > actualMatches) {
      const fpRate = (candidatesAfter - actualMatches) / candidatesAfter;
      prefilterMetrics.falsePositiveRate =
        (prefilterMetrics.falsePositiveRate *
          (prefilterMetrics.bloomFilterHits - 1) +
          fpRate) /
        prefilterMetrics.bloomFilterHits;
    }
  }

  if (DEBUG) {
    console.log(
      `🔍 Text search: ${candidatesBefore} -> ${candidatesAfter} candidates, ${actualMatches} matches`
    );
    if (prefilterUsed) {
      console.log(
        `📊 Reduction: ${((1 - candidatesAfter / candidatesBefore) * 100).toFixed(1)}%`
      );
    }
  }
}

/**
 * Phase 3.5: Record regex search prefiltering metrics
 */
export function recordRegexSearchMetrics(
  candidatesBefore: number,
  candidatesAfter: number,
  actualMatches: number,
  prefilterUsed: boolean,
  pattern: string
): void {
  prefilterMetrics.regexSearchQueries++;

  if (prefilterUsed) {
    prefilterMetrics.bloomFilterHits++;
    prefilterMetrics.candidateReductions += candidatesBefore - candidatesAfter;

    const reductionRate =
      candidatesBefore > 0
        ? (candidatesBefore - candidatesAfter) / candidatesBefore
        : 0;
    prefilterMetrics.averageReductionRate =
      (prefilterMetrics.averageReductionRate *
        (prefilterMetrics.bloomFilterHits - 1) +
        reductionRate) /
      prefilterMetrics.bloomFilterHits;
  }

  if (DEBUG) {
    console.log(
      `🔍 Regex search "${pattern}": ${candidatesBefore} -> ${candidatesAfter} candidates, ${actualMatches} matches`
    );
    if (prefilterUsed) {
      console.log(
        `📊 Reduction: ${((1 - candidatesAfter / candidatesBefore) * 100).toFixed(1)}%`
      );
    } else {
      console.log(`⚠️  Prefilter skipped for pattern: "${pattern}"`);
    }
  }
}

/**
 * Phase 3.5: Get prefiltering statistics
 */
export function getPrefilterMetrics(): PrefilterMetrics {
  return { ...prefilterMetrics };
}

/**
 * Phase 3.5: Reset prefiltering metrics
 */
export function resetPrefilterMetrics(): void {
  prefilterMetrics = {
    textSearchQueries: 0,
    regexSearchQueries: 0,
    bloomFilterHits: 0,
    candidateReductions: 0,
    averageReductionRate: 0,
    falsePositiveRate: 0,
  };
}

/**
 * Phase 3.5: Log comprehensive performance summary
 */
export function logPerformanceSummary(): void {
  if (!DEBUG) return;

  console.log('\n📊 Phase 3.5 Performance Summary');
  console.log('═══════════════════════════════════');
  console.log(`🔍 Text searches: ${prefilterMetrics.textSearchQueries}`);
  console.log(`🔍 Regex searches: ${prefilterMetrics.regexSearchQueries}`);
  console.log(`⚡ Bloom filter hits: ${prefilterMetrics.bloomFilterHits}`);
  console.log(
    `📉 Total candidate reductions: ${prefilterMetrics.candidateReductions}`
  );
  console.log(
    `📊 Average reduction rate: ${(prefilterMetrics.averageReductionRate * 100).toFixed(1)}%`
  );
  console.log(
    `⚠️  False positive rate: ${(prefilterMetrics.falsePositiveRate * 100).toFixed(2)}%`
  );
  console.log(`❌ Fallbacks: ${fallbackCount}`);
  console.log('═══════════════════════════════════\n');
}

/**
 * Wrap an IVM operator to trace delta flow
 */
export function wrapOperator<T extends { onAdd: Function; onRemove: Function }>(
  name: string,
  operator: T,
  debug = DEBUG
): T {
  if (!debug) return operator;

  // Don't create a new object - just wrap the methods on the original
  const original = {
    onAdd: operator.onAdd.bind(operator),
    onRemove: operator.onRemove.bind(operator),
  };

  let addCount = 0;
  let removeCount = 0;
  let dropCount = 0;

  operator.onAdd = function (...args: any[]) {
    const result = original.onAdd(...args);
    addCount++;

    if (result === null || (Array.isArray(result) && result.length === 0)) {
      dropCount++;
      if (DEBUG && addCount <= 5) {
        console.log(`[${name}] ADD dropped delta:`, args[0]);
      }
    } else if (DEBUG && addCount <= 5) {
      console.log(`[${name}] ADD forwarded:`, args[0], '→', result);
    }

    return result;
  };

  operator.onRemove = function (...args: any[]) {
    const result = original.onRemove(...args);
    removeCount++;

    if (DEBUG && removeCount <= 5) {
      console.log(`[${name}] REMOVE:`, args[0], '→', result);
    }

    return result;
  };

  // Add stats getter
  (operator as any).getStats = () => ({
    name,
    adds: addCount,
    removes: removeCount,
    drops: dropCount,
  });

  return operator;
}

/**
 * Wrap an operator's snapshot method to detect fallbacks
 */
export function wrapOperatorSnapshot<
  T extends { snapshot: Function; type: string },
>(operator: T, debug = DEBUG): T {
  if (!debug) return operator;

  const originalSnapshot = operator.snapshot.bind(operator);

  operator.snapshot = function (store: any, context: any) {
    try {
      const result = originalSnapshot(store, context);

      // Check if result is unexpected (e.g., wrong document structure)
      if (result && Array.isArray(result) && result.length > 0) {
        const firstDoc = result[0];

        // For GroupOperator, check if we're returning raw documents instead of groups
        if (
          operator.type === '$group' &&
          firstDoc &&
          typeof firstDoc._id !== 'undefined'
        ) {
          // Check if this looks like a raw document instead of a group result
          const hasGroupFields =
            firstDoc.hasOwnProperty('_id') &&
            !firstDoc.hasOwnProperty('category') &&
            !firstDoc.hasOwnProperty('item');
          if (!hasGroupFields) {
            console.warn(
              `[${operator.type}] FALLBACK DETECTED: Returning raw documents instead of grouped results`
            );
            recordFallback(
              { type: operator.type },
              'GroupOperator returning raw documents'
            );
          }
        }

        // For SortOperator after GroupOperator, check if groups are lost
        if (operator.type === '$sort' && context?.stageIndex > 0) {
          const prevStage = context.pipeline?.[context.stageIndex - 1];
          if (prevStage && Object.keys(prevStage)[0] === '$group') {
            // Check if we have raw documents instead of group results
            if (
              firstDoc &&
              !firstDoc.hasOwnProperty('_id') &&
              firstDoc.hasOwnProperty('category')
            ) {
              console.warn(
                `[${operator.type}] FALLBACK DETECTED: Lost group results after $sort`
              );
              recordFallback(
                { type: operator.type },
                'Lost group results after sort'
              );
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error(
        `[${operator.type}] FALLBACK DETECTED: snapshot() threw error:`,
        error
      );
      recordFallback({ type: operator.type }, error as Error);
      throw error;
    }
  };

  return operator;
}

/**
 * Log pipeline execution for debugging
 */
export function logPipelineExecution(
  stage: string,
  message: string,
  data?: any
): void {
  if (!DEBUG) return;

  const prefix = `[IVM:${stage}]`;
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}
