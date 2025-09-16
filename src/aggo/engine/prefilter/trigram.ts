/**
 * Phase 10: Trigram Prefilter for Substring Searches
 * 
 * Session-local prefilter for `%substr%` workloads:
 * - Trigram extraction and indexing
 * - Fast substring candidate filtering
 * - Session-local storage with automatic cleanup
 * - Guarded activation based on query patterns
 */

export interface TrigramConfig {
  minTrigramLength: number;
  maxTrigramsPerString: number;
  sessionTimeout: number;
  enableSessionTracking: boolean;
  activationThreshold: number; // Number of substring queries to activate
}

export interface TrigramStats {
  totalStrings: number;
  totalTrigrams: number;
  averageTrigramsPerString: number;
  substringQueries: number;
  candidatesGenerated: number;
  candidatesFiltered: number;
  filterEfficiency: number;
  sessionCount: number;
  memoryUsage: number;
}

export interface TrigramIndex {
  trigram: string;
  stringIds: Set<number>;
}

export interface SubstringQuery {
  pattern: string;
  caseSensitive: boolean;
  sessionId?: string;
}

/**
 * Trigram generator and utilities
 */
class TrigramGenerator {
  static generateTrigrams(text: string, minLength: number = 3): Set<string> {
    const trigrams = new Set<string>();
    
    if (text.length < minLength) {
      // For short strings, use the string itself as a "trigram"
      trigrams.add(text.toLowerCase());
      return trigrams;
    }
    
    const normalizedText = text.toLowerCase();
    
    // Add padding for start/end of string
    const paddedText = `  ${normalizedText}  `;
    
    // Generate all trigrams
    for (let i = 0; i <= paddedText.length - minLength; i++) {
      const trigram = paddedText.substring(i, i + minLength);
      trigrams.add(trigram);
    }
    
    return trigrams;
  }
  
  static getRequiredTrigrams(pattern: string, minLength: number = 3): Set<string> {
    if (pattern.length < minLength) {
      return new Set([pattern.toLowerCase()]);
    }
    
    const trigrams = new Set<string>();
    const normalizedPattern = pattern.toLowerCase();
    
    // For substring search, we need all trigrams in the pattern
    for (let i = 0; i <= normalizedPattern.length - minLength; i++) {
      const trigram = normalizedPattern.substring(i, i + minLength);
      trigrams.add(trigram);
    }
    
    return trigrams;
  }
}

/**
 * Session-based trigram prefilter
 */
export class TrigramPrefilter {
  private readonly config: Required<TrigramConfig>;
  private stringIndex = new Map<number, string>(); // stringId -> original string
  private trigramIndex = new Map<string, Set<number>>(); // trigram -> set of stringIds
  private nextStringId = 0;
  
  // Session tracking
  private sessions = new Map<string, { lastAccess: number; queryCount: number }>();
  private sessionQueries = new Map<string, SubstringQuery[]>();
  
  private stats: TrigramStats = {
    totalStrings: 0,
    totalTrigrams: 0,
    averageTrigramsPerString: 0,
    substringQueries: 0,
    candidatesGenerated: 0,
    candidatesFiltered: 0,
    filterEfficiency: 0,
    sessionCount: 0,
    memoryUsage: 0
  };
  
  constructor(config: Partial<TrigramConfig> = {}) {
    this.config = {
      minTrigramLength: 3,
      maxTrigramsPerString: 100,
      sessionTimeout: 300000, // 5 minutes
      enableSessionTracking: true,
      activationThreshold: 3,
      ...config
    };
    
    // Start cleanup timer if session tracking is enabled
    if (this.config.enableSessionTracking) {
      this.startSessionCleanup();
    }
  }
  
  /**
   * Add strings to the trigram index
   */
  addStrings(strings: string[]): number[] {
    const stringIds: number[] = [];
    
    for (const str of strings) {
      const stringId = this.addString(str);
      stringIds.push(stringId);
    }
    
    this.updateStats();
    return stringIds;
  }
  
  /**
   * Add single string to index
   */
  addString(str: string): number {
    const stringId = this.nextStringId++;
    this.stringIndex.set(stringId, str);
    
    // Generate trigrams for the string
    const trigrams = TrigramGenerator.generateTrigrams(str, this.config.minTrigramLength);
    
    // Limit trigrams per string to prevent memory explosion
    const limitedTrigrams = Array.from(trigrams).slice(0, this.config.maxTrigramsPerString);
    
    // Add to trigram index
    for (const trigram of limitedTrigrams) {
      let stringIds = this.trigramIndex.get(trigram);
      if (!stringIds) {
        stringIds = new Set();
        this.trigramIndex.set(trigram, stringIds);
      }
      stringIds.add(stringId);
    }
    
    this.stats.totalStrings++;
    return stringId;
  }
  
