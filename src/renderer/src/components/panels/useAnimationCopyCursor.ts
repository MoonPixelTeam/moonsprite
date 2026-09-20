import { useEffect, useRef, type RefObject } from 'react'
import type { AnimationPointerDrag } from './animation-gesture-types'

export function useAnimationCopyCursor(animationPointerDragRef: RefObject<AnimationPointerDrag | null>) {
  const animationCopyRef = useRef(false)
  const hoverCopyCursorRef = useRef<HTMLElement | null>(null)
  const syncCopyCursor = (): void => {
    const drag = animationPointerDragRef.current
    document.body.classList.toggle('animation-copy-drag', Boolean(drag && (drag.kind === 'frame' || drag.kind === 'cel') && drag.moved && drag.canMove && animationCopyRef.current))
  }
  useEffect(() => {
    const modifiers = (event: KeyboardEvent): void => {
      const hovered = hoverCopyCursorRef.current
      if (hovered?.isConnected) hovered.style.cursor = event.altKey ? 'var(--cursor-copy)' : 'var(--cursor-move)'
      const drag = animationPointerDragRef.current
      if (!drag || (drag.kind !== 'frame' && drag.kind !== 'cel')) return
      animationCopyRef.current = event.altKey
      syncCopyCursor()
    }
    window.addEventListener('keydown', modifiers)
    window.addEventListener('keyup', modifiers)
    const clearHover = (): void => {
      if (hoverCopyCursorRef.current) hoverCopyCursorRef.current.style.cursor = ''
      hoverCopyCursorRef.current = null
    }
    const leave = (event: PointerEvent): void => {
      const hovered = hoverCopyCursorRef.current
      if (hovered && event.target instanceof Node && hovered.contains(event.target) && !(event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget))) clearHover()
    }
    window.addEventListener('pointerout', leave, true)
    window.addEventListener('blur', clearHover)
    return () => {
      clearHover()
      window.removeEventListener('pointerout', leave, true)
      window.removeEventListener('blur', clearHover)
      window.removeEventListener('keydown', modifiers)
      window.removeEventListener('keyup', modifiers)
      document.body.classList.remove('animation-copy-drag')
    }
  }, [animationPointerDragRef])
  return { animationCopyRef, hoverCopyCursorRef, syncCopyCursor }
}
