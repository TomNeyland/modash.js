/**
 * Query Optimization Engine for modash.js
 * Provides intelligent query planning and execution optimization
 */

import type { Pipeline, PipelineStage } from '../index.js';
import type { Collection, Document } from './expressions.js';

interface OptimizedStage {
  type: string;
  operation: any;
  canMergeWithNext: boolean;
  estimatedCost: number;
  estimatedSelectivity: number;
  optimizations: string[];
}

export interface ExecutionPlan {
  canUseSinglePass: boolean;
  estimatedCost: number;
  stages: OptimizedStage[];
  indexUsage: string[];
  optimizations: string[];
}

export class QueryOptimizer {
  private planCache: Map<string, ExecutionPlan> = new Map();
  
  /**
   * Create an optimized execution plan for a pipeline
   */
  createExecutionPlan<T extends Document>(
    collection: Collection<T>, 
    pipeline: Pipeline
  ): ExecutionPlan {
    // Check cache first
    const cacheKey = this.createPlanCacheKey(pipeline, collection.length);
    const cachedPlan = this.planCache.get(cacheKey);
    if (cachedPlan) {
      return cachedPlan;
    }

    const stages: OptimizedStage[] = [];
    let canUseSinglePass = true;
    let estimatedCost = 0;
    const indexUsage: string[] = [];
    const optimizations: string[] = [];

    // Reorder stages for optimal execution
    const reorderedPipeline = this.reorderPipelineForOptimization([...pipeline]);
    if (reorderedPipeline.length !== pipeline.length || 
        !reorderedPipeline.every((stage, i) => stage === pipeline[i])) {
      optimizations.push('Pipeline stage reordering');
    }

    for (let i = 0; i < reorderedPipeline.length; i++) {
      const stage = reorderedPipeline[i];
      const stageType = Object.keys(stage)[0];
      const operation = stage[stageType as keyof PipelineStage];

      const optimizedStage: OptimizedStage = {
        type: stageType,
        operation,
        canMergeWithNext: this.canMergeWithNext(stage, reorderedPipeline[i + 1]),
        estimatedCost: this.estimateStageCost(stage, collection.length),
        estimatedSelectivity: this.estimateSelectivity(stage, collection.length),
        optimizations: []
      };

      // Detect optimization opportunities
      if (stageType === '$match') {
        const matchOptimizations = this.analyzeMatchStage(operation as any);
        optimizedStage.optimizations.push(...matchOptimizations);
        
        // Check for potential index usage
        const fields = this.extractQueryFields(operation as any);
        fields.forEach(field => {
          indexUsage.push(`${field}:equality`);
          optimizedStage.optimizations.push(`Index lookup for field: ${field}`);
        });
      }

      // Check if single-pass is still possible
      if (stageType === '$lookup' || stageType === '$unwind') {
        canUseSinglePass = false;
        optimizations.push('Multi-pass execution required for complex operations');
      } else if (stageType === '$sort' && i < reorderedPipeline.length - 1) {
        canUseSinglePass = false;
        optimizations.push('Sort not at end requires multi-pass execution');
      }

      stages.push(optimizedStage);
      estimatedCost += optimizedStage.estimatedCost * optimizedStage.estimatedSelectivity;
    }

    // Additional optimizations based on stage combinations
    if (this.hasFilterGroupCombination(stages)) {
      optimizations.push('Filter-then-group optimization detected');
    }

    if (this.hasProjectionOptimization(stages)) {
      optimizations.push('Early projection to reduce data size');
    }

    const plan: ExecutionPlan = {
      canUseSinglePass,
      estimatedCost,
      stages,
      indexUsage,
      optimizations
    };

    // Cache the plan
    this.planCache.set(cacheKey, plan);

    return plan;
  }

  /**
   * Reorder pipeline stages for optimal execution
   */
  private reorderPipelineForOptimization(pipeline: PipelineStage[]): PipelineStage[] {
    const reordered: PipelineStage[] = [];
    const remaining = [...pipeline];

    // First, move all $match stages to the beginning (most selective first)
    const matchStages = remaining.filter(stage => '$match' in stage)
      .sort((a, b) => this.estimateSelectivity(a, 1000) - this.estimateSelectivity(b, 1000));
    
    matchStages.forEach(stage => {
      reordered.push(stage);
      const index = remaining.indexOf(stage);
      remaining.splice(index, 1);
    });

    // Then add projection stages that reduce data size
    const earlyProjections = remaining.filter(stage => 
      '$project' in stage && this.isProjectionReducing(stage.$project as any)
    );
    
    earlyProjections.forEach(stage => {
      reordered.push(stage);
      const index = remaining.indexOf(stage);
      remaining.splice(index, 1);
    });

    // Add remaining stages in original order
    reordered.push(...remaining);

    return reordered;
  }

