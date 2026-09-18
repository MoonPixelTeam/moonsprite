import { useRef } from 'react'
import { useWorkspace } from '@/store/workspace'

/** Changes the displayed frame without replacing the timeline selection. */
export function useAnimationFramePreview(documentId: string) {
  const originRef = useRef<{ documentId: string; frameId: string } | null>(null)
  return {
    preview(frameId: string): void {
      const state = useWorkspace.getState()
      const active = state.sessions.find((item) => item.document.id === state.activeId)
      if (!active || active.document.id !== documentId || active.animationPlaying) return
      const currentFrameId = active.document.animation?.activeFrameId
      if (!currentFrameId || currentFrameId === frameId) return
      originRef.current ??= { documentId, frameId: currentFrameId }
      state.setActiveAnimationFrame(frameId)
    },
    cancel(): void {
      const origin = originRef.current
      originRef.current = null
      const state = useWorkspace.getState()
      const active = state.sessions.find((item) => item.document.id === state.activeId)
      if (origin && active?.document.id === origin.documentId && !active.animationPlaying
        && active.document.animation?.activeFrameId !== origin.frameId) state.setActiveAnimationFrame(origin.frameId)
    },
    commit(): void { originRef.current = null }
  }
}
