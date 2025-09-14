/**
 * High-Performance Bloom Filter Implementation for Text & Regex Prefiltering
 * 
 * Optimized for Phase 3.5 requirements:
 * - 256B and 512B filter sizes  
 * - False positive rates: ≤1% at 256B, ≤0.1% at 512B
 * - Zero false negatives (correctness guarantee)
 * - Compatible with streaming/IVM operations
 */

/**
 * Simple hash function for consistent results across operations
 * Uses FNV-1a algorithm for good distribution and speed
 */
function hash(data: string, seed = 0): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Bloom Filter optimized for text search prefiltering
 */
export class BloomFilter {
  private bits: Uint8Array;
  private size: number; // Size in bits
  private hashCount: number;
  private addedCount = 0;

  constructor(sizeInBytes: number = 256, hashCount: number = 3) {
    this.size = sizeInBytes * 8; // Convert to bits
    this.bits = new Uint8Array(sizeInBytes);
    this.hashCount = hashCount;
  }

  /**
   * Add an item to the Bloom filter
   */
  add(item: string): void {
    if (!item || typeof item !== 'string') return;
    
    for (let i = 0; i < this.hashCount; i++) {
      const index = hash(item, i) % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
    this.addedCount++;
  }

  /**
   * Test if an item might be in the set (may have false positives)
   */
  test(item: string): boolean {
    if (!item || typeof item !== 'string') return false;

    for (let i = 0; i < this.hashCount; i++) {
      const index = hash(item, i) % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false; // Definitely not in set
      }
    }
    return true; // Possibly in set
  }

  /**
   * Get estimated false positive rate based on current load
   */
  getFalsePositiveRate(): number {
    if (this.addedCount === 0) return 0;
    
    // Theoretical FPR = (1 - e^(-k*n/m))^k
    // Where k = hash functions, n = items added, m = bits
    const k = this.hashCount;
    const n = this.addedCount;
    const m = this.size;
    
    const exponent = (-k * n) / m;
    const baseFpr = Math.pow(1 - Math.exp(exponent), k);
    return Math.min(baseFpr, 1.0);
  }

  /**
   * Clear the filter
   */
  clear(): void {
    this.bits.fill(0);
    this.addedCount = 0;
  }

  /**
   * Get statistics about the filter
   */
  getStats(): BloomFilterStats {
    return {
      sizeInBytes: this.bits.length,
      sizeInBits: this.size,
      hashCount: this.hashCount,
      addedCount: this.addedCount,
      estimatedFalsePositiveRate: this.getFalsePositiveRate(),
    };
  }
}

export interface BloomFilterStats {
  sizeInBytes: number;
  sizeInBits: number;
  hashCount: number;
  addedCount: number;
  estimatedFalsePositiveRate: number;
}

/**
 * Extract tokens from text for $text operations
 * Simple whitespace-based tokenization with normalization
 */
export function extractTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(token => token.length >= 2) // Skip very short tokens
    .map(token => token.replace(/[^\w]/g, '')) // Remove punctuation
    .filter(token => token.length >= 2); // Filter again after cleanup
}

/**
 * Extract trigrams from text for $regex operations
 * Helps with literal character sequences in regex patterns
 */
export function extractTrigrams(text: string): string[] {
  if (!text || typeof text !== 'string' || text.length < 3) return [];
  
  const trigrams: string[] = [];
  for (let i = 0; i <= text.length - 3; i++) {
    trigrams.push(text.substring(i, i + 3));
  }
  return trigrams;
}

/**
 * Extract literal character sequences from regex patterns
 * Used for trigram-based prefiltering of regex operations
 */
