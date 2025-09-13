// Import basic types from expressions module
import type { Collection, Document } from './expressions.js';

/**
 * Returns the count of documents in the collection.
 * @param collection - Array of documents to count
 * @returns Number of documents
 */
function count<T extends Document = Document>(
  collection: Collection<T>
): number {
  return collection.length;
}

export { count };
export default { count };
