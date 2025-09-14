import type { CrossfilterStore, RowId, PhysicalRowId } from './crossfilter-ivm';
import type { Document } from './expressions';

// Helper to safely access physical documents by rowId
// Returns null for virtual row IDs (string), leaving materialization to operators
export function getPhysicalDocument(
  store: CrossfilterStore,
  rowId: RowId
): Document | null {
  if (typeof rowId === 'number') {
    return store.documents[rowId as PhysicalRowId] || null;
  }
  return null;
}