export function extractLiteralsFromRegex(pattern: string): string[] {
  if (!pattern || typeof pattern !== 'string') return [];
  
  // Simple extraction - find sequences of literal characters
  // This is a basic implementation that can be enhanced
  const literals: string[] = [];
  let current = '';
  
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    
    // Skip regex metacharacters
    if (/[.*+?^${}()|[\]\\]/.test(char)) {
      if (current.length >= 3) {
        literals.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }
  
  // Don't forget the last sequence
  if (current.length >= 3) {
    literals.push(current);
  }
  
  return literals;
}

/**
 * Text Search Bloom Filter - specialized for $text operations
 */
export class TextSearchBloomFilter extends BloomFilter {
  private documentFilters = new Map<string, BloomFilter>();
  
  /**
   * Add a document's text content to the filter
   */
  addDocument(docId: string, textContent: string): void {
    const tokens = extractTokens(textContent);
    
    // Create or get document-specific filter
    let docFilter = this.documentFilters.get(docId);
    if (!docFilter) {
      docFilter = new BloomFilter(256, 3); // 256B per document
      this.documentFilters.set(docId, docFilter);
    }
    
    // Add tokens to both global and document filters
    tokens.forEach(token => {
      this.add(token);
      docFilter!.add(token);
    });
  }

  /**
   * Test if query tokens might match document content
   */
  testQuery(query: string): { candidates: string[], falsePositiveRate: number } {
    const queryTokens = extractTokens(query);
    if (queryTokens.length === 0) return { candidates: [], falsePositiveRate: 0 };
    
    const candidates: string[] = [];
    let totalTests = 0;
    let falsePositives = 0;
    
    for (const [docId, docFilter] of this.documentFilters) {
      let allTokensMatch = true;
      
      for (const token of queryTokens) {
        if (!docFilter.test(token)) {
          allTokensMatch = false;
          break;
        }
      }
      
      totalTests++;
      if (allTokensMatch) {
        candidates.push(docId);
        // Estimate false positives (in practice this would need verification)
        if (docFilter.getFalsePositiveRate() > 0.01) {
          falsePositives++;
        }
      }
    }
    
    return {
      candidates,
      falsePositiveRate: totalTests > 0 ? falsePositives / totalTests : 0,
    };
  }

  /**
   * Remove a document from the filter
   */
  removeDocument(docId: string): void {
    this.documentFilters.delete(docId);
  }

  /**
   * Clear all document filters
   */
  clear(): void {
    super.clear();
    this.documentFilters.clear();
  }
}

/**
 * Regex Search Bloom Filter - specialized for $regex operations
 */
export class RegexSearchBloomFilter extends BloomFilter {
  private documentTrigrams = new Map<string, BloomFilter>();
  
  /**
   * Add a document's text content to the regex filter
   */
  addDocument(docId: string, textContent: string): void {
    const trigrams = extractTrigrams(textContent.toLowerCase());
    
    // Create or get document-specific filter
    let docFilter = this.documentTrigrams.get(docId);
    if (!docFilter) {
      docFilter = new BloomFilter(256, 3); // 256B per document  
      this.documentTrigrams.set(docId, docFilter);
    }
    
    // Add trigrams to both global and document filters
    trigrams.forEach(trigram => {
      this.add(trigram);
      docFilter!.add(trigram);
    });
  }

  /**
   * Test if regex pattern might match document content
   */
  testRegexPattern(pattern: string): { candidates: string[], shouldUsePrefilter: boolean, falsePositiveRate: number } {
    const literals = extractLiteralsFromRegex(pattern);
    
    // Skip prefiltering for patterns without sufficient literal content
    if (literals.length === 0 || literals.every(lit => lit.length < 3)) {
      return { 
        candidates: Array.from(this.documentTrigrams.keys()), 
        shouldUsePrefilter: false,
        falsePositiveRate: 0 
      };
    }
    
    const candidates: string[] = [];
    let totalTests = 0;
    let falsePositives = 0;
    
    // Get trigrams from the literals
    const patternTrigrams = new Set<string>();
    literals.forEach(literal => {
      extractTrigrams(literal.toLowerCase()).forEach(trigram => {
        patternTrigrams.add(trigram);
      });
    });
    
    if (patternTrigrams.size === 0) {
      return { 
        candidates: Array.from(this.documentTrigrams.keys()),
        shouldUsePrefilter: false,
        falsePositiveRate: 0 
      };
    }
    
    for (const [docId, docFilter] of this.documentTrigrams) {
      let hasMatchingTrigrams = false;
      
      for (const trigram of patternTrigrams) {
        if (docFilter.test(trigram)) {
          hasMatchingTrigrams = true;
          break;
        }
      }
      
      totalTests++;
      if (hasMatchingTrigrams) {
        candidates.push(docId);
        // Estimate false positives
        if (docFilter.getFalsePositiveRate() > 0.01) {
          falsePositives++;
        }
      }
    }
    
    return {
      candidates,
      shouldUsePrefilter: true,
      falsePositiveRate: totalTests > 0 ? falsePositives / totalTests : 0,
    };
  }

  /**
   * Remove a document from the filter
   */
  removeDocument(docId: string): void {
    this.documentTrigrams.delete(docId);
  }

  /**
   * Clear all document filters
   */
  clear(): void {
    super.clear();
    this.documentTrigrams.clear();
  }
}