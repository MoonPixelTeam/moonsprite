import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

interface SpaceDragState {
  pointerId: number
  startClientX: number
  startClientY: number
  startScrollLeft: number
  startScrollTop: number
}

export interface SpaceDragScrollPositionInput {
  startClientX: number
  startClientY: number
  clientX: number
  clientY: number
  startScrollLeft: number
  startScrollTop: number
  maxScrollLeft: number
  maxScrollTop: number
}

export function spaceDragScrollPosition(input: SpaceDragScrollPositionInput): { left: number; top: number } {
  return {
    left: Math.max(0, Math.min(input.maxScrollLeft, input.startScrollLeft - (input.clientX - input.startClientX))),
    top: Math.max(0, Math.min(input.maxScrollTop, input.startScrollTop - (input.clientY - input.startClientY)))
  }
}

function hasScrollableOverflow(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight
}

function editableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
}

/** Adds canvas-style Space and middle-button hand gestures to a native scroll container. */
export function useSpaceDragScroll<T extends HTMLElement>(containerRef: RefObject<T | null>) {
  const dragRef = useRef<SpaceDragState | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Space' && !editableTarget(event.target)) setSpaceHeld(true)
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const release = (): void => setSpaceHeld(false)
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('keyup', keyUp, true)
      window.removeEventListener('blur', release)
    }
  }, [])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    element.classList.toggle('space-drag-scroll-ready', !dragging && spaceHeld && pointerInside && hasScrollableOverflow(element))
    element.classList.toggle('space-drag-scroll-dragging', dragging)
    return () => {
      element.classList.remove('space-drag-scroll-ready', 'space-drag-scroll-dragging')
    }
  }, [containerRef, dragging, pointerInside, spaceHeld])

  const finish = (event: ReactPointerEvent<T>): boolean => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return false
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  return {
    begin(event: ReactPointerEvent<T>): boolean {
      const element = containerRef.current
      const spacePan = event.button === 0 && spaceHeld
      const middleButtonPan = event.button === 1
      if ((!spacePan && !middleButtonPan) || !element || !hasScrollableOverflow(element)) return false
      dragRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: element.scrollLeft,
        startScrollTop: element.scrollTop
      }
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    move(event: ReactPointerEvent<T>): boolean {
      const drag = dragRef.current
      const element = containerRef.current
      if (!drag || drag.pointerId !== event.pointerId || !element) return false
      const next = spaceDragScrollPosition({
        startClientX: drag.startClientX,
        startClientY: drag.startClientY,
        clientX: event.clientX,
        clientY: event.clientY,
        startScrollLeft: drag.startScrollLeft,
        startScrollTop: drag.startScrollTop,
        maxScrollLeft: Math.max(0, element.scrollWidth - element.clientWidth),
        maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight)
      })
      element.scrollLeft = next.left
      element.scrollTop = next.top
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    finish,
    cancel(event: ReactPointerEvent<T>): boolean {
      return finish(event)
    },
    enter(): void {
      setPointerInside(true)
    },
    leave(): boolean {
      if (dragRef.current) return true
      setPointerInside(false)
      return false
    }
  }
}
