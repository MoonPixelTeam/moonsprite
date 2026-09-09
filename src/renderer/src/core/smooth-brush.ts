import type { BrushShape, RasterLayer, SelectionMask, SpriteDocument } from '@shared/types'
import { layerIndexAt, readLayerPacked } from './document'
import { recordPixelKnownCurrent, type PixelEdit } from './history'
import { selectionContains } from './selection'
import { brushStampAnchor, solidBrushPreviewRowSpans } from './tools'

export const SMOOTH_BRUSH_OVERLAY = 'rgba(230, 0, 255, 0.35)'
export interface SmoothBrushStroke { visited: Set<number> }
type Point = { x: number; y: number }
const neighbors = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const

/** Synchronous, palette-preserving contour cleanup. Only commit after all passes. */
export function applySmoothBrush(
  document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, stroke: SmoothBrushStroke,
  selection: SelectionMask | null, strength = 50
): boolean {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) : 50
  if (amount === 0) return false
  // Low strengths must still remove ordinary nubs, not require 7–8 matching neighbors.
  // Above the original 50% pass, smooth corners and propagate the cleaned contour.
  const passes = 1 + Math.ceil(Math.max(0, amount - 50) / 25)
  const working = new Map<number, number>()
  const original = (x: number, y: number): number => {
    const index = layerIndexAt(layer, x, y)
    if (index === null || index < 0 || x < 0 || y < 0 || x >= document.width || y >= document.height) return 0
    const value = working.get(index) ?? edit.before.get(index) ?? readLayerPacked(document, layer, index)
    // Ignore invisible RGB without introducing new colors into indexed images.
    return layer.format === 'rgba' && (value >>> 24) === 0 ? 0 : value
  }
  for (let pass = 0; pass < passes; pass++) {
    const minimumSupport = pass > 0 && amount >= 75 ? 4 : 5
    const pending: Array<{ index: number; next: number; priority: number }> = []
    for (const key of stroke.visited) {
        const x = key % document.width
        const y = Math.floor(key / document.width)
        if (selection && !selectionContains(selection, x, y)) continue
        const index = layerIndexAt(layer, x, y)
        if (index === null || index < 0) continue
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
          const corner = pass > 0 && ownCardinals === 2 && counts.get(current) === 3 && !continuous
          if (count >= minimumSupport && (isolated || nub || corner)) { next = color; break }
          // Bridge only a one-pixel interruption with a two-pixel run on both sides.
          if (current === 0 && color !== 0 && [0, 1, 2, 3].some((i) => {
            const [dx, dy] = neighbors[i]
            return ring[i] === color && ring[i + 4] === color
              && original(x + dx * 2, y + dy * 2) === color
              && original(x - dx * 2, y - dy * 2) === color
          }) && count <= 3) { next = color; break }
        }
        if (next !== current) pending.push({ index, next, priority: (counts.get(next) ?? 0) - (counts.get(current) ?? 0) })
      }
    if (pending.length === 0) {
      // A clean base contour can still have corners eligible for a stronger pass.
      if (pass === 0 && passes > 1) continue
      break
    }
    // All decisions in a pass see the same contour, independent of stroke traversal order.
    // Spend strength on the strongest corrections first, not random dithering or alpha blending.
    // Each completed 25% above 50 adds a full contour pass; the last pass is proportional.
    const fraction = pass === 0 ? Math.min(1, amount / 50) : Math.min(1, (amount - 50 - (pass - 1) * 25) / 25)
    const count = Math.ceil(pending.length * fraction)
    if (count < pending.length) pending.sort((a, b) => b.priority - a.priority || a.index - b.index)
    for (let i = 0; i < count; i++) working.set(pending[i].index, pending[i].next)
  }
  let changed = false
  for (const [index, next] of working) {
    if (recordPixelKnownCurrent(document, layer, edit, index, readLayerPacked(document, layer, index), next)) changed = true
  }
  return changed
}

export function collectSmoothBrushArea(
  document: SpriteDocument, stroke: SmoothBrushStroke, from: Point, to: Point, size: number, selection: SelectionMask | null,
  shape: BrushShape = 'round', angle = 0, optimizedRotation = true
): void {
  const radius = Math.max(0.5, Math.min(64, size / 2))
  // A line stamp may only be one pixel wide. Its old radius-based sampling
  // skipped several pixels during a fast drag, leaving dashed gaps whenever
  // travel was perpendicular to the line. Keep that shape continuous.
  const maxStep = shape === 'line' ? 1 : Math.max(1, radius / 4)
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / maxStep))
  const stampSize = Math.max(1, Math.min(128, Math.round(size)))
  const anchor = brushStampAnchor(stampSize, null, angle, shape)
  const spans = solidBrushPreviewRowSpans(stampSize, shape, angle, optimizedRotation)
  for (let step = 0; step <= steps; step++) {
    const cx = Math.round(from.x + (to.x - from.x) * step / steps)
    const cy = Math.round(from.y + (to.y - from.y) * step / steps)
    for (const span of spans) {
      const y = cy - anchor.y + span.y
      if (y < 0 || y >= document.height) continue
      for (let x = Math.max(0, cx - anchor.x + span.left); x <= Math.min(document.width - 1, cx - anchor.x + span.right); x++) {
        const key = y * document.width + x
        if (stroke.visited.has(key) || (selection && !selectionContains(selection, x, y))) continue
        stroke.visited.add(key)
      }
    }
  }
}
