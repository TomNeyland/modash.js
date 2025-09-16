/**
 * Phase 10: Adaptive Batching Scheduler
 *
 * Manages delta micro-batching with:
 * - Adaptive batch sizing based on operation latency and queue depth
 * - Backpressure management with pause/resume logic
 * - Minimum emit cadence (≥10ms) for efficiency
 * - Performance monitoring and statistics
 */

import {
  SPSCRingBuffer,
  DeltaBatch,
  Delta,
  AdaptiveBatchBuilder,
} from '../io/ring_buffer';

// Re-export for convenience
export {
  SPSCRingBuffer,
  DeltaBatch,
  Delta,
  AdaptiveBatchBuilder,
} from '../io/ring_buffer';

export interface BatchingConfig {
  initialBatchSize?: number;
  minBatchSize?: number;
  maxBatchSize?: number;
  minEmitCadenceMs?: number;
  backpressureThreshold?: number;
  resumeThreshold?: number;
  ringBufferCapacity?: number;
}

export interface BatchingStats {
  totalBatchesProcessed: number;
  totalDeltasProcessed: number;
  avgBatchSize: number;
  avgProcessingLatency: number;
  backpressureEvents: number;
  ringBufferUtilization: number;
  currentBatchSize: number;
  isBackpressureActive: boolean;
}

/**
 * High-performance delta batching scheduler
 * Coordinates between producers and consumers with adaptive sizing
 */
export class DeltaBatchingScheduler {
  private readonly config: Required<BatchingConfig>;
  private readonly ringBuffer: SPSCRingBuffer;
  private readonly batchBuilder: AdaptiveBatchBuilder;

  private isBackpressureActive: boolean = false;
  private lastEmitTime: number = 0;
  private totalBatchesProcessed: number = 0;
  private totalDeltasProcessed: number = 0;
  private backpressureEvents: number = 0;
  private processingLatencies: number[] = [];

  private readonly processingLatencyWindow: number = 100;

  constructor(config: BatchingConfig = {}) {
    this.config = {
      initialBatchSize: config.initialBatchSize ?? 256,
      minBatchSize: config.minBatchSize ?? 256,
      maxBatchSize: config.maxBatchSize ?? 4096,
      minEmitCadenceMs: config.minEmitCadenceMs ?? 10,
      backpressureThreshold: config.backpressureThreshold ?? 0.8,
      resumeThreshold: config.resumeThreshold ?? 0.4,
      ringBufferCapacity: config.ringBufferCapacity ?? 1024,
    };

    this.ringBuffer = new SPSCRingBuffer(
      this.config.ringBufferCapacity,
      this.config.maxBatchSize
    );

    this.batchBuilder = new AdaptiveBatchBuilder();
  }

  /**
   * Submit a batch of deltas for processing
   * Returns false if backpressure is active
   */
  submitBatch(deltas: Delta[]): boolean {
    // Check backpressure
    if (this.ringBuffer.shouldApplyBackpressure()) {
      if (!this.isBackpressureActive) {
        this.isBackpressureActive = true;
        this.backpressureEvents++;
      }
      return false; // Apply backpressure
    }

    // Resume from backpressure if threshold is met
    if (
      this.isBackpressureActive &&
      this.ringBuffer.canResumeAfterBackpressure()
    ) {
      this.isBackpressureActive = false;
    }

    // Create batch
    const batch: DeltaBatch = {
      deltas: deltas.slice(), // Copy deltas
      size: deltas.length,
      capacity: deltas.length,
      timestamp: Date.now(),
    };

    // Try to produce batch
    const success = this.ringBuffer.produce(batch);
    if (success) {
      this.totalDeltasProcessed += deltas.length;
    }

    return success;
  }

  /**
   * Process next available batch
   * Returns null if no batch is ready or emit cadence not met
   */
  processNextBatch(): DeltaBatch | null {
    const now = Date.now();

    // Enforce minimum emit cadence
    if (now - this.lastEmitTime < this.config.minEmitCadenceMs) {
      return null;
    }

    // Consume batch from ring buffer
    const batch = this.ringBuffer.consume();
    if (!batch) {
      return null;
    }

    this.lastEmitTime = now;
    this.totalBatchesProcessed++;

    return batch;
  }

  /**
   * Report processing completion with latency for adaptive sizing
   */
  reportProcessingComplete(batch: DeltaBatch, processingLatencyMs: number) {
    // Track processing latency
    this.processingLatencies.push(processingLatencyMs);
    if (this.processingLatencies.length > this.processingLatencyWindow) {
      this.processingLatencies.shift();
    }

    // Update adaptive batch sizing
    const queueDepth = this.ringBuffer.getUtilization();
    this.batchBuilder.adaptBatchSize(processingLatencyMs, queueDepth);
  }

