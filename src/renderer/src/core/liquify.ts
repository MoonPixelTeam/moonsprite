import type { LayerMask, LiquifyMode, RasterLayer, SelectionMask, SelectionRect, SpriteDocument } from '@shared/types'
import { ensureLayerCoversCanvas, layerIndexAt, readLayerPacked, writeLayerPacked } from './document'
import { recordPixelKnownCurrent, type PixelEdit } from './history'
import { selectionContains } from './selection'

const PUSH_DAB_SPACING_RATIO = 0.125

export interface LiquifyPushStroke {
  dabCount: number
  maxDisplacement: number
  axisMode: 'horizontal' | 'vertical' | 'diagonal' | 'free' | null
  horizontalDisplacements: Map<number, number>
  verticalDisplacements: Map<number, number>
  path?: { sample: Point; remaining: number; spacing: number }
  provisional?: PushPreview
}

type Point = { x: number; y: number }
interface PushPreview {
  rect: SelectionRect
  pixels: Uint32Array
  horizontal: Map<number, number>
  vertical: Map<number, number>
  axisMode: LiquifyPushStroke['axisMode']
  maxDisplacement: number
}

interface HoldStroke {
  center: Point
  mode: LiquifyMode
  radius: number
  strength: number
  source: { rect: SelectionRect; pixels: Uint32Array }
}
const holdStrokes = new WeakMap<PixelEdit, HoldStroke>()

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
  holdStrokes.delete(edit)
  edit.before.clear()
  edit.after.clear()
  edit.points = undefined
  edit.runs = undefined
  edit.denseRegion = undefined
  edit.dirtyRect = undefined
  if (pushStroke) {
    pushStroke.dabCount = 0
    pushStroke.path = undefined
    pushStroke.provisional = undefined
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

// Axis fast paths are valid only for genuinely axial motion. Tiny cross-axis
// deltas must not disappear just because a device dispatches more events.
const updatePushAxisMode = (stroke: LiquifyPushStroke, delta: Point): void => {
  const hasX = Math.abs(delta.x) > 1e-9
  const hasY = Math.abs(delta.y) > 1e-9
  if (!hasX && !hasY) return
  const axis = hasX && hasY ? 'diagonal' : hasX ? 'horizontal' : 'vertical'
  if (stroke.axisMode === null || stroke.axisMode === 'free') stroke.axisMode = axis
  else if (stroke.axisMode !== axis) stroke.axisMode = 'diagonal'
}

/** Categorical corner sampling: refine a supported corner without mixing colors.
 * Equal opposite neighbours protect thin strokes, isolated pixels and holes.
 * Integer/axial sampling remains exact, including coherent scanline pushes.
 */
export function sampleLiquifyPixel(read: (x: number, y: number) => number | undefined, x: number, y: number): number | undefined {
  const ix = Math.round(x), iy = Math.round(y)
  const center = read(ix, iy)
  const dx = x - ix, dy = y - iy
  if (center === undefined || Math.abs(dx) < 0.25 || Math.abs(dy) < 0.25) return center
  const north = read(ix, iy - 1), south = read(ix, iy + 1)
  const west = read(ix - 1, iy), east = read(ix + 1, iy)
  if (north === undefined || south === undefined || west === undefined || east === undefined || north === south || west === east) return center
  const horizontal = dx < 0 ? west : east
  const vertical = dy < 0 ? north : south
  return horizontal === vertical ? horizontal : center
}

// Preserve actual source connectivity of thin marks on transparency. This is
// not a destination hole-fill: disconnected marks have no edge to bridge.
function preserveThinSourceEdges(
  document: SpriteDocument, layer: RasterLayer, edit: PixelEdit,
  read: (x: number, y: number) => number | undefined,
  center: Point, radius: number, strength: number, options: LiquifyStepOptions
): boolean {
  const paletteAlpha = layer.format === 'indexed' ? new Map(document.palette.map(entry => [entry.id, entry.color.a])) : null
  const alpha = (packed: number | undefined): number => packed === undefined ? 0
    : paletteAlpha ? paletteAlpha.get(packed) ?? 0 : packed >>> 24
  const occupied = (x: number, y: number): boolean => alpha(read(x, y)) > 0
  const thin = (x: number, y: number): boolean => {
    if (!occupied(x, y)) return false
    // A pixel belonging to a filled 2x2 cluster is already represented by the
    // area sampler. Only one-pixel features need a connectivity supplement.
    for (const dy of [-1, 1]) for (const dx of [-1, 1]) {
      if (occupied(x + dx, y) && occupied(x, y + dy) && occupied(x + dx, y + dy)) return false
    }
    return true
  }
  const transformed = new Map<number, Point>()
  const forward = (x: number, y: number): Point => {
    const key = (y - layer.offsetY) * layer.width + x - layer.offsetX
    const cached = transformed.get(key)
    if (cached) return cached
    const dx = x - center.x, dy = y - center.y, distance = Math.hypot(dx, dy)
    let result = { x, y }
    if (distance > 0 && distance < radius) {
      if (options.mode === 'inflate' || options.mode === 'deflate') {
        // The radial inverse mapping is monotone at all supported strengths.
        // Solve its inverse once per thin source pixel, not per output pixel.
        let low = 0, high = radius
        for (let i = 0; i < 20; i++) {
          const mid = (low + high) / 2
          const influence = brushFalloff(mid, radius) * strength
          const mapped = mid * (options.mode === 'inflate' ? 1 - influence * 0.75 : 1 + influence)
          if (mapped < distance) low = mid
          else high = mid
        }
        const scale = (low + high) / (2 * distance)
        result = { x: center.x + dx * scale, y: center.y + dy * scale }
      } else {
        const angle = brushFalloff(distance, radius) * strength * (options.mode === 'twist-clockwise' ? Math.PI / 2 : -Math.PI / 2)
        result = { x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) }
      }
    }
    transformed.set(key, result)
    return result
  }
  let changed = false
  const paint = (x: number, y: number, color: number): void => {
    if (Math.hypot(x - center.x, y - center.y) > radius || (options.selection && !selectionContains(options.selection, x, y)) || (options.mask && maskCoverageAt(options.mask, x, y) <= 0)) return
    const index = layerIndexAt(layer, x, y)
    if (index === null) return
    const current = readLayerPacked(document, layer, index)
    // Retain the inverse warp's existing colors and its overlap ordering.
    if (alpha(current) === 0 && recordPixelKnownCurrent(document, layer, edit, index, current, color)) changed = true
  }
  const left = Math.max(layer.offsetX, Math.floor(center.x - radius))
  const right = Math.min(layer.offsetX + layer.width - 1, Math.ceil(center.x + radius))
  const top = Math.max(layer.offsetY, Math.floor(center.y - radius))
  const bottom = Math.min(layer.offsetY + layer.height - 1, Math.ceil(center.y + radius))
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    if (Math.hypot(x - center.x, y - center.y) > radius || !thin(x, y)) continue
    const color = read(x, y)!
    const from = forward(x, y)
    paint(Math.round(from.x), Math.round(from.y), color)
    // Each undirected source edge is emitted once. No new connection is
    // inferred from two nearby but originally disconnected output pixels.
    for (const [dx, dy] of [[1, 0], [-1, 1], [0, 1], [1, 1]]) {
      const nx = x + dx, ny = y + dy
      if (!thin(nx, ny)) continue
      const to = forward(nx, ny)
      let px = Math.round(from.x), py = Math.round(from.y)
      const tx = Math.round(to.x), ty = Math.round(to.y)
      const sx = px < tx ? 1 : -1, sy = py < ty ? 1 : -1
      const ax = Math.abs(tx - px), ay = -Math.abs(ty - py)
      let error = ax + ay, step = 0
      const total = Math.max(ax, -ay)
      for (;;) {
        paint(px, py, step * 2 <= total ? color : read(nx, ny)!)
        if (px === tx && py === ty) break
        const twice = error * 2
        if (twice >= ay) { error += ay; px += sx }
        if (twice <= ax) { error += ax; py += sy }
        step++
      }
    }
  }
  return changed
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
  const lineStart = Math.max(horizontal ? layer.offsetY : layer.offsetX, Math.ceil((horizontal ? center.y : center.x) - radius))
  const lineEnd = Math.min(horizontal ? layer.offsetY + layer.height - 1 : layer.offsetX + layer.width - 1, Math.floor((horizontal ? center.y : center.x) + radius))
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
    const alongStart = Math.max(horizontal ? layer.offsetX : layer.offsetY, Math.ceil((horizontal ? center.x : center.y) - halfSpan))
    const alongEnd = Math.min(horizontal ? layer.offsetX + layer.width - 1 : layer.offsetY + layer.height - 1, Math.floor((horizontal ? center.x : center.y) + halfSpan))
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
  const rowStart = Math.max(layer.offsetY, Math.ceil(center.y - radius))
  const rowEnd = Math.min(layer.offsetY + layer.height - 1, Math.floor(center.y + radius))
  const columnStart = Math.max(layer.offsetX, Math.ceil(center.x - radius))
  const columnEnd = Math.min(layer.offsetX + layer.width - 1, Math.floor(center.x + radius))
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
  const renderLeft = columnStart
  const renderTop = rowStart
  const renderRight = columnEnd
  const renderBottom = rowEnd
  const readSource = (x: number, y: number): number | undefined => {
    const index = layerIndexAt(layer, x, y)
    return index === null ? undefined : baselinePacked(document, layer, edit, index)
  }
  let changed = false
  for (let y = renderTop; y <= renderBottom; y += 1) for (let x = renderLeft; x <= renderRight; x += 1) {
    if (Math.hypot(x - center.x, y - center.y) > radius) continue
    if ((selection && !selectionContains(selection, x, y)) || (mask && mask.visible !== false && maskCoverageAt(mask, x, y) <= 0)) continue
    const destinationIndex = layerIndexAt(layer, x, y)
    const sourceX = x - (stroke.horizontalDisplacements.get(y) ?? 0)
    const sourceY = y - (stroke.verticalDisplacements.get(x) ?? 0)
    const next = sampleLiquifyPixel(readSource, sourceX, sourceY)
    if (destinationIndex === null || next === undefined) continue
    const current = readLayerPacked(document, layer, destinationIndex)
    if (recordPixelKnownCurrent(document, layer, edit, destinationIndex, current, next)) changed = true
  }
  return { changed, dirtyRect: changed ? { x: renderLeft, y: renderTop, width: renderRight - renderLeft + 1, height: renderBottom - renderTop + 1 } : null }
}