  /**
   * Search for strings containing the pattern
   */
  searchSubstring(query: SubstringQuery): number[] {
    this.stats.substringQueries++;
    
    // Track session if enabled
    if (this.config.enableSessionTracking && query.sessionId) {
      this.trackSession(query.sessionId, query);
    }
    
    // Check if filter should be activated for this session
    if (!this.shouldActivateFilter(query.sessionId)) {
      // Return all string IDs if filter is not activated
      return Array.from(this.stringIndex.keys());
    }
    
    const requiredTrigrams = TrigramGenerator.getRequiredTrigrams(
      query.pattern, 
      this.config.minTrigramLength
    );
    
    if (requiredTrigrams.size === 0) {
      return Array.from(this.stringIndex.keys());
    }
    
    // Find intersection of all trigram matches
    let candidates: Set<number> | null = null;
    
    for (const trigram of requiredTrigrams) {
      const stringIds = this.trigramIndex.get(trigram);
      
      if (!stringIds || stringIds.size === 0) {
        // If any required trigram is missing, no matches possible
        this.stats.candidatesGenerated = 0;
        return [];
      }
      
      if (candidates === null) {
        candidates = new Set(stringIds);
      } else {
        // Intersect with previous candidates
        candidates = new Set([...candidates].filter(id => stringIds.has(id)));
      }
      
      // Early termination if no candidates remain
      if (candidates.size === 0) {
        this.stats.candidatesGenerated = 0;
        return [];
      }
    }
    
    const candidateIds = Array.from(candidates || []);
    this.stats.candidatesGenerated = candidateIds.length;
    
    // Additional filtering: verify actual substring match
    const filteredIds = this.verifySubstringMatch(candidateIds, query);
    this.stats.candidatesFiltered = this.stats.candidatesGenerated - filteredIds.length;
    
    this.updateFilterEfficiency();
    
    return filteredIds;
  }
  
  /**
   * Get strings by IDs
   */
  getStrings(stringIds: number[]): string[] {
    return stringIds
      .map(id => this.stringIndex.get(id))
      .filter((str): str is string => str !== undefined);
  }
  
  /**
   * Clear all data
   */
  clear() {
    this.stringIndex.clear();
    this.trigramIndex.clear();
    this.sessions.clear();
    this.sessionQueries.clear();
    this.nextStringId = 0;
    this.resetStats();
  }
  
  /**
   * Get prefilter statistics
   */
  getStats(): TrigramStats {
    return { ...this.stats };
  }
  
  /**
   * Get session information
   */
  getSessionInfo(): Map<string, { queryCount: number; lastAccess: number; queries: SubstringQuery[] }> {
    const sessionInfo = new Map();
    
    for (const [sessionId, session] of this.sessions) {
      sessionInfo.set(sessionId, {
        queryCount: session.queryCount,
        lastAccess: session.lastAccess,
        queries: this.sessionQueries.get(sessionId) || []
      });
    }
    
    return sessionInfo;
  }
  
  private trackSession(sessionId: string, query: SubstringQuery) {
    const now = Date.now();
    
    // Update session tracking
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { lastAccess: now, queryCount: 0 };
      this.sessions.set(sessionId, session);
    }
    
    session.lastAccess = now;
    session.queryCount++;
    
    // Track queries for this session
    let queries = this.sessionQueries.get(sessionId);
    if (!queries) {
      queries = [];
      this.sessionQueries.set(sessionId, queries);
    }
    
    queries.push({ ...query });
    
