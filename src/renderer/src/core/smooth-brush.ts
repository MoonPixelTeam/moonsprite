import type { TileRepeatMode } from '@shared/types-raster'
import { wrapDocumentPointForTileRepeat, tileRepeatIncludesX, tileRepeatIncludesY } from './tilemap'
import type { BrushShape } from '@shared/types-brush'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { layerIndexAt, readLayerPacked } from './document-model'
import { recordPixelKnownCurrent, type PixelEdit } from './history'
import { continuousLinePointsWithFixForLineBrush, selectionContains } from './selection'
import { brushStampAnchor, solidBrushPreviewRowSpans } from './tools-brush'

export const SMOOTH_BRUSH_OVERLAY = 'rgba(230, 0, 255, 0.35)'
export interface SmoothBrushStroke { visited: Set<number>; outsidePreview?: Map<string, Point> }
type Point = { x: number; y: number }
const neighbors = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const

/** Palette-preserving cleanup, followed by weighted contour relaxation at high strength. */
export function applySmoothBrush(
  document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, stroke: SmoothBrushStroke,
  selection: SelectionMask | null, strength = 50, source: 'stroke-start' | 'current' = 'stroke-start'
): boolean {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) : 50
  if (amount === 0) return false
  const passes = 1 + Math.ceil(Math.max(0, amount - 50) / 8)
  // Wider, smoothly weighted support rounds a contour without weak minority votes.
  const radius = 1 + 3 * Math.max(0, amount - 50) / 50
  const kernel: Array<{ dx: number; dy: number; weight: number }> = []
  const reach = Math.ceil(radius)
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const distance = (dx * dx + dy * dy) / ((radius + 0.5) ** 2)
    if (distance < 1) kernel.push({ dx, dy, weight: (1 - distance) ** 2 })
  }
  const working = new Map<number, number>()
  const readSource = (x: number, y: number): number => {
    const index = layerIndexAt(layer, x, y)
    if (index === null || index < 0 || x < 0 || y < 0 || x >= document.width || y >= document.height) return 0
    const value = (source === 'stroke-start' ? edit.before.get(index) : undefined) ?? readLayerPacked(document, layer, index)
    // Ignore invisible RGB without introducing new colors into indexed images.
    return layer.format === 'rgba' && (value >>> 24) === 0 ? 0 : value
  }
  const original = (x: number, y: number): number => {
    const index = layerIndexAt(layer, x, y)
    return index == null ? 0 : working.get(index) ?? readSource(x, y)
  }
  // Follow an endpoint back to a solid body. A short tail attached to a filled
  // 2x2 patch is a spur; an isolated/long thin line has no such nearby anchor.
  // Always inspect the source so repeated passes cannot peel a long line away.
  const spurPixels = new Set<number>()
  const maxSpurLength = 1 + Math.floor(amount / 50)
  const touchesBody = (x: number, y: number): boolean => {
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
      if (readSource(x + dx, y) !== 0 && readSource(x, y + dy) !== 0 && readSource(x + dx, y + dy) !== 0) return true
    }
    return false
  }
  for (const seed of stroke.visited) {
    const sx = seed % document.width, sy = Math.floor(seed / document.width)
    if (readSource(sx, sy) === 0) continue
    const adjacent = neighbors.filter(([dx, dy]) => readSource(sx + dx, sy + dy) !== 0)
    if (adjacent.length !== 1) continue
    const tail: number[] = []
    let x = sx, y = sy, previous = -1
    for (let step = 0; step <= maxSpurLength; step++) {
      const key = y * document.width + x
      if (step > 0 && touchesBody(x, y)) {
        for (const pixel of tail) spurPixels.add(pixel)
        break
      }
      if (step === maxSpurLength || !stroke.visited.has(key) || (selection && !selectionContains(selection, x, y))) break
      tail.push(key)
      const forward = neighbors.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter((point) => readSource(point.x, point.y) !== 0 && point.y * document.width + point.x !== previous)
      if (forward.length > 1 && forward.every((point) => touchesBody(point.x, point.y))) {
        for (const pixel of tail) spurPixels.add(pixel)
        break
      }
      if (forward.length !== 1) break
      previous = key
      x = forward[0].x; y = forward[0].y
    }
  }
  const contourCandidate = (x: number, y: number): { next: number; priority: number } | null => {
    const current = original(x, y)
    if (spurPixels.has(y * document.width + x)) return current === 0 ? null : { next: 0, priority: 8 }
    const ring = neighbors.map(([dx, dy]) => original(x + dx, y + dy))
    const own = ring.filter((value) => value === current).length
    if (own === 8 || own === 1) return null
    const ownCardinals = [0, 2, 4, 6].filter((i) => ring[i] === current).length
    const continuous = [0, 1, 2, 3].some((i) => ring[i] === current && ring[i + 4] === current)
    if (continuous && ownCardinals <= 2) return null
    const support = new Map<number, number>()
    for (const { dx, dy, weight } of kernel) {
      const color = original(x + dx, y + dy)
      support.set(color, (support.get(color) ?? 0) + weight)
    }
    let next = current
    let best = support.get(current) ?? 0
    // Only extend an adjacent color. Ties keep the existing pixel.
    for (const color of new Set(ring)) {
      const score = support.get(color) ?? 0
      if (score > best + 1e-6) { next = color; best = score }
    }
    return next === current ? null : { next, priority: best - (support.get(current) ?? 0) }
  }
  for (let pass = 0; pass < passes; pass++) {
    const pending: Array<{ index: number; x: number; y: number; next: number; priority: number }> = []
    for (const key of stroke.visited) {
        const x = key % document.width
        const y = Math.floor(key / document.width)
        if (selection && !selectionContains(selection, x, y)) continue
        const index = layerIndexAt(layer, x, y)
        if (index === null || index < 0) continue
        if (pass === 0 && spurPixels.has(key)) {
          pending.push({ index, x, y, next: 0, priority: 8 })
          continue
        }
        if (pass > 0) {
          const candidate = contourCandidate(x, y)
          if (candidate) pending.push({ index, x, y, ...candidate })
          continue
        }
        const current = original(x, y)
        const ring = neighbors.map(([dx, dy]) => original(x + dx, y + dy))
        const counts = new Map<number, number>()
        for (const color of ring) counts.set(color, (counts.get(color) ?? 0) + 1)
        let next = current
        const ownCardinals = [0, 2, 4, 6].filter((i) => ring[i] === current).length
        const continuous = [0, 1, 2, 3].some((i) => ring[i] === current && ring[i + 4] === current)
        for (const [color, count] of counts) {
          if (color === current) continue
          // Preserve thin lines, endpoints and ordinary corners; trim isolated specks/nubs.
          const isolated = !counts.has(current)
          const nub = ownCardinals <= 1 && (counts.get(current) ?? 0) >= 2 && !continuous
          if (count >= 5 && (isolated || nub)) { next = color; break }
          // Bridge only a one-pixel interruption with a two-pixel run on both sides.
          if (current === 0 && color !== 0 && [0, 1, 2, 3].some((i) => {
            const [dx, dy] = neighbors[i]
            return ring[i] === color && ring[i + 4] === color
              && original(x + dx * 2, y + dy * 2) === color
              && original(x - dx * 2, y - dy * 2) === color
          }) && count <= 3) { next = color; break }
        }
        if (next !== current) pending.push({ index, x, y, next, priority: (counts.get(next) ?? 0) - (counts.get(current) ?? 0) })
      }
    if (pending.length === 0) {
      // A clean base contour can still have corners eligible for a stronger pass.
      if (pass === 0 && passes > 1) continue
      break
    }
    if (pass > 0) {
      pending.sort((a, b) => b.priority - a.priority || a.index - b.index)
      let applied = 0
      for (const pixel of pending) {
        // Recheck after neighboring changes. Each accepted edit strictly lowers
        // weighted boundary disagreement, preventing simultaneous swaps/oscillation.
        const candidate = contourCandidate(pixel.x, pixel.y)
        if (candidate) { working.set(pixel.index, candidate.next); applied++ }
      }
      if (applied === 0) break
      continue
    }
    const fraction = Math.min(1, amount / 50)
    const count = Math.ceil(pending.length * fraction)
    if (count < pending.length) pending.sort((a, b) => b.priority - a.priority || a.index - b.index)
    for (let i = 0; i < count; i++) working.set(pending[i].index, pending[i].next)
  }
  // Inspect small connected regions as a whole: endpoint protection alone cannot
  // distinguish a two-pixel speck from an intentional long thin line.
  const maxArea = 1 + Math.floor(11 * (amount / 100) ** 2)
  const maxSpan = 1 + Math.floor(3 * amount / 100)
  const inspected = new Set<number>()
  const regions: Array<{ indices: number[]; next: number }> = []
  for (const seed of stroke.visited) {
    if (inspected.has(seed)) continue
    const sx = seed % document.width
    const sy = Math.floor(seed / document.width)
    // Classify the pre-smoothing shape so a rounded/shrunken main body is not
    // mistaken for newly isolated debris and deleted in the same stroke.
    const filled = readSource(sx, sy) !== 0
    const region = new Set<number>([seed])
    const queue = [seed]
    const boundary = new Map<number, number>()
    let valid = true
    let left = sx, right = sx, top = sy, bottom = sy
    while (queue.length && valid) {
      const key = queue.pop()!
      const x = key % document.width
      const y = Math.floor(key / document.width)
      const index = layerIndexAt(layer, x, y)
      if (!stroke.visited.has(key) || (selection && !selectionContains(selection, x, y)) || index == null) { valid = false; break }
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
      if (right - left + 1 > maxSpan || bottom - top + 1 > maxSpan) { valid = false; break }
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= document.width || ny >= document.height) { valid = false; break }
        const value = readSource(nx, ny)
        if ((value !== 0) !== filled) {
          boundary.set(value, (boundary.get(value) ?? 0) + 1)
          continue
        }
        const neighbor = ny * document.width + nx
        if (region.has(neighbor)) continue
        // A previously rejected component is not a new small region at its next seed.
        if (inspected.has(neighbor)) { valid = false; break }
        region.add(neighbor)
        if (region.size > maxArea) { valid = false; break }
        queue.push(neighbor)
      }
    }
    for (const key of region) inspected.add(key)
    if (!valid || boundary.size === 0) continue
    // The base pass already budgets single-pixel cleanup at low strength.
    if (region.size === 1 && amount < 50) continue
    let next = 0
    if (!filled) {
      const sorted = [...boundary].sort((a, b) => b[1] - a[1] || a[0] - b[0])
      const total = sorted.reduce((sum, entry) => sum + entry[1], 0)
      if (sorted[0][1] < total * 0.75) continue
      next = sorted[0][0]
    }
    regions.push({ indices: [...region].map((key) => layerIndexAt(layer, key % document.width, Math.floor(key / document.width))!), next })
  }
  for (const region of regions) for (const index of region.indices) working.set(index, region.next)
  let changed = false
  for (const [index, next] of working) {
    if (recordPixelKnownCurrent(document, layer, edit, index, readLayerPacked(document, layer, index), next)) changed = true
  }
  return changed
}

