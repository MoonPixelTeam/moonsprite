import { useRef } from 'react'
import { flushSync } from 'react-dom'

/** Immediate marquee feedback; frame-coalesced content-move feedback. */
export function useAnimationPointerQueue(move: (event: PointerEvent) => void) {
  const latestMove = useRef(move)
  latestMove.current = move
  const pendingRef = useRef<{frame: number | null; event: PointerEvent | null}>({frame: null, event: null})
  const take = (): PointerEvent | null => {
    const pending = pendingRef.current
    if (pending.frame !== null) window.cancelAnimationFrame(pending.frame)
    pending.frame = null
    const event = pending.event
    pending.event = null
    return event
  }
  const schedule = (event: PointerEvent, immediate: boolean): void => {
    if (immediate) {
      // Range selection skips unchanged cells; crossing a boundary should
      // update React during input without adding another display tick.
      take()
      flushSync(() => latestMove.current(event))
      return
    }
    const pending = pendingRef.current
    pending.event = event
    if (pending.frame !== null) return
    pending.frame = window.requestAnimationFrame(() => {
      pending.frame = null
      const next = take()
      // Commit the coalesced drop feedback before returning to paint.
      if (next) flushSync(() => latestMove.current(next))
    })
  }
  // Gesture ownership handles cancellation, pointerup and document changes.
  return {take, schedule}
}
