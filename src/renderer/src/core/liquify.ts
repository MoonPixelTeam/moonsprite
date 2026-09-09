import type { LayerMask, LiquifyMode, RasterLayer, SelectionMask, SelectionRect, SpriteDocument } from '@shared/types'
import { layerIndexAt, readLayerColor, readLayerPacked, writeLayerPacked } from './document'
import { recordPixelKnownCurrent, type PixelEdit } from './history'
import { selectionContains } from './selection'

const PUSH_DAB_SPACING_RATIO = 0.125
export const LIQUIFY_MAX_PUSH_DABS_PER_BATCH = 128

export interface LiquifyPushStroke {
  dabCount: number
  displacements: Map<number, { x: number; y: number }>
  maxDisplacement: number
  axisMode: 'horizontal' | 'vertical' | 'diagonal' | 'free' | null
  horizontalDisplacements: Map<number, number>
  verticalDisplacements: Map<number, number>
}

export interface LiquifyStepOptions {
  mode: LiquifyMode
  radius: number
  strength: number
  selection?: SelectionMask | null
  mask?: LayerMask | null
  pushStroke?: LiquifyPushStroke
}

export interface LiquifyPushPathResult {
  changed: boolean
  dabCount: number
  dirtyRect: SelectionRect | null
}

export const temporaryLiquifyModeForShift = (mode: LiquifyMode, shiftHeld: boolean): LiquifyMode => {
  if (!shiftHeld) return mode
  if (mode === 'inflate') return 'deflate'
  if (mode === 'deflate') return 'inflate'
  if (mode === 'twist-clockwise') return 'twist-counter-clockwise'
  if (mode === 'twist-counter-clockwise') return 'twist-clockwise'
  return mode
}

export const createLiquifyPushStroke = (): LiquifyPushStroke => ({
  dabCount: 0,
  displacements: new Map(),
  maxDisplacement: 0,
  axisMode: null,
  horizontalDisplacements: new Map(),
  verticalDisplacements: new Map()
})

/** Rewinds only the open liquify transaction; it does not create history. */
export const resetLiquifyStroke = (document: SpriteDocument, edit: PixelEdit, pushStroke?: LiquifyPushStroke): void => {
  const layer = document.layers.find((candidate) => candidate.id === edit.layerId)
  if (!layer) return
  if (edit.before.size > 0) {
    for (const [index, packed] of edit.before) {
      const current = readLayerPacked(document, layer, index)
      if (current !== packed) writeLayerPacked(document, layer, index, packed)
    }
  }
  edit.before.clear()
  edit.after.clear()
  edit.points = undefined
  edit.runs = undefined
  edit.denseRegion = undefined
  edit.dirtyRect = undefined
  if (pushStroke) {
    pushStroke.dabCount = 0
    pushStroke.displacements.clear()
    pushStroke.maxDisplacement = 0
    pushStroke.axisMode = null
    pushStroke.horizontalDisplacements.clear()
    pushStroke.verticalDisplacements.clear()
  }
}

const maskCoverageAt = (mask: LayerMask | null | undefined, x: number, y: number): number => {
  if (!mask || mask.visible === false) return 255
  const index = layerIndexAt(mask, x, y)
  if (index === null) return 255
  const offset = index * 4
  return mask.pixels[offset + 3] === 0 ? 255 : mask.pixels[offset]
}

let sourceScratch = new Uint32Array(0)

const ensureSourceScratch = (length: number): Uint32Array => {
  if (sourceScratch.length < length) sourceScratch = new Uint32Array(2 ** Math.ceil(Math.log2(Math.max(1, length))))
  return sourceScratch
}


const baselinePacked = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, index: number): number =>
  edit.before.get(index) ?? readLayerPacked(document, layer, index)

const axisModeForDelta = (delta: { x: number; y: number }): 'horizontal' | 'vertical' | 'diagonal' | 'free' => {
  const absX = Math.abs(delta.x)
  const absY = Math.abs(delta.y)
  if (absX >= absY * 1.75) return 'horizontal'
  if (absY >= absX * 1.75) return 'vertical'
  if (absX > 0.0001 && absY > 0.0001) return 'diagonal'
  return 'free'
}

/**
 * Keep a push stroke coherent while still allowing the pointer to bend.
 *
 * The first segment chooses the efficient scanline path. Once that path has
 * a meaningful component on the other axis, it must be upgraded to the
 * diagonal displacement field; otherwise a shallow diagonal bend (for
 * example, four pixels right and one pixel up) is silently discarded by the
 * axial ratio heuristic.
 */
