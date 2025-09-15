/**
 * Minimal debug infrastructure for IVM fallback diagnosis
 * Phase 3.5: Enhanced with text and regex prefiltering metrics
 */

export const DEBUG =
  process.env.DEBUG_IVM === '1' || 
  process.env.DEBUG_IVM === 'true' || 
  process.env.NODE_ENV === 'test';

// Fallback tracking
let fallbackCount = 0;
interface FallbackError {
  pipeline: any;
  error: string;
  stack?: string;
  timestamp?: string;
  code?: string;
  details?: any;
  reason?: string;
  stageIndex?: number;
  stageType?: string;
}
const fallbackErrors: FallbackError[] = [];

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
  meta?: { code?: string; details?: any; reason?: string; stageIndex?: number; stageType?: string }
): void {
  fallbackCount++;
  const payload: any = {
    pipeline,
    error: typeof error === 'string' ? error : error.message,
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  };
  if (meta && (meta.code || meta.details)) {
    payload.code = meta.code;
    payload.details = meta.details;
    payload.reason = meta.reason;
    payload.stageIndex = meta.stageIndex;
    payload.stageType = meta.stageType;
  }
  fallbackErrors.push(payload);
  
  // Always log fallback to standard engine when DEBUG_IVM is enabled
  if (DEBUG) {
    console.warn(`🚨 FALLBACK TO STANDARD ENGINE: ${payload.reason || payload.error}`);
    if (meta?.stageType && meta?.stageIndex !== undefined) {
      console.warn(`   Stage: ${meta.stageType} at index ${meta.stageIndex}`);
    }
    console.warn(`   Pipeline: ${JSON.stringify(pipeline.slice(0, 3))}${pipeline.length > 3 ? '...' : ''}`);
  }
}

export function getFallbackCount(): number {
  return fallbackCount;
}

export function getFallbackErrors(): FallbackError[] {
  return [...fallbackErrors];
}

/**
 * Generate comprehensive fallback analysis report
 */
export function generateFallbackAnalysis(): {
  totalFallbacks: number;
  fallbacksByReason: Map<string, number>;
  fallbacksByStageType: Map<string, number>;
  recentFallbacks: Array<{
    timestamp: string;
    reason: string;
    stageType?: string;
    stageIndex?: number;
    pipelineLength: number;
  }>;
  unsupportedOperators: Set<string>;
} {
  const fallbacksByReason = new Map<string, number>();
  const fallbacksByStageType = new Map<string, number>();
  const unsupportedOperators = new Set<string>();
  const recentFallbacks: Array<{
    timestamp: string;
    reason: string;
    stageType?: string;
    stageIndex?: number;
    pipelineLength: number;
  }> = [];

  for (const error of fallbackErrors) {
    const reason = error.reason || error.error || 'Unknown';
    fallbacksByReason.set(reason, (fallbacksByReason.get(reason) || 0) + 1);
    
    if (error.stageType) {
      fallbacksByStageType.set(error.stageType, (fallbacksByStageType.get(error.stageType) || 0) + 1);
      
      // Track operators that consistently cause fallbacks
      if (reason.includes('not supported') || reason.includes('unsupported')) {
        unsupportedOperators.add(error.stageType);
      }
    }
    
    const recentFallback: any = {
      timestamp: error.timestamp || 'Unknown',
      reason,
      pipelineLength: error.pipeline?.length || 0,
    };
    if (error.stageType) recentFallback.stageType = error.stageType;
    if (error.stageIndex !== undefined) recentFallback.stageIndex = error.stageIndex;
    
    recentFallbacks.push(recentFallback);
  }

  // Keep only recent fallbacks (last 20)
  recentFallbacks.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  recentFallbacks.splice(20);

  return {
    totalFallbacks: fallbackCount,
    fallbacksByReason,
    fallbacksByStageType,
    recentFallbacks,
    unsupportedOperators,
  };
}

/**
 * Print detailed fallback analysis to console
 */
export function printFallbackAnalysis(): void {
  const analysis = generateFallbackAnalysis();
  
  console.log('\n📊 STREAMING-FIRST EXECUTION ANALYSIS');
  console.log('=====================================');
  console.log(`Total fallbacks to standard engine: ${analysis.totalFallbacks}`);
  
  if (analysis.totalFallbacks === 0) {
    console.log('✅ All pipelines successfully processed by streaming engine!');
    return;
  }
  
  console.log('\n🔍 Fallback Reasons:');
  const sortedReasons = Array.from(analysis.fallbacksByReason.entries())
    .sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sortedReasons) {
    console.log(`  ${reason}: ${count} occurrences`);
  }
  
  console.log('\n⚠️  Problem Stage Types:');
  const sortedStages = Array.from(analysis.fallbacksByStageType.entries())
    .sort((a, b) => b[1] - a[1]);
  for (const [stage, count] of sortedStages) {
    console.log(`  ${stage}: ${count} fallbacks`);
  }
  
  if (analysis.unsupportedOperators.size > 0) {
    console.log('\n🚫 Confirmed Unsupported Operators:');
    for (const op of analysis.unsupportedOperators) {
      console.log(`  ${op}`);
    }
  }
  
  console.log('\n📝 Recent Fallbacks:');
  for (const fallback of analysis.recentFallbacks.slice(0, 5)) {
    console.log(`  [${fallback.timestamp}] ${fallback.reason}`);
    if (fallback.stageType) {
      console.log(`    Stage: ${fallback.stageType} at index ${fallback.stageIndex}`);
    }
  }
  
  console.log('\n💡 Recommendations:');
  if (analysis.unsupportedOperators.has('$lookup')) {
    console.log('  - $lookup operations require standard engine (expected)');
  }
  if (analysis.fallbacksByReason.has('Complex $match not supported in hot path')) {
    console.log('  - Consider expanding streaming engine $match support');
  }
  if (analysis.fallbacksByReason.has('Complex $project with unsupported computed fields')) {
    console.log('  - Consider expanding streaming engine expression support');
  }
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
