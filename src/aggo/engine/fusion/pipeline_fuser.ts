/**
 * Phase 10: Pipeline Operator Fusion
 * 
 * Auto-fuse linear `match→project→aggregate` into single vector loop:
 * - Code-size guardrails to prevent excessive fusion
 * - Maintain late-materialization semantics
 * - Split at joins/unwind operations
 * - Performance-aware fusion decisions
 */

export interface PipelineStage {
  operator: string;
  operand: any;
  fusable: boolean;
  complexity: number;
  vectorizable: boolean;
}

export interface FusionGroup {
  stages: PipelineStage[];
  fusedOperator: string;
  estimatedSpeedup: number;
  codeSize: number;
  maintainsSemantics: boolean;
}

export interface FusionStats {
  totalPipelines: number;
  fusedGroups: number;
  avgGroupSize: number;
  totalSpeedup: number;
  codeGenerated: number;
  semanticsPreserved: number;
}

export interface FusionConfig {
  maxGroupSize: number;
  maxCodeSize: number;
  minSpeedupThreshold: number;
  enableLateMatSplit: boolean;
  vectorizationRequired: boolean;
}

/**
 * Pipeline stage analyzer
 */
class StageAnalyzer {
  static analyzePipelineStage(stage: any): PipelineStage {
    const operator = Object.keys(stage)[0];
    const operand = stage[operator];
    
    return {
      operator,
      operand,
      fusable: this.isFusable(operator, operand),
      complexity: this.estimateComplexity(operator, operand),
      vectorizable: this.isVectorizable(operator, operand)
    };
  }
  
  static isFusable(operator: string, operand: any): boolean {
    switch (operator) {
      case '$match':
        return this.isSimpleMatch(operand);
      case '$project':
        return this.isSimpleProject(operand);
      case '$addFields':
      case '$set':
        return this.isSimpleFieldOp(operand);
      case '$limit':
      case '$skip':
        return true;
      case '$sort':
        return false; // Sorting breaks fusion due to reordering
      case '$group':
        return this.isSimpleGroup(operand);
      case '$unwind':
      case '$lookup':
        return false; // These break late-materialization semantics
      default:
        return false;
    }
  }
  
  static isVectorizable(operator: string, operand: any): boolean {
    switch (operator) {
      case '$match':
        return this.hasVectorizableConditions(operand);
      case '$project':
      case '$addFields':
      case '$set':
        return this.hasVectorizableExpressions(operand);
      case '$limit':
      case '$skip':
        return true;
      case '$group':
        return this.hasVectorizableAccumulators(operand);
      default:
        return false;
    }
  }
  
  static estimateComplexity(operator: string, operand: any): number {
    switch (operator) {
      case '$match':
        return this.countConditions(operand);
      case '$project':
      case '$addFields':
      case '$set':
        return Object.keys(operand).length;
      case '$group':
        return Object.keys(operand).length - 1; // Exclude _id
      case '$limit':
      case '$skip':
        return 1;
      default:
        return 5; // Default complexity
    }
  }
  
  private static isSimpleMatch(operand: any): boolean {
    // Check if match conditions are simple comparisons
    const conditions = this.flattenConditions(operand);
    return conditions.every(cond => this.isSimpleCondition(cond));
  }
  
  private static isSimpleProject(operand: any): boolean {
    // Check if projection uses only field selection or simple expressions
    return Object.values(operand).every(value => 
      typeof value === 'number' || 
      typeof value === 'string' ||
      this.isSimpleExpression(value)
    );
  }
  
  private static isSimpleFieldOp(operand: any): boolean {
    return Object.values(operand).every(value => this.isSimpleExpression(value));
  }
  
  private static isSimpleGroup(operand: any): boolean {
    // Simple if uses only basic accumulators
    const accumulators = Object.keys(operand).filter(key => key !== '_id');
    return accumulators.every(acc => this.isSimpleAccumulator(operand[acc]));
  }
  
  private static isSimpleCondition(condition: any): boolean {
    if (typeof condition !== 'object') return true;
    
    const operators = Object.keys(condition);
    const simpleOps = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists'];
    
    return operators.every(op => simpleOps.includes(op));
  }
  
  private static isSimpleExpression(expr: any): boolean {
    if (typeof expr !== 'object') return true;
    if (expr === null) return true;
    
    const operators = Object.keys(expr);
    const simpleExprOps = ['$add', '$subtract', '$multiply', '$divide', '$concat', '$toUpper', '$toLower'];
    
    return operators.every(op => simpleExprOps.includes(op));
  }
  