const updatePushAxisMode = (stroke: LiquifyPushStroke, delta: { x: number; y: number }): void => {
  const absX = Math.abs(delta.x)
  const absY = Math.abs(delta.y)
  if (absX <= 0.0001 && absY <= 0.0001) return
  if (stroke.axisMode === null || stroke.axisMode === 'free') {
    stroke.axisMode = axisModeForDelta(delta)
    return
  }
  if (stroke.axisMode === 'horizontal' && absY > 0.25) {
    stroke.axisMode = 'diagonal'
    return
  }
  if (stroke.axisMode === 'vertical' && absX > 0.25) stroke.axisMode = 'diagonal'
}

function applyAxisPushDab(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  stroke: LiquifyPushStroke,
  center: { x: number; y: number },
  delta: { x: number; y: number },
  radius: number,
  strength: number,
  axis: 'horizontal' | 'vertical',
  lineDisplacements: Map<number, number>,
  selection?: SelectionMask | null,
  mask?: LayerMask | null
): { changed: boolean; dirtyRect: SelectionRect | null } {
  const horizontal = axis === 'horizontal'
  const lineStart = Math.max(horizontal ? layer.offsetY : layer.offsetX, Math.floor((horizontal ? center.y : center.x) - radius))
  const lineEnd = Math.min(horizontal ? layer.offsetY + layer.height - 1 : layer.offsetX + layer.width - 1, Math.ceil((horizontal ? center.y : center.x) + radius))
  if (lineStart > lineEnd) return { changed: false, dirtyRect: null }
  let changed = false
  let dirtyRect: SelectionRect | null = null
  const mergeDirty = (next: SelectionRect): void => {
    if (!dirtyRect) dirtyRect = next
    else dirtyRect = unionRect(dirtyRect, next)
  }
  for (let line = lineStart; line <= lineEnd; line += 1) {
    const perpendicularDistance = Math.abs(line - (horizontal ? center.y : center.x))
    // Keep a non-zero baseline across the strip. A pure falloff reaches zero
    // at the edge and makes pixel-art pushing feel unresponsive even though
    // the pointer is moving; the baseline still remains smooth and coherent
    // because the whole scanline shares one displacement.
    const influence = (0.62 + brushFalloff(perpendicularDistance, radius) * 0.38) * strength
    if (influence <= 0.0001) continue
    const previousShift = lineDisplacements.get(line) ?? 0
    const shift = previousShift + (horizontal ? delta.x : delta.y) * influence
    lineDisplacements.set(line, shift)
    stroke.maxDisplacement = Math.max(stroke.maxDisplacement, Math.abs(shift))
    // The source may be sampled outside the brush, but destinations must stay
    // inside the circular brush footprint. This prevents pushed pixels from
    // leaking into a tail outside the visible brush radius.
    const halfSpan = Math.sqrt(Math.max(0, radius * radius - perpendicularDistance * perpendicularDistance))
    const alongStart = Math.max(horizontal ? layer.offsetX : layer.offsetY, Math.floor((horizontal ? center.x : center.y) - halfSpan))
    const alongEnd = Math.min(horizontal ? layer.offsetX + layer.width - 1 : layer.offsetY + layer.height - 1, Math.ceil((horizontal ? center.x : center.y) + halfSpan))
    for (let along = alongStart; along <= alongEnd; along += 1) {
      const x = horizontal ? along : line
      const y = horizontal ? line : along
      if ((selection && !selectionContains(selection, x, y)) || (mask && mask.visible !== false && maskCoverageAt(mask, x, y) <= 0)) continue
      const sourceAlong = Math.round(along - shift)
      const sourceX = horizontal ? sourceAlong : line
      const sourceY = horizontal ? line : sourceAlong
      const destinationIndex = layerIndexAt(layer, x, y)
      const sourceIndex = layerIndexAt(layer, sourceX, sourceY)
      if (destinationIndex === null || sourceIndex === null) continue
      const current = readLayerPacked(document, layer, destinationIndex)
      const next = baselinePacked(document, layer, edit, sourceIndex)
      if (recordPixelKnownCurrent(document, layer, edit, destinationIndex, current, next)) changed = true
    }
    if (changed) {
      const rect = horizontal
        ? { x: alongStart, y: line, width: Math.max(1, alongEnd - alongStart + 1), height: 1 }
        : { x: line, y: alongStart, width: 1, height: Math.max(1, alongEnd - alongStart + 1) }
      mergeDirty(rect)
    }
  }
  return { changed, dirtyRect }
}

