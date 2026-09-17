import type { PixelLinePoint } from './pixel-line'

export const ISO_LINE_STAIR_STEP = 2
export const ISO_GUIDE_BASE_SPACING = 16

export interface IsoGuideBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface IsoGuideSegment {
  start: PixelLinePoint
  end: PixelLinePoint
}

export interface IsoGuideOptions {
  spacing?: number
  stairStep?: number
  origin?: PixelLinePoint
}

export interface IsoGuidePixelPattern {
  width: number
  height: number
  pixels: PixelLinePoint[]
}

export type IsoLineDirection = 'right' | 'down' | 'left' | 'up' | 'down-right' | 'down-left' | 'up-left' | 'up-right'

export interface IsoAlignedStrokeSegmentState {
  anchor: PixelLinePoint
  endpoint: PixelLinePoint
  rawAnchor?: PixelLinePoint
  rawEndpoint?: PixelLinePoint
  gridVertex?: PixelLinePoint
  direction: IsoLineDirection | null
  directionSamples?: number
}

export interface IsoAlignedStrokeSegmentAdvance extends IsoAlignedStrokeSegmentState {
  initialAnchor?: PixelLinePoint
  lockedEndpoint?: PixelLinePoint
  lockedEndpoints?: PixelLinePoint[]
}

export interface IsoGridSnapOptions {
  spacing: number
  origin?: PixelLinePoint
}

export interface IsoGridStrokeEdge {
  key: string
  from: PixelLinePoint
  to: PixelLinePoint
  startVertex: PixelLinePoint
  endVertex: PixelLinePoint
}

export interface IsoGridPointerTraceOptions extends IsoGridSnapOptions {
  stairStep?: number
  hitRadius?: number
  sampleStep?: number
  hoveredEdgeKey?: string | null
}

export interface IsoGridPointerTraceResult {
  edges: IsoGridStrokeEdge[]
  hoveredEdgeKey: string | null
}

export interface IsoAlignedStrokeOptions {
  diagonalOnly?: boolean
  grid?: IsoGridSnapOptions
}

const pointWithCoordinates = <T extends PixelLinePoint>(sample: T, point: PixelLinePoint): T => ({
  ...sample,
  ...point
})

const normalizeStairStep = (value: number): number => Number.isFinite(value)
  ? Math.max(1, Math.min(16, Math.round(value)))
  : ISO_LINE_STAIR_STEP

const normalizeGridSpacing = (value: number): number => Number.isFinite(value) ? Math.max(1, Math.round(value)) : ISO_GUIDE_BASE_SPACING

const isoLineDirections = (stairStep: number): ReadonlyArray<{ direction: IsoLineDirection; vector: PixelLinePoint }> => [
  { direction: 'right', vector: { x: 1, y: 0 } },
  { direction: 'down', vector: { x: 0, y: 1 } },
  { direction: 'left', vector: { x: -1, y: 0 } },
  { direction: 'up', vector: { x: 0, y: -1 } },
  { direction: 'down-right', vector: { x: stairStep, y: 1 } },
  { direction: 'down-left', vector: { x: -stairStep, y: 1 } },
  { direction: 'up-left', vector: { x: -stairStep, y: -1 } },
  { direction: 'up-right', vector: { x: stairStep, y: -1 } }
]

const isoLineDirectionVector = (direction: IsoLineDirection, stairStep: number): PixelLinePoint => {
  switch (direction) {
    case 'right': return { x: 1, y: 0 }
    case 'down': return { x: 0, y: 1 }
    case 'left': return { x: -1, y: 0 }
    case 'up': return { x: 0, y: -1 }
    case 'down-right': return { x: stairStep, y: 1 }
    case 'down-left': return { x: -stairStep, y: 1 }
    case 'up-left': return { x: -stairStep, y: -1 }
    case 'up-right': return { x: stairStep, y: -1 }
  }
}

const samePoint = (left: PixelLinePoint, right: PixelLinePoint): boolean => left.x === right.x && left.y === right.y

