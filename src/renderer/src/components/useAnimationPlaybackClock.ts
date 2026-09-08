import { useEffect, useRef } from 'react'
import { ensureAnimationDocument } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'

interface AnimationPlaybackClockState {
  frameId: string
  rate: number
  deadline: number
  expectedFrameId: string | null
}

const monotonicNow = (): number => {
  const value = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return Number.isFinite(value) ? value : Date.now()
}

/** Owns the single animation timer shared by the canvas, layer panel, and preview panel. */
export const useAnimationPlaybackClock = (documentId: string): void => {
  const clockRef = useRef<AnimationPlaybackClockState | null>(null)
  const playbackKey = useWorkspace((state) => {
    const session = state.sessions.find((item) => item.document.id === documentId)
    if (!session?.animationPlaying) return `${documentId}:idle`
    const timeline = ensureAnimationDocument(session.document)
    const frame = timeline.frames.find((candidate) => candidate.id === timeline.activeFrameId)
    return `${documentId}:${frame?.id ?? ''}:${frame?.duration ?? 0}:${session.animationPlaybackRate}:${session.animationPlaybackMode}:${timeline.loop ? 1 : 0}:${session.animationPlaybackLoopSectionId ?? ''}:${session.animationPlaybackLoopSectionRepeatIndefinitely ? 1 : 0}:${session.animationPlaybackLoopIteration}`
  })

  useEffect(() => {
    const state = useWorkspace.getState()
    const session = state.sessions.find((item) => item.document.id === documentId)
    if (!session?.animationPlaying) {
      clockRef.current = null
      return
    }
    const timeline = ensureAnimationDocument(session.document)
    const activeFrame = timeline.frames.find((frame) => frame.id === timeline.activeFrameId)
    if (!activeFrame) {
      clockRef.current = null
      return
    }
    const activeFrameId = activeFrame.id
    const rate = Math.max(0.01, session.animationPlaybackRate || 1)
    const now = monotonicNow()
    const previous = clockRef.current
    const frameDuration = activeFrame.duration / rate
    const deadline = previous?.expectedFrameId === activeFrameId && previous.rate === rate
      ? previous.deadline + frameDuration
      : now + frameDuration
    clockRef.current = { frameId: activeFrameId, rate, deadline, expectedFrameId: null }
    let frameRequest: number | null = null
    const timer = window.setTimeout(() => {
      // Commit the playhead at the display boundary. View navigation uses the
      // same boundary, so React state, frame composition, and pan/zoom cannot
      // each enqueue a separate canvas draw inside one refresh interval.
      frameRequest = window.requestAnimationFrame(() => {
        frameRequest = null
        const currentState = useWorkspace.getState()
        const current = currentState.sessions.find((item) => item.document.id === documentId)
        if (!current?.animationPlaying || current.document.animation?.activeFrameId !== activeFrameId) return
        currentState.advanceAnimationFrame()
        const next = useWorkspace.getState().sessions.find((item) => item.document.id === documentId)
        const nextFrameId = next?.document.animation?.activeFrameId ?? null
        if (next?.animationPlaying && nextFrameId && nextFrameId !== activeFrameId) {
          const clock = clockRef.current
          if (clock?.frameId === activeFrameId && clock.rate === rate) {
            clock.expectedFrameId = nextFrameId
          }
        } else {
          clockRef.current = null
        }
      })
    }, Math.max(0, deadline - now))
    return () => {
      window.clearTimeout(timer)
      if (frameRequest !== null) window.cancelAnimationFrame(frameRequest)
    }
  }, [documentId, playbackKey])
}
