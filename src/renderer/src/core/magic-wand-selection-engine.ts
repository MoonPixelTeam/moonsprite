import type { SelectionMask, SelectionRect } from '@shared/types'
import { contiguousMatchingRegion, contiguousMatchingRegionInBounds } from './contiguous-region'

export interface MagicWandSelectionRequest {
  width: number
  height: number
  x: number
  y: number
  tolerance: number
  contiguous: boolean
  gapClosingThreshold: number
  layerBounds: SelectionRect
  contentBounds?: SelectionRect | null
}

interface CompactFloodResult {
  region: Uint8Array
  width: number
  height: number
  x: number
  y: number
  selected: number
}

const floodCompact = (
  width: number,
  height: number,
  startX: number,
  startY: number,
  matches: (index: number) => boolean
): CompactFloodResult | null => {
  if (width < 1 || height < 1 || startX < 0 || startY < 0 || startX >= width || startY >= height) return null
  const rowVisited: Array<Uint8Array | undefined> = new Array(height)
  const row = (y: number): Uint8Array => {
    let values = rowVisited[y]
    if (!values) {
      values = new Uint8Array(width)
      rowVisited[y] = values
    }
    return values
  }
  const allowed = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && rowVisited[y]?.[x] !== 1 && matches(y * width + x)
  if (!allowed(startX, startY)) return null
  const queue: Array<{ y: number; left: number; right: number }> = [{ y: startY, left: startX, right: startX + 1 }]
  const spans: Array<{ y: number; left: number; right: number }> = []
  let minX = startX
  let maxX = startX
  let minY = startY
  let maxY = startY
  let selected = 0
  const enqueueRuns = (y: number, from: number, to: number): void => {
    if (y < 0 || y >= height) return
    let x = Math.max(0, from)
    const end = Math.min(width, to)
    while (x < end) {
      if (!allowed(x, y)) {
        x += 1
        continue
      }
      const left = x
      while (x < end && allowed(x, y)) x += 1
      queue.push({ y, left, right: x })
    }
  }
  while (queue.length > 0) {
    const seed = queue.pop()!
    const y = seed.y
    if (!allowed(seed.left, y)) continue
    let left = seed.left
    let right = seed.right
    while (left > 0 && allowed(left - 1, y)) left -= 1
    while (right < width && allowed(right, y)) right += 1
    row(y).fill(1, left, right)
    spans.push({ y, left, right })
    selected += right - left
    minX = Math.min(minX, left)
    maxX = Math.max(maxX, right - 1)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    enqueueRuns(y - 1, left, right)
    enqueueRuns(y + 1, left, right)
  }
  const resultWidth = maxX - minX + 1
  const resultHeight = maxY - minY + 1
  const region = new Uint8Array(resultWidth * resultHeight)
  for (const span of spans) {
    region.fill(1, (span.y - minY) * resultWidth + span.left - minX, (span.y - minY) * resultWidth + span.right - minX)
  }
  return { region, width: resultWidth, height: resultHeight, x: minX, y: minY, selected }
}

const compactRegion = (
  region: Uint8Array,
  regionWidth: number,
  regionHeight: number,
  originX: number,
  originY: number
): SelectionMask | null => {
  let minX = regionWidth
  let minY = regionHeight
  let maxX = -1
  let maxY = -1
  let selected = 0
  for (let index = 0; index < region.length; index += 1) {
    if (region[index] !== 1) continue
    const x = index % regionWidth
    const y = Math.floor(index / regionWidth)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    selected += 1
  }
  if (maxX < minX || maxY < minY) return null
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  if (selected === width * height) return { x: originX + minX, y: originY + minY, width, height }
  const mask = new Uint8Array(width * height)
  for (let y = minY; y <= maxY; y += 1) {
    mask.set(
      region.subarray(y * regionWidth + minX, y * regionWidth + maxX + 1),
      (y - minY) * width
    )
  }
  return { x: originX + minX, y: originY + minY, width, height, mask }
}

