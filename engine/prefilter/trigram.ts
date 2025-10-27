/**
 * Phase 10: Trigram Prefilter for Substring Searches
 * 
 * Session-local prefilter for %substr% workloads:
 * - Trigram extraction and indexing
 * - Fast substring match filtering 
 * - Memory-efficient set operations
 * - Guarded by query pattern analysis
 */

/**
 * Trigram index entry
 */
interface TrigramEntry {
  trigram: string;
  documentIds: Set<number>;
  frequency: number;
}

/**
 * Trigram index configuration
 */
export interface TrigramConfig {
  minSubstringLength: number;    // Minimum substring length to index (default: 3)
  maxIndexSizeMB: number;       // Maximum memory for trigram index (default: 50MB)
  enableCaseInsensitive: boolean; // Case-insensitive matching (default: true)
  minFrequencyThreshold: number; // Skip rare trigrams (default: 2)
  sessionTimeoutMs: number;     // Index timeout for cleanup (default: 300000 = 5min)
}

/**
 * Substring query pattern
 */
export interface SubstringQuery {
  pattern: string;
  caseInsensitive: boolean;
  isPrefix?: boolean;
  isSuffix?: boolean;
}

/**
 * Trigram matching result
 */
export interface TrigramMatchResult {
  candidateIds: Set<number>;
  trigramsUsed: string[];
  estimatedSelectivity: number;
  shouldUseIndex: boolean;
  reason: string;
}

/**
 * Trigram index statistics
 */
export interface TrigramStats {
  totalTrigrams: number;
  totalDocuments: number;
  memoryUsageBytes: number;
  queryCount: number;
  indexHits: number;
  indexMisses: number;
  avgTrigramsPerQuery: number;
  avgSelectivity: number;
}

/**
 * High-performance trigram index for substring filtering
 */
export class TrigramIndex {
  private index = new Map<string, TrigramEntry>();
  private documentCount = 0;
  private lastAccess = Date.now();
  private config: TrigramConfig;
  
  // Statistics
  private stats: TrigramStats = {
    totalTrigrams: 0,
    totalDocuments: 0,
    memoryUsageBytes: 0,
    queryCount: 0,
    indexHits: 0,
    indexMisses: 0,
    avgTrigramsPerQuery: 0,
    avgSelectivity: 0
  };

  constructor(config: Partial<TrigramConfig> = {}) {
    this.config = {
      minSubstringLength: 3,
      maxIndexSizeMB: 50,
      enableCaseInsensitive: true,
      minFrequencyThreshold: 2,
      sessionTimeoutMs: 300000, // 5 minutes
      ...config
    };
  }

  /**
   * Add document to trigram index
   */
  addDocument(docId: number, text: string, fieldName?: string): void {
    if (!text || typeof text !== 'string') return;
    
    const processedText = this.config.enableCaseInsensitive ? 
                         text.toLowerCase() : text;
    
    const trigrams = this.extractTrigrams(processedText);
    
    for (const trigram of trigrams) {
      let entry = this.index.get(trigram);
      
      if (!entry) {
        entry = {
          trigram,
          documentIds: new Set(),
          frequency: 0
        };
        this.index.set(trigram, entry);
      }
      
      if (!entry.documentIds.has(docId)) {
        entry.documentIds.add(docId);
        entry.frequency++;
      }
    }
    
    this.documentCount = Math.max(this.documentCount, docId + 1);
    this.lastAccess = Date.now();
    this.updateMemoryUsage();
  }

  /**
   * Add batch of documents efficiently
   */
  addDocuments(docs: Array<{ id: number; text: string; field?: string }>): void {
    for (const doc of docs) {
      this.addDocument(doc.id, doc.text, doc.field);
    }
  }

