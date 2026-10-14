import { useSyncExternalStore } from 'react'
import { pendingGradientFor, subscribePendingGradient } from '@/core/canvas-gradient-confirmation'
import { translateCurrent as tr } from '@/core/localization'
export function GradientConfirmationBar({ documentId }: { documentId: string }) {
  const pending = useSyncExternalStore(subscribePendingGradient, () => pendingGradientFor(documentId), () => null)
  if (!pending) return null
  return <div className="gradient-confirm-bar" role="group" aria-label={tr('gradient.pending.title')}>
    <span role="status">{tr('gradient.pending.hint')}</span>
    <div className="gradient-confirm-actions">
      <button type="button" className="tool-text-button" onClick={() => pending.cancel()}>{tr('common.cancel')} (Esc)</button>
      <button type="button" className="tool-text-button primary" onClick={() => pending.apply()}>{tr('common.apply')} (Enter)</button>
    </div>
  </div>
}
