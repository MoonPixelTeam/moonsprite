import { BLEND_MODES, type BlendMode, type RgbaColor } from '@shared/types-color'
import { type AnimationCelSurface } from '@shared/types-animation'
import { type ColorMode, type ImageResizeInterpolation } from '@shared/types-raster'
import { type FreeTileCelData, type FreeTileInstance, type FreeTileSourceLayer, type TilemapQuarterTurns, type Tileset } from '@shared/types-tiles'
import { type SelectionRect } from '@shared/types-selection'
import { blendOver, blendWithMode, relativeLuminanceColor } from './raster'
import { MAX_TILESET_PIXELS, MAX_TILE_SIZE, readTilesetTilePixels } from './tilemap'

export const MAX_FREE_TILE_INSTANCES = 1_048_576
export const MAX_FREE_TILE_COORDINATE = 67_108_864
export const MAX_FREE_TILE_SURFACE_PIXELS = 64 * 1024 * 1024

export type FreeTileDrawingMode = 'paint' | 'edit'

/** Resolved source data used by the renderer. One source always owns one Tileset tile. */
export interface FreeTileSourceRef {
  id: string
  tileset: Tileset
  opacity: number
  visible: boolean
  blendMode: BlendMode
  offsetX: number
  offsetY: number
}

export type FreeTileSourceCollection = Tileset | readonly FreeTileSourceRef[] | ReadonlyMap<string, FreeTileSourceRef>

export type FreeTileInstanceTransform = Pick<FreeTileInstance, 'rotation' | 'flipHorizontal' | 'flipVertical'>

export const freeTileInstanceTransformPoint = (
  transform: FreeTileInstanceTransform,
  x: number,
  y: number
): { x: number; y: number } => {
  let targetX = x
  let targetY = y
  const rotation = transform.rotation ?? 0
  if (rotation === 1) [targetX, targetY] = [-targetY - 1, targetX]
  else if (rotation === 2) [targetX, targetY] = [-targetX - 1, -targetY - 1]
  else if (rotation === 3) [targetX, targetY] = [targetY, -targetX - 1]
  if (transform.flipHorizontal) targetX = -targetX - 1
  if (transform.flipVertical) targetY = -targetY - 1
  return { x: targetX, y: targetY }
}

export const freeTileInstanceInverseTransformPoint = (
  transform: FreeTileInstanceTransform,
  x: number,
  y: number
): { x: number; y: number } => {
  let sourceX = transform.flipHorizontal ? -x - 1 : x
  let sourceY = transform.flipVertical ? -y - 1 : y
  const rotation = transform.rotation ?? 0
  if (rotation === 1) [sourceX, sourceY] = [sourceY, -sourceX - 1]
  else if (rotation === 2) [sourceX, sourceY] = [-sourceX - 1, -sourceY - 1]
  else if (rotation === 3) [sourceX, sourceY] = [-sourceY - 1, sourceX]
  return { x: sourceX, y: sourceY }
}

export const freeTileInstanceTransformBounds = (
  transform: FreeTileInstanceTransform,
  rect: SelectionRect
): SelectionRect => {
  const right = rect.x + rect.width - 1
  const bottom = rect.y + rect.height - 1
  const points = [
    freeTileInstanceTransformPoint(transform, rect.x, rect.y),
    freeTileInstanceTransformPoint(transform, right, rect.y),
    freeTileInstanceTransformPoint(transform, rect.x, bottom),
    freeTileInstanceTransformPoint(transform, right, bottom)
  ]
  const left = Math.min(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const transformedRight = Math.max(...points.map((point) => point.x))
  const transformedBottom = Math.max(...points.map((point) => point.y))
  return { x: left, y: top, width: transformedRight - left + 1, height: transformedBottom - top + 1 }
}

export const freeTileTransformedSourceBounds = (
  transform: FreeTileInstanceTransform,
  source: Pick<FreeTileSourceRef, 'tileset' | 'offsetX' | 'offsetY'>
): SelectionRect => freeTileInstanceTransformBounds(transform, {
  x: source.offsetX,
  y: source.offsetY,
  width: source.tileset.tileWidth,
  height: source.tileset.tileHeight
})

export const transformFreeTileSourcePixels = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  transform: FreeTileInstanceTransform
): { pixels: Uint8ClampedArray; bounds: SelectionRect } => {
  const bounds = freeTileInstanceTransformBounds(transform, { x: offsetX, y: offsetY, width, height })
  const transformed = new Uint8ClampedArray(bounds.width * bounds.height * 4)
  for (let sourceY = 0; sourceY < height; sourceY += 1) for (let sourceX = 0; sourceX < width; sourceX += 1) {
    const target = freeTileInstanceTransformPoint(transform, offsetX + sourceX, offsetY + sourceY)
    const sourceOffset = (sourceY * width + sourceX) * 4
    const targetOffset = ((target.y - bounds.y) * bounds.width + target.x - bounds.x) * 4
    transformed.set(pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset)
  }
  return { pixels: transformed, bounds }
}