/** Post-process only actual push changes, preserving the original edit for one-step undo. */
export function smoothChangedLiquifyPixels(document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, selection: SelectionMask | null, strength = 50): boolean {
  const visited = new Set<number>()
  for (const [index, before] of edit.before) {
    if (readLayerPacked(document, layer, index) === before) continue
    const x = index % layer.width + layer.offsetX
    const y = Math.floor(index / layer.width) + layer.offsetY
    if (x >= 0 && y >= 0 && x < document.width && y < document.height) visited.add(y * document.width + x)
  }
  return applySmoothBrush(document, layer, edit, { visited }, selection, strength, 'current')
}

export function collectSmoothBrushArea(
  document: SpriteDocument, stroke: SmoothBrushStroke, from: Point, to: Point, size: number, selection: SelectionMask | null,
  shape: BrushShape = 'round', angle = 0, optimizedRotation = true, repeatMode: TileRepeatMode = 'off'
): void {
  const radius = Math.max(0.5, Math.min(64, size / 2))
  // A line stamp may only be one pixel wide. Its old radius-based sampling
  // skipped several pixels during a fast drag, leaving dashed gaps whenever
  // travel was perpendicular to the line. Keep that shape continuous.
  const maxStep = shape === 'line' ? 1 : Math.max(1, radius / 4)
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / maxStep))
  const stampSize = Math.max(1, Math.min(64, Math.round(size)))
  const anchor = brushStampAnchor(stampSize, null, angle, shape)
  const spans = solidBrushPreviewRowSpans(stampSize, shape, angle, optimizedRotation)
  const centers = shape === 'line' && stampSize > 1 && Math.abs(angle % 180) >= 0.0001
    ? continuousLinePointsWithFixForLineBrush({ x: Math.round(from.x), y: Math.round(from.y) }, { x: Math.round(to.x), y: Math.round(to.y) })
    : Array.from({ length: steps + 1 }, (_, step) => ({
        x: Math.round(from.x + (to.x - from.x) * step / steps),
        y: Math.round(from.y + (to.y - from.y) * step / steps)
      }))
  for (const { x: cx, y: cy } of centers) {
    for (const span of spans) {
      const sourceY = cy - anchor.y + span.y
        const unboundedPreview = repeatMode === 'off' && stroke.outsidePreview !== undefined
        if (!unboundedPreview && !tileRepeatIncludesY(repeatMode) && (sourceY < 0 || sourceY >= document.height)) continue
      const left = cx - anchor.x + span.left
      const right = cx - anchor.x + span.right
        for (let sourceX = unboundedPreview || tileRepeatIncludesX(repeatMode) ? left : Math.max(0, left); sourceX <= (unboundedPreview || tileRepeatIncludesX(repeatMode) ? right : Math.min(document.width - 1, right)); sourceX++) {
          if (unboundedPreview && (sourceX < 0 || sourceY < 0 || sourceX >= document.width || sourceY >= document.height)) {
            stroke.outsidePreview!.set(`${sourceX}:${sourceY}`, { x: sourceX, y: sourceY })
            continue
          }
        const { x, y } = wrapDocumentPointForTileRepeat({ x: sourceX, y: sourceY }, document.width, document.height, repeatMode)
        const key = y * document.width + x
        if (stroke.visited.has(key) || (selection && !selectionContains(selection, x, y))) continue
        stroke.visited.add(key)
      }
    }
  }
}