  /**
   * Analyze a match stage for optimization opportunities
   */
  private analyzeMatchStage(matchSpec: any): string[] {
    const optimizations: string[] = [];

    // Check for simple equality matches (most efficient)
    const simpleFields = Object.keys(matchSpec).filter(field => 
      !field.startsWith('$') && typeof matchSpec[field] !== 'object'
    );
    
    if (simpleFields.length > 0) {
      optimizations.push(`Simple equality matches on: ${simpleFields.join(', ')}`);
    }

    // Check for range queries that could benefit from indexes
    const rangeFields = Object.keys(matchSpec).filter(field => {
      const condition = matchSpec[field];
      return typeof condition === 'object' && condition !== null &&
        Object.keys(condition).some(op => ['$gt', '$gte', '$lt', '$lte'].includes(op));
    });

    if (rangeFields.length > 0) {
      optimizations.push(`Range queries on: ${rangeFields.join(', ')}`);
    }

    // Check for $in queries with small arrays (efficient)
    const inFields = Object.keys(matchSpec).filter(field => {
      const condition = matchSpec[field];
      return typeof condition === 'object' && condition !== null &&
        condition.$in && Array.isArray(condition.$in) && condition.$in.length <= 10;
    });

    if (inFields.length > 0) {
      optimizations.push(`Efficient $in queries on: ${inFields.join(', ')}`);
    }

    return optimizations;
  }

  /**
   * Extract queryable fields from match specification
   */
  private extractQueryFields(matchSpec: any): string[] {
    const fields: string[] = [];

    for (const [field, condition] of Object.entries(matchSpec)) {
      if (!field.startsWith('$')) {
        fields.push(field);
      }
    }

    return fields;
  }

  /**
   * Check if pipeline has filter-then-group pattern
   */
  private hasFilterGroupCombination(stages: OptimizedStage[]): boolean {
    for (let i = 0; i < stages.length - 1; i++) {
      if (stages[i].type === '$match' && stages[i + 1].type === '$group') {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if pipeline has early projection opportunities
   */
  private hasProjectionOptimization(stages: OptimizedStage[]): boolean {
    const firstProjection = stages.findIndex(stage => stage.type === '$project');
    const firstGroup = stages.findIndex(stage => stage.type === '$group');
    
    return firstProjection >= 0 && firstGroup >= 0 && firstProjection < firstGroup;
  }

  /**
   * Check if projection reduces data size
   */
  private isProjectionReducing(projectionSpec: any): boolean {
    const includeFields = Object.values(projectionSpec).filter(v => v === 1).length;
    const excludeFields = Object.values(projectionSpec).filter(v => v === 0).length;
    
    // Assume reducing if explicitly including only a few fields
    return includeFields > 0 && includeFields < 5;
  }

  /**
   * Estimate stage execution cost
   */
  private estimateStageCost(stage: PipelineStage, collectionSize: number): number {
    const stageType = Object.keys(stage)[0];
    
    switch (stageType) {
      case '$match':
        return collectionSize * 0.1; // Fast comparison operations
      case '$project':
        return collectionSize * 0.2; // Object transformation
      case '$group':
        return collectionSize * 0.5; // Aggregation operations
      case '$sort':
        return collectionSize * Math.log2(collectionSize) * 0.3; // O(n log n)
      case '$lookup':
        return collectionSize * collectionSize * 0.01; // Potentially O(n²)
      case '$unwind':
        return collectionSize * 0.3; // Array expansion
      default:
        return collectionSize * 0.2; // Default cost
    }
  }

  /**
   * Estimate selectivity (fraction of documents that pass the stage)
   */
  private estimateSelectivity(stage: PipelineStage, collectionSize: number): number {
    const stageType = Object.keys(stage)[0];
    
    switch (stageType) {
      case '$match':
        return 0.3; // Assume filters are reasonably selective
      case '$project':
        return 1.0; // No filtering
      case '$group':
        return 0.1; // Groups reduce data significantly
      case '$sort':
        return 1.0; // No filtering
      case '$limit':
        const limit = stage.$limit as number;
        return Math.min(limit / collectionSize, 1.0);
      case '$skip':
        const skip = stage.$skip as number;
        return Math.max((collectionSize - skip) / collectionSize, 0);
      default:
        return 0.8; // Conservative estimate
    }
  }

  /**
   * Check if stages can be merged for single-pass execution
   */
  private canMergeWithNext(stage: PipelineStage, nextStage?: PipelineStage): boolean {
    if (!nextStage) return false;
    
    const stageType = Object.keys(stage)[0];
    const nextType = Object.keys(nextStage)[0];
    
    // Compatible combinations for single-pass execution
    const compatibleCombinations = [
      ['$match', '$project'],
      ['$match', '$group'],
      ['$project', '$match'],
      ['$match', '$limit'],
      ['$match', '$skip'],
      ['$project', '$limit'],
      ['$project', '$skip']
    ];
    
    return compatibleCombinations.some(([first, second]) => 
      stageType === first && nextType === second
    );
  }

  /**
   * Create cache key for execution plan
   */
  private createPlanCacheKey(pipeline: Pipeline, collectionSize: number): string {
    const pipelineStr = JSON.stringify(pipeline);
    const sizeCategory = collectionSize < 100 ? 'small' : 
                        collectionSize < 1000 ? 'medium' : 'large';
    return `${sizeCategory}:${this.simpleHash(pipelineStr)}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats() {
    return {
      cachedPlans: this.planCache.size,
      plans: Array.from(this.planCache.values()).map(plan => ({
        canUseSinglePass: plan.canUseSinglePass,
        estimatedCost: plan.estimatedCost,
        optimizations: plan.optimizations,
        stageCount: plan.stages.length
      }))
    };
  }

  /**
   * Clear optimization cache
   */
  clearCache(): void {
    this.planCache.clear();
  }
}