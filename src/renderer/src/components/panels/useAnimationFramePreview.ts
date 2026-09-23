import { useRef } from 'react'
import { useWorkspace } from '@/store/workspace'

/** Let the local marquee paint before publishing a global frame change. */
export function useAnimationFramePreview(documentId: string) {
  const originRef = useRef<{ documentId: string; frameId: string } | null>(null)
  const pendingRef = useRef<{frameId: string | null; frame: number | null; timer: number | null}>({frameId: null, frame: null, timer: null})
  const clearPending = (): string | null => {
    const pending = pendingRef.current
    if (pending.frame !== null) window.cancelAnimationFrame(pending.frame)
    if (pending.timer !== null) window.clearTimeout(pending.timer)
    const frameId = pending.frameId
    pending.frameId = pending.frame = pending.timer = null
    return frameId
  }
  const apply = (frameId: string): void => {
    const state = useWorkspace.getState()
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    if (!frameId || !active || active.document.id !== documentId || active.animationPlaying) return
    const currentFrameId = active.document.animation?.activeFrameId
    if (!currentFrameId || currentFrameId === frameId) return
    originRef.current ??= { documentId, frameId: currentFrameId }
    state.setActiveAnimationFrame(frameId)
  }
  const flush = (): void => {
    const frameId = clearPending()
    if (frameId) apply(frameId)
  }
  const preview = (frameId: string): void => {
    const pending = pendingRef.current
    pending.frameId = frameId
    if (pending.frame !== null || pending.timer !== null) return
    pending.frame = window.requestAnimationFrame(() => {
      pending.frame = null
      // rAF runs before paint; the task keeps unrelated store subscribers and
      // canvas/preview work out of the marquee's synchronous input update.
      pending.timer = window.setTimeout(flush, 0)
    })
  }
  return {
    preview,
    cancel(): void {
      clearPending()
      const origin = originRef.current
      originRef.current = null
      const state = useWorkspace.getState()
      const active = state.sessions.find((item) => item.document.id === state.activeId)
      if (origin && active?.document.id === origin.documentId && !active.animationPlaying
        && active.document.animation?.activeFrameId !== origin.frameId) state.setActiveAnimationFrame(origin.frameId)
    },
    commit(): void { flush(); originRef.current = null }
  }
}