const isFreeTileSourceArray = (value: unknown): value is readonly FreeTileSourceRef[] => Array.isArray(value)

const isFreeTileSourceMap = (value: unknown): value is ReadonlyMap<string, FreeTileSourceRef> => value instanceof Map

const validCoordinate = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Math.abs(Number(value)) <= MAX_FREE_TILE_COORDINATE

const normalizeInstanceOpacity = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined

const normalizeInstanceBlendMode = (value: unknown): BlendMode | undefined =>
  typeof value === 'string' && BLEND_MODES.includes(value as BlendMode) ? value as BlendMode : undefined

const normalizeInstanceRotation = (value: unknown): TilemapQuarterTurns | undefined =>
  value === 0 || value === 1 || value === 2 || value === 3 ? value : undefined

const sourceIdForInstance = (instance: FreeTileInstance): string | null => instance.sourceId ?? instance.tileId ?? null

const legacySource = (tileset: Tileset): FreeTileSourceRef => ({
  id: tileset.id,
  tileset,
  opacity: 1,
  visible: true,
  blendMode: 'normal',
  offsetX: 0,
  offsetY: 0
})

export const freeTileSourceRef = (
  source: FreeTileSourceLayer,
  tilesets: readonly Tileset[]
): FreeTileSourceRef | null => {
  const tileset = tilesets.find((candidate) => candidate.id === source.tilesetId)
  if (!tileset) return null
  return {
    id: source.id,
    tileset,
    opacity: Math.max(0, Math.min(1, Number.isFinite(source.opacity) ? source.opacity : 1)),
    visible: source.visible !== false,
    blendMode: source.blendMode ?? 'normal',
    offsetX: Number.isSafeInteger(source.offsetX) ? source.offsetX : 0,
    offsetY: Number.isSafeInteger(source.offsetY) ? source.offsetY : 0
  }
}

export const freeTileSourceRefs = (
  sources: readonly FreeTileSourceLayer[] | undefined,
  tilesets: readonly Tileset[]
): FreeTileSourceRef[] => (sources ?? []).flatMap((source) => {
  const resolved = freeTileSourceRef(source, tilesets)
  return resolved ? [resolved] : []
})

const sourceForInstance = (
  sources: FreeTileSourceCollection,
  instance: FreeTileInstance
): { source: FreeTileSourceRef; tileId: string } | null => {
  if (isFreeTileSourceArray(sources)) {
    const id = sourceIdForInstance(instance)
    if (!id) return null
    const source = sources.find((candidate) => candidate.id === id || candidate.tileset.id === id)
    if (!source) return null
    return { source, tileId: source.tileset.tileIds[0] ?? instance.tileId ?? '' }
  }
  if (isFreeTileSourceMap(sources)) {
    const id = sourceIdForInstance(instance)
    const source = id ? sources.get(id) : undefined
    if (!source) return null
    return { source, tileId: source.tileset.tileIds[0] ?? instance.tileId ?? '' }
  }
  const tileset = sources as Tileset
  const id = instance.tileId ?? instance.sourceId ?? tileset.tileIds[0]
  return id && tileset.tileIds.includes(id) ? { source: legacySource(tileset), tileId: id } : null
}

export const freeTileSourceForInstance = (
  sources: FreeTileSourceCollection,
  instance: FreeTileInstance
): FreeTileSourceRef | null => sourceForInstance(sources, instance)?.source ?? null

/** Returns the topmost instance that references a source, optionally preferring a selected instance. */
export const freeTileInstanceForSource = (
  freeTiles: FreeTileCelData,
  sources: FreeTileSourceCollection,
  sourceId: string,
  preferredInstanceId?: string | null
): FreeTileInstance | null => {
  if (preferredInstanceId) {
    const preferred = freeTiles.instances.find((instance) => instance.id === preferredInstanceId)
    if (preferred && preferred.visible !== false && freeTileSourceForInstance(sources, preferred)?.id === sourceId) return preferred
  }
  for (let index = freeTiles.instances.length - 1; index >= 0; index -= 1) {
    const instance = freeTiles.instances[index]
    if (instance.visible !== false && freeTileSourceForInstance(sources, instance)?.id === sourceId) return instance
  }
  return null
}