/**
 * Applies a circular inverse-warp dab. Coherent row/column fields retain the
 * pixel-art strip behavior, sampling original colors instead of blending them.
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
  const left = Math.max(layer.offsetX, Math.ceil(center.x - radius))
  const top = Math.max(layer.offsetY, Math.ceil(center.y - radius))
  const right = Math.min(layer.offsetX + layer.width - 1, Math.floor(center.x + radius))
  const bottom = Math.min(layer.offsetY + layer.height - 1, Math.floor(center.y + radius))
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

  return { changed: false, dirtyRect: null }
}

const brushFalloff = (distance: number, radius: number): number => {
  const normalized = Math.min(1, distance / radius)
  return 1 - normalized * normalized * (3 - 2 * normalized)
}

const unionRect = (rect: SelectionRect | null, next: SelectionRect): SelectionRect => {
  if (!rect) return next
  const left = Math.min(rect.x, next.x)
  const top = Math.min(rect.y, next.y)
  const right = Math.max(rect.x + rect.width, next.x + next.width)
  const bottom = Math.max(rect.y + rect.height, next.y + next.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// The last, incomplete dab is a live preview. Replacing it on the next event
// preserves immediate feedback without making event frequency part of the warp.
const restorePushPreview = (document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, stroke: LiquifyPushStroke): SelectionRect | null => {
  const preview = stroke.provisional
  if (!preview) return null
  let changed = false
  const { rect, pixels } = preview
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const index = layerIndexAt(layer, rect.x + x, rect.y + y)!
    if (recordPixelKnownCurrent(document, layer, edit, index, readLayerPacked(document, layer, index), pixels[y * rect.width + x])) changed = true
  }
  stroke.horizontalDisplacements = preview.horizontal
  stroke.verticalDisplacements = preview.vertical
  stroke.axisMode = preview.axisMode
  stroke.maxDisplacement = preview.maxDisplacement
  stroke.provisional = undefined
  return changed ? rect : null
}

const capturePushPreview = (document: SpriteDocument, layer: RasterLayer, stroke: LiquifyPushStroke, center: Point, radius: number): void => {
  const x = Math.max(layer.offsetX, Math.ceil(center.x - radius))
  const y = Math.max(layer.offsetY, Math.ceil(center.y - radius))
  const right = Math.min(layer.offsetX + layer.width - 1, Math.floor(center.x + radius))
  const bottom = Math.min(layer.offsetY + layer.height - 1, Math.floor(center.y + radius))
  const rect = { x, y, width: Math.max(0, right - x + 1), height: Math.max(0, bottom - y + 1) }
  const pixels = new Uint32Array(rect.width * rect.height)
  for (let row = 0; row < rect.height; row++) for (let col = 0; col < rect.width; col++) {
    pixels[row * rect.width + col] = readLayerPacked(document, layer, layerIndexAt(layer, x + col, y + row)!)
  }
  stroke.provisional = { rect, pixels, horizontal: new Map(stroke.horizontalDisplacements), vertical: new Map(stroke.verticalDisplacements), axisMode: stroke.axisMode, maxDisplacement: stroke.maxDisplacement }
}

export function applyLiquifyPushPath(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  stroke: LiquifyPushStroke,
  from: Point,
  points: readonly Point[],
  options: Omit<LiquifyStepOptions, 'mode' | 'pushStroke'>
): LiquifyPushPathResult {
  // Canvas resizing keeps raster layers independent, so a previously 32×32
  // layer can remain smaller than the expanded document. Unlike ordinary
  // brush paths, liquify used to skip this materialization and consequently
  // clipped every deformation to the former layer bounds.
  if (!ensureLayerCoversCanvas(document, layer)) return { changed: false, dabCount: 0, dirtyRect: null }
  const radius = Math.max(1, Math.round(options.radius))
  const strength = Math.max(0, Math.min(1, options.strength / 100))
  if (strength === 0 || points.length === 0) return { changed: false, dabCount: 0, dirtyRect: null }
  if (points.every(point => Math.hypot(point.x - from.x, point.y - from.y) <= 1e-9)) return { changed: false, dabCount: 0, dirtyRect: null }
  const spacing = Math.max(1, radius * PUSH_DAB_SPACING_RATIO)
  let dirtyRect = restorePushPreview(document, layer, edit, stroke)
  let changed = dirtyRect !== null
  const path = stroke.path ??= { sample: { ...from }, remaining: spacing, spacing }
  if (path.spacing !== spacing) { path.remaining = spacing; path.spacing = spacing }
  let dabCount = 0
  const apply = (point: Point): void => {
    const delta = { x: point.x - path.sample.x, y: point.y - path.sample.y }
    const applied = applyPushDab(document, layer, edit, stroke, point, delta, radius, strength, options.selection, options.mask)
    changed = applied.changed || changed
    if (applied.dirtyRect) dirtyRect = unionRect(dirtyRect, applied.dirtyRect)
    dabCount++
    stroke.dabCount++
  }
  let previous = from
  for (const end of points) {
    const dx = end.x - previous.x, dy = end.y - previous.y
    const length = Math.hypot(dx, dy)
    let consumed = 0
    // Fixed arc-length samples span event boundaries. Long segments are fully
    // traversed; truncating at a per-event cap changes the visible stroke.
    while (length > 1e-9 && consumed + path.remaining <= length + 1e-9) {
      consumed = Math.min(length, consumed + path.remaining)
      const ratio = consumed / length
      const point = { x: Math.round((previous.x + dx * ratio) * 1e9) / 1e9, y: Math.round((previous.y + dy * ratio) * 1e9) / 1e9 }
      apply(point)
      path.sample = point
      path.remaining = spacing
    }
    path.remaining -= Math.max(0, length - consumed)
    previous = end
  }
  const end = points.at(-1)!
  if (Math.hypot(end.x - path.sample.x, end.y - path.sample.y) > 1e-9) {
    capturePushPreview(document, layer, stroke, end, radius)
    apply(end)
  }
  return { changed, dabCount, dirtyRect }
}

/** Timed hold impulse. A relocated/reversed brush starts from the current shape,
 * while repeated ticks at one anchor sample one stable source to avoid erosion.
 */
