import { useCallback, useEffect, useRef } from 'react'

/** Keep pointer movement local; render the latest canvas preview after a pause or release. */
export function useCoalescedGradientPreview() {
  const pending = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
  }, [])
  const flush = useCallback(() => {
    const callback = pending.current
    cancel()
    callback?.()
  }, [cancel])
  const schedule = useCallback((callback: () => void) => {
    cancel()
    pending.current = callback
    timer.current = setTimeout(flush, 100)
  }, [cancel, flush])
  useEffect(() => {
    window.addEventListener('pointerup', flush)
    window.addEventListener('pointercancel', flush)
    return () => {
      cancel()
      window.removeEventListener('pointerup', flush)
      window.removeEventListener('pointercancel', flush)
    }
  }, [cancel, flush])
  return { schedule, cancel }
}
