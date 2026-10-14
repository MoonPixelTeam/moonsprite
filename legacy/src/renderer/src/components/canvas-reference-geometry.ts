import { resizeTransformedSelectionBounds } from '@/core/canvas-input-resize'
import type { SelectionHandle } from '@/core/canvas-input-contracts'
import { rotateViewportPoint, unrotateViewportPoint, documentPointFromViewportPointContinuous, viewportPointFromDocumentPointContinuous, type ViewGeometryState, type ViewportPoint } from '@/core/view-geometry'
import { canvasViewportPointForInterfaceScale, canvasViewportPointToCss } from '@/core/canvas-interface-scale'
import type { RotationIndicatorPosition } from '@/core/file-preferences'

export interface ReferenceViewport {
  width: number; height: number
  documentWidth: number; documentHeight: number
  interfaceScale: number
  rotationIndicatorPosition: RotationIndicatorPosition
  view: ViewGeometryState
}

export function referenceDocumentPoint(clientX: number, clientY: number, bounds: { left: number; top: number }, viewport: ReferenceViewport): ViewportPoint {
  const point = canvasViewportPointForInterfaceScale(clientX, clientY, bounds.left, bounds.top, viewport.interfaceScale)
  return documentPointFromViewportPointContinuous(point, viewport.width, viewport.height, viewport.documentWidth, viewport.documentHeight, viewport.view, viewport.rotationIndicatorPosition)
}

export function referenceViewportPoint(point: ViewportPoint, viewport: ReferenceViewport): ViewportPoint {
  return canvasViewportPointToCss(viewportPointFromDocumentPointContinuous(point, viewport.width, viewport.height, viewport.documentWidth, viewport.documentHeight, viewport.view, viewport.rotationIndicatorPosition), viewport.interfaceScale)
}

type ReferenceBounds = { x: number; y: number; width: number; height: number; angle: number; flipX: boolean; flipY: boolean; floating?: boolean }

export function referenceScreenBounds<T extends ReferenceBounds>(image: T, viewport: ReferenceViewport): T {
  if (image.floating) return image
  const center = referenceViewportPoint({ x: image.x + image.width / 2, y: image.y + image.height / 2 }, viewport)
  const scale = viewport.view.zoom / viewport.interfaceScale
  const width = image.width * scale, height = image.height * scale
  const reflected = Boolean(viewport.view.mirrored) !== Boolean(viewport.view.mirroredVertical)
  return { ...image, x: center.x - width / 2, y: center.y - height / 2, width, height,
    angle: viewport.view.rotation + (reflected ? -image.angle : image.angle),
    flipX: image.flipX !== Boolean(viewport.view.mirrored), flipY: image.flipY !== Boolean(viewport.view.mirroredVertical) }
}

export function referenceDocumentBounds<T extends ReferenceBounds>(image: T, viewport: ReferenceViewport): T {
  const center = referenceDocumentPoint(image.x + image.width / 2, image.y + image.height / 2, { left: 0, top: 0 }, viewport)
  const scale = viewport.view.zoom / viewport.interfaceScale
  const width = image.width / scale, height = image.height / scale
  const reflected = Boolean(viewport.view.mirrored) !== Boolean(viewport.view.mirroredVertical)
  return { ...image, x: center.x - width / 2, y: center.y - height / 2, width, height,
    angle: (image.angle - viewport.view.rotation) * (reflected ? -1 : 1),
    flipX: image.flipX !== Boolean(viewport.view.mirrored), flipY: image.flipY !== Boolean(viewport.view.mirroredVertical) }
}

export function referenceOutlinePath(image: ReferenceBounds): string {
  const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 }
  const points = [[image.x, image.y], [image.x + image.width, image.y], [image.x + image.width, image.y + image.height], [image.x, image.y + image.height]]
    .map(([x, y]) => rotateViewportPoint({ x, y }, center, image.angle))
  return `M${points.map(point => `${point.x},${point.y}`).join('L')}Z`
}

export function referenceSourcePoint(image: { x: number; y: number; width: number; height: number; angle: number; flipX: boolean; flipY: boolean }, point: ViewportPoint, sourceWidth: number, sourceHeight: number): ViewportPoint | null {
  const local = unrotateViewportPoint(point, { x: image.x + image.width / 2, y: image.y + image.height / 2 }, image.angle)
  const x = (local.x - image.x) / image.width, y = (local.y - image.y) / image.height
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return null
  const sx = Math.floor(x * sourceWidth), sy = Math.floor(y * sourceHeight)
  return { x: image.flipX ? sourceWidth - 1 - sx : sx, y: image.flipY ? sourceHeight - 1 - sy : sy }
}


/** Keep the opposite handle (or center) anchored while enforcing an exact ratio. */
export function resizeReferenceBounds(start: ReferenceBounds, delta: ViewportPoint, handle: SelectionHandle, integerScale: boolean, fromCenter: boolean) {
  const target = resizeTransformedSelectionBounds(start, delta, start.angle, handle, true, integerScale, fromCenter)
  const vertical = handle === 'n' || handle === 's'
  const ratio = start.width / start.height
  const width = vertical ? target.height * ratio : target.width
  const height = width / ratio
  const dx = fromCenter ? 0 : (handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0) * (target.flipHorizontal ? -1 : 1) * (width - target.width) / 2
  const dy = fromCenter ? 0 : (handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0) * (target.flipVertical ? -1 : 1) * (height - target.height) / 2
  const shift = rotateViewportPoint({ x: dx, y: dy }, { x: 0, y: 0 }, start.angle)
  return { ...target, x: target.x + target.width / 2 + shift.x - width / 2, y: target.y + target.height / 2 + shift.y - height / 2, width, height }
}
