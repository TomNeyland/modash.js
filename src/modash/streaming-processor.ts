/**
 * Streaming/Chunking Processor for modash.js
 * Implements memory-efficient processing for very large datasets
 */

import type { Collection, Document } from './expressions.js';
import type { Pipeline } from '../index.js';
import { aggregate } from './aggregation.js';

export interface StreamingOptions {
  chunkSize?: number;
  maxMemoryMB?: number;
  enableParallelProcessing?: boolean;
}

export class StreamingProcessor {
  private defaultChunkSize: number;
  private maxMemoryBytes: number;

  constructor(options: StreamingOptions = {}) {
    this.defaultChunkSize = options.chunkSize || 1000;
    this.maxMemoryBytes = (options.maxMemoryMB || 50) * 1024 * 1024; // 50MB default
  }

  /**
   * Process large collections in chunks to avoid memory issues
   */
  async processLargeCollection<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline,
    options: StreamingOptions = {}
  ): Promise<Collection<T>> {
    const chunkSize = options.chunkSize || this.defaultChunkSize;
    
    // For smaller collections, use regular processing
    if (collection.length <= chunkSize * 2) {
      return aggregate(collection, pipeline);
    }

    // Check if pipeline is streamable (some operations require full dataset)
    if (!this.isPipelineStreamable(pipeline)) {
      console.warn('Pipeline contains non-streamable operations, using regular processing');
      return aggregate(collection, pipeline);
    }

    const results: T[] = [];
    const totalChunks = Math.ceil(collection.length / chunkSize);

    console.log(`🔄 Processing ${collection.length} documents in ${totalChunks} chunks of ${chunkSize}`);

    for (let i = 0; i < collection.length; i += chunkSize) {
      const chunk = collection.slice(i, i + chunkSize);
      const chunkResults = aggregate(chunk, pipeline);
      
      results.push(...(chunkResults as T[]));

      // Memory pressure check
      if (this.shouldRunGarbageCollection(results.length)) {
        await this.forceGarbageCollection();
      }

      // Progress reporting for very large datasets
      if (totalChunks > 10 && (i / chunkSize + 1) % Math.max(1, Math.floor(totalChunks / 10)) === 0) {
        const progress = Math.round(((i / chunkSize + 1) / totalChunks) * 100);
        console.log(`📊 Progress: ${progress}% (${i / chunkSize + 1}/${totalChunks} chunks)`);
      }
    }

    console.log(`✅ Completed processing ${collection.length} documents → ${results.length} results`);
    return results as Collection<T>;
  }

  /**
   * Process collection with adaptive chunking based on memory usage
   */
  async processWithAdaptiveChunking<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): Promise<Collection<T>> {
    const startMemory = this.getMemoryUsage();
    let chunkSize = this.defaultChunkSize;
    const results: T[] = [];

    for (let i = 0; i < collection.length; i += chunkSize) {
      const chunk = collection.slice(i, i + chunkSize);
      const chunkStart = this.getMemoryUsage();
      
      const chunkResults = aggregate(chunk, pipeline);
      results.push(...(chunkResults as T[]));

      const chunkEnd = this.getMemoryUsage();
      const chunkMemoryDelta = chunkEnd - chunkStart;

      // Adapt chunk size based on memory usage
      if (chunkMemoryDelta > this.maxMemoryBytes * 0.1) {
        // Reduce chunk size if using too much memory
        chunkSize = Math.max(100, Math.floor(chunkSize * 0.8));
        console.log(`🔽 Reducing chunk size to ${chunkSize} due to high memory usage`);
      } else if (chunkMemoryDelta < this.maxMemoryBytes * 0.02 && chunkSize < this.defaultChunkSize * 2) {
        // Increase chunk size if using very little memory
        chunkSize = Math.floor(chunkSize * 1.2);
        console.log(`🔼 Increasing chunk size to ${chunkSize} for better performance`);
      }

      // Force GC if memory usage is high
      if (this.getMemoryUsage() - startMemory > this.maxMemoryBytes * 0.7) {
        await this.forceGarbageCollection();
      }
    }

    return results as Collection<T>;
  }

  /**
   * Process very large datasets with spill-to-disk capability
   */
  async processVeryLargeDataset<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline,
    options: { spillToDisk?: boolean } = {}
  ): Promise<Collection<T>> {
    const { spillToDisk = false } = options;
    
    if (collection.length < 50000 || !spillToDisk) {
      return this.processLargeCollection(collection, pipeline);
    }

    // For extremely large datasets, implement a different strategy
    console.log(`🗂️  Processing extremely large dataset with ${collection.length} documents`);
    
    // This would be where we implement temporary file-based processing
    // For now, fall back to chunked processing with smaller chunks
    return this.processLargeCollection(collection, pipeline, { chunkSize: 500 });
  }

  /**
   * Check if pipeline operations are suitable for streaming
   */
  private isPipelineStreamable(pipeline: Pipeline): boolean {
    for (const stage of pipeline) {
      // Operations that require full dataset view
      if ('$sort' in stage && this.isGlobalSort(stage.$sort)) {
        return false;
      }
      if ('$group' in stage && this.requiresGlobalGrouping(stage.$group)) {
        return false;
      }
      if ('$lookup' in stage) {
        return false; // Lookups require full foreign collection
      }
      // $limit and $skip at the end might be problematic for streaming
      if ('$limit' in stage || '$skip' in stage) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if sort operation requires global ordering
   */
  private isGlobalSort(sortSpec: any): boolean {
    // Simple heuristic: if sorting is complex, assume it needs global view
    return Object.keys(sortSpec).length > 1;
  }

  /**
   * Check if grouping requires global aggregation
   */
  private requiresGlobalGrouping(groupSpec: any): boolean {
    // Most grouping operations require global view
    // Only simple field projections might be streamable
    return '_id' in groupSpec && groupSpec._id !== null;
  }

  /**
   * Get current memory usage (Node.js specific)
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0; // Browser fallback
  }

  /**
   * Check if garbage collection should be triggered
   */
  private shouldRunGarbageCollection(resultsLength: number): boolean {
    const currentMemory = this.getMemoryUsage();
    return currentMemory > this.maxMemoryBytes * 0.8 || resultsLength > 100000;
  }

  /**
   * Force garbage collection with delay
   */
  private async forceGarbageCollection(): Promise<void> {
    if (typeof global !== 'undefined' && global.gc) {
      console.log('🗑️  Running garbage collection...');
      global.gc();
    }
    
    // Small delay to allow GC to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Estimate memory requirements for collection
   */
  estimateMemoryRequirement<T extends Document>(collection: Collection<T>): number {
    if (collection.length === 0) return 0;
    
    // Rough estimate: JSON.stringify sample and extrapolate
    const sampleSize = Math.min(10, collection.length);
    const sample = collection.slice(0, sampleSize);
    const sampleMemory = JSON.stringify(sample).length * 2; // Rough estimate including overhead
    
    return (sampleMemory / sampleSize) * collection.length;
  }

  /**
   * Get processing recommendations for a collection
   */
  getProcessingRecommendation<T extends Document>(
    collection: Collection<T>,
    pipeline: Pipeline
  ): {
    strategy: 'regular' | 'chunked' | 'streaming' | 'adaptive';
    estimatedMemory: number;
    recommendedChunkSize?: number;
    warnings: string[];
  } {
    const estimatedMemory = this.estimateMemoryRequirement(collection);
    const warnings: string[] = [];
    let strategy: 'regular' | 'chunked' | 'streaming' | 'adaptive' = 'regular';
    let recommendedChunkSize: number | undefined;

    if (collection.length > 100000) {
      strategy = 'streaming';
      recommendedChunkSize = 1000;
      warnings.push('Very large dataset detected - consider streaming processing');
    } else if (collection.length > 25000) {
      strategy = 'chunked';
      recommendedChunkSize = 2500;
      warnings.push('Large dataset detected - chunked processing recommended');
    } else if (estimatedMemory > this.maxMemoryBytes) {
      strategy = 'adaptive';
      recommendedChunkSize = Math.max(100, Math.floor(this.maxMemoryBytes / (estimatedMemory / collection.length)));
      warnings.push('High memory usage estimated - adaptive chunking recommended');
    }

    if (!this.isPipelineStreamable(pipeline) && strategy !== 'regular') {
      warnings.push('Pipeline contains operations that may not benefit from streaming');
    }

    return {
      strategy,
      estimatedMemory,
      recommendedChunkSize,
      warnings,
    };
  }
}

// Export singleton instance
export const globalStreamingProcessor = new StreamingProcessor();