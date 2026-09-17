import type { GridSettings } from '@shared/types-view'
import type { SelectionRect } from '@shared/types-selection'

export type AlignmentAxis = 'x' | 'y'
export type AlignmentGuideSource = 'grid' | 'smart'

export interface AlignmentGuide {
  axis: AlignmentAxis
  position: number
  source: AlignmentGuideSource
}

export interface AlignmentOffset {
  x: number
  y: number
}

export interface ResolveAlignmentOptions {
  movingBounds: readonly SelectionRect[]
  targetBounds?: readonly SelectionRect[]
  delta: AlignmentOffset
  canvasWidth: number
  canvasHeight: number
  grid?: GridSettings | null
  gridEnabled: boolean
  smartEnabled: boolean
  threshold: number
  /** The axis that remains movable after Shift constrains the drag. */
  lockedAxis?: AlignmentAxis
}

export interface AlignmentResult {
  offset: AlignmentOffset
  guides: AlignmentGuide[]
}

interface AlignmentCandidate extends AlignmentGuide {
  correction: number
}

const EPSILON = 1e-6

const validBounds = (bounds: SelectionRect): boolean => [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  && bounds.width > 0
  && bounds.height > 0

export const unionAlignmentBounds = (bounds: readonly SelectionRect[]): SelectionRect | null => {
  const valid = bounds.filter(validBounds)
  if (valid.length === 0) return null
  const left = Math.min(...valid.map((candidate) => candidate.x))
  const top = Math.min(...valid.map((candidate) => candidate.y))
  const right = Math.max(...valid.map((candidate) => candidate.x + candidate.width))
  const bottom = Math.max(...valid.map((candidate) => candidate.y + candidate.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export const alignmentThresholdForZoom = (screenPixels: number, zoom: number): number => {
  if (!Number.isFinite(screenPixels) || screenPixels <= 0 || !Number.isFinite(zoom) || zoom === 0) return 0
  // Canvas move deltas are integer document pixels. Keep one document pixel
  // reachable when the configured screen-space threshold is smaller than the
  // current zoom, otherwise snapping can never engage at the default 16x view.
  return Math.max(1, screenPixels / Math.abs(zoom))
}

const axisEdges = (bounds: SelectionRect, axis: AlignmentAxis): [number, number] => axis === 'x'
  ? [bounds.x, bounds.x + bounds.width]
  : [bounds.y, bounds.y + bounds.height]

const axisCenter = (bounds: SelectionRect, axis: AlignmentAxis): number => {
  const [start, end] = axisEdges(bounds, axis)
  return (start + end) / 2
}

const integerCorrection = (value: number): number | null => {
  const rounded = Math.round(value)
  return Math.abs(value - rounded) <= EPSILON ? rounded : null
}

const smartCandidates = (
  moving: SelectionRect,
  targets: readonly SelectionRect[],
  axis: AlignmentAxis,
  threshold: number
): AlignmentCandidate[] => {
  const candidates: AlignmentCandidate[] = []
  const movingEdges = axisEdges(moving, axis)
  const movingCenter = axisCenter(moving, axis)
  for (const target of targets) {
    if (!validBounds(target)) continue
    const targetEdges = axisEdges(target, axis)
    for (const sourcePosition of movingEdges) for (const targetPosition of targetEdges) {
      const correction = integerCorrection(targetPosition - sourcePosition)
      if (correction !== null && Math.abs(correction) <= threshold) candidates.push({ axis, position: targetPosition, source: 'smart', correction })
    }
    const targetCenter = axisCenter(target, axis)
    const centerCorrection = integerCorrection(targetCenter - movingCenter)
    if (centerCorrection !== null && Math.abs(centerCorrection) <= threshold) candidates.push({ axis, position: targetCenter, source: 'smart', correction: centerCorrection })
  }
  return candidates
}

const nearestGridLine = (position: number, origin: number, size: number): number => origin + Math.round((position - origin) / size) * size

const gridCandidates = (
  moving: SelectionRect,
  grid: GridSettings | null | undefined,
  axis: AlignmentAxis,
  threshold: number
): AlignmentCandidate[] => {
  if (!grid) return []
  const origin = axis === 'x' ? grid.x : grid.y
  const size = axis === 'x' ? grid.width : grid.height
  if (!Number.isFinite(origin) || !Number.isFinite(size) || size <= 0) return []
  const candidates: AlignmentCandidate[] = []
  for (const sourcePosition of axisEdges(moving, axis)) {
    const position = nearestGridLine(sourcePosition, origin, size)
    const correction = integerCorrection(position - sourcePosition)
    if (correction !== null && Math.abs(correction) <= threshold) candidates.push({ axis, position, source: 'grid', correction })
  }
  return candidates
}

const bestAxisAlignment = (candidates: readonly AlignmentCandidate[]): { correction: number; guides: AlignmentGuide[] } | null => {
  if (candidates.length === 0) return null
  const ordered = [...candidates].sort((left, right) => Math.abs(left.correction) - Math.abs(right.correction)
    || Number(left.source === 'grid') - Number(right.source === 'grid')
    || left.position - right.position)
  const correction = ordered[0].correction
  const guides: AlignmentGuide[] = []
  for (const candidate of ordered) {
    if (candidate.correction !== correction) continue
    const existing = guides.find((guide) => Math.abs(guide.position - candidate.position) <= EPSILON)
    if (!existing) guides.push({ axis: candidate.axis, position: candidate.position, source: candidate.source })
    else if (existing.source === 'grid' && candidate.source === 'smart') existing.source = 'smart'
  }
  return { correction, guides }
}

export const resolveAlignment = (options: ResolveAlignmentOptions): AlignmentResult => {
  const movingBounds = unionAlignmentBounds(options.movingBounds)
  const threshold = Number.isFinite(options.threshold) ? Math.max(0, options.threshold) : 0
  if (!movingBounds || (!options.gridEnabled && !options.smartEnabled)) return { offset: { ...options.delta }, guides: [] }

  const sourceBounds = [movingBounds, ...options.movingBounds.filter(validBounds)]
    .filter((bounds, index, all) => all.findIndex((candidate) => candidate.x === bounds.x
      && candidate.y === bounds.y
      && candidate.width === bounds.width
      && candidate.height === bounds.height) === index)
  const translated = sourceBounds.map((bounds) => ({ ...bounds, x: bounds.x + options.delta.x, y: bounds.y + options.delta.y }))
  const canvasBounds = options.canvasWidth > 0 && options.canvasHeight > 0
    ? [{ x: 0, y: 0, width: options.canvasWidth, height: options.canvasHeight }]
    : []
  const smartTargets = [...canvasBounds, ...(options.targetBounds ?? [])]
  const offset = { ...options.delta }
  const guides: AlignmentGuide[] = []

  for (const axis of ['x', 'y'] as const) {
    if (options.lockedAxis && options.lockedAxis !== axis) continue
    const candidates = [
      ...(options.smartEnabled ? translated.flatMap((bounds) => smartCandidates(bounds, smartTargets, axis, threshold)) : []),
      ...(options.gridEnabled ? translated.flatMap((bounds) => gridCandidates(bounds, options.grid, axis, threshold)) : [])
    ]
    const alignment = bestAxisAlignment(candidates)
    if (!alignment) continue
    offset[axis] += alignment.correction
    guides.push(...alignment.guides)
  }
  return { offset, guides }
}
