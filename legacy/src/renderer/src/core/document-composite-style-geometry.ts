import type { RasterLayer } from '@shared/types-layer'
import type { LayerStyles } from '@shared/types-layer-style'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { lazyRuntimeRasterForSurface, readSurfacePackedLocal } from './runtime-raster'
import { type LayerStyleBinaryStrokeMetric } from './layer-styles'
import { unionSelectionRects } from './document-composite-plan'

interface BinaryDistanceField {
  bounds: SelectionRect
  distances: Uint8Array
}

const UNREACHABLE_BINARY_DISTANCE = 0xff

const incrementBinaryDistance = (value: number): number =>
  value >= UNREACHABLE_BINARY_DISTANCE ? UNREACHABLE_BINARY_DISTANCE : value + 1

const expandLocalRect = (rect: SelectionRect, amount: number): SelectionRect => ({
  x: rect.x - amount,
  y: rect.y - amount,
  width: rect.width + amount * 2,
  height: rect.height + amount * 2
})

// Layer style radii are capped at 32px. A byte is enough for every useful
// distance and keeps the cached field half the size of the old Uint16 field.
const binaryChebyshevDistanceFieldFromMask = (
  bounds: SelectionRect,
  maskBounds: SelectionRect,
  mask: Uint8Array,
  seed: 0 | 255
): BinaryDistanceField => {
  const distances = new Uint8Array(bounds.width * bounds.height)
  distances.fill(seed === 0 ? 0 : UNREACHABLE_BINARY_DISTANCE)
  const overlapLeft = Math.max(bounds.x, maskBounds.x)
  const overlapTop = Math.max(bounds.y, maskBounds.y)
  const overlapRight = Math.min(bounds.x + bounds.width, maskBounds.x + maskBounds.width)
  const overlapBottom = Math.min(bounds.y + bounds.height, maskBounds.y + maskBounds.height)
  for (let y = overlapTop; y < overlapBottom; y += 1) {
    const sourceRow = (y - maskBounds.y) * maskBounds.width
    const targetRow = (y - bounds.y) * bounds.width
    for (let x = overlapLeft; x < overlapRight; x += 1) {
      const targetIndex = targetRow + x - bounds.x
      if (mask[sourceRow + x - maskBounds.x] === seed) distances[targetIndex] = 0
      else if (seed === 0) distances[targetIndex] = UNREACHABLE_BINARY_DISTANCE
    }
  }
  for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
    const index = y * bounds.width + x
    let distance = distances[index]
    if (x > 0) distance = Math.min(distance, incrementBinaryDistance(distances[index - 1]))
    if (y > 0) {
      const previousRow = index - bounds.width
      distance = Math.min(distance, incrementBinaryDistance(distances[previousRow]))
      if (x > 0) distance = Math.min(distance, incrementBinaryDistance(distances[previousRow - 1]))
      if (x + 1 < bounds.width) distance = Math.min(distance, incrementBinaryDistance(distances[previousRow + 1]))
    }
    distances[index] = distance
  }
  for (let y = bounds.height - 1; y >= 0; y -= 1) for (let x = bounds.width - 1; x >= 0; x -= 1) {
    const index = y * bounds.width + x
    let distance = distances[index]
    if (x + 1 < bounds.width) distance = Math.min(distance, incrementBinaryDistance(distances[index + 1]))
    if (y + 1 < bounds.height) {
      const nextRow = index + bounds.width
      distance = Math.min(distance, incrementBinaryDistance(distances[nextRow]))
      if (x > 0) distance = Math.min(distance, incrementBinaryDistance(distances[nextRow - 1]))
      if (x + 1 < bounds.width) distance = Math.min(distance, incrementBinaryDistance(distances[nextRow + 1]))
    }
    distances[index] = distance
  }
  return { bounds, distances }
}

