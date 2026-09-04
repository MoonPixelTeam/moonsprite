import type { SpriteDocument, ViewState } from '@shared/types'
import type { RotationIndicatorPosition } from './file-preferences'
import { unrotatedViewportBounds, viewCanvasOrigin, type ViewportBounds } from './view-geometry'

export interface CanvasRenderPlan {
  viewportWidth: number
  viewportHeight: number
  rotated: boolean
  viewport: ViewportBounds
  sceneLeft: number
  sceneTop: number
  sceneWidth: number
  sceneHeight: number
  originX: number
  originY: number
  canvasWidth: number
  canvasHeight: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface DeviceAlignedPixelRect { x: number; y: number; width: number; height: number }

export interface DeviceAlignedPixelRun {
  start: number
  count: number
  left: number
  right: number
}

/**
 * Physical pixels per logical canvas unit.  A canvas backing store is rounded
 * to integer pixels independently on each axis, so the effective horizontal
 * and vertical ratios can differ by a small amount from the requested DPR.
 */
export interface CanvasDeviceScale {
  x: number
  y: number
}

export type CanvasDeviceScaleInput = number | CanvasDeviceScale

export interface DeviceAlignedCanvasRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const normalizedDevicePixelRatio = (devicePixelRatio: number): number => Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1

export const normalizeCanvasDeviceScale = (devicePixelRatio: CanvasDeviceScaleInput): CanvasDeviceScale => {
  if (typeof devicePixelRatio === 'number') {
    const value = normalizedDevicePixelRatio(devicePixelRatio)
    return { x: value, y: value }
  }
  return {
    x: normalizedDevicePixelRatio(devicePixelRatio.x),
    y: normalizedDevicePixelRatio(devicePixelRatio.y)
  }
}

/** Align a logical coordinate to the same physical-pixel tie rule as bitmap previews. */
export const deviceAlignedCoordinate = (value: number, devicePixelRatio: number): number => Math.ceil(value * devicePixelRatio - 0.5) / devicePixelRatio

/**
 * Calculate the screen rectangle for an integer document-pixel range.
 * Keeping the pixel index and range size in this helper makes a grouped
 * bitmap draw use exactly the same device-pixel edges as individual previews.
 */
export function deviceAlignedDocumentRect(
  originX: number,
  originY: number,
  zoom: number,
  pixelX: number,
  pixelY: number,
  pixelWidth: number,
  pixelHeight: number,
  devicePixelRatio: CanvasDeviceScaleInput
): DeviceAlignedCanvasRect {
  const dpr = normalizeCanvasDeviceScale(devicePixelRatio)
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const safeX = Number.isFinite(pixelX) ? pixelX : 0
  const safeY = Number.isFinite(pixelY) ? pixelY : 0
  const safeWidth = Number.isFinite(pixelWidth) ? Math.max(0, pixelWidth) : 0
  const safeHeight = Number.isFinite(pixelHeight) ? Math.max(0, pixelHeight) : 0
  const left = deviceAlignedCoordinate(originX + safeX * safeZoom, dpr.x)
  const top = deviceAlignedCoordinate(originY + safeY * safeZoom, dpr.y)
  const right = Math.max(left + 1 / dpr.x, deviceAlignedCoordinate(originX + (safeX + safeWidth) * safeZoom, dpr.x))
  const bottom = Math.max(top + 1 / dpr.y, deviceAlignedCoordinate(originY + (safeY + safeHeight) * safeZoom, dpr.y))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function deviceAlignedPixelRect(originX: number, originY: number, zoom: number, pixelX: number, pixelY: number, devicePixelRatio: CanvasDeviceScaleInput): DeviceAlignedPixelRect {
  // Canvas nearest-neighbour sampling assigns an exact half-device boundary
  // to the lower pixel. Match that tie rule so previews sit on committed pixels.
  const rect = deviceAlignedDocumentRect(originX, originY, zoom, pixelX, pixelY, 1, 1, devicePixelRatio)
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/** Group adjacent document pixels that occupy equal device widths. */
export function deviceAlignedPixelRuns(origin: number, zoom: number, start: number, count: number, devicePixelRatio: number): DeviceAlignedPixelRun[] {
  const safeCount = Math.max(0, Math.floor(count))
  if (safeCount === 0) return []
  const dpr = normalizedDevicePixelRatio(devicePixelRatio)
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const edge = (index: number): number => deviceAlignedCoordinate(origin + index * safeZoom, dpr)
  const runs: DeviceAlignedPixelRun[] = []
  const first = Math.floor(start)
  let runStart = first
  let runLeft = edge(runStart)
  let runRight = edge(runStart + 1)
  let runWidth = runRight - runLeft
  let runCount = 1
  for (let offset = 1; offset < safeCount; offset += 1) {
    const index = first + offset
    const left = edge(index)
    const right = edge(index + 1)
    if (Math.abs(left - runRight) <= 0.0000001 && Math.abs((right - left) - runWidth) <= 0.0000001) {
      runRight = right
      runCount += 1
      continue
    }
    runs.push({ start: runStart, count: runCount, left: runLeft, right: runRight })
    runStart = index
    runLeft = left
    runRight = right
    runWidth = right - left
    runCount = 1
  }
  runs.push({ start: runStart, count: runCount, left: runLeft, right: runRight })
  return runs
}

const deviceAlignedPixelIndex = (position: number, origin: number, zoom: number, devicePixelRatio: number): number => {
  const approximate = Math.floor((position - origin) / zoom)
  for (let index = approximate - 2; index <= approximate + 2; index += 1) {
    const left = deviceAlignedCoordinate(origin + index * zoom, devicePixelRatio)
    const right = deviceAlignedCoordinate(origin + (index + 1) * zoom, devicePixelRatio)
    if (position >= left && position < right) return index
  }
  return approximate
}

/** Map an unrotated viewport point to the pixel actually under the pointer. */
export function deviceAlignedDocumentPointAtViewport(
  viewportX: number,
  viewportY: number,
  originX: number,
  originY: number,
  zoom: number,
  devicePixelRatio: CanvasDeviceScaleInput
): { x: number; y: number } {
  const dpr = normalizeCanvasDeviceScale(devicePixelRatio)
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  return {
    x: deviceAlignedPixelIndex(viewportX, originX, safeZoom, dpr.x),
    y: deviceAlignedPixelIndex(viewportY, originY, safeZoom, dpr.y)
  }
}

/**
 * Snap the four outer edges of a canvas to the same device-pixel grid used by
 * pixel previews. Keeping both endpoints aligned is important: rounding only
 * the origin while leaving the scaled width fractional lets the right/bottom
 * edge drift or become antialiased during zooming.
 */
export function deviceAlignedCanvasRect(originX: number, originY: number, width: number, height: number, devicePixelRatio: CanvasDeviceScaleInput): DeviceAlignedCanvasRect {
  const dpr = normalizeCanvasDeviceScale(devicePixelRatio)
  const safeOriginX = Number.isFinite(originX) ? originX : 0
  const safeOriginY = Number.isFinite(originY) ? originY : 0
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0
  const left = deviceAlignedCoordinate(safeOriginX, dpr.x)
  const top = deviceAlignedCoordinate(safeOriginY, dpr.y)
  const right = Math.max(left + 1 / dpr.x, deviceAlignedCoordinate(safeOriginX + safeWidth, dpr.x))
  const bottom = Math.max(top + 1 / dpr.y, deviceAlignedCoordinate(safeOriginY + safeHeight, dpr.y))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

/**
 * Returns a repeated canvas boundary from one shared, already aligned period.
 * Using the base edges for the first neighbours avoids independent floating
 * point rounding at the join between two repeated copies.
 */
export function repeatedDeviceAlignedCanvasRect(base: DeviceAlignedCanvasRect, offsetX: number, offsetY: number): DeviceAlignedCanvasRect {
  const horizontalEdge = (index: number): number => index === 0
    ? base.left
    : index === 1
      ? base.right
      : base.left + index * base.width
  const verticalEdge = (index: number): number => index === 0
    ? base.top
    : index === 1
      ? base.bottom
      : base.top + index * base.height
  const left = horizontalEdge(offsetX)
  const right = horizontalEdge(offsetX + 1)
  const top = verticalEdge(offsetY)
  const bottom = verticalEdge(offsetY + 1)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function createCanvasRenderPlan(
  viewportWidth: number,
  viewportHeight: number,
  document: Pick<SpriteDocument, 'width' | 'height'>,
  view: ViewState,
  rotationIndicatorPosition: RotationIndicatorPosition
): CanvasRenderPlan {
  const rotated = Math.abs(view.rotation) > 0.000001 || view.mirrored || view.mirroredVertical
  const viewport = unrotatedViewportBounds(viewportWidth, viewportHeight, view, rotationIndicatorPosition)
  const sceneLeft = Math.floor(viewport.left) - 2
  const sceneTop = Math.floor(viewport.top) - 2
  const sceneWidth = Math.ceil(viewport.right) - sceneLeft + 2
  const sceneHeight = Math.ceil(viewport.bottom) - sceneTop + 2
  const origin = viewCanvasOrigin(viewportWidth, viewportHeight, document.width, document.height, view)
  const canvasWidth = document.width * view.zoom
  const canvasHeight = document.height * view.zoom
  return {
    viewportWidth,
    viewportHeight,
    rotated,
    viewport,
    sceneLeft,
    sceneTop,
    sceneWidth,
    sceneHeight,
    originX: origin.x,
    originY: origin.y,
    canvasWidth,
    canvasHeight,
    fromX: Math.max(0, Math.floor((viewport.left - origin.x) / view.zoom)),
    fromY: Math.max(0, Math.floor((viewport.top - origin.y) / view.zoom)),
    toX: Math.min(document.width, Math.ceil((viewport.right - origin.x) / view.zoom)),
    toY: Math.min(document.height, Math.ceil((viewport.bottom - origin.y) / view.zoom))
  }
}
