import type { ViewState } from '@shared/types-view'
import type { RotationIndicatorPosition } from './file-preferences'
import { unrotatedViewportBounds, viewCanvasOrigin } from './view-geometry'

export interface ClipboardPlacementInput {
  width: number
  height: number
  originX?: number
  originY?: number
  documentWidth: number
  documentHeight: number
  viewportWidth: number
  viewportHeight: number
  view: ViewState
  rotationIndicatorPosition: RotationIndicatorPosition
}

interface ClipboardPlacementBounds {
  left: number
  top: number
  right: number
  bottom: number
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value))

const centeredAxisOrigin = (start: number, end: number, size: number): number =>
  start + Math.floor((end - start) / 2) - Math.floor(size / 2)

const placeCopiedAxis = (origin: number, size: number, start: number, end: number): number => {
  const center = origin + Math.floor(size / 2)
  return center >= start && center < end
    ? clamp(origin, start - size, end - 1)
    : centeredAxisOrigin(start, end, size)
}

export function resolveClipboardPlacement(input: ClipboardPlacementInput): { x: number; y: number } {
  const viewport = unrotatedViewportBounds(input.viewportWidth, input.viewportHeight, input.view, input.rotationIndicatorPosition)
  const origin = viewCanvasOrigin(input.viewportWidth, input.viewportHeight, input.documentWidth, input.documentHeight, input.view)
  const visible: ClipboardPlacementBounds = {
    left: Math.floor((viewport.left - origin.x) / input.view.zoom),
    top: Math.floor((viewport.top - origin.y) / input.view.zoom),
    right: Math.ceil((viewport.right - origin.x) / input.view.zoom),
    bottom: Math.ceil((viewport.bottom - origin.y) / input.view.zoom)
  }

  let x: number
  let y: number
  if (input.originX !== undefined && input.originY !== undefined) {
    x = placeCopiedAxis(input.originX, input.width, visible.left, visible.right)
    y = placeCopiedAxis(input.originY, input.height, visible.top, visible.bottom)
  } else {
    const visibleCanvas: ClipboardPlacementBounds = {
      left: Math.max(0, visible.left),
      top: Math.max(0, visible.top),
      right: Math.min(input.documentWidth, visible.right),
      bottom: Math.min(input.documentHeight, visible.bottom)
    }
    const horizontal = visibleCanvas.right > visibleCanvas.left ? visibleCanvas : visible
    const vertical = visibleCanvas.bottom > visibleCanvas.top ? visibleCanvas : visible
    x = centeredAxisOrigin(horizontal.left, horizontal.right, input.width)
    y = centeredAxisOrigin(vertical.top, vertical.bottom, input.height)
  }

  if (input.documentWidth <= input.width || input.documentHeight <= input.height) {
    return {
      x: clamp(x, 0, Math.max(0, input.documentWidth - input.width)),
      y: clamp(y, 0, Math.max(0, input.documentHeight - input.height))
    }
  }

  return {
    x: clamp(x, -input.width + 1, input.documentWidth - 1),
    y: clamp(y, -input.height + 1, input.documentHeight - 1)
  }
}
