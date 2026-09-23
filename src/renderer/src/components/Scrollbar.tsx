import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useScrollbarThumb } from './useScrollbarThumb'

export interface ScrollbarProps {
  ariaLabel: string
  className?: string
  orientation: 'horizontal' | 'vertical'
  thumbRatio: number
  value: number
  onChange(value: number): void
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))

export function Scrollbar({ ariaLabel, className = '', orientation, thumbRatio, value, onChange }: ScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; offset: number } | null>(null)
  const normalizedValue = clampUnit(value)
  const normalizedRatio = clampUnit(thumbRatio)
  const horizontal = orientation === 'horizontal'
  const { canvasRef, thumbAt, setHovered } = useScrollbarThumb(trackRef, horizontal, normalizedRatio, normalizedValue)

  const pointerCoordinate = (event: PointerEvent<HTMLDivElement>): number => horizontal ? event.clientX : event.clientY
  const updateFromPointer = (event: PointerEvent<HTMLDivElement>, offset: number): void => {
    const track = trackRef.current?.getBoundingClientRect()
    if (!track) return
    const trackStart = horizontal ? track.left : track.top
    const trackLength = horizontal ? track.width : track.height
    const { length: thumbLength } = thumbAt(trackLength)
    const travel = trackLength - thumbLength
    onChange(travel > 0 ? clampUnit((pointerCoordinate(event) - trackStart - offset) / travel) : 0)
  }
  const beginPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    const { offset: thumbOffset, length: thumbLength } = thumbAt(horizontal ? bounds.width : bounds.height)
    const thumbStart = (horizontal ? bounds.left : bounds.top) + thumbOffset
    const pressedThumb = pointerCoordinate(event) >= thumbStart && pointerCoordinate(event) <= thumbStart + thumbLength
    const offset = pressedThumb ? pointerCoordinate(event) - thumbStart : thumbLength / 2
    dragRef.current = { pointerId: event.pointerId, offset }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some test hosts. */ }
    if (!pressedThumb) updateFromPointer(event, offset)
  }
  const movePointer = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    updateFromPointer(event, drag.offset)
  }
  const finishPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    } catch { /* Pointer capture is unavailable in some test hosts. */ }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const lineStep = 0.05
    const pageStep = Math.max(0.1, normalizedRatio * 0.9)
    let next: number | null = null
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 1
    else if (event.key === 'PageUp') next = normalizedValue - pageStep
    else if (event.key === 'PageDown') next = normalizedValue + pageStep
    else if ((horizontal && event.key === 'ArrowLeft') || (!horizontal && event.key === 'ArrowUp')) next = normalizedValue - lineStep
    else if ((horizontal && event.key === 'ArrowRight') || (!horizontal && event.key === 'ArrowDown')) next = normalizedValue + lineStep
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    onChange(clampUnit(next))
  }

  return <div
    ref={trackRef}
    className={`ui-scrollbar ui-scrollbar-${orientation} ${className}`.trim()}
    role="scrollbar"
    tabIndex={0}
    aria-label={ariaLabel}
    aria-orientation={orientation}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(normalizedValue * 100)}
    onKeyDown={handleKeyDown}
    onPointerDown={beginPointer}
    onPointerMove={movePointer}
    onPointerUp={finishPointer}
    onPointerCancel={finishPointer}
    onPointerEnter={() => setHovered(true)}
    onPointerLeave={() => setHovered(false)}
    onLostPointerCapture={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null }}
    onContextMenu={(event) => event.preventDefault()}
  >
    <canvas ref={canvasRef} className="ui-scrollbar-thumb" aria-hidden="true" />
  </div>
}