  private static isSimpleAccumulator(acc: any): boolean {
    if (typeof acc !== 'object') return true;
    
    const operators = Object.keys(acc);
    const simpleAccOps = ['$sum', '$avg', '$min', '$max', '$first', '$last', '$push', '$addToSet'];
    
    return operators.every(op => simpleAccOps.includes(op));
  }
  
  private static hasVectorizableConditions(operand: any): boolean {
    // Check if conditions can be vectorized
    const conditions = this.flattenConditions(operand);
    return conditions.every(cond => this.isVectorizableCondition(cond));
  }
  
  private static hasVectorizableExpressions(operand: any): boolean {
    return Object.values(operand).every(value => this.isVectorizableExpression(value));
  }
  
  private static hasVectorizableAccumulators(operand: any): boolean {
    const accumulators = Object.keys(operand).filter(key => key !== '_id');
    return accumulators.every(acc => this.isVectorizableAccumulator(operand[acc]));
  }
  
  private static isVectorizableCondition(condition: any): boolean {
    // Most simple conditions are vectorizable
    return this.isSimpleCondition(condition);
  }
  
  private static isVectorizableExpression(expr: any): boolean {
    // Most simple expressions are vectorizable
    return this.isSimpleExpression(expr);
  }
  
  private static isVectorizableAccumulator(acc: any): boolean {
    // Most simple accumulators are vectorizable
    return this.isSimpleAccumulator(acc);
  }
  
  private static flattenConditions(operand: any): any[] {
    if (typeof operand !== 'object' || operand === null) {
      return [operand];
    }
    
    const conditions: any[] = [];
    
    for (const [key, value] of Object.entries(operand)) {
      if (key === '$and' || key === '$or') {
        if (Array.isArray(value)) {
          for (const subCondition of value) {
            conditions.push(...this.flattenConditions(subCondition));
          }
        }
      } else {
        conditions.push({ [key]: value });
      }
    }
    
    return conditions;
  }
  
  private static countConditions(operand: any): number {
    return this.flattenConditions(operand).length;
  }
}

/**
 * Pipeline fusion optimizer
 */
export class PipelineFuser {
  private readonly config: Required<FusionConfig>;
  private stats: FusionStats = {
    totalPipelines: 0,
    fusedGroups: 0,
    avgGroupSize: 0,
    totalSpeedup: 0,
    codeGenerated: 0,
    semanticsPreserved: 0
  };
  
  constructor(config: Partial<FusionConfig> = {}) {
    this.config = {
      maxGroupSize: 5,
      maxCodeSize: 10000, // characters
      minSpeedupThreshold: 1.2,
      enableLateMatSplit: true,
      vectorizationRequired: false,
      ...config
    };
  }
  
  /**
   * Analyze pipeline and create fusion groups
   */
  fusePipeline(pipeline: any[]): FusionGroup[] {
    this.stats.totalPipelines++;
    
    if (pipeline.length === 0) {
      return [];
    }
    
    // Analyze all stages
    const analyzedStages = pipeline.map(stage => StageAnalyzer.analyzePipelineStage(stage));
    
    // Find fusion boundaries
    const fusionGroups = this.identifyFusionGroups(analyzedStages);
    
    // Generate fused operators
    const processedGroups = fusionGroups.map(group => this.processFusionGroup(group));
    
    // Filter groups that meet criteria
    const validGroups = processedGroups.filter(group => this.isValidFusionGroup(group));
    
    this.stats.fusedGroups += validGroups.length;
    this.updateStats(validGroups);
    
    return validGroups;
  }
  
  /**
   * Generate optimized pipeline with fused operators
   */
  generateOptimizedPipeline(originalPipeline: any[]): any[] {
    const fusionGroups = this.fusePipeline(originalPipeline);
    
    if (fusionGroups.length === 0) {
      return originalPipeline; // No fusion possible
    }
    
    const optimizedPipeline: any[] = [];
    let stageIndex = 0;
    
    for (const group of fusionGroups) {
      if (group.stages.length > 1) {
        // Replace multiple stages with fused operator
        optimizedPipeline.push({
          $fused: {
            stages: group.stages.map(stage => ({ [stage.operator]: stage.operand })),
            fusedOperator: group.fusedOperator,
            metadata: {
              estimatedSpeedup: group.estimatedSpeedup,
              codeSize: group.codeSize
            }
          }
        });
        stageIndex += group.stages.length;
      } else {
        // Keep single stage as-is
        optimizedPipeline.push({ [group.stages[0].operator]: group.stages[0].operand });
        stageIndex++;
      }
    }
    
    // Add any remaining unfused stages
    while (stageIndex < originalPipeline.length) {
      optimizedPipeline.push(originalPipeline[stageIndex]);
      stageIndex++;
    }
    
    return optimizedPipeline;
  }
  
