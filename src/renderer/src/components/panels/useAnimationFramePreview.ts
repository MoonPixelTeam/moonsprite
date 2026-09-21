import { useRef } from 'react'
import { useWorkspace } from '@/store/workspace'

/** Coalesces canvas previews without delaying the local timeline highlight. */
export function useAnimationFramePreview(documentId: string) {
  const originRef = useRef<{ documentId: string; frameId: string } | null>(null)
  const pendingRef = useRef<string | null>(null)
  const scheduledRef = useRef<number | null>(null)
  const stop = (): void => {
    if (scheduledRef.current !== null) window.cancelAnimationFrame(scheduledRef.current)
    scheduledRef.current = null
  }
  const flush = (): void => {
    stop()
    const frameId = pendingRef.current
    pendingRef.current = null
    const state = useWorkspace.getState()
    const active = state.sessions.find((item) => item.document.id === state.activeId)
    if (!frameId || !active || active.document.id !== documentId || active.animationPlaying) return
    const currentFrameId = active.document.animation?.activeFrameId
    if (!currentFrameId || currentFrameId === frameId) return
    originRef.current ??= { documentId, frameId: currentFrameId }
    state.setActiveAnimationFrame(frameId)
  }
  return {
    preview(frameId: string): void {
      pendingRef.current = frameId
      if (scheduledRef.current === null) scheduledRef.current = window.requestAnimationFrame(flush)
    },
    cancel(): void {
      stop()
      pendingRef.current = null
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