export function updateIsoAlignedStrokePath<T extends PixelLinePoint>(
  path: T[],
  advanced: IsoAlignedStrokeSegmentAdvance,
  targetSample: T
): void {
  const startSample = path[0]
  const endpointSample = path.at(-1)
  if (!startSample || !endpointSample) return
  const anchorSample = path.length > 1 ? path[path.length - 2]! : startSample
  const lockedPoints = advanced.lockedEndpoints ?? (advanced.lockedEndpoint ? [advanced.lockedEndpoint] : [])
  const lockedSamples = lockedPoints.map((point) => pointWithCoordinates(endpointSample, point))
  const anchorChanged = !samePoint(advanced.anchor, anchorSample)

  if (lockedSamples.length > 0) {
    const [firstLockedSample, ...remainingLockedSamples] = lockedSamples
    if (path.length === 1) {
      path[0] = pointWithCoordinates(startSample, advanced.initialAnchor ?? startSample)
      path.push(firstLockedSample!)
    } else path[path.length - 1] = firstLockedSample!
    path.push(...remainingLockedSamples)
    path.push(targetSample)
    return
  }

  if (path.length === 1) {
    path[0] = pointWithCoordinates(startSample, advanced.anchor)
    path.push(targetSample)
    return
  }

  if (anchorChanged && path.length > 2 && samePoint(anchorSample, endpointSample)) {
    path[path.length - 1] = pointWithCoordinates(endpointSample, advanced.anchor)
    path.push(targetSample)
    return
  }

  if (anchorChanged) path[path.length - 2] = pointWithCoordinates(anchorSample, advanced.anchor)
  path[path.length - 1] = targetSample
}

const resolveIsoLineDirection = (from: PixelLinePoint, to: PixelLinePoint, stairStep: number, diagonalOnly = false): IsoLineDirection | null => {
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  if (deltaX === 0 && deltaY === 0) return null
  const length = Math.hypot(deltaX, deltaY)
  const directions = isoLineDirections(stairStep)
  const candidates = diagonalOnly ? directions.slice(4) : directions
  return candidates.reduce((best, candidate) => {
    const score = (deltaX * candidate.vector.x + deltaY * candidate.vector.y) / (length * Math.hypot(candidate.vector.x, candidate.vector.y))
    return score > best.score ? { direction: candidate.direction, score } : best
  }, { direction: candidates[0]!.direction, score: Number.NEGATIVE_INFINITY }).direction
}

const isoLineEndpointForDirection = (
  from: PixelLinePoint,
  to: PixelLinePoint,
  direction: IsoLineDirection,
  stairStep: number
): PixelLinePoint => {
  const vector = isoLineDirectionVector(direction, stairStep)
  if (vector.y === 0) return { x: to.x, y: from.y }
  if (vector.x === 0) return { x: from.x, y: to.y }
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const majorDelta = Math.abs(deltaX)
  const minorDelta = Math.abs(deltaY)
  const stairCount = Math.max(1, Math.round((stairStep * (majorDelta + 1) + minorDelta + 1) / (stairStep ** 2 + 1)))
  return {
    x: from.x + Math.sign(vector.x) * (stairCount * stairStep - 1),
    y: from.y + Math.sign(vector.y) * (stairCount - 1)
  }
}

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(Math.round(left))
  let b = Math.abs(Math.round(right))
  while (b !== 0) [a, b] = [b, a % b]
  return Math.max(1, a)
}

const isoGridSlopeSign = (direction: IsoLineDirection): -1 | 1 | null => {
  if (direction === 'down-right' || direction === 'up-left') return 1
  if (direction === 'up-right' || direction === 'down-left') return -1
  return null
}

const normalizedGridOrigin = (origin?: PixelLinePoint): PixelLinePoint => ({
  x: Number.isFinite(origin?.x) ? Math.round(origin!.x) : 0,
  y: Number.isFinite(origin?.y) ? Math.round(origin!.y) : 0
})