function applyDiagonalAxisPushDab(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  stroke: LiquifyPushStroke,
  center: { x: number; y: number },
  delta: { x: number; y: number },
  radius: number,
  strength: number,
  selection?: SelectionMask | null,
  mask?: LayerMask | null
): { changed: boolean; dirtyRect: SelectionRect | null } {
  const rowStart = Math.max(layer.offsetY, Math.floor(center.y - radius))
  const rowEnd = Math.min(layer.offsetY + layer.height - 1, Math.ceil(center.y + radius))
  const columnStart = Math.max(layer.offsetX, Math.floor(center.x - radius))
  const columnEnd = Math.min(layer.offsetX + layer.width - 1, Math.ceil(center.x + radius))
  for (let y = rowStart; y <= rowEnd; y += 1) {
    const influence = (0.62 + brushFalloff(Math.abs(y - center.y), radius) * 0.38) * strength
    const previous = stroke.horizontalDisplacements.get(y) ?? 0
    const next = previous + delta.x * influence
    stroke.horizontalDisplacements.set(y, next)
    stroke.maxDisplacement = Math.max(stroke.maxDisplacement, Math.abs(next))
  }
  for (let x = columnStart; x <= columnEnd; x += 1) {
    const influence = (0.62 + brushFalloff(Math.abs(x - center.x), radius) * 0.38) * strength
    const previous = stroke.verticalDisplacements.get(x) ?? 0
    const next = previous + delta.y * influence
    stroke.verticalDisplacements.set(x, next)
    stroke.maxDisplacement = Math.max(stroke.maxDisplacement, Math.abs(next))
  }
  const reach = Math.ceil(Math.min(stroke.maxDisplacement, radius * 2)) + 1
  const renderLeft = Math.max(layer.offsetX, Math.floor(center.x - radius - reach))
  const renderTop = Math.max(layer.offsetY, Math.floor(center.y - radius - reach))
  const renderRight = Math.min(layer.offsetX + layer.width - 1, Math.ceil(center.x + radius + reach))
  const renderBottom = Math.min(layer.offsetY + layer.height - 1, Math.ceil(center.y + radius + reach))
  let changed = false
  for (let y = renderTop; y <= renderBottom; y += 1) for (let x = renderLeft; x <= renderRight; x += 1) {
    if (Math.hypot(x - center.x, y - center.y) > radius) continue
    if ((selection && !selectionContains(selection, x, y)) || (mask && mask.visible !== false && maskCoverageAt(mask, x, y) <= 0)) continue
    const destinationIndex = layerIndexAt(layer, x, y)
    const sourceX = Math.round(x - (stroke.horizontalDisplacements.get(y) ?? 0))
    const sourceY = Math.round(y - (stroke.verticalDisplacements.get(x) ?? 0))
    const sourceIndex = layerIndexAt(layer, sourceX, sourceY)
    if (destinationIndex === null || sourceIndex === null) continue
    const current = readLayerPacked(document, layer, destinationIndex)
    const next = baselinePacked(document, layer, edit, sourceIndex)
    if (recordPixelKnownCurrent(document, layer, edit, destinationIndex, current, next)) changed = true
  }
  return { changed, dirtyRect: changed ? { x: renderLeft, y: renderTop, width: renderRight - renderLeft + 1, height: renderBottom - renderTop + 1 } : null }
}

/**
 * Applies one inverse-warp dab from a local snapshot. Every destination pixel
 * samples a source pixel shifted opposite to the pointer delta, with a strong
 * Gaussian influence at the brush centre and a fast falloff at the edge.
 */