export const freeTileInstancesForSource = (
  freeTiles: FreeTileCelData,
  sources: FreeTileSourceCollection,
  sourceId: string
): FreeTileInstance[] => freeTiles.instances.filter((instance) => freeTileSourceForInstance(sources, instance)?.id === sourceId)

/** Empty sources still have an editable anchor even though their rendered tile is transparent. */
export const freeTileSourceHasVisiblePixels = (source: FreeTileSourceRef): boolean => {
  const tileId = source.tileset.tileIds[0]
  const pixels = tileId ? readTilesetTilePixels(source.tileset, tileId) : null
  return Boolean(pixels?.some((value, index) => index % 4 === 3 && value > 0))
}

export const freeTileTileIdForInstance = (
  sources: FreeTileSourceCollection,
  instance: FreeTileInstance
): string | null => sourceForInstance(sources, instance)?.tileId ?? null

export const cloneFreeTileInstance = (instance: FreeTileInstance): FreeTileInstance => ({ ...instance })

export const cloneFreeTileCelData = (freeTiles: FreeTileCelData): FreeTileCelData => ({
  instances: freeTiles.instances.map(cloneFreeTileInstance)
})

export const createFreeTileCelData = (): FreeTileCelData => ({ instances: [] })

export const normalizeFreeTileCelData = (
  value: unknown,
  sources?: FreeTileSourceCollection,
  strict = false
): FreeTileCelData | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<FreeTileCelData>
  if (!Array.isArray(candidate.instances) || candidate.instances.length > MAX_FREE_TILE_INSTANCES) return null
  const ids = new Set<string>()
  const instances: FreeTileInstance[] = []
  for (const value of candidate.instances) {
    if (!value || typeof value !== 'object') {
      if (strict) return null
      continue
    }
    const instance = value as Partial<FreeTileInstance>
    const sourceId = typeof instance.sourceId === 'string' && instance.sourceId ? instance.sourceId : undefined
    const tileId = typeof instance.tileId === 'string' && instance.tileId ? instance.tileId : undefined
    const sourceCandidate = sourceId ?? tileId
    const sourceExists = sources
      ? Boolean(sourceCandidate && (isFreeTileSourceArray(sources)
        ? sources.some((source) => source.id === sourceCandidate || source.tileset.id === sourceCandidate || source.tileset.tileIds.includes(sourceCandidate))
        : isFreeTileSourceMap(sources) ? sources.has(sourceCandidate) : (sources as Tileset).tileIds.includes(sourceCandidate)))
      : Boolean(sourceCandidate)
    if (typeof instance.id !== 'string' || !instance.id || ids.has(instance.id)
      || !sourceExists || !validCoordinate(instance.x) || !validCoordinate(instance.y)) {
      if (strict) return null
      continue
    }
    const opacity = normalizeInstanceOpacity(instance.opacity)
    const blendMode = normalizeInstanceBlendMode(instance.blendMode)
    const rotation = normalizeInstanceRotation(instance.rotation)
    if (strict && ((instance.visible !== undefined && typeof instance.visible !== 'boolean')
      || (instance.locked !== undefined && typeof instance.locked !== 'boolean')
      || (instance.opacity !== undefined && opacity === undefined)
      || (instance.blendMode !== undefined && blendMode === undefined)
      || (instance.rotation !== undefined && rotation === undefined)
      || (instance.flipHorizontal !== undefined && typeof instance.flipHorizontal !== 'boolean')
      || (instance.flipVertical !== undefined && typeof instance.flipVertical !== 'boolean'))) return null
    ids.add(instance.id)
    const state = { visible: instance.visible !== false, locked: instance.locked === true }
    const appearance = {
      ...(opacity === undefined ? {} : { opacity }),
      ...(blendMode === undefined ? {} : { blendMode })
    }
    const transform = {
      ...(rotation ? { rotation } : {}),
      ...(instance.flipHorizontal === true ? { flipHorizontal: true } : {}),
      ...(instance.flipVertical === true ? { flipVertical: true } : {})
    }
    if (sources && isFreeTileSourceArray(sources)) {
      const source = sources.find((candidate) => candidate.id === sourceCandidate || candidate.tileset.id === sourceCandidate || candidate.tileset.tileIds.includes(sourceCandidate!))
      instances.push({ id: instance.id, sourceId: source?.id ?? sourceCandidate, x: instance.x, y: instance.y, ...state, ...appearance, ...transform })
    } else if (sources && isFreeTileSourceMap(sources)) {
      instances.push({ id: instance.id, sourceId: sourceCandidate, x: instance.x, y: instance.y, ...state, ...appearance, ...transform })
    } else {
      instances.push({ id: instance.id, tileId: sourceCandidate, x: instance.x, y: instance.y, ...state, ...appearance, ...transform })
    }
  }
  return { instances }
}