  /**
   * Find candidate documents for substring query
   */
  findCandidates(query: SubstringQuery): TrigramMatchResult {
    this.stats.queryCount++;
    this.lastAccess = Date.now();
    
    const pattern = this.config.enableCaseInsensitive ? 
                   query.pattern.toLowerCase() : query.pattern;
    
    // Check if pattern is long enough for trigram filtering
    if (pattern.length < this.config.minSubstringLength) {
      this.stats.indexMisses++;
      return {
        candidateIds: new Set(Array.from({ length: this.documentCount }, (_, i) => i)),
        trigramsUsed: [],
        estimatedSelectivity: 1.0,
        shouldUseIndex: false,
        reason: `Pattern too short (${pattern.length} < ${this.config.minSubstringLength})`
      };
    }
    
    const trigrams = this.extractTrigrams(pattern);
    
    if (trigrams.length === 0) {
      this.stats.indexMisses++;
      return {
        candidateIds: new Set(Array.from({ length: this.documentCount }, (_, i) => i)),
        trigramsUsed: [],
        estimatedSelectivity: 1.0,
        shouldUseIndex: false,
        reason: 'No trigrams extracted from pattern'
      };
    }
    
    // Find intersection of document sets for all trigrams
    const candidates = this.intersectTrigrams(trigrams);
    
    if (candidates.size === 0) {
      this.stats.indexHits++;
      return {
        candidateIds: candidates,
        trigramsUsed: trigrams,
        estimatedSelectivity: 0.0,
        shouldUseIndex: true,
        reason: 'No documents contain all required trigrams'
      };
    }
    
    const selectivity = candidates.size / this.documentCount;
    this.updateAverages(trigrams.length, selectivity);
    
    // Decide whether to use index based on selectivity
    const shouldUse = selectivity < 0.5; // Use index if filters out >50% of docs
    
    if (shouldUse) {
      this.stats.indexHits++;
    } else {
      this.stats.indexMisses++;
    }
    
    return {
      candidateIds: candidates,
      trigramsUsed: trigrams,
      estimatedSelectivity: selectivity,
      shouldUseIndex: shouldUse,
      reason: shouldUse ? 
              `Good selectivity: ${(selectivity * 100).toFixed(1)}%` :
              `Poor selectivity: ${(selectivity * 100).toFixed(1)}%, scanning all`
    };
  }

  /**
   * Test if document might contain substring (fast path)
   */
  mightContain(docId: number, pattern: string): boolean {
    const result = this.findCandidates({ pattern, caseInsensitive: this.config.enableCaseInsensitive });
    return result.candidateIds.has(docId);
  }

  /**
   * Extract trigrams from text
   */
  private extractTrigrams(text: string): string[] {
    if (text.length < 3) return [];
    
    const trigrams: string[] = [];
    
    // Add padding for prefix/suffix matching
    const paddedText = `  ${text}  `;
    
    for (let i = 0; i <= paddedText.length - 3; i++) {
      const trigram = paddedText.substring(i, i + 3);
      trigrams.push(trigram);
    }
    
    return Array.from(new Set(trigrams)); // Remove duplicates
  }

  /**
   * Find intersection of document sets for trigrams
   */
  private intersectTrigrams(trigrams: string[]): Set<number> {
    if (trigrams.length === 0) return new Set();
    
    // Start with the rarest trigram (smallest document set)
    const sortedTrigrams = trigrams
      .map(t => ({ trigram: t, entry: this.index.get(t) }))
      .filter(item => item.entry !== undefined)
      .sort((a, b) => a.entry!.documentIds.size - b.entry!.documentIds.size);
    
    if (sortedTrigrams.length === 0) return new Set();
    
    // Start with smallest set
    let result = new Set(sortedTrigrams[0].entry!.documentIds);
    
    // Intersect with remaining sets
    for (let i = 1; i < sortedTrigrams.length; i++) {
      const currentSet = sortedTrigrams[i].entry!.documentIds;
      result = this.intersectSets(result, currentSet);
      
      // Early termination if result becomes empty
      if (result.size === 0) break;
    }
    
    return result;
  }

  /**
   * Efficient set intersection
   */
  private intersectSets(setA: Set<number>, setB: Set<number>): Set<number> {
    const smaller = setA.size <= setB.size ? setA : setB;
    const larger = setA.size > setB.size ? setA : setB;
    
    const result = new Set<number>();
    
    for (const item of Array.from(smaller)) {
      if (larger.has(item)) {
        result.add(item);
      }
    }
    
    return result;
  }