const applyPushDab = (
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  stroke: LiquifyPushStroke,
  center: { x: number; y: number },
  delta: { x: number; y: number },
  radius: number,
  strength: number,
  selection?: SelectionMask | null,
  mask?: LayerMask | null
): { changed: boolean; dirtyRect: SelectionRect | null } => {
  const left = Math.max(layer.offsetX, Math.floor(center.x - radius))
  const top = Math.max(layer.offsetY, Math.floor(center.y - radius))
  const right = Math.min(layer.offsetX + layer.width - 1, Math.ceil(center.x + radius))
  const bottom = Math.min(layer.offsetY + layer.height - 1, Math.ceil(center.y + radius))
  if (left > right || top > bottom) return { changed: false, dirtyRect: null }
  updatePushAxisMode(stroke, delta)
  if (stroke.axisMode === 'horizontal') {
    return applyAxisPushDab(document, layer, edit, stroke, center, delta, radius, strength, 'horizontal', stroke.horizontalDisplacements, selection, mask)
  }
  if (stroke.axisMode === 'vertical') {
    return applyAxisPushDab(document, layer, edit, stroke, center, delta, radius, strength, 'vertical', stroke.verticalDisplacements, selection, mask)
  }
  if (stroke.axisMode === 'diagonal') {
    return applyDiagonalAxisPushDab(document, layer, edit, stroke, center, delta, radius, strength, selection, mask)
  }

  const maxSearchPadding = Math.ceil(stroke.maxDisplacement) + 2
  const sourceLeft = Math.max(layer.offsetX, left - maxSearchPadding)
  const sourceTop = Math.max(layer.offsetY, top - maxSearchPadding)
  const sourceRight = Math.min(layer.offsetX + layer.width - 1, right + maxSearchPadding)
  const sourceBottom = Math.min(layer.offsetY + layer.height - 1, bottom + maxSearchPadding)
  const touched = new Map<number, { oldX: number; oldY: number; newX: number; newY: number }>()
  for (let y = sourceTop; y <= sourceBottom; y += 1) for (let x = sourceLeft; x <= sourceRight; x += 1) {
    if ((selection && !selectionContains(selection, x, y)) || (mask && mask.visible !== false && maskCoverageAt(mask, x, y) <= 0)) continue
    const index = layerIndexAt(layer, x, y)
    if (index === null) continue
    const previous = stroke.displacements.get(index) ?? { x: 0, y: 0 }
    const transformedX = x + previous.x
    const transformedY = y + previous.y
    const distance = pixelPushInfluenceDistance(center, { x: transformedX, y: transformedY }, delta, radius)
    if (distance >= radius) continue
    const influence = brushFalloff(distance, radius) * strength
    if (influence <= 0.0001) continue
    const next = { x: previous.x + delta.x * influence, y: previous.y + delta.y * influence }
    stroke.displacements.set(index, next)
    stroke.maxDisplacement = Math.max(stroke.maxDisplacement, Math.abs(next.x), Math.abs(next.y))
    touched.set(index, { oldX: transformedX, oldY: transformedY, newX: x + next.x, newY: y + next.y })
  }
  if (touched.size === 0) return { changed: false, dirtyRect: null }
  let renderLeft = left
  let renderTop = top
  let renderRight = right
  let renderBottom = bottom
  for (const point of touched.values()) {
    renderLeft = Math.min(renderLeft, Math.floor(point.oldX), Math.floor(point.newX))
    renderTop = Math.min(renderTop, Math.floor(point.oldY), Math.floor(point.newY))
    renderRight = Math.max(renderRight, Math.ceil(point.oldX), Math.ceil(point.newX))
    renderBottom = Math.max(renderBottom, Math.ceil(point.oldY), Math.ceil(point.newY))
  }
  renderLeft = Math.max(layer.offsetX, renderLeft - 1)
  renderTop = Math.max(layer.offsetY, renderTop - 1)
  renderRight = Math.min(layer.offsetX + layer.width - 1, renderRight + 1)
  renderBottom = Math.min(layer.offsetY + layer.height - 1, renderBottom + 1)
  // A long gesture may accumulate a large absolute displacement, but each
  // dab only needs the nearby source neighborhood. Older, already-rendered
  // parts of the stroke are left untouched, keeping large-canvas pushes local.
  const localDisplacement = Math.min(stroke.maxDisplacement, radius * 2)
  const sourceRenderLeft = Math.max(layer.offsetX, renderLeft - Math.ceil(localDisplacement) - 1)
  const sourceRenderTop = Math.max(layer.offsetY, renderTop - Math.ceil(localDisplacement) - 1)
  const sourceRenderRight = Math.min(layer.offsetX + layer.width - 1, renderRight + Math.ceil(localDisplacement) + 1)
  const sourceRenderBottom = Math.min(layer.offsetY + layer.height - 1, renderBottom + Math.ceil(localDisplacement) + 1)
  const winners = new Map<number, { sourceIndex: number; score: number; alpha: number; moved: boolean }>()
  for (let y = sourceRenderTop; y <= sourceRenderBottom; y += 1) for (let x = sourceRenderLeft; x <= sourceRenderRight; x += 1) {
    const sourceIndex = layerIndexAt(layer, x, y)
    if (sourceIndex === null) continue
    const displacement = stroke.displacements.get(sourceIndex) ?? { x: 0, y: 0 }
    const destinationX = Math.round(x + displacement.x)
    const destinationY = Math.round(y + displacement.y)
    if (destinationX < renderLeft || destinationX > renderRight || destinationY < renderTop || destinationY > renderBottom) continue
    if ((selection && !selectionContains(selection, destinationX, destinationY)) || (mask && mask.visible !== false && maskCoverageAt(mask, destinationX, destinationY) <= 0)) continue
    const destinationIndex = layerIndexAt(layer, destinationX, destinationY)
    if (destinationIndex === null) continue
    const sourcePacked = baselinePacked(document, layer, edit, sourceIndex)
    const alpha = layer.format === 'rgba' ? (sourcePacked >>> 24) & 0xff : readLayerColor(document, layer, sourceIndex).a
    const moved = displacement.x !== 0 || displacement.y !== 0
    const score = (destinationX - (x + displacement.x)) ** 2 + (destinationY - (y + displacement.y)) ** 2
    const winner = winners.get(destinationIndex)
    if (!winner || (moved && !winner.moved) || (moved === winner.moved && (alpha > winner.alpha || (alpha === winner.alpha && score < winner.score)))) {
      winners.set(destinationIndex, { sourceIndex, score, alpha, moved })
    }
  }
  // Nearest-neighbour rasterization can leave a one-pixel crack between two
  // otherwise connected transformed pixels. Fill only holes with at least two
  // opaque winner neighbours; large transparent regions remain untouched.
  const filledWinners = new Map(winners)
  if (winners.size <= 20_000) {
    const holeNeighbors = new Map<number, Array<{ sourceIndex: number; score: number; alpha: number; moved: boolean }>>()
    for (const [winnerIndex, winner] of winners) {
      if (winner.alpha <= 0) continue
      const winnerX = layer.offsetX + (winnerIndex % layer.width)
      const winnerY = layer.offsetY + Math.floor(winnerIndex / layer.width)
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue
        const holeIndex = layerIndexAt(layer, winnerX + offsetX, winnerY + offsetY)
        if (holeIndex === null || winners.has(holeIndex)) continue
        const neighbors = holeNeighbors.get(holeIndex) ?? []
        neighbors.push(winner)
        holeNeighbors.set(holeIndex, neighbors)
      }
    }
    for (const [holeIndex, neighbors] of holeNeighbors) {
      if (neighbors.length < 2) continue
      neighbors.sort((a, b) => b.alpha - a.alpha || a.score - b.score)
      filledWinners.set(holeIndex, neighbors[0])
    }
  }
  let changed = false
  for (let y = renderTop; y <= renderBottom; y += 1) for (let x = renderLeft; x <= renderRight; x += 1) {
    if (Math.hypot(x - center.x, y - center.y) > radius) continue
    if ((selection && !selectionContains(selection, x, y)) || (mask && mask.visible !== false && maskCoverageAt(mask, x, y) <= 0)) continue
    const destinationIndex = layerIndexAt(layer, x, y)
    if (destinationIndex === null) continue
    const winner = filledWinners.get(destinationIndex)
    const current = readLayerPacked(document, layer, destinationIndex)
    const next = winner ? baselinePacked(document, layer, edit, winner.sourceIndex) : 0
    if (recordPixelKnownCurrent(document, layer, edit, destinationIndex, current, next)) changed = true
  }
  return { changed, dirtyRect: changed ? { x: renderLeft, y: renderTop, width: renderRight - renderLeft + 1, height: renderBottom - renderTop + 1 } : null }
}