export function applyLiquifyHoldStep(document: SpriteDocument, layer: RasterLayer, edit: PixelEdit, to: Point, options: LiquifyStepOptions): boolean {
  if (options.mode === 'push') return false
  if (!ensureLayerCoversCanvas(document, layer)) return false
  let stroke = holdStrokes.get(edit)
  const radius = Math.max(1, Math.round(options.radius))
  if (!stroke || stroke.mode !== options.mode || stroke.radius !== radius || Math.hypot(to.x - stroke.center.x, to.y - stroke.center.y) >= 0.5) {
    const extent = (options.mode === 'deflate' ? radius * 2 : radius) + 1
    const x = Math.max(layer.offsetX, Math.floor(to.x - extent))
    const y = Math.max(layer.offsetY, Math.floor(to.y - extent))
    const right = Math.min(layer.offsetX + layer.width - 1, Math.ceil(to.x + extent))
    const bottom = Math.min(layer.offsetY + layer.height - 1, Math.ceil(to.y + extent))
    const rect = { x, y, width: Math.max(0, right - x + 1), height: Math.max(0, bottom - y + 1) }
    const pixels = new Uint32Array(rect.width * rect.height)
    for (let row = 0; row < rect.height; row++) for (let col = 0; col < rect.width; col++) {
      pixels[row * rect.width + col] = readLayerPacked(document, layer, layerIndexAt(layer, x + col, y + row)!)
    }
    stroke = { center: { ...to }, mode: options.mode, radius, strength: 0, source: { rect, pixels } }
    holdStrokes.set(edit, stroke)
  }
  const nextStrength = Math.min(100, stroke.strength + Math.max(0, options.strength))
  if (nextStrength === stroke.strength) return false
  stroke.strength = nextStrength
  return applyLiquifyStep(document, layer, edit, stroke.center, stroke.center, { ...options, strength: stroke.strength }, stroke.source)
}

