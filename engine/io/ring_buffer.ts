/**
 * Phase 10: Delta Micro-Batching Ring Buffer
 * 
 * Power-of-two SPSC (Single Producer Single Consumer) ring buffer with:
 * - Cache-line padded cursors to avoid false sharing
 * - Preallocated batch slots for zero-allocation operation
 * - Backpressure control with configurable thresholds
 */

export interface RingBufferItem<T> {
  data: T;
  timestamp: number;
  batchId: number;
}

/**
 * Cache-line aligned cursor for avoiding false sharing
 * Standard x86-64 cache line is 64 bytes
 */
class AlignedCursor {
  private _value: number = 0;
  private readonly _padding: Uint8Array;

  constructor() {
    // Pad to 64 bytes to ensure cache line alignment
    this._padding = new Uint8Array(60); // 64 - 4 bytes for _value
  }

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = val;
  }

  increment(): number {
    return ++this._value;
  }
}

export interface RingBufferStats {
  readonly size: number;
  readonly capacity: number;
  readonly utilizationPercent: number;
  readonly totalProduced: number;
  readonly totalConsumed: number;
  readonly backpressureEvents: number;
}

/**
 * High-performance SPSC ring buffer for delta micro-batching
 */
export class RingBuffer<T> {
  private readonly buffer: RingBufferItem<T>[];
  private readonly capacity: number;
  private readonly mask: number; // For power-of-two modulo optimization
  
  // Cache-line padded cursors to avoid false sharing
  private readonly head = new AlignedCursor(); // Producer cursor
  private readonly tail = new AlignedCursor(); // Consumer cursor
  
  // Backpressure configuration
  private readonly pauseThreshold: number;   // Pause at 80% full
  private readonly resumeThreshold: number;  // Resume at 40% full
  private isPaused: boolean = false;
  
  // Statistics
  private totalProduced: number = 0;
  private totalConsumed: number = 0;
  private backpressureEvents: number = 0;
  private currentBatchId: number = 0;

  constructor(capacityPowerOfTwo: number = 12) { // Default 4096 slots
    if (!Number.isInteger(capacityPowerOfTwo) || capacityPowerOfTwo < 8 || capacityPowerOfTwo > 20) {
      throw new Error('Capacity must be power of 2 between 2^8 and 2^20');
    }
    
    this.capacity = 1 << capacityPowerOfTwo; // 2^capacityPowerOfTwo
    this.mask = this.capacity - 1; // For fast modulo via bitwise AND
    this.pauseThreshold = Math.floor(this.capacity * 0.8);
    this.resumeThreshold = Math.floor(this.capacity * 0.4);
    
    // Preallocate all slots to avoid runtime allocation
    this.buffer = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = {
        data: null as T,
        timestamp: 0,
        batchId: 0
      };
    }
  }

  /**
   * Produce (enqueue) an item - returns false if backpressure active
   */
  produce(item: T): boolean {
    const currentSize = this.size;
    
    // Check backpressure threshold
    if (!this.isPaused && currentSize >= this.pauseThreshold) {
      this.isPaused = true;
      this.backpressureEvents++;
      return false;
    }
    
    if (this.isPaused && currentSize < this.resumeThreshold) {
      this.isPaused = false;
    }
    
    if (this.isPaused) {
      return false;
    }
    
    // Check if buffer is full
    if (currentSize >= this.capacity) {
      return false;
    }
    
    const headIndex = this.head.value & this.mask;
    const slot = this.buffer[headIndex];
    
    // Update slot in-place (zero allocation)
    slot.data = item;
    slot.timestamp = Date.now();
    slot.batchId = this.currentBatchId;
    
    this.head.increment();
    this.totalProduced++;
    
    return true;
  }

  /**
   * Consume (dequeue) an item - returns null if empty
   */
  consume(): RingBufferItem<T> | null {
    if (this.isEmpty) {
      return null;
    }
    
    const tailIndex = this.tail.value & this.mask;
    const slot = this.buffer[tailIndex];
    
    // Create return value (we need to copy to avoid mutation)
    const result: RingBufferItem<T> = {
      data: slot.data,
      timestamp: slot.timestamp,
      batchId: slot.batchId
    };
    
    // Clear slot (help GC)
    slot.data = null as T;
    slot.timestamp = 0;
    slot.batchId = 0;
    
    this.tail.increment();
    this.totalConsumed++;
    
    // Check if we should resume from backpressure
    if (this.isPaused && this.size <= this.resumeThreshold) {
      this.isPaused = false;
    }
    
    return result;
  }

  /**
   * Consume up to maxItems items in a batch
   */
  consumeBatch(maxItems: number = 256): RingBufferItem<T>[] {
    const results: RingBufferItem<T>[] = [];
    let consumed = 0;
    
    while (consumed < maxItems && !this.isEmpty) {
      const item = this.consume();
      if (item) {
        results.push(item);
        consumed++;
      } else {
        break;
      }
    }
    
    return results;
  }

  /**
   * Advance to next batch ID for grouping purposes
   */
  nextBatch(): number {
    return ++this.currentBatchId;
  }

  get isEmpty(): boolean {
    return this.head.value === this.tail.value;
  }

  get isFull(): boolean {
    return this.size >= this.capacity;
  }

  get size(): number {
    return (this.capacity + this.head.value - this.tail.value) & this.mask;
  }

  get isBackpressureActive(): boolean {
    return this.isPaused;
  }

  get stats(): RingBufferStats {
    return {
      size: this.size,
      capacity: this.capacity,
      utilizationPercent: (this.size / this.capacity) * 100,
      totalProduced: this.totalProduced,
      totalConsumed: this.totalConsumed,
      backpressureEvents: this.backpressureEvents
    };
  }

  /**
   * Clear all items and reset state
   */
  clear(): void {
    while (!this.isEmpty) {
      this.consume();
    }
    this.isPaused = false;
    this.currentBatchId = 0;
  }
}