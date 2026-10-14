import { useEffect, useRef, type RefObject } from 'react'
import type { CanvasInputState } from '@/core/canvas-input'

export const CANVAS_HOVER_DISMISS = 'moonsprite:canvas-hover-dismiss'

interface Ports {
  canvasRef: RefObject<HTMLCanvasElement | null>
  inputRef: RefObject<CanvasInputState>
  wheelBrushSizePreviewRef: RefObject<boolean>
  hidePenCursor: () => void
  hideEyedropperMagnifier: () => void
  draw: () => void
}

/** Drop hover visuals when another surface takes input, without editing a gesture. */
export function useCanvasHoverDismiss(ports: Ports) {
  const current = useRef(ports)
  current.current = ports
  const suspended = useRef(false)
  const windowActive = useRef(true)
  const dismiss = () => {
    suspended.current = true
    const next = current.current
    const hadPreview = next.inputRef.current.pointer.visible || next.inputRef.current.shiftLinePreview || next.wheelBrushSizePreviewRef.current
    next.inputRef.current.pointer.visible = false
    next.inputRef.current.shiftLinePreview = false
    next.wheelBrushSizePreviewRef.current = false
    next.hidePenCursor()
    next.hideEyedropperMagnifier()
    if (hadPreview) next.draw()
  }
  const acceptsHover = (event: { type: string; buttons: number }): boolean => {
    if (document.visibilityState === 'hidden') return false
    // Returning from an extension iframe can deliver pointerdown before window
    // focus. The canvas press itself reclaims input; do not consume that press.
    if (event.type === 'pointerdown') {
      windowActive.current = true
      suspended.current = false
      return true
    }
    if (!windowActive.current) return false
    if (!event.buttons && ['pointerenter', 'pointermove'].includes(event.type)) suspended.current = false
    return !suspended.current
  }
  useEffect(() => {
    const outside = (event: Event) => {
      const next = current.current
      if (next.inputRef.current.drag || event.composedPath().includes(next.canvasRef.current!)) return
      dismiss()
    }
    const blur = () => { windowActive.current = false; dismiss() }
    const focus = () => { windowActive.current = true }
    const visibility = () => {
      if (document.visibilityState === 'hidden') blur()
      else windowActive.current = document.hasFocus()
    }
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    window.addEventListener('moonsprite:extension-pointer-enter', dismiss)
    window.addEventListener(CANVAS_HOVER_DISMISS, dismiss)
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('focusin', outside, true)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      window.removeEventListener('moonsprite:extension-pointer-enter', dismiss)
      window.removeEventListener(CANVAS_HOVER_DISMISS, dismiss)
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('focusin', outside, true)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  return { acceptsHover, dismiss }
}
