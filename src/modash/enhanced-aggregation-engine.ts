/**
 * Enhanced Aggregation Engine for modash.js
 * Integrates columnar storage, object pooling, and adaptive strategies
 */

import type { Collection, Document } from './expressions.js';
import type { Pipeline } from '../index.js';
import { ColumnarStorage } from './columnar-storage.js';
import { globalDocumentPool, PooledOperation } from './object-pool.js';
import { QueryOptimizer, type ExecutionPlan } from './query-optimizer.js';

interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  strategy: string;
  optimizations: string[];
}

interface AdaptiveThresholds {
  smallDataset: number;
  mediumDataset: number;
  largeDataset: number;
  columnarThreshold: number;
}

export class EnhancedAggregationEngine {
  private queryOptimizer: QueryOptimizer;
  private performanceHistory: Map<string, PerformanceMetrics[]> = new Map();
  private columnarCache: Map<string, any> = new Map();
  
  private thresholds: AdaptiveThresholds = {
    smallDataset: 1000,
    mediumDataset: 10000,
    largeDataset: 100000,
    columnarThreshold: 50000  // Much higher threshold for columnar optimization
  };

  constructor() {
    this.queryOptimizer = new QueryOptimizer();
  }

  /**
   * Enhanced aggregate with adaptive strategy selection (synchronous version)
   */
  aggregateSync<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    const startTime = performance.now();
    const startMemory = this.getCurrentMemoryUsage();

    // Select optimal strategy based on dataset characteristics
    const strategy = this.selectOptimalStrategy(collection, pipeline);
    let result: Collection<T>;
    let optimizations: string[] = [];

