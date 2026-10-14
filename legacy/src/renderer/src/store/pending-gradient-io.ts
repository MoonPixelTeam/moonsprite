import { pendingGradientFor } from '@/core/canvas-gradient-confirmation'
import type { AppDialog } from './workspace-types'
import { tr } from './workspace-translation'

/** Resolve visible, uncommitted pixels before taking any file snapshot. */
export async function resolvePendingGradientForIo(documentId: string,
  requestDialog: (options: Omit<AppDialog, 'resolve'>) => Promise<string>,
  activate: () => void): Promise<boolean> {
  const pending = pendingGradientFor(documentId)
  if (!pending) return true
  const choice = await requestDialog({ title: tr('gradient.pending.title'), message: tr('gradient.pending.io'),
    choices: [
      { id: 'cancel', label: tr('gradient.pending.continue'), tone: 'quiet' },
      { id: 'discard', label: tr('gradient.pending.discard'), tone: 'danger' },
      { id: 'apply', label: tr('common.apply'), tone: 'primary' }
    ] })
  // A replaced/invalidated preview must never authorize a different operation.
  if (pendingGradientFor(documentId) !== pending) return false
  if (choice === 'discard') { pending.cancel(); return pendingGradientFor(documentId) === null }
  if (choice !== 'apply') return false
  activate()
  if (pendingGradientFor(documentId) !== pending) return false
  return pending.apply() !== false && pendingGradientFor(documentId) === null
}
