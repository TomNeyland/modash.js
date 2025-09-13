import { size } from 'lodash-es';
import type { Collection, Document } from '../index.js';

/**
 * Returns the count of documents in the collection.
 * @param collection - Array of documents to count
 * @returns Number of documents
 */
function count<T extends Document = Document>(collection: Collection<T>): number {
  return size(collection);
}

export { count };
export default { count };