export function snapIsoPointToGridVertex(
  point: PixelLinePoint,
  stairStep = ISO_LINE_STAIR_STEP,
  spacing = ISO_GUIDE_BASE_SPACING,
  origin?: PixelLinePoint
): PixelLinePoint {
  const step = normalizeStairStep(stairStep)
  const unit = normalizeGridSpacing(spacing)
  const gridOrigin = normalizedGridOrigin(origin)
  const stairPeriod = unit / greatestCommonDivisor(unit, 2)
  const vertexWidth = step * stairPeriod
  const localX = point.x - gridOrigin.x
  const localY = point.y - gridOrigin.y
  const center = Math.round(localX / vertexWidth)
  let nearest: PixelLinePoint | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let horizontalIndex = center - 2; horizontalIndex <= center + 2; horizontalIndex += 1) {
    const stair = horizontalIndex * stairPeriod
    const x = gridOrigin.x + stair * step
    const verticalCenter = Math.round((localY - stair) / unit)
    for (let offset = -1; offset <= 1; offset += 1) {
      const y = gridOrigin.y + stair + (verticalCenter + offset) * unit
      const distance = (point.x - x) ** 2 + (point.y - y) ** 2
      if (distance >= nearestDistance) continue
      nearest = { x, y }
      nearestDistance = distance
    }
  }
  return nearest ?? { x: Math.round(point.x), y: Math.round(point.y) }
}

interface IsoGridEdgeGeometry {
  start: PixelLinePoint
  pixelEnd: PixelLinePoint
  vertex: PixelLinePoint
  vector: PixelLinePoint
}

const isoGridEdgeGeometry = (
  anchor: PixelLinePoint,
  direction: IsoLineDirection,
  stairStep: number,
  spacing: number
): IsoGridEdgeGeometry | null => {
  if (!isoGridSlopeSign(direction)) return null
  const step = normalizeStairStep(stairStep)
  const unit = normalizeGridSpacing(spacing)
  const stairPeriod = unit / greatestCommonDivisor(unit, 2)
  const directionVector = isoLineDirectionVector(direction, step)
  const signX = Math.sign(directionVector.x)
  const signY = Math.sign(directionVector.y)
  const horizontalDistance = step * stairPeriod
  const verticalDistance = stairPeriod
  const vector = {
    x: signX * horizontalDistance,
    y: signY * verticalDistance
  }
  const vertex = {
    x: anchor.x + vector.x,
    y: anchor.y + vector.y
  }
  return {
    start: {
      x: anchor.x + (signX < 0 ? -1 : 0),
      y: anchor.y + (signX < 0 ? signY : 0)
    },
    pixelEnd: {
      x: vertex.x + (signX > 0 ? -1 : 0),
      y: vertex.y + (signX > 0 ? -signY : 0)
    },
    vertex,
    vector
  }
}

const pointToSegmentDistanceSquared = (
  point: PixelLinePoint,
  start: PixelLinePoint,
  end: PixelLinePoint
): number => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX ** 2 + deltaY ** 2
  if (lengthSquared <= 0) return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
  const progress = Math.max(0, Math.min(1, (
    (point.x - start.x) * deltaX + (point.y - start.y) * deltaY
  ) / lengthSquared))
  const nearestX = start.x + deltaX * progress
  const nearestY = start.y + deltaY * progress
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2
}

const isoGridStrokeEdge = (
  anchor: PixelLinePoint,
  slopeSign: -1 | 1,
  stairStep: number,
  spacing: number
): IsoGridStrokeEdge | null => {
  const geometry = isoGridEdgeGeometry(anchor, slopeSign > 0 ? 'down-right' : 'up-right', stairStep, spacing)
  if (!geometry) return null
  return {
    key: `${anchor.x}:${anchor.y}:${slopeSign}`,
    from: { ...geometry.start },
    to: { ...geometry.pixelEnd },
    startVertex: { ...anchor },
    endVertex: { ...geometry.vertex }
  }
}