const transparentExteriorSelection = (
  request: MagicWandSelectionRequest,
  matchesAt: (x: number, y: number) => boolean
): SelectionMask | null | undefined => {
  const { width, height, x, y, contentBounds } = request
  if (contentBounds === undefined) return undefined
  if (contentBounds === null) return { x: 0, y: 0, width, height }
  const left = Math.max(0, contentBounds.x - 1)
  const top = Math.max(0, contentBounds.y - 1)
  const right = Math.min(width, contentBounds.x + contentBounds.width + 1)
  const bottom = Math.min(height, contentBounds.y + contentBounds.height + 1)
  // A visible run touching the canvas edge can divide the exterior into
  // separate regions. Use the general flood in that uncommon case.
  if (left === 0 || top === 0 || right === width || bottom === height) return undefined
  const localWidth = right - left
  const localHeight = bottom - top
  if (localWidth * localHeight >= width * height / 2) return undefined
  const seedX = Math.max(left, Math.min(right - 1, x))
  const seedY = Math.max(top, Math.min(bottom - 1, y))
  const local = floodCompact(localWidth, localHeight, seedX - left, seedY - top, (index) => {
    const localX = index % localWidth
    const localY = Math.floor(index / localWidth)
    return matchesAt(left + localX, top + localY)
  })
  if (!local) return null
  const touchesExterior = local.x === 0
    || local.y === 0
    || local.x + local.width === localWidth
    || local.y + local.height === localHeight
  if (!touchesExterior) {
    return {
      x: left + local.x,
      y: top + local.y,
      width: local.width,
      height: local.height,
      ...(local.selected === local.width * local.height ? {} : { mask: local.region })
    }
  }
  const mask = new Uint8Array(width * height)
  mask.fill(1)
  for (let row = top; row < bottom; row += 1) mask.fill(0, row * width + left, row * width + right)
  for (let row = 0; row < local.height; row += 1) {
    const sourceStart = row * local.width
    const destinationStart = (top + local.y + row) * width + left + local.x
    mask.set(local.region.subarray(sourceStart, sourceStart + local.width), destinationStart)
  }
  return { x: 0, y: 0, width, height, mask }
}

export const computeMagicWandSelection = (
  request: MagicWandSelectionRequest,
  readPacked: (x: number, y: number) => number
): SelectionMask | null => {
  const { width, height, x, y, contiguous } = request
  if (width < 1 || height < 1 || x < 0 || y < 0 || x >= width || y >= height) return null
  const tolerance = Math.max(0, Math.min(255, Math.round(request.tolerance)))
  const target = readPacked(x, y)
  const matchesAt = (px: number, py: number): boolean => {
    const color = readPacked(px, py)
    return Math.max(
      Math.abs((color & 0xff) - (target & 0xff)),
      Math.abs(((color >>> 8) & 0xff) - ((target >>> 8) & 0xff)),
      Math.abs(((color >>> 16) & 0xff) - ((target >>> 16) & 0xff)),
      Math.abs((color >>> 24) - (target >>> 24))
    ) <= tolerance
  }
  const matches = (index: number): boolean => {
    return matchesAt(index % width, Math.floor(index / width))
  }
  const layerLeft = Math.max(0, request.layerBounds.x)
  const layerTop = Math.max(0, request.layerBounds.y)
  const layerRight = Math.min(width, request.layerBounds.x + request.layerBounds.width)
  const layerBottom = Math.min(height, request.layerBounds.y + request.layerBounds.height)
  const bounded = (target >>> 24) > tolerance && layerRight > layerLeft && layerBottom > layerTop
  const originX = bounded ? layerLeft : 0
  const originY = bounded ? layerTop : 0
  const regionWidth = bounded ? layerRight - layerLeft : width
  const regionHeight = bounded ? layerBottom - layerTop : height

  if (!contiguous) {
    const region = new Uint8Array(width * height)
    for (let index = 0; index < region.length; index += 1) if (matches(index)) region[index] = 1
    return compactRegion(region, width, height, 0, 0)
  }

  const gapClosingThreshold = Math.max(0, Math.round(request.gapClosingThreshold))
  if (gapClosingThreshold <= 0) {
    if (target === 0) {
      const exterior = transparentExteriorSelection(request, matchesAt)
      if (exterior !== undefined) return exterior
    }
    const local = floodCompact(regionWidth, regionHeight, x - originX, y - originY, (index) => {
      const documentX = originX + index % regionWidth
      const documentY = originY + Math.floor(index / regionWidth)
      return matches(documentY * width + documentX)
    })
    if (!local) return null
    if (local.selected === local.width * local.height) {
      return { x: originX + local.x, y: originY + local.y, width: local.width, height: local.height }
    }
    return { x: originX + local.x, y: originY + local.y, width: local.width, height: local.height, mask: local.region }
  }

  const local = bounded
    ? contiguousMatchingRegionInBounds(width, height, x, y, matches, gapClosingThreshold, {
        x: originX,
        y: originY,
        width: regionWidth,
        height: regionHeight
      })
    : null
  if (local) return compactRegion(local.region, local.bounds.width, local.bounds.height, local.bounds.x, local.bounds.y)
  const region = contiguousMatchingRegion(width, height, x, y, matches, gapClosingThreshold)
  return region ? compactRegion(region, width, height, 0, 0) : null
}