    try {
      switch (strategy) {
        case 'columnar-optimized':
          result = this.executeColumnarOptimizedSync(collection, pipeline);
          optimizations.push('Columnar storage optimization');
          break;

        case 'pooled-execution':
          result = this.executePooledOperationSync(collection, pipeline);
          optimizations.push('Object pooling optimization');
          break;

        case 'streaming-batched':
          result = this.executeStreamingBatchedSync(collection, pipeline);
          optimizations.push('Streaming batch processing');
          break;

        case 'hybrid-optimized':
          result = this.executeHybridOptimizedSync(collection, pipeline);
          optimizations.push('Hybrid optimization strategy');
          break;

        default:
          // Fallback to existing performance engine
          result = this.executeFallbackSync(collection, pipeline);
          optimizations.push('Standard execution');
      }

      // Record performance metrics
      const endTime = performance.now();
      const endMemory = this.getCurrentMemoryUsage();
      
      const metrics: PerformanceMetrics = {
        executionTime: endTime - startTime,
        memoryUsage: endMemory - startMemory,
        strategy,
        optimizations
      };

      this.recordPerformanceMetrics(collection, pipeline, metrics);

      return result;

    } catch (error) {
      // Fallback to standard execution on error
      console.warn('Enhanced execution failed, falling back to standard:', error);
      return this.executeFallbackSync(collection, pipeline);
    }
  }

  /**
   * Enhanced aggregate with adaptive strategy selection (async version)
   */
  async aggregate<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    const startTime = performance.now();
    const startMemory = this.getCurrentMemoryUsage();

    // Select optimal strategy based on dataset characteristics
    const strategy = this.selectOptimalStrategy(collection, pipeline);
    let result: Collection<T>;
    let optimizations: string[] = [];

    try {
      switch (strategy) {
        case 'columnar-optimized':
          result = await this.executeColumnarOptimized(collection, pipeline);
          optimizations.push('Columnar storage optimization');
          break;

        case 'pooled-execution':
          result = await this.executePooledOperation(collection, pipeline);
          optimizations.push('Object pooling optimization');
          break;

        case 'streaming-batched':
          result = await this.executeStreamingBatched(collection, pipeline);
          optimizations.push('Streaming batch processing');
          break;

        case 'hybrid-optimized':
          result = await this.executeHybridOptimized(collection, pipeline);
          optimizations.push('Hybrid optimization strategy');
          break;

        default:
          // Fallback to existing performance engine
          result = await this.executeFallback(collection, pipeline);
          optimizations.push('Standard execution');
      }

      // Record performance metrics
      const endTime = performance.now();
      const endMemory = this.getCurrentMemoryUsage();
      
      const metrics: PerformanceMetrics = {
        executionTime: endTime - startTime,
        memoryUsage: endMemory - startMemory,
        strategy,
        optimizations
      };

      this.recordPerformanceMetrics(collection, pipeline, metrics);

      return result;

    } catch (error) {
      // Fallback to standard execution on error
      console.warn('Enhanced execution failed, falling back to standard:', error);
      return await this.executeFallback(collection, pipeline);
    }
  }

  /**
   * Columnar storage optimized execution (synchronous)
   */
  private executeColumnarOptimizedSync<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    // Create columnar representation
    const columnStore = ColumnarStorage.createColumnStore(collection);
    
    // Process pipeline stages using columnar operations where possible
    let currentData: Collection<T> = collection;
    
    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0];
      
      if (stageType === '$group' && this.canUseColumnarGrouping(stage.$group)) {
        // Use optimized columnar grouping
        const groupResult = ColumnarStorage.fastGroupBy(
          columnStore,
          stage.$group._id,
          stage.$group
        );
        currentData = groupResult as Collection<T>;
      } else {
        // Fall back to regular processing for this stage
        currentData = this.executeSingleStageSync(currentData, stage);
      }
    }

    return currentData;
  }

  /**
   * Object pooling optimized execution (synchronous)
   */
  private executePooledOperationSync<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    const pooled = new PooledOperation(globalDocumentPool);
    
    try {
      let currentData: Collection<T> = collection;

      for (const stage of pipeline) {
        currentData = pooled.withArray<T, Collection<T>>((resultArray) => {
          // Process stage with pooled objects
          for (const doc of currentData) {
            const processedDoc = pooled.withDocument((tempDoc) => {
              return this.processDocumentWithStage(doc, stage, tempDoc);
            });
            
            if (processedDoc) {
              resultArray.push(processedDoc);
            }
          }
          
          return [...resultArray]; // Return copy since resultArray will be pooled
        });
      }

      return currentData;
    } finally {
      pooled.dispose();
    }
  }

  /**
   * Streaming batch processing for large datasets (synchronous)
   */
  private executeStreamingBatchedSync<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    const batchSize = this.calculateOptimalBatchSize(collection.length);
    const results: T[] = [];

    // Process in batches to manage memory
    for (let i = 0; i < collection.length; i += batchSize) {
      const batch = collection.slice(i, i + batchSize);
      const batchResult = this.executeFallbackSync(batch, pipeline);
      results.push(...batchResult);
    }

    return results as Collection<T>;
  }

  /**
   * Hybrid optimization combining multiple strategies (synchronous)
   */
  private executeHybridOptimizedSync<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    // Use columnar for numeric-heavy operations
    if (this.hasNumericAggregations(pipeline) && collection.length > this.thresholds.columnarThreshold) {
      return this.executeColumnarOptimizedSync(collection, pipeline);
    }

    // Use object pooling for medium datasets with complex operations
    if (collection.length > this.thresholds.smallDataset && collection.length < this.thresholds.largeDataset) {
      return this.executePooledOperationSync(collection, pipeline);
    }

    // Use streaming for very large datasets
    if (collection.length > this.thresholds.largeDataset) {
      return this.executeStreamingBatchedSync(collection, pipeline);
    }

    // Default to standard execution
    return this.executeFallbackSync(collection, pipeline);
  }

  /**
   * Columnar storage optimized execution
   */
  private async executeColumnarOptimized<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    // Create columnar representation
    const columnStore = ColumnarStorage.createColumnStore(collection);
    
    // Process pipeline stages using columnar operations where possible
    let currentData: Collection<T> = collection;
    
    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0];
      
      if (stageType === '$group' && this.canUseColumnarGrouping(stage.$group)) {
        // Use optimized columnar grouping
        const groupResult = ColumnarStorage.fastGroupBy(
          columnStore,
          stage.$group._id,
          stage.$group
        );
        currentData = groupResult as Collection<T>;
      } else {
        // Fall back to regular processing for this stage
        currentData = await this.executeSingleStage(currentData, stage);
      }
    }

    return currentData;
  }

  /**
   * Object pooling optimized execution
   */
  private async executePooledOperation<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    const pooled = new PooledOperation(globalDocumentPool);
    
    try {
      let currentData: Collection<T> = collection;

      for (const stage of pipeline) {
        currentData = await pooled.withArray<T, Collection<T>>(async (resultArray) => {
          // Process stage with pooled objects
          for (const doc of currentData) {
            const processedDoc = await pooled.withDocument((tempDoc) => {
              return this.processDocumentWithStage(doc, stage, tempDoc);
            });
            
            if (processedDoc) {
              resultArray.push(processedDoc);
            }
          }
          
          return [...resultArray]; // Return copy since resultArray will be pooled
        });
      }

      return currentData;
    } finally {
      pooled.dispose();
    }
  }

  /**
   * Streaming batch processing for large datasets
   */
  private async executeStreamingBatched<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    const batchSize = this.calculateOptimalBatchSize(collection.length);
    const results: T[] = [];

    // Process in batches to manage memory
    for (let i = 0; i < collection.length; i += batchSize) {
      const batch = collection.slice(i, i + batchSize);
      const batchResult = await this.executeFallback(batch, pipeline);
      results.push(...batchResult);

      // Yield control to prevent blocking
      if (i % (batchSize * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return results as Collection<T>;
  }

  /**
   * Hybrid optimization combining multiple strategies
   */
  private async executeHybridOptimized<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    // Use columnar for numeric-heavy operations
    if (this.hasNumericAggregations(pipeline) && collection.length > this.thresholds.columnarThreshold) {
      return await this.executeColumnarOptimized(collection, pipeline);
    }

    // Use object pooling for medium datasets with complex operations
    if (collection.length > this.thresholds.smallDataset && collection.length < this.thresholds.largeDataset) {
      return await this.executePooledOperation(collection, pipeline);
    }

    // Use streaming for very large datasets
    if (collection.length > this.thresholds.largeDataset) {
      return await this.executeStreamingBatched(collection, pipeline);
    }

    // Default to standard execution
    return await this.executeFallback(collection, pipeline);
  }

  /**
   * Select optimal execution strategy based on data characteristics
   */
  private selectOptimalStrategy<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): string {
    const size = collection.length;
    const complexity = this.calculatePipelineComplexity(pipeline);
    const hasNumericOps = this.hasNumericAggregations(pipeline);
    const historicalPerf = this.getHistoricalPerformance(pipeline);

    // Very large datasets - use streaming
    if (size > this.thresholds.largeDataset) {
      return 'streaming-batched';
    }

    // Numeric-heavy operations with large enough dataset - use columnar
    if (hasNumericOps && size > this.thresholds.columnarThreshold) {
      return 'columnar-optimized';
    }

    // Medium complexity and size - consider hybrid approach
    if (size > this.thresholds.mediumDataset && complexity > 3) {
      return 'hybrid-optimized';
    }

    // Medium datasets - use object pooling
    if (size > this.thresholds.smallDataset) {
      return 'pooled-execution';
    }

    // Small datasets or based on historical performance
    if (historicalPerf && historicalPerf.strategy) {
      return historicalPerf.strategy;
    }

    return 'standard';
  }

  /**
   * Calculate pipeline complexity score
   */
  private calculatePipelineComplexity(pipeline: Pipeline): number {
    let complexity = 0;
    
    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0];
      
      switch (stageType) {
        case '$match':
          complexity += 1;
          break;
        case '$project':
          complexity += 1;
          break;
        case '$group':
          complexity += 3; // Grouping is expensive
          break;
        case '$sort':
          complexity += 2;
          break;
        case '$lookup':
          complexity += 4; // Joins are very expensive
          break;
        case '$unwind':
          complexity += 2;
          break;
        default:
          complexity += 1;
      }
    }
    
    return complexity;
  }

  /**
   * Check if pipeline has numeric aggregations
   */
  private hasNumericAggregations(pipeline: Pipeline): boolean {
    for (const stage of pipeline) {
      if (stage.$group) {
        const groupSpec = stage.$group;
        for (const [key, value] of Object.entries(groupSpec)) {
          if (key !== '_id' && typeof value === 'object') {
            const op = Object.keys(value)[0];
            if (['$sum', '$avg', '$min', '$max'].includes(op)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if columnar grouping can be used
   */
  private canUseColumnarGrouping(groupSpec: any): boolean {
    // For now, disable columnar grouping to avoid compatibility issues
    // This would need more sophisticated parsing of group specifications
    return false;
    
    // Original logic (commented out):
    // // Simple check - if _id is a string field and we have supported aggregations
    // if (typeof groupSpec._id !== 'string') {
    //   return false;
    // }

    // for (const [key, value] of Object.entries(groupSpec)) {
    //   if (key !== '_id' && typeof value === 'object') {
    //     const op = Object.keys(value)[0];
    //     if (!['$sum', '$avg', '$min', '$max', '$count'].includes(op)) {
    //       return false;
    //     }
    //   }
    // }

    // return true;
  }

  /**
   * Calculate optimal batch size based on available memory and dataset size
   */
  private calculateOptimalBatchSize(collectionSize: number): number {
    const availableMemory = this.getAvailableMemory();
    const baseSize = Math.min(10000, Math.max(1000, Math.floor(collectionSize / 100)));
    
    // Adjust based on available memory
    if (availableMemory < 100 * 1024 * 1024) { // Less than 100MB
      return Math.floor(baseSize / 2);
    } else if (availableMemory > 500 * 1024 * 1024) { // More than 500MB
      return baseSize * 2;
    }
    
    return baseSize;
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Get available memory estimate
   */
  private getAvailableMemory(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return usage.heapTotal - usage.heapUsed;
    }
    return 256 * 1024 * 1024; // Default 256MB estimate
  }

  /**
   * Record performance metrics for future optimization
   */
  private recordPerformanceMetrics<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline,
    metrics: PerformanceMetrics
  ) {
    const key = this.generateMetricsKey(pipeline, collection.length);
    const history = this.performanceHistory.get(key) || [];
    
    history.push(metrics);
    
    // Keep only recent metrics (last 10 executions)
    if (history.length > 10) {
      history.shift();
    }
    
    this.performanceHistory.set(key, history);
  }

  /**
   * Get historical performance data
   */
  private getHistoricalPerformance(pipeline: Pipeline) {
    const key = this.generateMetricsKey(pipeline, 0);
    const history = this.performanceHistory.get(key);
    
    if (!history || history.length === 0) {
      return null;
    }

    // Return the best performing strategy
    const bestMetrics = history.reduce((best, current) => 
      current.executionTime < best.executionTime ? current : best
    );

    return {
      strategy: bestMetrics.strategy,
      avgTime: history.reduce((sum, m) => sum + m.executionTime, 0) / history.length,
      bestTime: bestMetrics.executionTime
    };
  }

  /**
   * Generate cache key for metrics
   */
  private generateMetricsKey(pipeline: Pipeline, size: number): string {
    const pipelineHash = JSON.stringify(pipeline);
    const sizeCategory = size < 1000 ? 'small' : size < 10000 ? 'medium' : 'large';
    return `${pipelineHash}:${sizeCategory}`;
  }

  // Helper methods that would interface with existing aggregation system
  private async executeFallback<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    // This would call the existing aggregation system
    // For now, returning as-is since we don't want to break existing functionality
    const { aggregate } = await import('./aggregation.js');
    return aggregate(collection, pipeline) as Collection<T>;
  }

  private executeFallbackSync<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Collection<T> {
    // Fallback to traditional execution - just return collection for now
    // This would be replaced with actual traditional execution
    return collection;
  }

  private async executeSingleStage<T extends Document>(
    collection: Collection<T>,
    stage: any
  ): Promise<Collection<T>> {
    // Process a single pipeline stage
    return await this.executeFallback(collection, [stage]);
  }

  private executeSingleStageSync<T extends Document>(
    collection: Collection<T>,
    stage: any
  ): Collection<T> {
    // Process a single pipeline stage synchronously
    return this.executeFallbackSync(collection, [stage]);
  }

  private processDocumentWithStage<T extends Document>(
    doc: T,
    stage: any,
    tempDoc: Document
  ): T | null {
    // Process a single document through a stage using temporary pooled objects
    // This is a simplified version - would need full stage processing logic
    return doc;
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const stats = {
      totalQueries: 0,
      strategyCounts: {} as Record<string, number>,
      avgExecutionTime: 0,
      memoryEfficiency: 0
    };

    let totalTime = 0;
    let totalMemory = 0;

    for (const history of this.performanceHistory.values()) {
      for (const metrics of history) {
        stats.totalQueries++;
        totalTime += metrics.executionTime;
        totalMemory += Math.abs(metrics.memoryUsage);
        
        stats.strategyCounts[metrics.strategy] = 
          (stats.strategyCounts[metrics.strategy] || 0) + 1;
      }
    }

    if (stats.totalQueries > 0) {
      stats.avgExecutionTime = totalTime / stats.totalQueries;
      stats.memoryEfficiency = totalMemory / stats.totalQueries;
    }

    return stats;
  }
}