const binaryAxisDistanceFieldFromMask = (
  bounds: SelectionRect,
  maskBounds: SelectionRect,
  mask: Uint8Array,
  seed: 0 | 255,
  metric: Exclude<LayerStyleBinaryStrokeMetric, 'square'>
): BinaryDistanceField => {
  const distances = new Uint8Array(bounds.width * bounds.height)
  distances.fill(seed === 0 ? 0 : UNREACHABLE_BINARY_DISTANCE)
  const overlapLeft = Math.max(bounds.x, maskBounds.x)
  const overlapTop = Math.max(bounds.y, maskBounds.y)
  const overlapRight = Math.min(bounds.x + bounds.width, maskBounds.x + maskBounds.width)
  const overlapBottom = Math.min(bounds.y + bounds.height, maskBounds.y + maskBounds.height)
  for (let y = overlapTop; y < overlapBottom; y += 1) {
    const sourceRow = (y - maskBounds.y) * maskBounds.width
    const targetRow = (y - bounds.y) * bounds.width
    for (let x = overlapLeft; x < overlapRight; x += 1) {
      const targetIndex = targetRow + x - bounds.x
      if (mask[sourceRow + x - maskBounds.x] === seed) distances[targetIndex] = 0
      else if (seed === 0) distances[targetIndex] = UNREACHABLE_BINARY_DISTANCE
    }
  }
  const horizontal = metric === 'horizontal' || metric === 'cardinal'
  const vertical = metric === 'vertical' || metric === 'cardinal'

  if (horizontal) for (let y = 0; y < bounds.height; y += 1) {
    let distance = UNREACHABLE_BINARY_DISTANCE
    for (let x = 0; x < bounds.width; x += 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      distances[index] = distance
    }
    distance = UNREACHABLE_BINARY_DISTANCE
    for (let x = bounds.width - 1; x >= 0; x -= 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      if (distance < distances[index]) distances[index] = distance
    }
  }

  if (vertical) for (let x = 0; x < bounds.width; x += 1) {
    let distance = UNREACHABLE_BINARY_DISTANCE
    for (let y = 0; y < bounds.height; y += 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      if (distance < distances[index]) distances[index] = distance
    }
    distance = UNREACHABLE_BINARY_DISTANCE
    for (let y = bounds.height - 1; y >= 0; y -= 1) {
      const index = y * bounds.width + x
      distance = distances[index] === 0 ? 0 : incrementBinaryDistance(distance)
      if (distance < distances[index]) distances[index] = distance
    }
  }
  return { bounds, distances }
}

const binaryDistanceFieldFromMaskMetric = (
  bounds: SelectionRect,
  maskBounds: SelectionRect,
  mask: Uint8Array,
  seed: 0 | 255,
  metric: LayerStyleBinaryStrokeMetric
): BinaryDistanceField => metric === 'square'
  ? binaryChebyshevDistanceFieldFromMask(bounds, maskBounds, mask, seed)
  : binaryAxisDistanceFieldFromMask(bounds, maskBounds, mask, seed, metric)

interface LocalBinaryStyleFields {
  shadow: BinaryDistanceField | null
  innerGlow: BinaryDistanceField | null
  strokeOutside: BinaryDistanceField | null
  strokeInside: BinaryDistanceField | null
}

/** Packed style evaluation is only valid when every enabled geometric effect
 * has a matching distance field. Custom stroke direction masks deliberately
 * fall back to the pixel-accurate evaluator. */
export const hasCompleteBinaryStyleCoverage = (
  styles: LayerStyles,
  fields: Pick<LocalBinaryStyleFields, 'shadow' | 'innerGlow' | 'strokeOutside' | 'strokeInside'> | null
): boolean => Boolean(fields)
  && (!styles.shadow.enabled || styles.shadow.blur <= 0 || Boolean(fields!.shadow))
  && (!styles.innerGlow.enabled || Boolean(fields!.innerGlow))
  && (!styles.stroke.enabled || styles.stroke.position === 'inside' || Boolean(fields!.strokeOutside))
  && (!styles.stroke.enabled || styles.stroke.position === 'outside' || Boolean(fields!.strokeInside))