    // Limit query history per session
    if (queries.length > 100) {
      queries.splice(0, queries.length - 100);
    }
  }
  
  private shouldActivateFilter(sessionId?: string): boolean {
    if (!this.config.enableSessionTracking || !sessionId) {
      // Always activate if session tracking is disabled
      return true;
    }
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    return session.queryCount >= this.config.activationThreshold;
  }
  
  private verifySubstringMatch(candidateIds: number[], query: SubstringQuery): number[] {
    const pattern = query.caseSensitive ? query.pattern : query.pattern.toLowerCase();
    const verified: number[] = [];
    
    for (const id of candidateIds) {
      const str = this.stringIndex.get(id);
      if (!str) continue;
      
      const searchStr = query.caseSensitive ? str : str.toLowerCase();
      if (searchStr.includes(pattern)) {
        verified.push(id);
      }
    }
    
    return verified;
  }
  
  private updateStats() {
    this.stats.totalTrigrams = this.trigramIndex.size;
    this.stats.averageTrigramsPerString = this.stats.totalStrings > 0 
      ? this.stats.totalTrigrams / this.stats.totalStrings 
      : 0;
    this.stats.sessionCount = this.sessions.size;
    
    // Estimate memory usage
    this.stats.memoryUsage = this.estimateMemoryUsage();
  }
  
  private updateFilterEfficiency() {
    if (this.stats.candidatesGenerated > 0) {
      this.stats.filterEfficiency = this.stats.candidatesFiltered / this.stats.candidatesGenerated;
    }
  }
  
  private estimateMemoryUsage(): number {
    let bytes = 0;
    
    // String index
    for (const str of this.stringIndex.values()) {
      bytes += str.length * 2; // Rough estimate for Unicode strings
    }
    
    // Trigram index
    for (const [trigram, stringIds] of this.trigramIndex) {
      bytes += trigram.length * 2; // Trigram string
      bytes += stringIds.size * 4; // String ID set (4 bytes per number)
    }
    
    // Session data (rough estimate)
    bytes += this.sessions.size * 100;
    
    return bytes;
  }
  
  private resetStats() {
    this.stats = {
      totalStrings: 0,
      totalTrigrams: 0,
      averageTrigramsPerString: 0,
      substringQueries: 0,
      candidatesGenerated: 0,
      candidatesFiltered: 0,
      filterEfficiency: 0,
      sessionCount: 0,
      memoryUsage: 0
    };
  }
  
  private startSessionCleanup() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Check every minute
  }
  
  private cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastAccess > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }
    
    for (const sessionId of expiredSessions) {
      this.sessions.delete(sessionId);
      this.sessionQueries.delete(sessionId);
    }
  }
}

/**
 * Trigram prefilter manager with automatic activation
 */
export class TrigramPrefilterManager {
  private prefilters = new Map<string, TrigramPrefilter>();
  private queryPatterns = new Map<string, { count: number; patterns: Set<string> }>();
  
  /**
   * Get or create prefilter for a data context
   */
  getPrefilter(contextId: string, config?: Partial<TrigramConfig>): TrigramPrefilter {
    let prefilter = this.prefilters.get(contextId);
    
    if (!prefilter) {
      prefilter = new TrigramPrefilter(config);
      this.prefilters.set(contextId, prefilter);
    }
    
    return prefilter;
  }
  
  /**
   * Track query patterns to determine when to activate prefilters
   */
  trackQuery(contextId: string, pattern: string) {
    let context = this.queryPatterns.get(contextId);
    
    if (!context) {
      context = { count: 0, patterns: new Set() };
      this.queryPatterns.set(contextId, context);
    }
    
    context.count++;
    context.patterns.add(pattern);
  }
  
  /**
   * Check if prefilter should be activated for context
   */
  shouldActivatePrefilter(contextId: string, threshold: number = 3): boolean {
    const context = this.queryPatterns.get(contextId);
    return context ? context.count >= threshold : false;
  }
  
  /**
   * Get combined statistics for all prefilters
   */
  getCombinedStats() {
    const combined = {
      totalPrefilters: this.prefilters.size,
      totalContexts: this.queryPatterns.size,
      totalStrings: 0,
      totalQueries: 0,
      totalMemoryUsage: 0,
      avgFilterEfficiency: 0
    };
    
    let totalEfficiency = 0;
    let prefiltersWithQueries = 0;
    
    for (const prefilter of this.prefilters.values()) {
      const stats = prefilter.getStats();
      combined.totalStrings += stats.totalStrings;
      combined.totalQueries += stats.substringQueries;
      combined.totalMemoryUsage += stats.memoryUsage;
      
      if (stats.substringQueries > 0) {
        totalEfficiency += stats.filterEfficiency;
        prefiltersWithQueries++;
      }
    }
    
    combined.avgFilterEfficiency = prefiltersWithQueries > 0 
      ? totalEfficiency / prefiltersWithQueries 
      : 0;
    
    return combined;
  }
  
  /**
   * Clear all prefilters
   */
  clear() {
    for (const prefilter of this.prefilters.values()) {
      prefilter.clear();
    }
    this.prefilters.clear();
    this.queryPatterns.clear();
  }
  
  /**
   * Remove prefilter for specific context
   */
  removeContext(contextId: string) {
    const prefilter = this.prefilters.get(contextId);
    if (prefilter) {
      prefilter.clear();
      this.prefilters.delete(contextId);
    }
    this.queryPatterns.delete(contextId);
  }
}