const brushFalloff = (distance: number, radius: number): number => {
  const normalized = Math.min(1, distance / radius)
  return 1 - normalized * normalized * (3 - 2 * normalized)
}

/**
 * Pixel-art push uses a strip-like influence instead of applying a different
 * displacement to every pixel by radial distance. A horizontal drag keeps a
 * scanline coherent, and a vertical drag keeps a column coherent. For a
 * diagonal drag the falloff is measured perpendicular to the stroke vector.
 */
const pixelPushInfluenceDistance = (
  center: { x: number; y: number },
  point: { x: number; y: number },
  delta: { x: number; y: number },
  radius: number
): number => {
  const length = Math.hypot(delta.x, delta.y)
  if (length <= 0.0001) return Math.hypot(point.x - center.x, point.y - center.y)
  const directionX = delta.x / length
  const directionY = delta.y / length
  const perpendicular = Math.abs((point.x - center.x) * directionY - (point.y - center.y) * directionX)
  const along = Math.abs((point.x - center.x) * directionX + (point.y - center.y) * directionY)
  // Keep the strip bounded, but make the longitudinal falloff much wider than
  // the perpendicular one so a straight pixel-art edge does not fragment.
  return Math.max(perpendicular, Math.max(0, along - radius * 1.5) * 0.35)
}