const sourceSize = (sources: FreeTileSourceCollection, instance: FreeTileInstance): { width: number; height: number } | null => {
  const source = sourceForInstance(sources, instance)?.source
  return source ? { width: source.tileset.tileWidth, height: source.tileset.tileHeight } : null
}

export const freeTileInstanceBounds = (
  instance: FreeTileInstance,
  sources: FreeTileSourceCollection | Pick<Tileset, 'tileWidth' | 'tileHeight'>,
  offsetX = 0,
  offsetY = 0
): SelectionRect => {
  const source = isFreeTileSourceArray(sources) || isFreeTileSourceMap(sources) ? freeTileSourceForInstance(sources, instance) : null
  const size = source
    ? { width: source.tileset.tileWidth, height: source.tileset.tileHeight }
    : 'tileIds' in sources
      ? sourceSize(sources, instance) ?? { width: sources.tileWidth, height: sources.tileHeight }
      : { width: (sources as Pick<Tileset, 'tileWidth' | 'tileHeight'>).tileWidth, height: (sources as Pick<Tileset, 'tileWidth' | 'tileHeight'>).tileHeight }
  const transformed = freeTileInstanceTransformBounds(instance, {
    x: source?.offsetX ?? 0,
    y: source?.offsetY ?? 0,
    width: size.width,
    height: size.height
  })
  return {
    x: offsetX + instance.x + transformed.x,
    y: offsetY + instance.y + transformed.y,
    width: transformed.width,
    height: transformed.height
  }
}

export const freeTileSourcePointForInstance = (
  instance: FreeTileInstance,
  source: FreeTileSourceRef,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0
): { x: number; y: number } | null => {
  const transformedX = Math.floor(x) - offsetX - instance.x
  const transformedY = Math.floor(y) - offsetY - instance.y
  const canonical = freeTileInstanceInverseTransformPoint(instance, transformedX, transformedY)
  const sourceX = canonical.x - source.offsetX
  const sourceY = canonical.y - source.offsetY
  return sourceX >= 0 && sourceY >= 0 && sourceX < source.tileset.tileWidth && sourceY < source.tileset.tileHeight
    ? { x: sourceX, y: sourceY }
    : null
}

export const freeTileStampOrigin = (
  x: number,
  y: number,
  source: Pick<Tileset, 'tileWidth' | 'tileHeight'>,
  offsetX = 0,
  offsetY = 0
): { x: number; y: number } => ({
  x: Math.floor(x) - offsetX - Math.floor(source.tileWidth / 2),
  y: Math.floor(y) - offsetY - Math.floor(source.tileHeight / 2)
})

export const freeTileSourceStampOrigin = (
  x: number,
  y: number,
  source: FreeTileSourceRef,
  offsetX = 0,
  offsetY = 0
): { x: number; y: number } => ({
  x: Math.floor(x) - offsetX - Math.floor(source.tileset.tileWidth / 2) - source.offsetX,
  y: Math.floor(y) - offsetY - Math.floor(source.tileset.tileHeight / 2) - source.offsetY
})

export const freeTileInstanceAtPoint = (
  freeTiles: FreeTileCelData,
  sources: FreeTileSourceCollection,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0
): FreeTileInstance | null => {
  for (let index = freeTiles.instances.length - 1; index >= 0; index -= 1) {
    const instance = freeTiles.instances[index]
    if (instance.visible === false) continue
    const source = freeTileSourceForInstance(sources, instance)
    if (!source) continue
    if (freeTileSourcePointForInstance(instance, source, x, y, offsetX, offsetY)) return instance
  }
  return null
}

export interface FreeTileSourceEditTarget {
  instance: FreeTileInstance | null
  blockedByOtherSource: boolean
}