const localTranslatedRect = (rect: SelectionRect, x: number, y: number): SelectionRect => ({
  x: rect.x + x,
  y: rect.y + y,
  width: rect.width,
  height: rect.height
})

export const localBinaryStyleFields = (
  document: SpriteDocument,
  layer: RasterLayer,
  affected: SelectionRect,
  styles: LayerStyles,
  strokeMetric: LayerStyleBinaryStrokeMetric | null
): LocalBinaryStyleFields | null => {
  const indexedAlpha = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, entry.color.a]))
    : null
  const rgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
    ? layer.pixels
    : null
  const alphaAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return 0
    if (x + layer.offsetX < 0 || y + layer.offsetY < 0
      || x + layer.offsetX >= document.width || y + layer.offsetY >= document.height) return 0
    const sourceIndex = y * layer.width + x
    if (rgbaPixels) return rgbaPixels[sourceIndex * 4 + 3]
    const packed = readSurfacePackedLocal(layer, x, y)
    return layer.format === 'rgba' ? packed >>> 24 : (indexedAlpha!.get(packed) ?? 0)
  }
  let dependencyBounds: SelectionRect | null = null
  const include = (rect: SelectionRect): void => {
    dependencyBounds = dependencyBounds ? unionSelectionRects(dependencyBounds, rect) : rect
  }
  const shadowBounds = styles.shadow.enabled && styles.shadow.blur > 0
    ? expandLocalRect(localTranslatedRect(affected, -styles.shadow.offsetX, -styles.shadow.offsetY), styles.shadow.blur)
    : null
  const innerGlowBounds = styles.innerGlow.enabled
    ? expandLocalRect(affected, styles.innerGlow.size)
    : null
  const strokeBounds = strokeMetric && styles.stroke.enabled
    ? expandLocalRect(affected, styles.stroke.size)
    : null
  if (shadowBounds) include(shadowBounds)
  if (innerGlowBounds) include(innerGlowBounds)
  if (strokeBounds) include(strokeBounds)
  const dependencies = dependencyBounds as SelectionRect | null
  if (dependencies === null) return { shadow: null, innerGlow: null, strokeOutside: null, strokeInside: null }

  const dependencyMask = new Uint8Array(Math.max(0, dependencies.width * dependencies.height))
  for (let y = dependencies.y; y < dependencies.y + dependencies.height; y += 1) {
    const row = (y - dependencies.y) * dependencies.width
    for (let x = dependencies.x; x < dependencies.x + dependencies.width; x += 1) {
      const alpha = alphaAt(x, y)
      if (alpha !== 0 && alpha !== 255) return null
      dependencyMask[row + x - dependencies.x] = alpha
    }
  }
  type FieldRequest = { bounds: SelectionRect; seed: 0 | 255; metric: LayerStyleBinaryStrokeMetric }
  const requests = {
    shadow: shadowBounds ? { bounds: shadowBounds, seed: 255 as const, metric: 'square' as const } : null,
    innerGlow: innerGlowBounds ? { bounds: innerGlowBounds, seed: 0 as const, metric: 'square' as const } : null,
    strokeOutside: strokeBounds && strokeMetric && styles.stroke.position !== 'inside'
      ? { bounds: strokeBounds, seed: 255 as const, metric: strokeMetric }
      : null,
    strokeInside: strokeBounds && strokeMetric && styles.stroke.position !== 'outside'
      ? { bounds: strokeBounds, seed: 0 as const, metric: strokeMetric }
      : null
  }
  const groupedBounds = new Map<string, { bounds: SelectionRect; seed: 0 | 255; metric: LayerStyleBinaryStrokeMetric }>()
  for (const request of Object.values(requests) as Array<FieldRequest | null>) {
    if (!request) continue
    const key = `${request.seed}:${request.metric}`
    const group = groupedBounds.get(key)
    groupedBounds.set(key, group
      ? { ...group, bounds: unionSelectionRects(group.bounds, request.bounds) }
      : request)
  }
  const groupedFields = new Map<string, BinaryDistanceField>()
  for (const [key, request] of groupedBounds) {
    groupedFields.set(key, binaryDistanceFieldFromMaskMetric(request.bounds, dependencies, dependencyMask, request.seed, request.metric))
  }
  const fieldFor = (request: FieldRequest | null): BinaryDistanceField | null => request
    ? groupedFields.get(`${request.seed}:${request.metric}`) ?? null
    : null
  const shadow = fieldFor(requests.shadow)
  const innerGlow = fieldFor(requests.innerGlow)
  const strokeOutside = fieldFor(requests.strokeOutside)
  const strokeInside = fieldFor(requests.strokeInside)
  return { shadow, innerGlow, strokeOutside, strokeInside }
}

