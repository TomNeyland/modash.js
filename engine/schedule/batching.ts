/**
 * Phase 10: Adaptive Micro-Batching Scheduler
 * 
 * Manages adaptive batch sizing (256→4096) based on:
 * - Operation latency feedback
 * - Queue depth monitoring
 * - Backpressure control with 80%/40% thresholds
 * - Minimum emit cadence of 10ms
 */

import { RingBuffer, RingBufferItem } from '../io/ring_buffer';

export interface BatchConfig {
  minBatchSize: number;      // Minimum batch size (default: 256)
  maxBatchSize: number;      // Maximum batch size (default: 4096)
  targetLatencyMs: number;   // Target operation latency (default: 5ms)
  minEmitCadenceMs: number;  // Minimum emit interval (default: 10ms)
  adaptationFactor: number;  // Batch size adaptation rate (default: 0.1)
  queueDepthThreshold: number; // Queue depth for batch size increase (default: 0.6)
}

export interface BatchMetrics {
  currentBatchSize: number;
  avgLatencyMs: number;
  queueUtilization: number;
  totalBatchesProcessed: number;
  adaptationEvents: number;
  backpressureTime: number;
}

export interface ProcessingResult {
  processedCount: number;
  latencyMs: number;
  memoryDeltaMB?: number;
}

/**
 * Exponential weighted moving average for latency tracking
 */
class EWMA {
  private value: number = 0;
  private initialized: boolean = false;
  
  constructor(private alpha: number = 0.1) {}
  
  update(newValue: number): number {
    if (!this.initialized) {
      this.value = newValue;
      this.initialized = true;
    } else {
      this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    }
    return this.value;
  }
  
  get current(): number {
    return this.value;
  }
}

/**
 * Adaptive micro-batching scheduler with backpressure control
 */
export class BatchingScheduler<T> {
  private readonly ringBuffer: RingBuffer<T>;
  private readonly config: BatchConfig;
  
  // Adaptive batch sizing state
  private currentBatchSize: number;
  private latencyTracker = new EWMA(0.1);
  private lastEmitTime: number = 0;
  
  // Metrics
  private totalBatchesProcessed: number = 0;
  private adaptationEvents: number = 0;
  private backpressureStartTime: number = 0;
  private totalBackpressureTime: number = 0;
  
  constructor(
    ringBufferCapacityPow2: number = 12, // 4096 slots
    config: Partial<BatchConfig> = {}
  ) {
    this.ringBuffer = new RingBuffer<T>(ringBufferCapacityPow2);
    
    this.config = {
      minBatchSize: 256,
      maxBatchSize: 4096,
      targetLatencyMs: 5,
      minEmitCadenceMs: 10,
      adaptationFactor: 0.1,
      queueDepthThreshold: 0.6,
      ...config
    };
    
    this.currentBatchSize = this.config.minBatchSize;
  }

  /**
   * Submit item for processing - returns false if backpressure active
   */
  submit(item: T): boolean {
    const wasBackpressure = this.ringBuffer.isBackpressureActive;
    const result = this.ringBuffer.produce(item);
    
    // Track backpressure timing
    if (!wasBackpressure && this.ringBuffer.isBackpressureActive) {
      this.backpressureStartTime = Date.now();
    } else if (wasBackpressure && !this.ringBuffer.isBackpressureActive) {
      this.totalBackpressureTime += Date.now() - this.backpressureStartTime;
    }
    
    return result;
  }

  /**
   * Get next batch for processing, respecting adaptive sizing and cadence
   */
  getNextBatch(): RingBufferItem<T>[] | null {
    const now = Date.now();
    const timeSinceLastEmit = now - this.lastEmitTime;
    const queueStats = this.ringBuffer.stats;
    
    // Enforce minimum emit cadence
    if (timeSinceLastEmit < this.config.minEmitCadenceMs) {
      return null;
    }
    
    // Check if we have enough items or if we've waited long enough
    const shouldEmit = queueStats.size >= this.currentBatchSize || 
                      timeSinceLastEmit >= this.config.minEmitCadenceMs * 2 ||
                      queueStats.utilizationPercent > 80;
    
    if (!shouldEmit || queueStats.size === 0) {
      return null;
    }
    
    // Consume batch with current adaptive size
    const batch = this.ringBuffer.consumeBatch(this.currentBatchSize);
    this.lastEmitTime = now;
    
    return batch.length > 0 ? batch : null;
  }

  /**
   * Report processing results to adapt batch size
   */
  reportProcessingResult(result: ProcessingResult): void {
    this.totalBatchesProcessed++;
    
    // Update latency tracking
    const avgLatency = this.latencyTracker.update(result.latencyMs);
    const queueStats = this.ringBuffer.stats;
    
    // Adapt batch size based on latency and queue depth
    let newBatchSize = this.currentBatchSize;
    
    if (avgLatency > this.config.targetLatencyMs) {
      // Latency too high - decrease batch size
      newBatchSize = Math.max(
        this.config.minBatchSize,
        Math.floor(this.currentBatchSize * (1 - this.config.adaptationFactor))
      );
    } else if (
      avgLatency < this.config.targetLatencyMs * 0.7 && 
      queueStats.utilizationPercent > this.config.queueDepthThreshold * 100
    ) {
      // Latency good and queue has depth - increase batch size
      newBatchSize = Math.min(
        this.config.maxBatchSize,
        Math.floor(this.currentBatchSize * (1 + this.config.adaptationFactor))
      );
    }
    
    if (newBatchSize !== this.currentBatchSize) {
      this.currentBatchSize = newBatchSize;
      this.adaptationEvents++;
    }
  }

  /**
   * Force batch emission (useful for shutdown/flush scenarios)
   */
  forceBatch(): RingBufferItem<T>[] {
    const batch = this.ringBuffer.consumeBatch(this.config.maxBatchSize);
    this.lastEmitTime = Date.now();
    return batch;
  }

  get metrics(): BatchMetrics {
    const queueStats = this.ringBuffer.stats;
    
    return {
      currentBatchSize: this.currentBatchSize,
      avgLatencyMs: this.latencyTracker.current,
      queueUtilization: queueStats.utilizationPercent,
      totalBatchesProcessed: this.totalBatchesProcessed,
      adaptationEvents: this.adaptationEvents,
      backpressureTime: this.totalBackpressureTime + 
        (this.ringBuffer.isBackpressureActive ? Date.now() - this.backpressureStartTime : 0)
    };
  }

  get isBackpressureActive(): boolean {
    return this.ringBuffer.isBackpressureActive;
  }

  /**
   * Clear all pending items and reset adaptive state
   */
  clear(): void {
    this.ringBuffer.clear();
    this.currentBatchSize = this.config.minBatchSize;
    this.latencyTracker = new EWMA(0.1);
    this.lastEmitTime = 0;
    this.totalBatchesProcessed = 0;
    this.adaptationEvents = 0;
    this.totalBackpressureTime = 0;
  }

  /**
   * Get configuration snapshot
   */
  get configuration(): BatchConfig {
    return { ...this.config };
  }
}