const isoGridEdgeAtPoint = (
  point: PixelLinePoint,
  stairStep: number,
  grid: IsoGridSnapOptions,
  hitRadius: number,
  preferredKey: string | null
): IsoGridStrokeEdge | null => {
  const step = normalizeStairStep(stairStep)
  const unit = normalizeGridSpacing(grid.spacing)
  const origin = normalizedGridOrigin(grid.origin)
  const stairPeriod = unit / greatestCommonDivisor(unit, 2)
  const vertexWidth = step * stairPeriod
  const horizontalCenter = Math.floor((point.x - origin.x) / vertexWidth)
  const maximumDistanceSquared = hitRadius ** 2
  let nearest: IsoGridStrokeEdge | null = null
  let nearestDistanceSquared = Number.POSITIVE_INFINITY

  for (let horizontalIndex = horizontalCenter - 1; horizontalIndex <= horizontalCenter + 1; horizontalIndex += 1) {
    const anchorX = origin.x + horizontalIndex * vertexWidth
    const anchorBaseY = origin.y + horizontalIndex * stairPeriod
    const verticalCenter = Math.round((point.y - anchorBaseY) / unit)
    for (let verticalIndex = verticalCenter - 2; verticalIndex <= verticalCenter + 2; verticalIndex += 1) {
      const anchor = { x: anchorX, y: anchorBaseY + verticalIndex * unit }
      for (const slopeSign of [-1, 1] as const) {
        const edge = isoGridStrokeEdge(anchor, slopeSign, step, unit)
        if (!edge) continue
        const distanceSquared = pointToSegmentDistanceSquared(point, edge.startVertex, edge.endVertex)
        if (distanceSquared > maximumDistanceSquared) continue
        const equallyNear = Math.abs(distanceSquared - nearestDistanceSquared) < 1e-9
        const preferred = edge.key === preferredKey && nearest?.key !== preferredKey
        if (distanceSquared > nearestDistanceSquared && !equallyNear) continue
        if (equallyNear && !preferred && nearest && edge.key >= nearest.key) continue
        nearest = edge
        nearestDistanceSquared = distanceSquared
      }
    }
  }
  return nearest
}

export function traceIsoGridPointerEdges(
  from: PixelLinePoint,
  to: PixelLinePoint,
  options: IsoGridPointerTraceOptions
): IsoGridPointerTraceResult {
  const stairStep = normalizeStairStep(options.stairStep ?? ISO_LINE_STAIR_STEP)
  const hitRadius = Number.isFinite(options.hitRadius) ? Math.max(0.05, options.hitRadius!) : 0.55
  const sampleStep = Number.isFinite(options.sampleStep) ? Math.max(0.05, options.sampleStep!) : 0.25
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  const sampleCount = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaY) / sampleStep))
  const edges: IsoGridStrokeEdge[] = []
  let hoveredEdgeKey = options.hoveredEdgeKey ?? null

  for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
    const progress = sampleIndex / sampleCount
    const point = {
      x: from.x + deltaX * progress,
      y: from.y + deltaY * progress
    }
    const edge = isoGridEdgeAtPoint(point, stairStep, options, hitRadius, hoveredEdgeKey)
    const nextHoveredEdgeKey = edge?.key ?? null
    if (edge && nextHoveredEdgeKey !== hoveredEdgeKey) edges.push(edge)
    hoveredEdgeKey = nextHoveredEdgeKey
  }

  return { edges, hoveredEdgeKey }
}