  /**
   * Get recommended batch size for next submission
   */
  getRecommendedBatchSize(): number {
    return this.batchBuilder.getCurrentBatchSize();
  }

  /**
   * Get comprehensive batching statistics
   */
  getStats(): BatchingStats {
    const avgProcessingLatency =
      this.processingLatencies.length > 0
        ? this.processingLatencies.reduce((a, b) => a + b, 0) /
          this.processingLatencies.length
        : 0;

    const avgBatchSize =
      this.totalBatchesProcessed > 0
        ? this.totalDeltasProcessed / this.totalBatchesProcessed
        : 0;

    return {
      totalBatchesProcessed: this.totalBatchesProcessed,
      totalDeltasProcessed: this.totalDeltasProcessed,
      avgBatchSize,
      avgProcessingLatency,
      backpressureEvents: this.backpressureEvents,
      ringBufferUtilization: this.ringBuffer.getUtilization(),
      currentBatchSize: this.batchBuilder.getCurrentBatchSize(),
      isBackpressureActive: this.isBackpressureActive,
    };
  }

  /**
   * Get detailed performance metrics
   */
  getDetailedMetrics() {
    return {
      batching: this.getStats(),
      ringBuffer: this.ringBuffer.getStats(),
      batchBuilder: this.batchBuilder.getStats(),
      config: this.config,
    };
  }

  /**
   * Reset statistics (useful for benchmarking)
   */
  resetStats() {
    this.totalBatchesProcessed = 0;
    this.totalDeltasProcessed = 0;
    this.backpressureEvents = 0;
    this.processingLatencies = [];
    this.isBackpressureActive = false;
    this.lastEmitTime = 0;
  }

  /**
   * Check if scheduler can accept more deltas
   */
  canAcceptMore(): boolean {
    return !this.isBackpressureActive;
  }

  /**
   * Get current queue depth (0.0 to 1.0)
   */
  getQueueDepth(): number {
    return this.ringBuffer.getUtilization();
  }
}

/**
 * Delta Throughput Monitor
 * Tracks performance metrics for throughput optimization
 */
export class DeltaThroughputMonitor {
  private deltasPerSecondSamples: number[] = [];
  private readonly sampleWindow: number = 20;
  private readonly sampleIntervalMs: number = 1000;

  private lastSampleTime: number = 0;
  private lastDeltaCount: number = 0;
  private totalDeltas: number = 0;

  /**
   * Update delta count and calculate throughput
   */
  updateDeltaCount(deltaCount: number) {
    this.totalDeltas = deltaCount;
    const now = Date.now();

    if (now - this.lastSampleTime >= this.sampleIntervalMs) {
      const deltasSinceLastSample = deltaCount - this.lastDeltaCount;
      const timeElapsed = (now - this.lastSampleTime) / 1000;
      const deltasPerSecond = deltasSinceLastSample / timeElapsed;

      this.deltasPerSecondSamples.push(deltasPerSecond);
      if (this.deltasPerSecondSamples.length > this.sampleWindow) {
        this.deltasPerSecondSamples.shift();
      }

      this.lastSampleTime = now;
      this.lastDeltaCount = deltaCount;
    }
  }

  /**
   * Get current throughput in deltas per second
   */
  getCurrentThroughput(): number {
    if (this.deltasPerSecondSamples.length === 0) return 0;

    const recentSamples = this.deltasPerSecondSamples.slice(-5);
    return recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
  }

  /**
   * Get average throughput over the sample window
   */
  getAverageThroughput(): number {
    if (this.deltasPerSecondSamples.length === 0) return 0;

    return (
      this.deltasPerSecondSamples.reduce((a, b) => a + b, 0) /
      this.deltasPerSecondSamples.length
    );
  }

  /**
   * Check if target throughput is being met
   */
  isMeetingTargetThroughput(targetDeltasPerSecond: number): boolean {
    return this.getCurrentThroughput() >= targetDeltasPerSecond;
  }

  /**
   * Get throughput statistics
   */
  getStats() {
    return {
      currentThroughput: this.getCurrentThroughput(),
      averageThroughput: this.getAverageThroughput(),
      totalDeltas: this.totalDeltas,
      sampleCount: this.deltasPerSecondSamples.length,
      samples: this.deltasPerSecondSamples.slice(),
    };
  }
}