  /**
   * Update running averages for statistics
   */
  private updateAverages(trigramCount: number, selectivity: number): void {
    const queries = this.stats.queryCount;
    
    this.stats.avgTrigramsPerQuery = 
      (this.stats.avgTrigramsPerQuery * (queries - 1) + trigramCount) / queries;
    
    this.stats.avgSelectivity = 
      (this.stats.avgSelectivity * (queries - 1) + selectivity) / queries;
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryUsage(): void {
    let bytes = 0;
    
    for (const entry of Array.from(this.index.values())) {
      bytes += entry.trigram.length * 2; // String storage
      bytes += entry.documentIds.size * 4; // Set of numbers
      bytes += 50; // Object overhead
    }
    
    this.stats.memoryUsageBytes = bytes;
    this.stats.totalTrigrams = this.index.size;
    this.stats.totalDocuments = this.documentCount;
  }

  /**
   * Clean up rare trigrams to save memory
   */
  cleanup(): void {
    const beforeSize = this.index.size;
    
    for (const [trigram, entry] of Array.from(this.index.entries())) {
      if (entry.frequency < this.config.minFrequencyThreshold) {
        this.index.delete(trigram);
      }
    }
    
    const afterSize = this.index.size;
    this.updateMemoryUsage();
    
    console.log(`Trigram cleanup: ${beforeSize} -> ${afterSize} trigrams`);
  }

  /**
   * Check if index has expired and should be cleaned up
   */
  isExpired(): boolean {
    return Date.now() - this.lastAccess > this.config.sessionTimeoutMs;
  }

  /**
   * Check if index should be used based on memory limits
   */
  shouldUseIndex(): boolean {
    const memoryMB = this.stats.memoryUsageBytes / (1024 * 1024);
    return memoryMB <= this.config.maxIndexSizeMB;
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): TrigramStats {
    this.updateMemoryUsage();
    return { ...this.stats };
  }

  /**
   * Get efficiency metrics
   */
  getEfficiencyMetrics() {
    const stats = this.getStats();
    const totalQueries = stats.queryCount;
    const hitRate = totalQueries > 0 ? (stats.indexHits / totalQueries * 100) : 0;
    
    return {
      hitRate: hitRate.toFixed(2) + '%',
      avgSelectivity: (stats.avgSelectivity * 100).toFixed(2) + '%',
      memoryUsageMB: (stats.memoryUsageBytes / (1024 * 1024)).toFixed(2) + 'MB',
      trigramsPerDoc: stats.totalDocuments > 0 ? 
        (stats.totalTrigrams / stats.totalDocuments).toFixed(1) : '0',
      isExpired: this.isExpired()
    };
  }

  /**
   * Clear all trigram data
   */
  clear(): void {
    this.index.clear();
    this.documentCount = 0;
    this.lastAccess = Date.now();
    this.stats = {
      totalTrigrams: 0,
      totalDocuments: 0,
      memoryUsageBytes: 0,
      queryCount: 0,
      indexHits: 0,
      indexMisses: 0,
      avgTrigramsPerQuery: 0,
      avgSelectivity: 0
    };
  }
}

/**
 * Session-local trigram manager with automatic cleanup
 */
export class TrigramManager {
  private indexes = new Map<string, TrigramIndex>();
  private lastCleanup = Date.now();
  private readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute

  /**
   * Get or create trigram index for session
   */
  getIndex(sessionId: string, config?: Partial<TrigramConfig>): TrigramIndex {
    let index = this.indexes.get(sessionId);
    
    if (!index) {
      index = new TrigramIndex(config);
      this.indexes.set(sessionId, index);
    }
    
    this.maybeCleanup();
    return index;
  }

  /**
   * Check if substring query pattern suggests trigram filtering would be beneficial
   */
  shouldUseTrigrams(pattern: string): boolean {
    // Use trigrams for patterns that:
    // 1. Are long enough (>=3 chars)
    // 2. Contain substring searches (%...% patterns)
    // 3. Are not simple prefix/suffix patterns
    
    if (pattern.length < 3) return false;
    
    // Check for substring patterns
    const hasWildcards = pattern.includes('*') || pattern.includes('%');
    const isSubstring = hasWildcards && !pattern.startsWith('*') && !pattern.endsWith('*');
    
    return isSubstring || pattern.length >= 6; // Always use for longer patterns
  }

  /**
   * Get statistics for all active indexes
   */
  getAllStats(): Map<string, TrigramStats> {
    const stats = new Map<string, TrigramStats>();
    
    for (const [sessionId, index] of Array.from(this.indexes)) {
      stats.set(sessionId, index.getStats());
    }
    
    return stats;
  }

  /**
   * Cleanup expired indexes
   */
  private maybeCleanup(): void {
    const now = Date.now();
    
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) return;
    
    const expiredSessions: string[] = [];
    
    for (const [sessionId, index] of Array.from(this.indexes)) {
      if (index.isExpired()) {
        expiredSessions.push(sessionId);
      } else {
        // Cleanup rare trigrams in active indexes
        index.cleanup();
      }
    }
    
    // Remove expired sessions
    for (const sessionId of expiredSessions) {
      this.indexes.delete(sessionId);
    }
    
    this.lastCleanup = now;
    
    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired trigram indexes`);
    }
  }

  /**
   * Force cleanup of all indexes
   */
  cleanup(): void {
    for (const index of Array.from(this.indexes.values())) {
      index.cleanup();
    }
  }

  /**
   * Clear all indexes
   */
  clear(): void {
    this.indexes.clear();
    this.lastCleanup = Date.now();
  }

  /**
   * Get global memory usage across all indexes
   */
  getTotalMemoryUsage(): number {
    let totalBytes = 0;
    
    for (const index of Array.from(this.indexes.values())) {
      totalBytes += index.getStats().memoryUsageBytes;
    }
    
    return totalBytes;
  }
}