  private identifyFusionGroups(stages: PipelineStage[]): PipelineStage[][] {
    const groups: PipelineStage[][] = [];
    let currentGroup: PipelineStage[] = [];
    
    for (const stage of stages) {
      // Check if stage can be added to current group
      if (this.canAddToGroup(currentGroup, stage)) {
        currentGroup.push(stage);
      } else {
        // Finalize current group if it has stages
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        
        // Start new group
        currentGroup = [stage];
      }
      
      // Check group size limits
      if (currentGroup.length >= this.config.maxGroupSize) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
    
    // Add final group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
  
  private canAddToGroup(currentGroup: PipelineStage[], stage: PipelineStage): boolean {
    // Cannot add if stage is not fusable
    if (!stage.fusable) {
      return false;
    }
    
    // First stage can always be added if fusable
    if (currentGroup.length === 0) {
      return true;
    }
    
    // Check if vectorization is required and consistent
    if (this.config.vectorizationRequired) {
      const allVectorizable = currentGroup.every(s => s.vectorizable) && stage.vectorizable;
      if (!allVectorizable) {
        return false;
      }
    }
    
    // Check for late-materialization breaking operations
    if (this.config.enableLateMatSplit) {
      if (this.breaksLateMaterialization(stage)) {
        return false;
      }
    }
    
    // Check complexity limits
    const totalComplexity = currentGroup.reduce((sum, s) => sum + s.complexity, 0) + stage.complexity;
    if (totalComplexity > 20) { // Arbitrary complexity threshold
      return false;
    }
    
    return true;
  }
  
  private breaksLateMaterialization(stage: PipelineStage): boolean {
    // Operations that require full document materialization
    const lateMatBreakers = ['$sort', '$unwind', '$lookup', '$facet', '$graphLookup'];
    return lateMatBreakers.includes(stage.operator);
  }
  
  private processFusionGroup(stages: PipelineStage[]): FusionGroup {
    const fusedOperator = this.generateFusedOperator(stages);
    const estimatedSpeedup = this.estimateSpeedup(stages);
    const codeSize = fusedOperator.length;
    const maintainsSemantics = this.checkSemanticEquivalence(stages);
    
    return {
      stages,
      fusedOperator,
      estimatedSpeedup,
      codeSize,
      maintainsSemantics
    };
  }
  
  private generateFusedOperator(stages: PipelineStage[]): string {
    // Generate pseudo-code for fused operator
    const operations: string[] = [];
    
    for (const stage of stages) {
      switch (stage.operator) {
        case '$match':
          operations.push(`filter(${JSON.stringify(stage.operand)})`);
          break;
        case '$project':
          operations.push(`project(${JSON.stringify(stage.operand)})`);
          break;
        case '$addFields':
        case '$set':
          operations.push(`addFields(${JSON.stringify(stage.operand)})`);
          break;
        case '$limit':
          operations.push(`limit(${stage.operand})`);
          break;
        case '$skip':
          operations.push(`skip(${stage.operand})`);
          break;
        case '$group':
          operations.push(`group(${JSON.stringify(stage.operand)})`);
          break;
        default:
          operations.push(`${stage.operator}(${JSON.stringify(stage.operand)})`);
      }
    }
    
    return `vectorLoop(batch => batch.${operations.join('.')})`;
  }
  
  private estimateSpeedup(stages: PipelineStage[]): number {
    if (stages.length <= 1) {
      return 1.0; // No speedup for single stage
    }
    
    // Base speedup from reducing overhead
    let speedup = 1.0 + (stages.length - 1) * 0.15;
    
    // Additional speedup from vectorization
    if (stages.every(s => s.vectorizable)) {
      speedup *= 1.3;
    }
    
    // Speedup from reduced materializations
    const projectionStages = stages.filter(s => s.operator === '$project' || s.operator === '$addFields');
    if (projectionStages.length > 1) {
      speedup *= 1.2;
    }
    
    // Penalty for complexity
    const totalComplexity = stages.reduce((sum, s) => sum + s.complexity, 0);
    if (totalComplexity > 10) {
      speedup *= 0.9;
    }
    
    return Math.max(1.0, speedup);
  }
  
  private checkSemanticEquivalence(stages: PipelineStage[]): boolean {
    // Check if fusion maintains semantic equivalence
    
    // Cannot maintain semantics if any stage is not fusable
    if (stages.some(s => !s.fusable)) {
      return false;
    }
    
    // Check for ordering dependencies
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const curr = stages[i];
      
      // $sort must not be followed by operations that depend on order
      if (prev.operator === '$sort' && this.dependsOnOrder(curr)) {
        return false;
      }
      
      // $group changes document structure
      if (prev.operator === '$group' && curr.operator === '$project') {
        // Need to verify projection is compatible with group output
        if (!this.isCompatibleWithGroupOutput(curr.operand, prev.operand)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  private dependsOnOrder(stage: PipelineStage): boolean {
    return ['$skip', '$limit'].includes(stage.operator);
  }
  
  private isCompatibleWithGroupOutput(projection: any, grouping: any): boolean {
    // Simplified check - in practice would need more sophisticated analysis
    const projectionFields = Object.keys(projection);
    const groupOutputFields = ['_id', ...Object.keys(grouping).filter(k => k !== '_id')];
    
    return projectionFields.every(field => 
      groupOutputFields.includes(field) || projection[field] === 0 || projection[field] === false
    );
  }
  
  private isValidFusionGroup(group: FusionGroup): boolean {
    // Must have multiple stages to be worth fusing
    if (group.stages.length <= 1) {
      return false;
    }
    
    // Must meet speedup threshold
    if (group.estimatedSpeedup < this.config.minSpeedupThreshold) {
      return false;
    }
    
    // Must not exceed code size limit
    if (group.codeSize > this.config.maxCodeSize) {
      return false;
    }
    
    // Must maintain semantics
    if (!group.maintainsSemantics) {
      return false;
    }
    
    return true;
  }
  
  private updateStats(groups: FusionGroup[]) {
    const totalStages = groups.reduce((sum, g) => sum + g.stages.length, 0);
    this.stats.avgGroupSize = groups.length > 0 ? totalStages / groups.length : 0;
    
    this.stats.totalSpeedup += groups.reduce((sum, g) => sum + g.estimatedSpeedup, 0);
    this.stats.codeGenerated += groups.reduce((sum, g) => sum + g.codeSize, 0);
    this.stats.semanticsPreserved += groups.filter(g => g.maintainsSemantics).length;
  }
  
  /**
   * Get fusion statistics
   */
  getStats(): FusionStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalPipelines: 0,
      fusedGroups: 0,
      avgGroupSize: 0,
      totalSpeedup: 0,
      codeGenerated: 0,
      semanticsPreserved: 0
    };
  }
}

/**
 * Utility functions for pipeline analysis
 */
export class PipelineAnalysisUtils {
  /**
   * Analyze pipeline for fusion opportunities
   */
  static analyzeFusionOpportunities(pipeline: any[]): {
    totalStages: number;
    fusableStages: number;
    fusabilityRatio: number;
    complexityScore: number;
    estimatedSpeedup: number;
  } {
    const stages = pipeline.map(stage => StageAnalyzer.analyzePipelineStage(stage));
    
    const fusableStages = stages.filter(s => s.fusable).length;
    const complexityScore = stages.reduce((sum, s) => sum + s.complexity, 0);
    
    // Rough speedup estimate
    const fusabilityRatio = stages.length > 0 ? fusableStages / stages.length : 0;
    const estimatedSpeedup = 1.0 + (fusabilityRatio * stages.length * 0.1);
    
    return {
      totalStages: stages.length,
      fusableStages,
      fusabilityRatio,
      complexityScore,
      estimatedSpeedup
    };
  }
  
  /**
   * Recommend fusion configuration based on pipeline characteristics
   */
  static recommendFusionConfig(pipelines: any[][]): Partial<FusionConfig> {
    const analyses = pipelines.map(p => this.analyzeFusionOpportunities(p));
    
    const avgStages = analyses.reduce((sum, a) => sum + a.totalStages, 0) / analyses.length;
    const avgComplexity = analyses.reduce((sum, a) => sum + a.complexityScore, 0) / analyses.length;
    const avgFusability = analyses.reduce((sum, a) => sum + a.fusabilityRatio, 0) / analyses.length;
    
    const config: Partial<FusionConfig> = {};
    
    // Adjust max group size based on average pipeline length
    if (avgStages > 10) {
      config.maxGroupSize = 3; // Smaller groups for complex pipelines
    } else if (avgStages < 5) {
      config.maxGroupSize = 7; // Larger groups for simple pipelines
    }
    
    // Adjust speedup threshold based on fusability
    if (avgFusability > 0.8) {
      config.minSpeedupThreshold = 1.1; // Lower threshold for highly fusable pipelines
    } else if (avgFusability < 0.4) {
      config.minSpeedupThreshold = 1.5; // Higher threshold for poorly fusable pipelines
    }
    
    // Enable vectorization for simple pipelines
    config.vectorizationRequired = avgComplexity < 10;
    
    return config;
  }
}