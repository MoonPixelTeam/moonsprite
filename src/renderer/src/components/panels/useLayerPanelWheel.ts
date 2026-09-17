import { useEffect, useRef, type RefObject } from 'react'

const LAYER_PAN_ACCELERATION = 5
const LAYER_DISPLAY_ACCELERATION = 3

/**
 * Clamps a requested scroll offset. `scrollSize === 0` means the element has not been
 * laid out yet; the browser already clamps an assignment, so only clamp when the
 * range is known.
 */
const clampScroll = (value: number, scrollSize: number, clientSize: number): number => {
  const max = scrollSize > 0 ? Math.max(0, scrollSize - clientSize) : null
  return max === null ? Math.max(0, value) : Math.max(0, Math.min(max, value))
}

interface Options {
  panelRef: RefObject<HTMLElement | null>
  layerListRef: RefObject<HTMLElement | null>
  changeLayerDensity: (direction: -1 | 1, step?: number) => void
}

export function useLayerPanelWheel({ panelRef, layerListRef, changeLayerDensity }: Options): void {
  const handleWheel = (event: WheelEvent): void => {
    const accelerated = event.altKey
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (delta !== 0) changeLayerDensity(delta < 0 ? 1 : -1, accelerated ? LAYER_DISPLAY_ACCELERATION : 1)
      return
    }
    if (!accelerated) return
    event.preventDefault()
    event.stopPropagation()
    const list = layerListRef.current
    if (!list) return
    const horizontal = event.shiftKey
    const delta = horizontal
      ? (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
      : (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX)
    if (delta === 0) return
    const amount = delta * LAYER_PAN_ACCELERATION
    if (horizontal) list.scrollLeft = clampScroll(list.scrollLeft + amount, list.scrollWidth, list.clientWidth)
    else list.scrollTop = clampScroll(list.scrollTop + amount, list.scrollHeight, list.clientHeight)
  }

  const handlerRef = useRef(handleWheel)
  handlerRef.current = handleWheel

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const listener = (event: WheelEvent): void => handlerRef.current(event)
    panel.addEventListener('wheel', listener, { passive: false })
    return () => panel.removeEventListener('wheel', listener)
  }, [panelRef])
}
