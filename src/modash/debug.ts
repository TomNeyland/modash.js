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

  const wrapped = Object.create(operator);
  const original = {
    onAdd: operator.onAdd.bind(operator),
    onRemove: operator.onRemove.bind(operator),
  };

  let addCount = 0;
  let removeCount = 0;
  let dropCount = 0;

  wrapped.onAdd = function (...args: any[]) {
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

  wrapped.onRemove = function (...args: any[]) {
    const result = original.onRemove(...args);
    removeCount++;

    if (DEBUG && removeCount <= 5) {
      console.log(`[${name}] REMOVE:`, args[0], '→', result);
    }

    return result;
  };

  // Add stats getter
  (wrapped as any).getStats = () => ({
    name,
    adds: addCount,
    removes: removeCount,
    drops: dropCount,
  });

  return wrapped;
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