const advanceIsoGridAlignedStrokeSegment = (
  state: IsoAlignedStrokeSegmentState,
  rawTarget: PixelLinePoint,
  stairStep: number,
  grid: IsoGridSnapOptions
): IsoAlignedStrokeSegmentAdvance => {
  const step = normalizeStairStep(stairStep)
  let gridVertex = { ...(state.gridVertex ?? state.anchor) }
  let anchor = { ...state.anchor }
  let rawAnchor = { ...gridVertex }
  const candidateDirection = resolveIsoLineDirection(gridVertex, rawTarget, step, true)
  const activeExtent = Math.max(
    Math.abs(state.endpoint.x - state.anchor.x),
    Math.abs(state.endpoint.y - state.anchor.y)
  )
  const previousDirectionSamples = state.directionSamples ?? 0
  const directionEstablished = Boolean(state.direction && activeExtent > 0)
  const activeGeometry = state.direction && directionEstablished
    ? isoGridEdgeGeometry(gridVertex, state.direction, step, grid.spacing)
    : null
  const activeProgress = activeGeometry
    ? ((rawTarget.x - gridVertex.x) * activeGeometry.vector.x + (rawTarget.y - gridVertex.y) * activeGeometry.vector.y)
      / (activeGeometry.vector.x ** 2 + activeGeometry.vector.y ** 2)
    : Number.NEGATIVE_INFINITY
  let direction = state.direction && directionEstablished && activeProgress >= 1
    ? state.direction
    : candidateDirection ?? (activeExtent > 0 ? state.direction : null)
  let directionSamples = direction
    ? direction === state.direction
      ? candidateDirection === state.direction ? Math.max(1, previousDirectionSamples) + 1 : Math.max(1, previousDirectionSamples)
      : 1
    : 0
  const lockedEndpoints: PixelLinePoint[] = []
  let initialAnchor: PixelLinePoint | undefined
  const finish = (endpoint: PixelLinePoint): IsoAlignedStrokeSegmentAdvance => {
    const result: IsoAlignedStrokeSegmentAdvance = {
      anchor: { ...anchor },
      endpoint: { ...endpoint },
      rawAnchor: { ...rawAnchor },
      rawEndpoint: { ...rawTarget },
      gridVertex: { ...gridVertex },
      direction,
      directionSamples
    }
    if (initialAnchor) result.initialAnchor = { ...initialAnchor }
    if (lockedEndpoints.length === 0) return result
    return {
      ...result,
      lockedEndpoint: { ...lockedEndpoints[lockedEndpoints.length - 1]! },
      lockedEndpoints: lockedEndpoints.map((point) => ({ ...point }))
    }
  }
  if (!direction) return finish(anchor)

  for (let edgeIndex = 0; edgeIndex < 16384; edgeIndex += 1) {
    const geometry = isoGridEdgeGeometry(gridVertex, direction, step, grid.spacing)
    if (!geometry) return finish(anchor)
    initialAnchor ??= { ...geometry.start }
    anchor = { ...geometry.start }
    const rawDelta = {
      x: rawTarget.x - gridVertex.x,
      y: rawTarget.y - gridVertex.y
    }
    const vectorLengthSquared = geometry.vector.x ** 2 + geometry.vector.y ** 2
    const progress = vectorLengthSquared > 0
      ? (rawDelta.x * geometry.vector.x + rawDelta.y * geometry.vector.y) / vectorLengthSquared
      : 0
    if (!Number.isFinite(progress) || progress < 1) return finish(geometry.pixelEnd)

    if (!samePoint(anchor, geometry.pixelEnd)) lockedEndpoints.push({ ...geometry.pixelEnd })
    const nextVertex = { ...geometry.vertex }
    const nextDirection = resolveIsoLineDirection(nextVertex, rawTarget, step, true)
    if (!nextDirection) {
      gridVertex = nextVertex
      rawAnchor = { ...gridVertex }
      anchor = { ...geometry.pixelEnd }
      direction = null
      directionSamples = 0
      return finish(geometry.pixelEnd)
    }
    gridVertex = nextVertex
    rawAnchor = { ...gridVertex }
    direction = nextDirection
    directionSamples = 1
    const nextGeometry = isoGridEdgeGeometry(gridVertex, direction, step, grid.spacing)
    if (!nextGeometry) return finish(geometry.pixelEnd)
    if (!samePoint(geometry.pixelEnd, nextGeometry.start)) lockedEndpoints.push({ ...nextGeometry.start })
    anchor = { ...nextGeometry.start }
  }

  return finish(anchor)
}

const validBounds = (bounds: IsoGuideBounds): boolean =>
  Number.isFinite(bounds.left)
  && Number.isFinite(bounds.top)
  && Number.isFinite(bounds.right)
  && Number.isFinite(bounds.bottom)
  && bounds.right > bounds.left
  && bounds.bottom > bounds.top

const clampVisibleBounds = (width: number, height: number, visible: IsoGuideBounds): IsoGuideBounds => ({
  left: Math.max(0, Math.min(width, visible.left)),
  top: Math.max(0, Math.min(height, visible.top)),
  right: Math.max(0, Math.min(width, visible.right)),
  bottom: Math.max(0, Math.min(height, visible.bottom))
})

const uniquePoint = (points: PixelLinePoint[], candidate: PixelLinePoint): void => {
  if (points.some((point) => Math.abs(point.x - candidate.x) < 1e-9 && Math.abs(point.y - candidate.y) < 1e-9)) return
  points.push(candidate)
}

