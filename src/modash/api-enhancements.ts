/**
 * API enhancements for Phase 6 - Developer Experience improvements
 */

import type { Document, Collection } from './expressions';
import type { Pipeline } from '../index';
import { aggregate } from './index';
import { createInterface } from 'readline';

/**
 * Pipeline analysis result from explain()
 */
export interface PipelineExplanation {
  stages: StageExplanation[];
  optimizations: OptimizationInfo[];
  warnings: string[];
  estimatedComplexity: 'O(1)' | 'O(n)' | 'O(n log n)' | 'O(n²)';
  hotPathEligible: boolean;
  ivmEligible: boolean;
}

/**
 * Individual stage analysis
 */
export interface StageExplanation {
  stage: string;
  operation: string;
  complexity: string;
  description: string;
  canUseIndexes: boolean;
  memoryImpact: 'low' | 'medium' | 'high';
  optimizations: string[];
}

/**
 * Optimization information
 */
export interface OptimizationInfo {
  type: 'fusion' | 'index' | 'hotpath' | 'ivm';
  description: string;
  stages: number[];
  benefit: 'low' | 'medium' | 'high';
}

/**
 * Benchmark results from benchmark()
 */
export interface BenchmarkResults {
  duration: {
    total: number;
    perDocument: number;
    perStage: number[];
  };
  memory: {
    peak: number;
    delta: number;
    efficiency: number;
  };
  throughput: {
    documentsPerSecond: number;
    stageThroughput: number[];
  };
  optimizations: {
    hotPathUsed: boolean;
    ivmUsed: boolean;
    fusedOperations: string[];
  };
  dataset: {
    inputDocuments: number;
    outputDocuments: number;
    reductionRatio: number;
  };
}

/**
 * Streaming loader options
 */
export interface StreamLoaderOptions {
  /**
   * Batch size for processing chunks
   * @default 1000
   */
  batchSize?: number;
  
  /**
   * Maximum memory usage before forcing flush
   * @default 100MB (in bytes)
   */
  maxMemoryBytes?: number;
  
  /**
   * Callback for processing each batch
   */
  onBatch?: (batch: Document[], batchNumber: number) => void;
  
  /**
   * Error handling strategy
   * @default 'skip'
   */
  errorStrategy?: 'skip' | 'stop' | 'collect';
}

/**
 * Analyzes an aggregation pipeline and provides optimization insights
 * 
 * @param pipeline - The aggregation pipeline to analyze
 * @returns Detailed analysis of the pipeline structure and optimization opportunities
 * 
 * @example
 * ```typescript
 * import { explain } from 'modash';
 * 
 * const analysis = explain([
 *   { $match: { status: 'active' } },
 *   { $sort: { createdAt: -1 } },
 *   { $limit: 10 }
 * ]);
 * 
 * console.log('Hot path eligible:', analysis.hotPathEligible);
 * console.log('Optimizations:', analysis.optimizations);
 * ```
 */
export function explain(pipeline: Pipeline): PipelineExplanation {
  const stages: StageExplanation[] = [];
  const optimizations: OptimizationInfo[] = [];
  const warnings: string[] = [];
  
  let hotPathEligible = true;
  let ivmEligible = true;
  let estimatedComplexity: PipelineExplanation['estimatedComplexity'] = 'O(n)';
  
  pipeline.forEach((stage, index) => {
    const stageName = Object.keys(stage)[0];
    const stageExplanation = analyzeStage(stageName, stage[stageName as keyof typeof stage], index);
    stages.push(stageExplanation);
    
    // Update global flags based on stage analysis
    // Only certain stages break hot path eligibility (like complex operations)
    if (stageName === '$group' && stageExplanation.memoryImpact === 'high') {
      hotPathEligible = false;
    } else if (stageName === '$unwind') {
      hotPathEligible = false; // Array operations are complex
    }
    
    // Check for optimization opportunities
    if (stageName === '$sort' && index < pipeline.length - 1) {
      const nextStage = pipeline[index + 1];
      if ('$limit' in nextStage) {
        optimizations.push({
          type: 'fusion',
          description: '$sort + $limit can be fused into $topK operation',
          stages: [index, index + 1],
          benefit: 'high'
        });
      }
    }
    
    // Update complexity estimate
    if (stageName === '$sort') {
      estimatedComplexity = 'O(n log n)';
    } else if (stageName === '$group' && estimatedComplexity === 'O(n)') {
      // Group typically maintains O(n) but can be worse with many groups
      if (stageExplanation.memoryImpact === 'high') {
        estimatedComplexity = 'O(n log n)';
      }
    }
  });
  
  // Add warnings for common performance issues
  if (pipeline.length > 5) {
    warnings.push('Long pipeline detected - consider breaking into multiple operations');
  }
  
  const hasEarlyMatch = pipeline[0] && '$match' in pipeline[0];
  if (!hasEarlyMatch && pipeline.length > 2) {
    warnings.push('Consider adding $match as first stage to reduce dataset early');
  }
  
  return {
    stages,
    optimizations,
    warnings,
    estimatedComplexity,
    hotPathEligible,
    ivmEligible
  };
}