/** Keeps source editing scoped to the selected source, even when sources overlap. */
export const freeTileSourceEditTargetAtPoint = (
  freeTiles: FreeTileCelData,
  sources: FreeTileSourceCollection,
  selectedSourceId: string,
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
  preferredInstanceId?: string | null
): FreeTileSourceEditTarget => {
  if (preferredInstanceId) {
    const preferred = freeTiles.instances.find((instance) => instance.id === preferredInstanceId)
    if (preferred && freeTileSourceForInstance(sources, preferred)?.id === selectedSourceId) {
      return { instance: preferred, blockedByOtherSource: false }
    }
  }
  const hit = freeTileInstanceAtPoint(freeTiles, sources, x, y, offsetX, offsetY)
  const hitSource = hit ? freeTileSourceForInstance(sources, hit) : null
  if (hit && hitSource?.id !== selectedSourceId) return { instance: null, blockedByOtherSource: true }
  return {
    instance: hit ?? freeTileInstanceForSource(freeTiles, sources, selectedSourceId, preferredInstanceId),
    blockedByOtherSource: false
  }
}

const writeRgba = (pixels: Uint8ClampedArray, index: number, color: RgbaColor): void => {
  const offset = index * 4
  pixels[offset] = color.r
  pixels[offset + 1] = color.g
  pixels[offset + 2] = color.b
  pixels[offset + 3] = color.a
}

const readRgba = (pixels: Uint8ClampedArray, index: number): RgbaColor => {
  const offset = index * 4
  return { r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] }
}

const renderFreeTileRgba = (
  freeTiles: FreeTileCelData,
  sources: FreeTileSourceCollection,
  width: number,
  height: number,
  mode: ColorMode
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (const instance of freeTiles.instances) {
    if (instance.visible === false) continue
    const resolved = sourceForInstance(sources, instance)
    const opacity = normalizeInstanceOpacity(instance.opacity) ?? resolved?.source.opacity ?? 1
    const blendMode = instance.blendMode ?? resolved?.source.blendMode ?? 'normal'
    if (!resolved || !resolved.source.visible || opacity <= 0) continue
    const sourcePixels = readTilesetTilePixels(resolved.source.tileset, resolved.tileId)
    if (!sourcePixels) continue
    const sourceWidth = resolved.source.tileset.tileWidth
    const sourceHeight = resolved.source.tileset.tileHeight
    for (let tileY = 0; tileY < sourceHeight; tileY += 1) for (let tileX = 0; tileX < sourceWidth; tileX += 1) {
      const sourceOffset = (tileY * sourceWidth + tileX) * 4
      if (sourcePixels[sourceOffset + 3] === 0) continue
      const transformed = freeTileInstanceTransformPoint(
        instance,
        resolved.source.offsetX + tileX,
        resolved.source.offsetY + tileY
      )
      const targetX = instance.x + transformed.x
      const targetY = instance.y + transformed.y
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue
      const targetIndex = targetY * width + targetX
      const sourceColor = { r: sourcePixels[sourceOffset], g: sourcePixels[sourceOffset + 1], b: sourcePixels[sourceOffset + 2], a: sourcePixels[sourceOffset + 3] }
      const color = mode === 'grayscale' ? relativeLuminanceColor(sourceColor) : sourceColor
      const bottom = readRgba(pixels, targetIndex)
      writeRgba(pixels, targetIndex, blendMode === 'normal'
        ? blendOver(bottom, color, opacity)
        : blendWithMode(bottom, color, opacity, blendMode))
    }
  }
  return pixels
}

export const renderFreeTileSurface = (
  freeTiles: FreeTileCelData,
  sources: FreeTileSourceCollection,
  mode: ColorMode,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
  colorToPaletteId?: (color: RgbaColor) => number
): AnimationCelSurface => {
  const pixelCount = width * height
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !Number.isSafeInteger(pixelCount) || pixelCount > MAX_FREE_TILE_SURFACE_PIXELS) throw new Error('Free Tile surface is too large')
  const rgba = renderFreeTileRgba(freeTiles, sources, width, height, mode)
  if (mode !== 'indexed') return { format: 'rgba', width, height, offsetX, offsetY, pixels: rgba }
  const pixels = new Uint32Array(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    const color = readRgba(rgba, index)
    if (color.a > 0) pixels[index] = colorToPaletteId?.(color) ?? 0
  }
  return { format: 'indexed', width, height, offsetX, offsetY, pixels }
}