const clippedGuideSegment = (slope: number, intercept: number, bounds: IsoGuideBounds): IsoGuideSegment | null => {
  const points: PixelLinePoint[] = []
  const include = (x: number, y: number): void => {
    if (x < bounds.left - 1e-9 || x > bounds.right + 1e-9 || y < bounds.top - 1e-9 || y > bounds.bottom + 1e-9) return
    uniquePoint(points, { x, y })
  }
  include(bounds.left, slope * bounds.left + intercept)
  include(bounds.right, slope * bounds.right + intercept)
  include((bounds.top - intercept) / slope, bounds.top)
  include((bounds.bottom - intercept) / slope, bounds.bottom)
  if (points.length < 2) return null
  let start = points[0]
  let end = points[1]
  let farthest = -1
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const distance = (points[second].x - points[first].x) ** 2 + (points[second].y - points[first].y) ** 2
      if (distance <= farthest) continue
      farthest = distance
      start = points[first]
      end = points[second]
    }
  }
  return { start, end }
}

export function isoGuideSpacingForZoom(zoom: number, unitSize = ISO_GUIDE_BASE_SPACING): number {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  let spacing = Number.isFinite(unitSize) ? Math.max(1, Math.round(unitSize)) : ISO_GUIDE_BASE_SPACING
  while (spacing * safeZoom < 8 && spacing < 8192) spacing *= 2
  return spacing
}

export function isoGuidePixelPattern(stairStep = ISO_LINE_STAIR_STEP, spacing = ISO_GUIDE_BASE_SPACING): IsoGuidePixelPattern {
  const step = normalizeStairStep(stairStep)
  const safeSpacing = Number.isFinite(spacing) ? Math.max(1, Math.round(spacing)) : ISO_GUIDE_BASE_SPACING
  const width = step * safeSpacing
  const pixels: PixelLinePoint[] = []
  for (let x = 0; x < width; x += 1) {
    const stair = Math.floor(x / step)
    const ascendingY = positiveModulo(stair, safeSpacing)
    const descendingY = positiveModulo(-stair, safeSpacing)
    pixels.push({ x, y: ascendingY })
    if (descendingY !== ascendingY) pixels.push({ x, y: descendingY })
  }
  return { width, height: safeSpacing, pixels }
}

export function isoGuideSegments(
  width: number,
  height: number,
  visible: IsoGuideBounds,
  options: IsoGuideOptions | number = {}
): IsoGuideSegment[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !validBounds(visible)) return []
  const bounds = clampVisibleBounds(width, height, visible)
  if (!validBounds(bounds)) return []
  const resolvedOptions = typeof options === 'number' ? { spacing: options } : options
  const requestedSpacing = resolvedOptions.spacing
  const safeSpacing = typeof requestedSpacing === 'number' && Number.isFinite(requestedSpacing) ? Math.max(1, Math.round(requestedSpacing)) : ISO_GUIDE_BASE_SPACING
  const stairStep = normalizeStairStep(resolvedOptions.stairStep ?? ISO_LINE_STAIR_STEP)
  const requestedOrigin = resolvedOptions.origin
  const origin = {
    x: typeof requestedOrigin?.x === 'number' && Number.isFinite(requestedOrigin.x) ? requestedOrigin.x : 0,
    y: typeof requestedOrigin?.y === 'number' && Number.isFinite(requestedOrigin.y) ? requestedOrigin.y : 0
  }
  const segments: IsoGuideSegment[] = []
  for (const slope of [1 / stairStep, -1 / stairStep]) {
    const baseIntercept = origin.y - slope * origin.x
    const intercepts = [
      bounds.top - slope * bounds.left,
      bounds.top - slope * bounds.right,
      bounds.bottom - slope * bounds.left,
      bounds.bottom - slope * bounds.right
    ]
    const first = baseIntercept + Math.floor((Math.min(...intercepts) - baseIntercept) / safeSpacing) * safeSpacing
    const last = baseIntercept + Math.ceil((Math.max(...intercepts) - baseIntercept) / safeSpacing) * safeSpacing
    for (let intercept = first; intercept <= last; intercept += safeSpacing) {
      const segment = clippedGuideSegment(slope, intercept, bounds)
      if (segment) segments.push(segment)
    }
  }
  return segments
}

export function isoLineEndpoint(from: PixelLinePoint, to: PixelLinePoint, stairStep = ISO_LINE_STAIR_STEP): PixelLinePoint {
  const step = normalizeStairStep(stairStep)
  const direction = resolveIsoLineDirection(from, to, step)
  return direction ? isoLineEndpointForDirection(from, to, direction, step) : { ...to }
}

export function isoGridLineEndpoint(from: PixelLinePoint, to: PixelLinePoint, stairStep = ISO_LINE_STAIR_STEP): PixelLinePoint {
  return isoGridLineSegment(from, to, stairStep).to
}