/** Applies a nearest-neighbor local warp while retaining one PixelEdit for the full gesture. */
export function applyLiquifyStep(
  document: SpriteDocument,
  layer: RasterLayer,
  edit: PixelEdit,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: LiquifyStepOptions,
  sourceBaseline?: HoldStroke['source']
): boolean {
  if (!ensureLayerCoversCanvas(document, layer)) return false
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
  const radialPadding = (options.mode === 'deflate' ? radius : 0) + 1
  const sourceLeft = Math.max(layer.offsetX, left - radialPadding)
  const sourceTop = Math.max(layer.offsetY, top - radialPadding)
  const sourceRight = Math.min(layer.offsetX + layer.width - 1, right + radialPadding)
  const sourceBottom = Math.min(layer.offsetY + layer.height - 1, bottom + radialPadding)
  const sourceWidth = Math.max(0, sourceRight - sourceLeft + 1)
  const sourceHeight = Math.max(0, sourceBottom - sourceTop + 1)
  if (sourceWidth === 0 || sourceHeight === 0) return false
  const source = sourceBaseline?.pixels ?? ensureSourceScratch(sourceWidth * sourceHeight)
  if (!sourceBaseline) for (let y = sourceTop; y <= sourceBottom; y += 1) {
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
    const next = sampleLiquifyPixel(sampleSource, sourceX, sourceY)
    if (next !== undefined && recordPixelKnownCurrent(document, layer, edit, index, current, next)) changed = true
  }
  changed = preserveThinSourceEdges(document, layer, edit, sampleSource, to, radius, strength, options) || changed
  return changed
}
