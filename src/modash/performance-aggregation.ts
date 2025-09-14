/**
 * High-performance aggregation implementation for modash.js
 *
 * Integrates all performance optimizations:
 * 1. Operator fusion ($match + $project)
 * 2. Compiled expressions and predicates
 * 3. Optimized grouping with Robin Hood hashing
 * 4. Top-K heap sorting
 * 5. Object pooling and memory management
 * 6. Zero-allocation hot paths
 */

import type {
  Collection,
  Document,
  DocumentValue,
} from './expressions.js';
import { $expression } from './expressions.js';
import type { Pipeline, PipelineStage, QueryExpression } from '../index.js';

import {
  createCompilationContext,
  compileMatch,
  compileProject,
  canFuseMatchProject,
  fuseMatchProject,
  type CompilationContext,
} from './performance-compiler.js';

import { performanceGroup } from './performance-grouping.js';
import { optimizedSort, canUseTopK } from './performance-sorting.js';

import {
  globalArena,
  clearAllPools,
  // deltaBatcher,
  // acquireTempObject, 
  // releaseTempObject,
  getScratchArray,
  releaseScratchArray,
} from './object-pools.js';

import { perfCounters } from '../../benchmarks/operators.js';

/**
 * Pipeline analysis result for optimization decisions
 */
interface PipelineAnalysis {
  canOptimize: boolean;
  fusionOpportunities: Array<{
    startIndex: number;
    endIndex: number;
    type: 'match-project' | 'sort-limit';
  }>;
  hotPath: boolean; // True if pipeline can use compiled hot path entirely
  estimatedComplexity: number;
}

/**
 * Analyze pipeline for optimization opportunities
 */
function analyzePipeline(pipeline: Pipeline): PipelineAnalysis {
  const analysis: PipelineAnalysis = {
    canOptimize: true,
    fusionOpportunities: [],
    hotPath: true,
    estimatedComplexity: 0,
  };

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]!;

    // Check for $match + $project fusion
    if ('$match' in stage && i + 1 < pipeline.length) {
      const nextStage = pipeline[i + 1]!;
      if ('$project' in nextStage) {
        try {
          if (canFuseMatchProject(stage.$match, nextStage.$project)) {
            analysis.fusionOpportunities.push({
              startIndex: i,
              endIndex: i + 1,
              type: 'match-project',
            });
          }
        } catch {
          // Fusion not possible, continue
        }
      }
    }

    // Check for $sort + $limit (Top-K) optimization
    if ('$sort' in stage && i + 1 < pipeline.length) {
      const nextStage = pipeline[i + 1]!;
      if ('$limit' in nextStage) {
        const topKCheck = canUseTopK(pipeline, i);
        if (topKCheck.canUse) {
          analysis.fusionOpportunities.push({
            startIndex: i,
            endIndex: i + 1,
            type: 'sort-limit',
          });
        }
      }
    }

    // Estimate complexity
    if ('$group' in stage) {
      analysis.estimatedComplexity += 3; // Grouping is expensive
    } else if ('$sort' in stage) {
      analysis.estimatedComplexity += 2; // Sorting is moderately expensive
    } else if ('$lookup' in stage) {
      analysis.estimatedComplexity += 4; // Lookup is very expensive
      analysis.hotPath = false; // Lookup not optimized yet
    } else if ('$unwind' in stage) {
      analysis.estimatedComplexity += 1; // Unwind can expand data
      analysis.hotPath = false; // Unwind not fully optimized yet
    } else {
      analysis.estimatedComplexity += 1; // Basic operations
    }
  }

  return analysis;
}

/**
 * High-performance match implementation
 */
function performanceMatch(
  collection: Collection,
  query: QueryExpression,
  ctx: CompilationContext
): Collection {
  if (collection.length === 0) {
    return [];
  }

  const predicate = compileMatch(query, ctx);
  const result = getScratchArray('matchResult', collection.length);
  let resultIndex = 0;

  for (let i = 0; i < collection.length; i++) {
    const doc = collection[i]!;
    if (predicate(doc, i)) {
      result[resultIndex++] = doc;
    }
  }

  // Create properly sized result array
  const finalResult = result.slice(0, resultIndex);
  releaseScratchArray('matchResult');

  return finalResult;
}

