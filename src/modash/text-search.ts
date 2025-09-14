/**
 * Text Search Implementation with Bloom Filter Prefiltering
 *
 * Implements $text operator with token-based Bloom filtering for Phase 3.5
 * Target: 5x speedup with 90%+ candidate reduction and <1% false positive rate
 */

import type { Collection, Document, DocumentValue } from './expressions';
import { TextSearchBloomFilter, extractTokens } from './bloom-filter';
import { DEBUG } from './debug';

/**
 * Text search statistics for monitoring and debugging
 */
export interface TextSearchStats {
  totalQueries: number;
  prefilterHits: number;
  candidatesBeforeFilter: number;
  candidatesAfterFilter: number;
  actualMatches: number;
  falsePositiveRate: number;
  averageSpeedupRatio: number;
  totalPrefilterTime: number;
  totalVerificationTime: number;
}

/**
 * Text search configuration
 */
export interface TextSearchConfig {
  enableBloomFilter: boolean;
  bloomFilterSizeBytes: number;
  minQueryTokens: number;
  caseSensitive: boolean;
  minCollectionSize: number;
}

/**
 * Global text search statistics
 */
let textSearchStats: TextSearchStats = {
  totalQueries: 0,
  prefilterHits: 0,
  candidatesBeforeFilter: 0,
  candidatesAfterFilter: 0,
  actualMatches: 0,
  falsePositiveRate: 0,
  averageSpeedupRatio: 1.0,
  totalPrefilterTime: 0,
  totalVerificationTime: 0,
};

/**
 * Default configuration
 */
const defaultConfig: TextSearchConfig = {
  enableBloomFilter: true,
  bloomFilterSizeBytes: 256,
  minQueryTokens: 2,
  caseSensitive: false,
  minCollectionSize: 1000, // Only use Bloom filter for collections larger than this
};

/**
 * Global Bloom filter for text search - managed per collection
 */
const collectionIndexes = new WeakMap<Collection<any>, TextSearchBloomFilter>();

/**
 * Initialize or get the text search filter for a collection
 */
function getTextFilterForCollection<T extends Document>(
  collection: Collection<T>
): TextSearchBloomFilter {
  let filter = collectionIndexes.get(collection);
  if (!filter) {
    filter = new TextSearchBloomFilter(defaultConfig.bloomFilterSizeBytes, 3);
    buildDocumentIndex(collection, filter);
    collectionIndexes.set(collection, filter);
  }
  return filter;
}

/**
 * $text operator implementation with Bloom filter acceleration
 */
export function $text<T extends Document = Document>(
  collection: Collection<T>,
  query: string,
  config: Partial<TextSearchConfig> = {}
): Collection<T> {
  const startTime = performance.now();
  const mergedConfig = { ...defaultConfig, ...config };

  textSearchStats.totalQueries++;

  if (!query || typeof query !== 'string') {
    if (DEBUG) {
      console.log('🔍 $text: Empty or invalid query, returning empty result');
    }
    return [];
  }

  const queryTokens = extractTokens(query);

  // Check if we should use prefiltering
  if (
    !mergedConfig.enableBloomFilter ||
    queryTokens.length < mergedConfig.minQueryTokens ||
    collection.length < mergedConfig.minCollectionSize
  ) {
    if (DEBUG) {
      const reason = !mergedConfig.enableBloomFilter
        ? 'disabled'
        : queryTokens.length < mergedConfig.minQueryTokens
          ? `insufficient tokens (${queryTokens.length} < ${mergedConfig.minQueryTokens})`
          : `small collection (${collection.length} < ${mergedConfig.minCollectionSize})`;
      console.log(`🔍 $text: Skipping Bloom prefilter - ${reason}`);
    }
    return performFullTextSearch(collection, queryTokens, mergedConfig);
  }

  // Try Bloom filter prefiltering
  const filter = getTextFilterForCollection(collection);
  const prefilterStartTime = performance.now();

  const { candidates, falsePositiveRate } = filter.testQuery(query);
  const prefilterEndTime = performance.now();

  textSearchStats.candidatesBeforeFilter += collection.length;
  textSearchStats.candidatesAfterFilter += candidates.length;
  textSearchStats.totalPrefilterTime += prefilterEndTime - prefilterStartTime;

  if (DEBUG) {
    console.log(
      `🔍 $text Bloom prefilter: ${collection.length} -> ${candidates.length} candidates (${((1 - candidates.length / collection.length) * 100).toFixed(1)}% reduction)`
    );
    console.log(
      `🔍 $text estimated FPR: ${(falsePositiveRate * 100).toFixed(2)}%`
    );
  }

  // If prefiltering didn't help much, fall back to full scan
  if (candidates.length > collection.length * 0.5) {
    if (DEBUG) {
      console.log(
        '🔍 $text: Prefilter not effective, falling back to full scan'
      );
    }
    return performFullTextSearch(collection, queryTokens, mergedConfig);
  }

  textSearchStats.prefilterHits++;

  // Filter collection to candidate documents and verify
  const verificationStartTime = performance.now();
  const candidateSet = new Set(candidates);
  const candidateDocs = collection.filter(
    (doc, index) =>
      candidateSet.has(index.toString()) ||
      candidateSet.has((doc as any)._id?.toString())
  );

  const results = performFullTextSearch(
    candidateDocs,
    queryTokens,
    mergedConfig
  );
  const verificationEndTime = performance.now();

  textSearchStats.totalVerificationTime +=
    verificationEndTime - verificationStartTime;
  textSearchStats.actualMatches += results.length;

  const totalTime = performance.now() - startTime;
  const estimatedFullScanTime =
    (totalTime / candidateDocs.length) * collection.length;
  const speedupRatio = estimatedFullScanTime / totalTime;

  textSearchStats.averageSpeedupRatio =
    (textSearchStats.averageSpeedupRatio * (textSearchStats.totalQueries - 1) +
      speedupRatio) /
    textSearchStats.totalQueries;

  if (DEBUG) {
    console.log(
      `🔍 $text: Found ${results.length} matches, estimated speedup: ${speedupRatio.toFixed(1)}x`
    );
  }

  return results;
}

