import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { animationTweenPreviewFor } from './animation-tween-preview'

interface Point { x: number; y: number }
interface Ports {
  documentId(): string
  moveToolActive(): boolean
  pointAt(clientX: number, clientY: number): { local: Point; repeated: Point } | null
}
type Pointer = Pick<ReactPointerEvent<HTMLCanvasElement>, 'button' | 'pointerId' | 'clientX' | 'clientY' | 'currentTarget' | 'preventDefault'>

/** Owns only the temporary endpoint gesture; never starts a document move transaction. */
export function createAnimationTweenPreviewDrag(ports: Ports) {
  let drag: {
    pointerId: number; canvas: HTMLCanvasElement; documentId: string
    start: Point | null; move: NonNullable<ReturnType<typeof animationTweenPreviewFor>>['move']
  } | null = null
  const currentMove = () => drag && animationTweenPreviewFor(drag.documentId)?.move
  const update = (event: Pointer): void => {
    const current = currentMove()
    if (!drag?.start || !drag.move || current?.owner !== drag.move.owner) return
    const point = ports.pointAt(event.clientX, event.clientY)?.repeated
    if (!point) return
    const clamp = (value: number) => Math.max(-16384, Math.min(16384, Math.round(value)))
    const x = clamp(drag.move.x + point.x - drag.start.x), y = clamp(drag.move.y + point.y - drag.start.y)
    if (current.x !== x || current.y !== y) current.onChange(x, y)
  }
  const release = (): void => {
    const finished = drag
    drag = null
    if (finished?.canvas.hasPointerCapture(finished.pointerId)) finished.canvas.releasePointerCapture(finished.pointerId)
  }
  const cancel = (): void => {
    const current = currentMove()
    if (drag?.start && drag.move && current?.owner === drag.move.owner) current.onChange(drag.move.x, drag.move.y)
    release()
  }
  return {
    pointerDown(event: Pointer): boolean {
      if (drag) return true
      if (event.button !== 0 || !ports.moveToolActive()) return false
      const preview = animationTweenPreviewFor(ports.documentId())
      if (!preview?.move) return false
      const point = ports.pointAt(event.clientX, event.clientY)
      if (!point) return false
      const hit = point.local.x >= preview.offsetX && point.local.y >= preview.offsetY
        && point.local.x < preview.offsetX + preview.canvas.width && point.local.y < preview.offsetY + preview.canvas.height
      // Misses are consumed too, so a click next to the ghost cannot move source pixels.
      drag = { pointerId: event.pointerId, canvas: event.currentTarget, documentId: ports.documentId(), start: hit ? point.repeated : null, move: preview.move }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      return true
    },
    pointerMove(event: Pointer): boolean {
      if (!drag) return false
      if (event.pointerId !== drag.pointerId) return true
      event.preventDefault()
      update(event)
      return true
    },
    pointerUp(event: Pointer): boolean {
      if (!drag) return false
      if (event.pointerId !== drag.pointerId) return true
      event.preventDefault()
      update(event)
      release()
      return true
    },
    pointerCancel(event: Pointer): boolean {
      if (!drag) return false
      if (event.pointerId !== drag.pointerId) return true
      cancel()
      return true
    },
    cancel
  }
}

export function useAnimationTweenPreviewDrag(ports: Ports) {
  const portsRef = useRef(ports)
  portsRef.current = ports
  const controllerRef = useRef<ReturnType<typeof createAnimationTweenPreviewDrag> | null>(null)
  if (!controllerRef.current) controllerRef.current = createAnimationTweenPreviewDrag({
    documentId: () => portsRef.current.documentId(),
    moveToolActive: () => portsRef.current.moveToolActive(),
    pointAt: (x, y) => portsRef.current.pointAt(x, y)
  })
  const controller = controllerRef.current
  useEffect(() => {
    window.addEventListener('blur', controller.cancel)
    return () => { window.removeEventListener('blur', controller.cancel); controller.cancel() }
  }, [controller, ports.documentId()])
  return controller
}