/**
 * High-performance project implementation
 */
function performanceProject(
  collection: Collection,
  projectSpec: Record<string, any>,
  ctx: CompilationContext
): Collection {
  if (collection.length === 0) {
    return [];
  }

  const projector = compileProject(projectSpec, ctx);
  const result: Document[] = [];

  for (let i = 0; i < collection.length; i++) {
    const doc = collection[i]!;
    const projected = projector(doc, i);
    result.push(projected);
  }

  return result;
}

/**
 * Process a single pipeline stage with optimizations
 */
function processStage(
  collection: Collection,
  stage: PipelineStage,
  ctx: CompilationContext
): Collection {
  if ('$match' in stage) {
    return performanceMatch(collection, stage.$match, ctx);
  }

  if ('$project' in stage) {
    return performanceProject(collection, stage.$project, ctx);
  }

  if ('$group' in stage) {
    return performanceGroup(collection, stage.$group, ctx);
  }

  if ('$sort' in stage) {
    return optimizedSort(collection, stage.$sort, undefined, ctx);
  }

  if ('$limit' in stage) {
    return collection.slice(0, stage.$limit);
  }

  if ('$skip' in stage) {
    return collection.slice(stage.$skip);
  }

  // For other stages, fall back to original implementation
  perfCounters.recordFallback();

  // Import and use original implementations
  if ('$addFields' in stage || '$set' in stage) {
    const fieldSpecs = stage.$addFields || stage.$set;
    return collection.map(doc => {
      const newFields: Record<string, DocumentValue> = {};
      for (const [fieldName, expression] of Object.entries(fieldSpecs)) {
        newFields[fieldName] = $expression(doc, expression);
      }
      return { ...doc, ...newFields };
    });
  }

  if ('$unwind' in stage) {
    // Simplified unwind implementation
    const spec = stage.$unwind;
    const path = typeof spec === 'string' ? spec : spec.path;
    const fieldName = path.startsWith('$') ? path.slice(1) : path;

    const result: Document[] = [];
    for (const doc of collection) {
      const fieldValue = doc[fieldName];
      if (Array.isArray(fieldValue)) {
        for (const item of fieldValue) {
          result.push({ ...doc, [fieldName]: item });
        }
      } else {
        result.push(doc);
      }
    }
    return result;
  }

  if ('$lookup' in stage) {
    perfCounters.recordFallback();
    // Lookup not optimized - would need original implementation
    throw new Error('$lookup not supported in performance mode yet');
  }

  return collection;
}

/**
 * Apply fusion optimizations to pipeline
 */
function applyFusions(
  collection: Collection,
  pipeline: Pipeline,
  analysis: PipelineAnalysis,
  ctx: CompilationContext
): Collection {
  let result = collection;
  const processedStages = new Set<number>();

  // Apply fusion optimizations
  for (const fusion of analysis.fusionOpportunities) {
    if (
      processedStages.has(fusion.startIndex) ||
      processedStages.has(fusion.endIndex)
    ) {
      continue; // Already processed as part of another fusion
    }

    if (fusion.type === 'match-project') {
      const matchStage = pipeline[fusion.startIndex]! as any;
      const projectStage = pipeline[fusion.endIndex]! as any;

      try {
        const fusedOperator = fuseMatchProject(
          matchStage.$match,
          projectStage.$project,
          ctx
        );

        result = fusedOperator(result);
        processedStages.add(fusion.startIndex);
        processedStages.add(fusion.endIndex);

        perfCounters.recordAdd(); // Record fusion used
      } catch (error) {
        // Fallback to individual stages
        perfCounters.recordFallback();
        result = processStage(result, matchStage, ctx);
        result = processStage(result, projectStage, ctx);
        processedStages.add(fusion.startIndex);
        processedStages.add(fusion.endIndex);
      }
    }

    if (fusion.type === 'sort-limit') {
      const sortStage = pipeline[fusion.startIndex]! as any;
      const limitStage = pipeline[fusion.endIndex]! as any;

      result = optimizedSort(result, sortStage.$sort, limitStage.$limit, ctx);
      processedStages.add(fusion.startIndex);
      processedStages.add(fusion.endIndex);

      perfCounters.recordAdd(); // Record Top-K optimization used
    }
  }

  // Process remaining stages
  for (let i = 0; i < pipeline.length; i++) {
    if (!processedStages.has(i)) {
      result = processStage(result, pipeline[i]!, ctx);
    }
  }

  return result;
}