export const distanceFieldAt = (field: BinaryDistanceField | null, x: number, y: number): number => {
  if (!field) return UNREACHABLE_BINARY_DISTANCE
  const localX = x - field.bounds.x
  const localY = y - field.bounds.y
  if (localX < 0 || localY < 0 || localX >= field.bounds.width || localY >= field.bounds.height) return UNREACHABLE_BINARY_DISTANCE
  return field.distances[localY * field.bounds.width + localX]
}

export const localRectForLayer = (rect: SelectionRect, layer: RasterLayer): SelectionRect => ({
  x: rect.x - layer.offsetX,
  y: rect.y - layer.offsetY,
  width: rect.width,
  height: rect.height
})

export const visibleBoundsWithinLocalRect = (document: SpriteDocument, layer: RasterLayer, rect: SelectionRect): SelectionRect | null => {
  const left = Math.max(0, Math.floor(rect.x))
  const top = Math.max(0, Math.floor(rect.y))
  const right = Math.min(layer.width, Math.ceil(rect.x + rect.width))
  const bottom = Math.min(layer.height, Math.ceil(rect.y + rect.height))
  if (right <= left || bottom <= top) return null
  const indexedAlpha = layer.format === 'indexed'
    ? new Map(document.palette.map((entry) => [entry.id, entry.color.a]))
    : null
  const rgbaPixels = layer.format === 'rgba' && !lazyRuntimeRasterForSurface(layer)
    ? layer.pixels
    : null
  let minX = right
  let minY = bottom
  let maxX = left - 1
  let maxY = top - 1
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const sourceIndex = y * layer.width + x
      const alpha = rgbaPixels
        ? rgbaPixels[sourceIndex * 4 + 3]
        : (() => {
            const packed = readSurfacePackedLocal(layer, x, y)
            return layer.format === 'rgba' ? packed >>> 24 : (indexedAlpha!.get(packed) ?? 0)
          })()
      if (alpha === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX < minX || maxY < minY ? null : {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

/**
 * Updates a known content bound from a source dirty region without rescanning
 * the whole layer. The previous bound is intentionally retained when pixels
 * are erased from its edge; it is a safe superset and avoids a full scan on
 * every stroke. A later edit that reaches a new edge expands the superset.
 */
export const incrementalContentBounds = (
  document: SpriteDocument,
  layer: RasterLayer,
  previous: SelectionRect | null,
  dirtyLocal: SelectionRect
): SelectionRect | null => {
  const changedBounds = visibleBoundsWithinLocalRect(document, layer, dirtyLocal)
  if (!previous) return changedBounds
  return changedBounds ? unionSelectionRects(previous, changedBounds) : { ...previous }
}

export const intersectRect = (left: SelectionRect, right: SelectionRect): SelectionRect | null => {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const rightEdge = Math.min(left.x + left.width, right.x + right.width)
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height)
  return rightEdge > x && bottomEdge > y
    ? { x, y, width: rightEdge - x, height: bottomEdge - y }
    : null
}
