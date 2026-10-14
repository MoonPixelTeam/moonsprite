import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react'

/** Keep the displayed tool stable until both editing and pointer ownership end. */
export function useToolOptionsInteraction<T>(value: T, temporary: boolean, context: string) {
  const [held, setHeld] = useState<{ value: T } | null>(null)
  const heldRef = useRef(held)
  const inside = useRef(false)
  const pointers = useRef(new Set<number>())
  const editing = useRef(false)
  const release = () => {
    if (inside.current || pointers.current.size || editing.current) return
    heldRef.current = null
    setHeld(null)
  }
  const hold = () => {
    if (heldRef.current) return
    heldRef.current = { value }
    setHeld(heldRef.current)
  }
  useLayoutEffect(() => {
    heldRef.current = null
    setHeld(null)
    pointers.current.clear()
    editing.current = false
  }, [context])
  useEffect(() => {
    const end = (event: PointerEvent) => { pointers.current.delete(event.pointerId); release() }
    const reset = () => {
      inside.current = false
      editing.current = false
      pointers.current.clear()
      release()
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('blur', reset)
    }
  }, [])
  const isEditor = (target: EventTarget | null) => target instanceof Element
    && Boolean(target.closest('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]'))
  return {
    value: held?.value ?? value,
    handlers: {
      onPointerEnter: () => { inside.current = true; if (temporary) hold() },
      onPointerLeave: () => { inside.current = false; release() },
      onPointerDownCapture: (event: React.PointerEvent<HTMLElement>) => { hold(); pointers.current.add(event.pointerId) },
      onFocusCapture: (event: FocusEvent<HTMLElement>) => { if (isEditor(event.target)) { hold(); editing.current = true } },
      onBlurCapture: () => { editing.current = false; release() }
    }
  }
}
