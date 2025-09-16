/**
 * Pipeline Execution Engine - Executes raw MongoDB pipeline JSON strings
 * 
 * Features:
 * - Accepts raw MongoDB pipeline JSON strings (no allowlist)
 * - Passes directly to aggo executor
 * - Error handling and inline error panels
 * - Streaming support with windowing configuration
 * - Performance metrics tracking
 */

import { type Document, type Pipeline } from 'aggo';
import type { WindowingConfig } from '../plan.zod.js';

export interface PipelineExecutionResult {
  success: boolean;
  results?: Document[];
  error?: {
    type: 'parse' | 'execution' | 'validation';
    message: string;
    stage?: number;
    details?: any;
  };
  performance?: {
    parseMs: number;
    executionMs: number;
    totalMs: number;
    inputCount: number;
    outputCount: number;
  };
}

export interface StreamingExecutionOptions {
  windowing?: WindowingConfig;
  onUpdate?: (results: Document[]) => void;
  onError?: (error: any) => void;
}

/**
 * Execute a raw MongoDB pipeline JSON string against data
 */
export async function executePipelineString(
  pipelineJson: string,
  data: Document[],
  options: StreamingExecutionOptions = {}
): Promise<PipelineExecutionResult> {
  const startTime = Date.now();
  let pipeline: Pipeline;
  
  try {
    // Step 1: Parse the pipeline JSON string
    const parseStart = Date.now();
    pipeline = JSON.parse(pipelineJson);
    
    // Validate it's an array
    if (!Array.isArray(pipeline)) {
      return {
        success: false,
        error: {
          type: 'validation',
          message: 'Pipeline must be a JSON array of aggregation stages',
          details: { received: typeof pipeline }
        }
      };
    }
    
    const parseMs = Date.now() - parseStart;
    
    // Step 2: Execute with aggo
    const executionStart = Date.now();
    const Aggo = await import('aggo');
    
    let results: Document[];
    
    if (options.windowing?.mode === 'u') {
      // Unbounded/streaming mode
      results = await executeStreamingPipeline(
        pipeline,
        data,
        options.windowing,
        options.onUpdate
      );
    } else {
      // Bounded mode - standard execution
      results = Aggo.default.aggregate(data, pipeline);
    }
    
    const executionMs = Date.now() - executionStart;
    const totalMs = Date.now() - startTime;
    
    return {
      success: true,
      results,
      performance: {
        parseMs,
        executionMs,
        totalMs,
        inputCount: data.length,
        outputCount: results.length
      }
    };
    
  } catch (error) {
    const totalMs = Date.now() - startTime;
    
    // Determine error type
    let errorType: 'parse' | 'execution' | 'validation' = 'execution';
    let stage: number | undefined;
    let message = 'Unknown error';
    
    if (error instanceof SyntaxError) {
      errorType = 'parse';
      message = `Invalid JSON: ${error.message}`;
    } else if (error instanceof Error) {
      message = error.message;
      
      // Try to extract stage information from aggo errors
      const stageMatch = message.match(/stage (\d+)/i);
      if (stageMatch) {
        stage = parseInt(stageMatch[1], 10);
      }
    }
    
    return {
      success: false,
      error: {
        type: errorType,
        message,
        stage,
        details: error
      },
      performance: {
        parseMs: 0,
        executionMs: 0,
        totalMs,
        inputCount: data.length,
        outputCount: 0
      }
    };
  }
}

/**
 * Execute pipeline in streaming mode with periodic updates
 */
async function executeStreamingPipeline(
  pipeline: Pipeline,
  data: Document[],
  windowing: WindowingConfig,
  onUpdate?: (results: Document[]) => void
): Promise<Document[]> {
  const Aggo = await import('aggo');
  
  // For now, implement simple batched execution
  // In a full implementation, this would use aggo's streaming capabilities
  const emitMs = windowing.emitMs || 100;
  const maxDocs = windowing.maxDocs;
  
  let processedData = data;
  if (maxDocs && processedData.length > maxDocs) {
    processedData = processedData.slice(0, maxDocs);
  }
  
  // Simulate streaming by processing in chunks
  const chunkSize = Math.max(100, Math.floor(processedData.length / 10));
  let allResults: Document[] = [];
  
  for (let i = 0; i < processedData.length; i += chunkSize) {
    const chunk = processedData.slice(0, i + chunkSize);
    const chunkResults = Aggo.default.aggregate(chunk, pipeline);
    
    allResults = chunkResults; // Replace with latest results
    
    if (onUpdate) {
      onUpdate(allResults);
    }
    
    // Wait for next emit interval
    if (i + chunkSize < processedData.length) {
      await new Promise(resolve => setTimeout(resolve, emitMs));
    }
  }
  
  return allResults;
}

/**
 * Attempt to fix common JSON parsing errors
 */
export function attemptJsonFix(jsonString: string): string {
  let fixed = jsonString.trim();
  
  // Common fixes
  if (!fixed.startsWith('[')) {
    fixed = '[' + fixed;
  }
  
  if (!fixed.endsWith(']')) {
    fixed = fixed + ']';
  }
  
  // Fix missing commas between objects
  fixed = fixed.replace(/}\s*{/g, '}, {');
  
  // Fix trailing commas
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  return fixed;
}

/**
 * Validate pipeline structure without executing
 */
export function validatePipelineStructure(pipeline: any[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!Array.isArray(pipeline)) {
    errors.push('Pipeline must be an array');
    return { valid: false, errors };
  }
  
  if (pipeline.length === 0) {
    errors.push('Pipeline cannot be empty');
    return { valid: false, errors };
  }
  
  pipeline.forEach((stage, index) => {
    if (typeof stage !== 'object' || stage === null) {
      errors.push(`Stage ${index + 1}: must be an object`);
      return;
    }
    
    const stageKeys = Object.keys(stage);
    if (stageKeys.length !== 1) {
      errors.push(`Stage ${index + 1}: must have exactly one stage operator`);
      return;
    }
    
    const stageType = stageKeys[0];
    if (!stageType.startsWith('$')) {
      errors.push(`Stage ${index + 1}: stage operator must start with $ (got: ${stageType})`);
    }
  });
  
  return { valid: errors.length === 0, errors };
}