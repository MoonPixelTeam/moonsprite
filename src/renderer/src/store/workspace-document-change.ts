import type { ContentInvalidationHint } from '@/core/history'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceRecording } from './workspace-recording'
import { touch, touchMetadata } from './workspace-session'

/** Finalizes an already-applied change before Store publication.
 * History construction and preview rollback remain owned by the transaction.
 * This is not an atomic rollback wrapper. */
export function completeDocumentChange(
  session: DocumentSession,
  change: 'ui' | 'metadata' | 'content',
  record: WorkspaceRecording['recordDocumentOperation'],
  invalidation?: ContentInvalidationHint
): void {
  if (change === 'ui') return
  if (change === 'metadata') touchMetadata(session)
  else touch(session, true, invalidation)
  record(session, undefined, change === 'content')
}