const unionRect = (rect: SelectionRect | null, next: SelectionRect): SelectionRect => {
  if (!rect) return next
  const left = Math.min(rect.x, next.x)
  const top = Math.min(rect.y, next.y)
  const right = Math.max(rect.x + rect.width, next.x + next.width)
  const bottom = Math.max(rect.y + rect.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const resamplePushPath = (
  from: { x: number; y: number },
  points: readonly { x: number; y: number }[],
  radius: number
): Array<{ point: { x: number; y: number }; delta: { x: number; y: number } }> => {
  const vertices = [from, ...points]
  let totalLength = 0
  for (let index = 1; index < vertices.length; index += 1) {
    totalLength += Math.hypot(vertices[index].x - vertices[index - 1].x, vertices[index].y - vertices[index - 1].y)
  }
  if (totalLength === 0) return []
  const spacing = Math.max(1, radius * PUSH_DAB_SPACING_RATIO, totalLength / LIQUIFY_MAX_PUSH_DABS_PER_BATCH)
  const samples: Array<{ x: number; y: number }> = []
  let distanceUntilSample = spacing
  for (let index = 1; index < vertices.length; index += 1) {
    const start = vertices[index - 1]
    const end = vertices[index]
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y
    const length = Math.hypot(deltaX, deltaY)
    if (length === 0) continue
    let consumed = 0
    while (consumed + distanceUntilSample <= length && samples.length < LIQUIFY_MAX_PUSH_DABS_PER_BATCH) {
      consumed += distanceUntilSample
      const ratio = consumed / length
      samples.push({ x: start.x + deltaX * ratio, y: start.y + deltaY * ratio })
      distanceUntilSample = spacing
    }
    distanceUntilSample -= length - consumed
  }
  const end = vertices.at(-1)!
  const last = samples.at(-1)
  if ((!last || last.x !== end.x || last.y !== end.y) && samples.length < LIQUIFY_MAX_PUSH_DABS_PER_BATCH) samples.push({ ...end })
  if (samples.length === 0) samples.push({ ...end })
  const dabs: Array<{ point: { x: number; y: number }; delta: { x: number; y: number } }> = []
  let previous = from
  for (const point of samples) {
    dabs.push({ point, delta: { x: point.x - previous.x, y: point.y - previous.y } })
    previous = point
  }
  return dabs
}

export function applyLiquifyPushPath(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  stroke: LiquifyPushStroke,
  from: { x: number; y: number },
  points: readonly { x: number; y: number }[],
  options: Omit<LiquifyStepOptions, 'mode' | 'pushStroke'>
): LiquifyPushPathResult {
  const radius = Math.max(1, Math.round(options.radius))
  const strength = Math.max(0, Math.min(1, options.strength / 100))
  if (strength === 0 || points.length === 0) return { changed: false, dabCount: 0, dirtyRect: null }
  const pathEnd = points.at(-1)!
  updatePushAxisMode(stroke, { x: pathEnd.x - from.x, y: pathEnd.y - from.y })
  const dabs = resamplePushPath(from, points, radius)
  let dirtyRect: SelectionRect | null = null
  // A later dab commonly rewrites indices already present in PixelEdit. Map
  // size is therefore not a valid change signal; use the actual write result
  // from each dab so the composite cache is invalidated on every visible warp.
  let changed = false
  for (const dab of dabs) {
    const applied = applyPushDab(document, layer, edit, stroke, dab.point, dab.delta, radius, strength, options.selection, options.mask)
    stroke.dabCount += 1
    changed = applied.changed || changed
    if (applied.dirtyRect) dirtyRect = unionRect(dirtyRect, applied.dirtyRect)
  }
  return { changed, dabCount: dabs.length, dirtyRect }
}

/** Applies a nearest-neighbor local warp while retaining one PixelEdit for the full gesture. */
export function applyLiquifyStep(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: LiquifyStepOptions
): boolean {
  const radius = Math.max(1, Math.round(options.radius))
  const strength = Math.max(0, Math.min(1, options.strength / 100))
  if (strength === 0) return false
  if (options.mode === 'push') {
    const stroke = options.pushStroke ?? createLiquifyPushStroke()
    return applyLiquifyPushPath(document, layer, edit, stroke, from, [to], options).changed
  }
  const left = Math.floor(to.x - radius)
  const top = Math.floor(to.y - radius)
  const right = Math.ceil(to.x + radius)
  const bottom = Math.ceil(to.y + radius)
  const radialPadding = options.mode === 'deflate' ? radius : 0
  const sourceLeft = Math.max(layer.offsetX, left - radialPadding)
  const sourceTop = Math.max(layer.offsetY, top - radialPadding)
  const sourceRight = Math.min(layer.offsetX + layer.width - 1, right + radialPadding)
  const sourceBottom = Math.min(layer.offsetY + layer.height - 1, bottom + radialPadding)
  const sourceWidth = Math.max(0, sourceRight - sourceLeft + 1)
  const sourceHeight = Math.max(0, sourceBottom - sourceTop + 1)
  if (sourceWidth === 0 || sourceHeight === 0) return false
  const source = ensureSourceScratch(sourceWidth * sourceHeight)
  for (let y = sourceTop; y <= sourceBottom; y += 1) {
    const sourceRow = (y - sourceTop) * sourceWidth
    for (let x = sourceLeft; x <= sourceRight; x += 1) {
      const index = (y - layer.offsetY) * layer.width + x - layer.offsetX
      // Every hold tick is rendered from the gesture baseline. Re-sampling
      // the already-warped result compounds nearest-neighbor artifacts and
      // quickly breaks coherent pixel clusters into noisy fragments.
      source[sourceRow + x - sourceLeft] = baselinePacked(document, layer, edit, index)
    }
  }
  const sampleSource = (x: number, y: number): number | undefined => {
    if (x < sourceLeft || y < sourceTop || x > sourceRight || y > sourceBottom) return undefined
    return source[(y - sourceTop) * sourceWidth + x - sourceLeft]
  }
  const targetLeft = Math.max(layer.offsetX, left)
  const targetTop = Math.max(layer.offsetY, top)
  const targetRight = Math.min(layer.offsetX + layer.width - 1, right)
  const targetBottom = Math.min(layer.offsetY + layer.height - 1, bottom)
  let changed = false
  for (let y = targetTop; y <= targetBottom; y += 1) for (let x = targetLeft; x <= targetRight; x += 1) {
    if ((options.selection && !selectionContains(options.selection, x, y)) || (options.mask && options.mask.visible !== false && maskCoverageAt(options.mask, x, y) <= 0)) continue
    const index = (y - layer.offsetY) * layer.width + x - layer.offsetX
    const offsetX = x - to.x
    const offsetY = y - to.y
    const distance = Math.hypot(offsetX, offsetY)
    if (distance > radius) continue
    const influence = brushFalloff(distance, radius) * strength
    // The source buffer is the gesture baseline, but the value being replaced
    // must come from the live layer. During a held deformation an earlier
    // strength step may have changed this destination; comparing against the
    // baseline would skip the write when the newer step restores the baseline
    // value, leaving stale pixels behind.
    const current = readLayerPacked(document, layer, index)
    let sourceX = x
    let sourceY = y
    if (options.mode === 'inflate' || options.mode === 'deflate') {
      const scale = options.mode === 'inflate' ? 1 - influence * 0.75 : 1 + influence
      sourceX = to.x + offsetX * scale
      sourceY = to.y + offsetY * scale
    } else {
      const angle = influence * (options.mode === 'twist-clockwise' ? -Math.PI / 2 : Math.PI / 2)
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      sourceX = to.x + offsetX * cosine - offsetY * sine
      sourceY = to.y + offsetX * sine + offsetY * cosine
    }
    const next = sampleSource(Math.round(sourceX), Math.round(sourceY))
    if (next !== undefined && recordPixelKnownCurrent(document, layer, edit, index, current, next)) changed = true
  }
  return changed
}
