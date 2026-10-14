import { useRef } from 'react'
import { flushSync } from 'react-dom'

/** Process the latest pointer once per display frame, before painting. */
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
  const schedule = (event: PointerEvent): void => {
    const pending = pendingRef.current
    pending.event = event
    if (pending.frame !== null) return
    pending.frame = window.requestAnimationFrame(() => {
      pending.frame = null
      const next = take()
      // Range selection can derive the entire timeline. Skip intermediate
      // pointer positions that cannot be painted, then commit before paint.
      if (next) flushSync(() => latestMove.current(next))
    })
  }
  // Gesture ownership handles cancellation, pointerup and document changes.
  return {take, schedule}
}
