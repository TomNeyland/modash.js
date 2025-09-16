/**
 * Phase 10: SPSC Ring Buffer for Delta Micro-Batching
 *
 * Single Producer Single Consumer ring buffer with:
 * - Power-of-two sizing for fast modulo operations
 * - Cache-line padded cursors to avoid false sharing
 * - Preallocated batch slots for zero-allocation operation
 * - Backpressure management
 */

const CACHE_LINE_SIZE = 64;

/**
 * Delta representing a single change in the dataset
 */
export interface Delta {
  type: 'insert' | 'update' | 'delete';
  rowId: number;
  data?: any;
  timestamp: number;
}

/**
 * Batch of deltas for processing
 */
export interface DeltaBatch {
  deltas: Delta[];
  size: number;
  capacity: number;
  timestamp: number;
}

/**
 * Single Producer Single Consumer Ring Buffer
 * Optimized for high-throughput delta processing
 */
export class SPSCRingBuffer {
  private readonly capacity: number;
  private readonly mask: number;
  private readonly buffer: DeltaBatch[];

  // Cache-line padded cursors to avoid false sharing
  private readonly producerCursor = new Int32Array(CACHE_LINE_SIZE / 4);
  private readonly consumerCursor = new Int32Array(CACHE_LINE_SIZE / 4);

  private readonly batchCapacity: number;

  constructor(capacity: number = 1024, batchCapacity: number = 256) {
    // Ensure power of two for fast modulo operations
    this.capacity = this.nextPowerOfTwo(capacity);
    this.mask = this.capacity - 1;
    this.batchCapacity = batchCapacity;

    // Preallocate all batch slots
    this.buffer = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = {
        deltas: new Array(this.batchCapacity),
        size: 0,
        capacity: this.batchCapacity,
        timestamp: 0,
      };
    }

    // Initialize cursors
    this.producerCursor[0] = 0;
    this.consumerCursor[0] = 0;
  }

  /**
   * Produce a batch into the ring buffer
   * Returns true if successful, false if buffer is full (backpressure)
   */
  produce(batch: DeltaBatch): boolean {
    const currentProducer = this.producerCursor[0];
    const nextProducer = (currentProducer + 1) & this.mask;

    // Check if buffer is full
    if (nextProducer === this.consumerCursor[0]) {
      return false; // Backpressure - buffer full
    }

    const slot = this.buffer[currentProducer];

    // Copy batch data into preallocated slot
    slot.size = Math.min(batch.size, slot.capacity);
    slot.timestamp = batch.timestamp;

    for (let i = 0; i < slot.size; i++) {
      slot.deltas[i] = batch.deltas[i];
    }

    // Memory barrier - ensure data is written before updating cursor
    this.producerCursor[0] = nextProducer;

    return true;
  }

  /**
   * Consume a batch from the ring buffer
   * Returns null if buffer is empty
   */
  consume(): DeltaBatch | null {
    const currentConsumer = this.consumerCursor[0];

    // Check if buffer is empty
    if (currentConsumer === this.producerCursor[0]) {
      return null;
    }

    const batch = this.buffer[currentConsumer];
    const nextConsumer = (currentConsumer + 1) & this.mask;

    // Memory barrier - ensure data is read before updating cursor
    this.consumerCursor[0] = nextConsumer;

    return batch;
  }

  /**
   * Get current buffer utilization (0.0 to 1.0)
   */
  getUtilization(): number {
    const producer = this.producerCursor[0];
    const consumer = this.consumerCursor[0];
    const used = (producer - consumer + this.capacity) & this.mask;
    return used / this.capacity;
  }

  /**
   * Check if buffer has reached backpressure threshold (80%)
   */
  shouldApplyBackpressure(): boolean {
    return this.getUtilization() >= 0.8;
  }

  /**
   * Check if buffer can resume after backpressure (40%)
   */
  canResumeAfterBackpressure(): boolean {
    return this.getUtilization() <= 0.4;
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    return {
      capacity: this.capacity,
      utilization: this.getUtilization(),
      used:
        (this.producerCursor[0] - this.consumerCursor[0] + this.capacity) &
        this.mask,
      batchCapacity: this.batchCapacity,
    };
  }

  private nextPowerOfTwo(n: number): number {
    if (n <= 1) return 2;
    return Math.pow(2, Math.ceil(Math.log2(n)));
  }
}

/**
 * Adaptive Batch Builder
 * Dynamically adjusts batch sizes based on processing latency and queue depth
 */
export class AdaptiveBatchBuilder {
  private currentBatchSize: number = 256;
  private readonly minBatchSize: number = 256;
  private readonly maxBatchSize: number = 4096;
  private readonly adjustmentFactor: number = 1.2;

  private recentLatencies: number[] = [];
  private readonly latencyWindowSize: number = 10;

  constructor() {
    // Initialize with default batch size
  }

  /**
   * Update batch size based on processing latency and queue depth
   */
  adaptBatchSize(processingLatencyMs: number, queueDepth: number): number {
    // Track recent latencies
    this.recentLatencies.push(processingLatencyMs);
    if (this.recentLatencies.length > this.latencyWindowSize) {
      this.recentLatencies.shift();
    }

    const avgLatency =
      this.recentLatencies.reduce((a, b) => a + b, 0) /
      this.recentLatencies.length;

    // Increase batch size if latency is low and queue depth is high
    if (avgLatency < 5 && queueDepth > 0.6) {
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.floor(this.currentBatchSize * this.adjustmentFactor)
      );
    }
    // Decrease batch size if latency is high
    else if (avgLatency > 20) {
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize / this.adjustmentFactor)
      );
    }

    return this.currentBatchSize;
  }

  getCurrentBatchSize(): number {
    return this.currentBatchSize;
  }

  getStats() {
    return {
      currentBatchSize: this.currentBatchSize,
      minBatchSize: this.minBatchSize,
      maxBatchSize: this.maxBatchSize,
      avgLatency:
        this.recentLatencies.length > 0
          ? this.recentLatencies.reduce((a, b) => a + b, 0) /
            this.recentLatencies.length
          : 0,
      latencyWindow: this.recentLatencies.length,
    };
  }
}
