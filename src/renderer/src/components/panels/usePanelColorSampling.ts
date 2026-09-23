import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { RgbaColor } from '@shared/types-color'
import { documentPointFromViewportPointContinuous } from '@/core/view-geometry'
import { canvasCursors } from '@/core/canvas-visuals'
import { useWorkspace } from '@/store/workspace'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from '@/components/color-sampling-events'

/** The exact placement used by the last panel draw, before checkerboard/display effects. */
export interface PanelColorSource {
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  originX: number
  originY: number
  scale: number
  read: (x: number, y: number) => RgbaColor | null
}

export function samplePanelColor(canvas: HTMLCanvasElement, source: PanelColorSource, clientX: number, clientY: number): RgbaColor | null {
  const bounds = canvas.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0 || source.scale <= 0
    || clientX < bounds.left || clientY < bounds.top || clientX >= bounds.right || clientY >= bounds.bottom) return null
  const point = documentPointFromViewportPointContinuous(
    { x: (clientX - bounds.left) * source.viewportWidth / bounds.width - source.originX, y: (clientY - bounds.top) * source.viewportHeight / bounds.height - source.originY },
    source.width * source.scale, source.height * source.scale, source.width, source.height,
    { zoom: source.scale, panX: 0, panY: 0, rotation: 0 }, 'canvas'
  )
  const x = Math.floor(point.x), y = Math.floor(point.y)
  return x >= 0 && y >= 0 && x < source.width && y < source.height ? source.read(x, y) : null
}

export function usePanelColorSampling(sample: (x: number, y: number) => RgbaColor | null) {
  const eyedropper = useWorkspace(state => state.sessions.find(item => item.document.id === state.activeId)?.tool === 'eyedropper')
  const [alt, setAlt] = useState(false)
  const gesture = useRef<{ pointerId: number; secondary: boolean } | null>(null)
  useEffect(() => {
    const keys = (event: KeyboardEvent) => setAlt(event.altKey)
    const blur = () => { setAlt(false); gesture.current = null }
    window.addEventListener('keydown', keys)
    window.addEventListener('keyup', keys)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', keys); window.removeEventListener('keyup', keys); window.removeEventListener('blur', blur) }
  }, [])
  const apply = (event: PointerEvent<HTMLDivElement>, secondary: boolean) => {
    const color = sample(event.clientX, event.clientY)
    if (!color) return
    const state = useWorkspace.getState()
    if (secondary) state.setSecondaryColor(color)
    else state.setPrimaryColor(color)
    publishCanvasColorSample(color, secondary)
  }
  return {
    cursor: alt || eyedropper ? canvasCursors.eyedropper : undefined,
    start(event: PointerEvent<HTMLDivElement>): boolean {
      if (!(event.altKey || eyedropper) || (event.button !== 0 && event.button !== 2)) return false
      gesture.current = { pointerId: event.pointerId, secondary: event.button === 2 }
      event.preventDefault(); event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      apply(event, event.button === 2)
      return true
    },
    move(event: PointerEvent<HTMLDivElement>): boolean {
      if (gesture.current?.pointerId !== event.pointerId) return false
      apply(event, gesture.current.secondary)
      return true
    },
    finish(event: PointerEvent<HTMLDivElement>): void {
      if (gesture.current?.pointerId !== event.pointerId) return
      gesture.current = null
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      publishCanvasColorSamplingCompleted()
    },
    cancel(): void { gesture.current = null }
  }
}