/**
 * Main high-performance aggregation function
 */
export function performanceAggregate<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline
): Collection<T> {
  // Early return for empty inputs
  if (!Array.isArray(collection) || collection.length === 0) {
    return [];
  }

  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return collection;
  }

  // Reset performance counters
  perfCounters.reset();

  // Clear temporary allocations from previous operations
  clearAllPools();

  try {
    // Create compilation context for this aggregation
    const ctx = createCompilationContext();

    // Analyze pipeline for optimization opportunities
    const analysis = analyzePipeline(pipeline);

    let result: Collection;

    if (analysis.canOptimize && analysis.fusionOpportunities.length > 0) {
      // Use fusion-optimized path
      result = applyFusions(collection, pipeline, analysis, ctx);
    } else if (analysis.hotPath) {
      // Use compiled hot path without fusion
      result = collection;
      for (const stage of pipeline) {
        result = processStage(result, stage, ctx);
      }
    } else {
      // Fall back to original implementation
      perfCounters.recordFallback();
      throw new Error('Pipeline contains operations not yet optimized');
    }

    return result as Collection<T>;
  } catch (error) {
    // If performance path fails, could fall back to original implementation
    perfCounters.recordFallback();
    throw error;
  } finally {
    // Clean up temporary allocations
    globalArena.clear();
  }
}

/**
 * Check if performance aggregation can handle this pipeline
 */
export function canUsePerformanceAggregation(pipeline: Pipeline): boolean {
  // Track fields added by $addFields/$set stages and $group stages
  const addedFields = new Set<string>();

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]!;

    // Track fields added by $addFields/$set
    if ('$addFields' in stage || '$set' in stage) {
      const fieldSpecs = stage.$addFields || stage.$set;
      for (const fieldName of Object.keys(fieldSpecs)) {
        addedFields.add(fieldName);
      }
    }

    // Track fields created by $group
    if ('$group' in stage) {
      const groupSpec = stage.$group;
      // Check if $group uses fields added by $addFields
      const groupStr = JSON.stringify(groupSpec);
      for (const addedField of addedFields) {
        if (groupStr.includes(`"$${addedField}"`)) {
          // If $group references added fields, disable optimization
          return false;
        }
      }

      // Add group output fields to tracking
      for (const fieldName of Object.keys(groupSpec)) {
        if (fieldName !== '_id') {
          addedFields.add(fieldName);
        }
      }
    }

    // Check $project stages for complex expressions that need traditional processing
    if ('$project' in stage) {
      const projectSpec = stage.$project;
      for (const [field, spec] of Object.entries(projectSpec)) {
        if (field === '_id') continue;

        // If it's a computed expression, check various conditions
        if (typeof spec === 'object' && spec !== null && !Array.isArray(spec)) {
          const specStr = JSON.stringify(spec);

          // Check if it references fields added by previous stages
          for (const addedField of addedFields) {
            if (specStr.includes(`"$${addedField}"`)) {
              return false; // Fall back to traditional aggregation
            }
          }

          // For now, disable optimization for any complex expressions in multi-stage pipelines
          // This is a conservative approach to ensure correctness
          if (pipeline.length > 1) {
            return false; // Fall back to traditional aggregation for complex expressions
          }
        }
      }
    }
  }

  const analysis = analyzePipeline(pipeline);
  return analysis.canOptimize && analysis.hotPath;
}

/**
 * Wrapper that automatically chooses between performance and fallback implementations
 */
export function smartAggregate<T extends Document = Document>(
  collection: Collection<T>,
  pipeline: Pipeline,
  fallbackFn: (collection: Collection<T>, pipeline: Pipeline) => Collection<T>
): Collection<T> {
  // Try performance path first
  if (canUsePerformanceAggregation(pipeline)) {
    try {
      return performanceAggregate(collection, pipeline);
    } catch (error) {
      perfCounters.recordFallback();
      // Fall through to fallback implementation
    }
  }

  perfCounters.recordFallback();
  return fallbackFn(collection, pipeline);
}