export function isoGridLineSegment(
  from: PixelLinePoint,
  to: PixelLinePoint,
  stairStep = ISO_LINE_STAIR_STEP
): { from: PixelLinePoint; to: PixelLinePoint } {
  const step = normalizeStairStep(stairStep)
  const direction = resolveIsoLineDirection(from, to, step, true)
  if (!direction) return { from: { ...from }, to: { ...to } }
  const vector = isoLineDirectionVector(direction, step)
  const start = {
    x: from.x + (vector.x < 0 ? -1 : 0),
    // Preview stairs are indexed by floor(x / step), in both slope families.
    // Crossing left of a vertex enters the previous stair; moving right does not.
    y: from.y + (vector.x < 0 ? Math.sign(vector.y) : 0)
  }
  const delta = { x: to.x - from.x, y: to.y - from.y }
  const stairCount = Math.max(1, Math.round(
    (delta.x * vector.x + delta.y * vector.y) / (vector.x ** 2 + vector.y ** 2)
  ))
  return {
    from: start,
    to: {
      x: start.x + Math.sign(vector.x) * (stairCount * step - 1),
      y: start.y + Math.sign(vector.y) * (stairCount - 1)
    }
  }
}

export function advanceIsoAlignedStrokeSegment(
  state: IsoAlignedStrokeSegmentState,
  rawTarget: PixelLinePoint,
  stairStep = ISO_LINE_STAIR_STEP,
  options: IsoAlignedStrokeOptions = {}
): IsoAlignedStrokeSegmentAdvance {
  const step = normalizeStairStep(stairStep)
  if (options.grid) return advanceIsoGridAlignedStrokeSegment(state, rawTarget, step, options.grid)
  const rawAnchor = state.rawAnchor ?? state.anchor
  const rawEndpoint = state.rawEndpoint ?? rawAnchor
  const candidateDirection = resolveIsoLineDirection(rawAnchor, rawTarget, step, options.diagonalOnly === true)
  if (!candidateDirection) {
    return {
      anchor: { ...state.anchor },
      endpoint: { ...state.anchor },
      rawAnchor: { ...rawAnchor },
      rawEndpoint: { ...rawTarget },
      direction: state.direction,
      directionSamples: state.directionSamples ?? 0
    }
  }
  const activeExtent = Math.max(
    Math.abs(state.endpoint.x - state.anchor.x),
    Math.abs(state.endpoint.y - state.anchor.y)
  )
  const directionSamples = candidateDirection === state.direction ? (state.directionSamples ?? 1) + 1 : 1
  const requiredDirectionSamples = Math.max(2, Math.min(4, step + 1))
  const directionEstablished = activeExtent > step && (state.directionSamples ?? 0) >= requiredDirectionSamples
  const alignedRawTarget = {
    x: state.anchor.x + rawTarget.x - rawAnchor.x,
    y: state.anchor.y + rawTarget.y - rawAnchor.y
  }
  if (!state.direction || candidateDirection === state.direction || samePoint(state.anchor, state.endpoint) || !directionEstablished) {
    return {
      anchor: { ...state.anchor },
      endpoint: isoLineEndpointForDirection(state.anchor, alignedRawTarget, candidateDirection, step),
      rawAnchor: { ...rawAnchor },
      rawEndpoint: { ...rawTarget },
      direction: candidateDirection,
      directionSamples
    }
  }
  const lockedEndpoint = { ...state.endpoint }
  const nextRawAnchor = { ...rawEndpoint }
  const nextDirection = resolveIsoLineDirection(nextRawAnchor, rawTarget, step, options.diagonalOnly === true) ?? candidateDirection
  const nextAlignedTarget = {
    x: lockedEndpoint.x + rawTarget.x - nextRawAnchor.x,
    y: lockedEndpoint.y + rawTarget.y - nextRawAnchor.y
  }
  return {
    anchor: lockedEndpoint,
    endpoint: isoLineEndpointForDirection(lockedEndpoint, nextAlignedTarget, nextDirection, step),
    rawAnchor: nextRawAnchor,
    rawEndpoint: { ...rawTarget },
    direction: nextDirection,
    directionSamples: 1,
    lockedEndpoint
  }
}
