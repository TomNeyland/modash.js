/**
 * Minimal debug infrastructure for IVM fallback diagnosis
 */

export const DEBUG = process.env.DEBUG_IVM === 'true' || process.env.NODE_ENV === 'test';

// Fallback tracking
let fallbackCount = 0;
const fallbackErrors: Array<{ pipeline: any; error: string; stack?: string }> = [];

export function resetFallbackTracking(): void {
  fallbackCount = 0;
  fallbackErrors.length = 0;
}

export function recordFallback(pipeline: any, error: Error | string): void {
  fallbackCount++;
  fallbackErrors.push({
    pipeline,
    error: typeof error === 'string' ? error : error.message,
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export function getFallbackCount(): number {
  return fallbackCount;
}

export function getFallbackErrors(): typeof fallbackErrors {
  return [...fallbackErrors];
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
export function wrapOperatorSnapshot<T extends { snapshot: Function; type: string }>(
  operator: T,
  debug = DEBUG
): T {
  if (!debug) return operator;

  const originalSnapshot = operator.snapshot.bind(operator);

  operator.snapshot = function(store: any, context: any) {
    try {
      const result = originalSnapshot(store, context);

      // Check if result is unexpected (e.g., wrong document structure)
      if (result && Array.isArray(result) && result.length > 0) {
        const firstDoc = result[0];

        // For GroupOperator, check if we're returning raw documents instead of groups
        if (operator.type === '$group' && firstDoc && typeof firstDoc._id !== 'undefined') {
          // Check if this looks like a raw document instead of a group result
          const hasGroupFields = firstDoc.hasOwnProperty('_id') &&
                                 !firstDoc.hasOwnProperty('category') &&
                                 !firstDoc.hasOwnProperty('item');
          if (!hasGroupFields) {
            console.warn(`[${operator.type}] FALLBACK DETECTED: Returning raw documents instead of grouped results`);
            recordFallback({ type: operator.type }, 'GroupOperator returning raw documents');
          }
        }

        // For SortOperator after GroupOperator, check if groups are lost
        if (operator.type === '$sort' && context?.stageIndex > 0) {
          const prevStage = context.pipeline?.[context.stageIndex - 1];
          if (prevStage && Object.keys(prevStage)[0] === '$group') {
            // Check if we have raw documents instead of group results
            if (firstDoc && !firstDoc.hasOwnProperty('_id') && firstDoc.hasOwnProperty('category')) {
              console.warn(`[${operator.type}] FALLBACK DETECTED: Lost group results after $sort`);
              recordFallback({ type: operator.type }, 'Lost group results after sort');
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error(`[${operator.type}] FALLBACK DETECTED: snapshot() threw error:`, error);
      recordFallback({ type: operator.type }, error as Error);
      throw error;
    }
  };

  return operator;
}

/**
 * Log pipeline execution for debugging
 */
export function logPipelineExecution(stage: string, message: string, data?: any): void {
  if (!DEBUG) return;

  const prefix = `[IVM:${stage}]`;
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}