/**
 * Benchmarks an aggregation pipeline with a given dataset
 * 
 * @param collection - Documents to process
 * @param pipeline - Aggregation pipeline to benchmark
 * @param options - Benchmark configuration
 * @returns Detailed performance metrics
 * 
 * @example
 * ```typescript
 * import { benchmark } from 'modash';
 * 
 * const results = await benchmark(documents, [
 *   { $match: { category: 'electronics' } },
 *   { $group: { _id: '$brand', totalSales: { $sum: '$price' } } }
 * ], { iterations: 5 });
 * 
 * console.log(`Throughput: ${results.throughput.documentsPerSecond.toLocaleString()} docs/sec`);
 * console.log(`Memory efficiency: ${results.memory.efficiency}%`);
 * ```
 */
export async function benchmark<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline,
  options: { iterations?: number; warmupRuns?: number } = {}
): Promise<BenchmarkResults> {
  const { iterations = 5, warmupRuns = 2 } = options;
  
  // Warmup runs to stabilize JIT compilation
  for (let i = 0; i < warmupRuns; i++) {
    aggregate(collection, pipeline);
  }
  
  const measurements: {
    duration: number;
    memoryDelta: number;
    peakMemory: number;
  }[] = [];
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  for (let i = 0; i < iterations; i++) {
    const startMemory = process.memoryUsage();
    const startTime = process.hrtime.bigint();
    
    const result = aggregate(collection, pipeline);
    
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    measurements.push({
      duration: Number(endTime - startTime) / 1_000_000, // Convert to milliseconds
      memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
      peakMemory: endMemory.heapUsed
    });
  }
  
  // Calculate statistics
  const avgDuration = measurements.reduce((sum, m) => sum + m.duration, 0) / iterations;
  const avgMemoryDelta = measurements.reduce((sum, m) => sum + m.memoryDelta, 0) / iterations;
  const peakMemory = Math.max(...measurements.map(m => m.peakMemory));
  
  const documentsPerSecond = (collection.length / avgDuration) * 1000;
  const memoryEfficiency = Math.max(0, Math.min(100, 
    100 - ((avgMemoryDelta / (collection.length * 1024)) * 100)
  ));
  
  // Get final result for reduction ratio
  const finalResult = aggregate(collection, pipeline);
  const reductionRatio = finalResult.length / collection.length;
  
  return {
    duration: {
      total: avgDuration,
      perDocument: avgDuration / collection.length,
      perStage: Array(pipeline.length).fill(avgDuration / pipeline.length)
    },
    memory: {
      peak: peakMemory,
      delta: avgMemoryDelta,
      efficiency: memoryEfficiency
    },
    throughput: {
      documentsPerSecond,
      stageThroughput: Array(pipeline.length).fill(documentsPerSecond)
    },
    optimizations: {
      hotPathUsed: false, // Would be detected by actual optimization system
      ivmUsed: false,     // Would be detected by actual optimization system  
      fusedOperations: [] // Would be populated by optimization system
    },
    dataset: {
      inputDocuments: collection.length,
      outputDocuments: finalResult.length,
      reductionRatio
    }
  };
}

/**
 * Creates an async iterable from a Node.js readable stream of JSONL data
 * 
 * @param stream - Readable stream containing JSONL data
 * @param options - Processing options
 * @returns AsyncIterable of parsed documents
 * 
 * @example
 * ```typescript
 * import { createReadStream } from 'fs';
 * import { fromJSONL, aggregate } from 'modash';
 * 
 * const stream = createReadStream('data.jsonl');
 * const documents = [];
 * 
 * for await (const doc of fromJSONL(stream)) {
 *   documents.push(doc);
 * }
 * 
 * const result = aggregate(documents, [
 *   { $group: { _id: '$category', count: { $sum: 1 } } }
 * ]);
 * ```
 */