/**
 * Build document index for Bloom filtering
 */
function buildDocumentIndex<T extends Document>(
  collection: Collection<T>,
  filter: TextSearchBloomFilter
): void {
  collection.forEach((doc, index) => {
    const docId = (doc as any)._id?.toString() || index.toString();

    // Extract text from all string fields in the document
    const textContent = extractTextFromDocument(doc);
    if (textContent) {
      filter.addDocument(docId, textContent);
    }
  });
}

/**
 * Extract all text content from a document for indexing
 */
function extractTextFromDocument(doc: Document): string {
  const textParts: string[] = [];

  function extractRecursive(obj: any): void {
    if (typeof obj === 'string') {
      textParts.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(extractRecursive);
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(extractRecursive);
    }
  }

  extractRecursive(doc);
  return textParts.join(' ');
}

/**
 * Perform full text search without prefiltering
 */
function performFullTextSearch<T extends Document>(
  collection: Collection<T>,
  queryTokens: string[],
  config: TextSearchConfig
): Collection<T> {
  if (queryTokens.length === 0) return [];

  return collection.filter(doc => {
    const docText = extractTextFromDocument(doc);
    if (!docText) return false;

    const docTokens = extractTokens(docText);
    const docTokenSet = new Set(docTokens);

    // Simple AND matching - all query tokens must be present
    return queryTokens.every(token => docTokenSet.has(token));
  });
}

/**
 * Reset text search statistics
 */
export function resetTextSearchStats(): void {
  textSearchStats = {
    totalQueries: 0,
    prefilterHits: 0,
    candidatesBeforeFilter: 0,
    candidatesAfterFilter: 0,
    actualMatches: 0,
    falsePositiveRate: 0,
    averageSpeedupRatio: 1.0,
    totalPrefilterTime: 0,
    totalVerificationTime: 0,
  };
}

/**
 * Get current text search statistics
 */
export function getTextSearchStats(): TextSearchStats {
  const stats = { ...textSearchStats };

  // Calculate derived metrics
  if (stats.candidatesBeforeFilter > 0) {
    const reductionRate =
      1 - stats.candidatesAfterFilter / stats.candidatesBeforeFilter;
    stats.falsePositiveRate =
      stats.candidatesAfterFilter > stats.actualMatches
        ? (stats.candidatesAfterFilter - stats.actualMatches) /
          stats.candidatesAfterFilter
        : 0;
  }

  return stats;
}

/**
 * Configure text search behavior
 */
export function configureTextSearch(config: Partial<TextSearchConfig>): void {
  Object.assign(defaultConfig, config);
  // Note: Existing indexes will use old configuration until they're rebuilt
}

/**
 * Clear text search index (useful for testing or memory management)
 */
export function clearTextSearchIndex(): void {
  // WeakMap will automatically clean up when collections are garbage collected
  // For manual clearing, we'd need to track collections differently
}
