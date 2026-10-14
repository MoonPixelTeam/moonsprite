import { useEffect, type RefObject } from 'react'
import type { CanvasInputState } from '@/core/canvas-input'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import type { CanvasCompositeCache } from './canvas-composite-cache'

export function useSelectionBackdropPrewarm(cache: CanvasCompositeCache, session: DocumentSession, input: RefObject<CanvasInputState>): void {
  const documentId = session.document.id
  useEffect(() => {
    let stop = () => {}, releaseTimer = 0
    const prepare = () => {
      stop()
      const state = useWorkspace.getState()
      const current = state.sessions.find(candidate => candidate.document.id === documentId)
      if (state.activeId !== documentId || !current?.selection || current.activeLayerMaskId || current.pendingPaste || current.animationPlaying || input.current.drag) return
      stop = cache.prepareSelectionBackdrop(current.document, current.document.activeLayerId, current.contentRevision, current.selection,
        () => !input.current.drag && useWorkspace.getState().activeId === documentId)
    }
    // The final selection may retain its identity when the gesture ends.
    // Wait until the pointer handler publishes it and releases drag ownership.
    const released = () => { window.clearTimeout(releaseTimer); releaseTimer = window.setTimeout(prepare, 0) }
    prepare()
    window.addEventListener('pointerup', released)
    return () => { stop(); window.clearTimeout(releaseTimer); window.removeEventListener('pointerup', released) }
  }, [cache, documentId, session.selection, session.contentRevision, session.document.activeLayerId, session.activeLayerMaskId, session.pendingPaste, session.animationPlaying, input])
}