export async function* fromJSONL(
  stream: NodeJS.ReadableStream,
  options: StreamLoaderOptions = {}
): AsyncIterable<Document> {
  const { 
    batchSize = 1000, 
    maxMemoryBytes = 100 * 1024 * 1024,
    errorStrategy = 'skip',
    onBatch 
  } = options;
  
  const errors: Error[] = [];
  let currentBatch: Document[] = [];
  let batchNumber = 0;
  let totalMemoryUsed = 0;
  
  const rl = createInterface({
    input: stream,
    crlfDelay: Infinity
  });
  
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      
      try {
        const document = JSON.parse(line);
        currentBatch.push(document);
        totalMemoryUsed += Buffer.byteLength(line, 'utf8');
        
        // Check if we should yield the current batch
        if (currentBatch.length >= batchSize || totalMemoryUsed >= maxMemoryBytes) {
          if (onBatch) {
            onBatch([...currentBatch], batchNumber++);
          }
          
          // Yield each document in the batch
          for (const doc of currentBatch) {
            yield doc;
          }
          
          // Reset batch
          currentBatch = [];
          totalMemoryUsed = 0;
        }
        
      } catch (error) {
        const parseError = new Error(`Failed to parse JSON line: ${line}`);
        
        if (errorStrategy === 'stop') {
          throw parseError;
        } else if (errorStrategy === 'collect') {
          errors.push(parseError);
        }
        // 'skip' strategy just continues
      }
    }
    
    // Yield remaining documents in the final batch
    if (currentBatch.length > 0) {
      if (onBatch) {
        onBatch([...currentBatch], batchNumber);
      }
      
      for (const doc of currentBatch) {
        yield doc;
      }
    }
    
  } finally {
    rl.close();
    
    if (errorStrategy === 'collect' && errors.length > 0) {
      console.warn(`⚠️  Encountered ${errors.length} parsing errors during JSONL processing`);
    }
  }
}

/**
 * Analyzes a single pipeline stage
 */
function analyzeStage(stageName: string, stageValue: any, index: number): StageExplanation {
  const baseStage: Omit<StageExplanation, 'operation' | 'complexity' | 'description' | 'canUseIndexes' | 'memoryImpact' | 'optimizations'> = {
    stage: `Stage ${index + 1}: ${stageName}`
  };
  
  switch (stageName) {
    case '$match':
      return {
        ...baseStage,
        operation: 'Document filtering',
        complexity: 'O(n)',
        description: 'Filters documents based on query conditions',
        canUseIndexes: true,
        memoryImpact: 'low',
        optimizations: [
          'Can use indexes if available',
          'Hot path eligible',
          'Consider placing early in pipeline'
        ]
      };
      
    case '$project':
      return {
        ...baseStage,
        operation: 'Field selection/transformation',
        complexity: 'O(n)',
        description: 'Selects and transforms document fields',
        canUseIndexes: false,
        memoryImpact: 'low',
        optimizations: [
          'IVM (Isolated Virtual Machine) eligible',
          'Can reduce document size early'
        ]
      };
      
    case '$group':
      return {
        ...baseStage,
        operation: 'Aggregation grouping',
        complexity: 'O(n)',
        description: 'Groups documents and applies accumulator functions',
        canUseIndexes: false,
        memoryImpact: 'high',
        optimizations: [
          'Memory-optimized accumulators available',
          'Hash-based grouping for efficiency'
        ]
      };
      
    case '$sort':
      return {
        ...baseStage,
        operation: 'Document sorting',
        complexity: 'O(n log n)',
        description: 'Sorts documents by specified fields',
        canUseIndexes: true,
        memoryImpact: 'medium',
        optimizations: [
          'Can use indexes for covered sorts',
          'Consider combining with $limit for $topK'
        ]
      };
      
    case '$limit':
      return {
        ...baseStage,
        operation: 'Result limiting',
        complexity: 'O(1)',
        description: 'Limits the number of documents in results',
        canUseIndexes: false,
        memoryImpact: 'low',
        optimizations: [
          'Efficient early termination',
          'Can be fused with preceding $sort'
        ]
      };
      
    case '$skip':
      return {
        ...baseStage,
        operation: 'Document skipping',
        complexity: 'O(n)',
        description: 'Skips a specified number of documents',
        canUseIndexes: false,
        memoryImpact: 'low',
        optimizations: [
          'More efficient when combined with $limit'
        ]
      };
      
    case '$unwind':
      return {
        ...baseStage,
        operation: 'Array deconstruction',
        complexity: 'O(n * m)', // where m is average array size
        description: 'Deconstructs arrays into separate documents',
        canUseIndexes: false,
        memoryImpact: 'high',
        optimizations: [
          'Can significantly increase document count',
          'Consider filtering before unwinding'
        ]
      };
      
    default:
      return {
        ...baseStage,
        operation: 'Custom operation',
        complexity: 'O(n)',
        description: `${stageName} operation`,
        canUseIndexes: false,
        memoryImpact: 'medium',
        optimizations: []
      };
  }
}
