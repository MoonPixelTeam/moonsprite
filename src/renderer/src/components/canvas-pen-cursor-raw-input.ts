import { useEffect, type RefObject } from 'react'
import type { CanvasCursorPositionUpdater, CanvasPenCursorClientPoint } from './canvas-pen-cursor-state'

interface RawCursorRefs {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  readonly clientPointRef: RefObject<CanvasPenCursorClientPoint | null>
  readonly penCursorStateRef: RefObject<{ active: boolean; pressure: boolean; x: number; y: number }>
  readonly moveCursorRef: RefObject<CanvasCursorPositionUpdater | undefined>
}

export function useCanvasPenCursorRawInput(refs: RawCursorRefs): void {
  useEffect(() => {
    const canvas = refs.canvasRef.current
    if (!canvas) return
    const move = (rawEvent: Event): void => {
      const event = rawEvent as PointerEvent
      const previous = refs.clientPointRef.current
      const pointer = refs.penCursorStateRef.current
      if (!pointer.active || !previous || !refs.moveCursorRef.current || document.visibilityState === 'hidden' ||
        event.pointerType === 'touch' || event.pointerId !== previous.pointerId || event.pointerType !== previous.pointerType ||
        event.timeStamp < previous.timeStamp) return
      pointer.x += event.clientX - previous.x
      pointer.y += event.clientY - previous.y
      previous.x = event.clientX
      previous.y = event.clientY
      previous.buttons = event.buttons
      previous.timeStamp = event.timeStamp
      previous.source = 'raw'
      refs.moveCursorRef.current(pointer)
    }
    canvas.addEventListener('pointerrawupdate', move, { passive: true })
    return () => canvas.removeEventListener('pointerrawupdate', move)
  }, [refs.canvasRef, refs.clientPointRef, refs.moveCursorRef, refs.penCursorStateRef])
}