const resizeFreeTilePixels = (
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  interpolation: ImageResizeInterpolation
): Uint8ClampedArray => {
  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  if (interpolation === 'nearest') {
    for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / targetWidth))
      const sourceY = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / targetHeight))
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
      target.set(source.subarray(sourceOffset, sourceOffset + 4), (y * targetWidth + x) * 4)
    }
    return target
  }
  const sample = (x: number, y: number): [number, number, number, number] => {
    const offset = (Math.max(0, Math.min(sourceHeight - 1, y)) * sourceWidth + Math.max(0, Math.min(sourceWidth - 1, x))) * 4
    const alpha = source[offset + 3] / 255
    return [source[offset] * alpha, source[offset + 1] * alpha, source[offset + 2] * alpha, alpha]
  }
  for (let y = 0; y < targetHeight; y += 1) for (let x = 0; x < targetWidth; x += 1) {
    const sourceX = (x + 0.5) * sourceWidth / targetWidth - 0.5
    const sourceY = (y + 0.5) * sourceHeight / targetHeight - 0.5
    const left = Math.floor(sourceX)
    const top = Math.floor(sourceY)
    const fractionX = sourceX - left
    const fractionY = sourceY - top
    const topLeft = sample(left, top)
    const topRight = sample(left + 1, top)
    const bottomLeft = sample(left, top + 1)
    const bottomRight = sample(left + 1, top + 1)
    const interpolate = (a: number, b: number, amount: number): number => a + (b - a) * amount
    const channel = (index: number): number => interpolate(interpolate(topLeft[index], topRight[index], fractionX), interpolate(bottomLeft[index], bottomRight[index], fractionX), fractionY)
    const alpha = channel(3)
    const offset = (y * targetWidth + x) * 4
    target[offset] = alpha > 0 ? Math.round(channel(0) / alpha) : 0
    target[offset + 1] = alpha > 0 ? Math.round(channel(1) / alpha) : 0
    target[offset + 2] = alpha > 0 ? Math.round(channel(2) / alpha) : 0
    target[offset + 3] = Math.round(alpha * 255)
  }
  return target
}

/** Legacy helper retained for old projects and image-resize migration. */
export const resizeFreeTileTileset = (
  tileset: Tileset,
  tileWidth: number,
  tileHeight: number,
  interpolation: ImageResizeInterpolation
): void => {
  if (!Number.isSafeInteger(tileWidth) || !Number.isSafeInteger(tileHeight) || tileWidth < 1 || tileHeight < 1
    || tileWidth > MAX_TILE_SIZE || tileHeight > MAX_TILE_SIZE
    || tileset.columns * tileset.rows * tileWidth * tileHeight > MAX_TILESET_PIXELS) throw new Error('Free Tile source size is too large')
  if (tileWidth === tileset.tileWidth && tileHeight === tileset.tileHeight) return
  const sheetWidth = tileset.columns * tileWidth
  const pixels = new Uint8ClampedArray(sheetWidth * tileset.rows * tileHeight * 4)
  for (let index = 0; index < tileset.tileIds.length; index += 1) {
    const source = readTilesetTilePixels(tileset, tileset.tileIds[index])
    if (!source) continue
    const resized = resizeFreeTilePixels(source, tileset.tileWidth, tileset.tileHeight, tileWidth, tileHeight, interpolation)
    const column = index % tileset.columns
    const row = Math.floor(index / tileset.columns)
    for (let y = 0; y < tileHeight; y += 1) {
      const sourceOffset = y * tileWidth * 4
      const targetOffset = ((row * tileHeight + y) * sheetWidth + column * tileWidth) * 4
      pixels.set(resized.subarray(sourceOffset, sourceOffset + tileWidth * 4), targetOffset)
    }
  }
  tileset.tileWidth = tileWidth
  tileset.tileHeight = tileHeight
  tileset.pixels = pixels
}

export const freeTileCelDataEqual = (left: FreeTileCelData, right: FreeTileCelData): boolean =>
  left.instances.length === right.instances.length
  && left.instances.every((instance, index) => {
    const other = right.instances[index]
    return instance.id === other.id
      && (instance.sourceId ?? instance.tileId) === (other.sourceId ?? other.tileId)
      && instance.x === other.x && instance.y === other.y
      && (instance.visible !== false) === (other.visible !== false)
      && (instance.locked === true) === (other.locked === true)
      // Keep omitted appearance fields distinct from explicit defaults. Legacy
      // sources can supply the effective value for omitted instance fields.
      && instance.opacity === other.opacity
      && instance.blendMode === other.blendMode
      && (instance.rotation ?? 0) === (other.rotation ?? 0)
      && Boolean(instance.flipHorizontal) === Boolean(other.flipHorizontal)
      && Boolean(instance.flipVertical) === Boolean(other.flipVertical)
  })
