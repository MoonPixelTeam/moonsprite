import type { AnimationCel, AnimationCelSurface } from '@shared/types-animation'
import type { FreeTileCelData, FreeTileInstance, FreeTileSourceLayer, Tileset } from '@shared/types-tiles'
import type { ImageResizeInterpolation } from '@shared/types-raster'
import type { PaletteEntry } from '@shared/types-color'
import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { ensureAnimationDocument, refreshActiveAnimationFrame } from './animation'
import { createId, markRasterStorageContentChanged, markRasterSurfaceContentChanged, paletteColorIdForCanvas, rasterContentBounds } from './document-model'
import { cloneFreeTileCelData, createFreeTileCelData, freeTileInstanceAtPoint, freeTileSourceRefs, renderFreeTileSurface, resizeFreeTileTileset, type FreeTileSourceRef } from './free-tile'
import { createBlankTileset, MAX_TILESET_PIXELS, MAX_TILE_SIZE, readTilesetTilePixels } from './tilemap'
import { unpackColor } from './raster'
import { readSurfacePackedLocal } from './runtime-raster'

export interface FreeTileCelTarget {
  layer: RasterLayer
  cel: AnimationCel
  source: AnimationCel
  freeTiles: FreeTileCelData
  surface: AnimationCelSurface
  tileset: Tileset
  sources: FreeTileSourceRef[]
}

export interface FreeTileLayerTileset {
  layer: RasterLayer
  tileset: Tileset
  source?: FreeTileSourceLayer
}

export interface FreeTileSourceOwner {
  layer: RasterLayer
  source: FreeTileSourceLayer
  tileset: Tileset
}

const cloneFreeTileSource = (source: FreeTileSourceLayer): FreeTileSourceLayer => ({
  ...source,
  displayColor: source.displayColor ? { ...source.displayColor } : undefined
})

export const freeTileSetIdForLayer = (layer: RasterLayer): string | null =>
  layer.kind === 'free-tile' ? layer.freeTileSetId ?? layer.id : null

export const freeTileLayersForSet = (document: SpriteDocument, setId: string | null | undefined): RasterLayer[] => {
  if (!setId) return []
  return document.layers.filter((layer) => layer.kind === 'free-tile' && freeTileSetIdForLayer(layer) === setId)
}

export const replaceFreeTileSetSources = (
  document: SpriteDocument,
  layer: RasterLayer,
  sources: readonly FreeTileSourceLayer[]
): RasterLayer[] => {
  if (layer.kind !== 'free-tile') return []
  layer.freeTileSetId ??= createId('free-tile-set')
  const members = freeTileLayersForSet(document, layer.freeTileSetId)
  if (!members.includes(layer)) members.push(layer)
  const sharedSources = sources.map(cloneFreeTileSource)
  for (const member of members) member.freeTileSources = sharedSources
  return members
}

export interface FreeTilePlacementEdit {
  layerId: string
  frameId: string
  before: FreeTileCelData
  after: FreeTileCelData
  dirtyRect: SelectionRect | null
}

export interface FreeTileSourceEditSnapshot {
  sourceId: string
  tilesetId: string
  width: number
  height: number
  pixels: Uint8ClampedArray
  offsetX: number
  offsetY: number
}

export interface FreeTileRasterStamp {
  x: number
  y: number
  width: number
  height: number
  pixels: Uint8ClampedArray
}

/** Converts visible raster content into source-sized chunks while retaining canvas coordinates. */
export const rasterSurfaceToFreeTileStamps = (
  surface: AnimationCelSurface,
  palette: readonly PaletteEntry[] = []
): FreeTileRasterStamp[] => {
  const bounds = rasterContentBounds(surface, palette)
  if (!bounds) return []
  const paletteById = surface.format === 'indexed' ? new Map(palette.map((entry) => [entry.id, entry.color])) : null
  const colorAt = (x: number, y: number) => surface.format === 'rgba'
    ? unpackColor(readSurfacePackedLocal(surface, x, y))
    : paletteById?.get(readSurfacePackedLocal(surface, x, y)) ?? { r: 0, g: 0, b: 0, a: 0 }
  const stamps: FreeTileRasterStamp[] = []
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height
  for (let chunkY = bounds.y; chunkY < bottom; chunkY += MAX_TILE_SIZE) {
    const chunkBottom = Math.min(bottom, chunkY + MAX_TILE_SIZE)
    for (let chunkX = bounds.x; chunkX < right; chunkX += MAX_TILE_SIZE) {
      const chunkRight = Math.min(right, chunkX + MAX_TILE_SIZE)
      let minX = chunkRight
      let minY = chunkBottom
      let maxX = -1
      let maxY = -1
      for (let y = chunkY; y < chunkBottom; y += 1) for (let x = chunkX; x < chunkRight; x += 1) {
        if (colorAt(x, y).a === 0) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      if (maxX < minX || maxY < minY) continue
      const width = maxX - minX + 1
      const height = maxY - minY + 1
      const pixels = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const color = colorAt(minX + x, minY + y)
        const offset = (y * width + x) * 4
        pixels[offset] = color.r
        pixels[offset + 1] = color.g
        pixels[offset + 2] = color.b
        pixels[offset + 3] = color.a
      }
      stamps.push({ x: surface.offsetX + minX, y: surface.offsetY + minY, width, height, pixels })
    }
  }
  return stamps
}

export interface FreeTileInstanceReference {
  celId: string
  index: number
  instance: FreeTileInstance
}

export interface FreeTileImageResizeState {
  sourceWidth: number
  sourceHeight: number
  sources: Array<{ source: FreeTileSourceLayer; offsetX: number; offsetY: number }>
  cels: Array<{
    freeTiles: FreeTileCelData
    instances: FreeTileInstance[]
    offsetX: number
    offsetY: number
  }>
}

const cloneSingleTileTileset = (source: Tileset, tileId: string, id: string, name: string): Tileset | null => {
  const pixels = readTilesetTilePixels(source, tileId)
  if (!pixels) return null
  return {
    id,
    name,
    tileWidth: source.tileWidth,
    tileHeight: source.tileHeight,
    columns: 1,
    rows: 1,
    tileIds: [id],
    tileSlots: [id],
    pixels
  }
}

const migrateLegacyFreeTileLayer = (document: SpriteDocument, layer: RasterLayer, legacyTileset: Tileset): void => {
  const sources: FreeTileSourceLayer[] = []
  const replacements = new Map<string, string>()
  const created: Tileset[] = []
  for (const [index, tileId] of legacyTileset.tileIds.entries()) {
    const sourceId = createId('free-tile-source')
    const tileset = cloneSingleTileTileset(legacyTileset, tileId, createId('tileset'), `${layer.name} ${index + 1}`)
    if (!tileset) continue
    created.push(tileset)
    replacements.set(tileId, sourceId)
    sources.push({ id: sourceId, name: `${layer.name} ${index + 1}`, tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 })
  }
  if (created.length === 0) return
  document.tilesets = [...(document.tilesets ?? []).filter((tileset) => tileset.id !== legacyTileset.id), ...created]
  layer.freeTileSources = sources
  const timeline = ensureAnimationDocument(document)
  for (const cel of timeline.cels) {
    if (cel.layerId !== layer.id || !cel.freeTiles) continue
    cel.freeTiles.instances = cel.freeTiles.instances.flatMap((instance) => {
      const sourceId = instance.sourceId ?? (instance.tileId ? replacements.get(instance.tileId) : undefined)
      return sourceId ? [{ ...instance, sourceId, tileId: undefined }] : []
    })
  }
  delete layer.freeTileTilesetId
}

export const ensureFreeTileTilesetOwnership = (document: SpriteDocument): void => {
  const byId = new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  const tilemapClaims = new Set(document.layers.flatMap((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []))
  for (const layer of document.layers) {
    if (layer.kind !== 'free-tile') continue
    layer.freeTileSetId ??= createId('free-tile-set')
    if ((!layer.freeTileSources || layer.freeTileSources.length === 0) && layer.freeTileTilesetId) {
      const legacyTileset = byId.get(layer.freeTileTilesetId)
      if (legacyTileset && !tilemapClaims.has(legacyTileset.id)) {
        migrateLegacyFreeTileLayer(document, layer, legacyTileset)
        byId.delete(legacyTileset.id)
        for (const tileset of document.tilesets ?? []) byId.set(tileset.id, tileset)
      }
    }
  }
  const sets = new Map<string, RasterLayer[]>()
  for (const layer of document.layers) {
    if (layer.kind !== 'free-tile' || !layer.freeTileSetId) continue
    const members = sets.get(layer.freeTileSetId) ?? []
    members.push(layer)
    sets.set(layer.freeTileSetId, members)
  }
  const tilesetOwners = new Map<string, string>()
  const sourceOwners = new Map<string, string>()
  for (const [setId, members] of sets) {
    let sharedSources: FreeTileSourceLayer[] = []
    for (const member of members) {
      const localTilesets = new Set<string>()
      const localSources = new Set<string>()
      const candidates = (member.freeTileSources ?? []).filter((source) => {
        if (!byId.has(source.tilesetId) || tilemapClaims.has(source.tilesetId)) return false
        const tilesetOwner = tilesetOwners.get(source.tilesetId)
        const sourceOwner = sourceOwners.get(source.id)
        if ((tilesetOwner && tilesetOwner !== setId) || (sourceOwner && sourceOwner !== setId)) return false
        if (localTilesets.has(source.tilesetId) || localSources.has(source.id)) return false
        localTilesets.add(source.tilesetId)
        localSources.add(source.id)
        return true
      })
      if (candidates.length > 0) {
        sharedSources = candidates
        break
      }
    }
    // A malformed or newly-created set still gets one editable transparent source.
    if (sharedSources.length === 0) {
      const owner = members[0]
      const sourceId = createId('free-tile-source')
      const tileset = createBlankTileset(createId('tileset'), `${owner.name} 1`, 1, 1, createId('tile'), 1)
      document.tilesets = [...(document.tilesets ?? []), tileset]
      byId.set(tileset.id, tileset)
      sharedSources = [{ id: sourceId, name: `${owner.name} 1`, tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    }
    for (const source of sharedSources) {
      const tileset = byId.get(source.tilesetId)
      if (!tileset) continue
      tileset.name = source.name
      tilesetOwners.set(source.tilesetId, setId)
      sourceOwners.set(source.id, setId)
    }
    for (const member of members) member.freeTileSources = sharedSources
  }
}

export const freeTileLayerTilesets = (document: SpriteDocument): FreeTileLayerTileset[] => {
  ensureFreeTileTilesetOwnership(document)
  const byId = new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  const seen = new Set<string>()
  return document.layers.flatMap((layer) => {
    if (layer.kind !== 'free-tile') return []
    return (layer.freeTileSources ?? []).flatMap((source) => {
      const tileset = byId.get(source.tilesetId)
      if (!tileset || seen.has(tileset.id)) return []
      seen.add(tileset.id)
      return [{ layer, tileset, source }]
    })
  })
}

export const freeTileSourcesForLayer = (document: SpriteDocument, layer: RasterLayer): FreeTileSourceRef[] => {
  ensureFreeTileTilesetOwnership(document)
  return freeTileSourceRefs(layer.freeTileSources, document.tilesets ?? [])
}

export const freeTileSourceForId = (document: SpriteDocument, layer: RasterLayer, sourceId: string | null | undefined): FreeTileSourceRef | null => {
  if (!sourceId) return null
  return freeTileSourcesForLayer(document, layer).find((source) => source.id === sourceId || source.tileset.id === sourceId) ?? null
}

export const freeTileSourceOwnerForId = (document: SpriteDocument, sourceId: string | null | undefined): FreeTileSourceOwner | null => {
  return freeTileSourceOwnersForId(document, sourceId)[0] ?? null
}

export const freeTileSourceOwnersForId = (document: SpriteDocument, sourceId: string | null | undefined): FreeTileSourceOwner[] => {
  if (!sourceId) return []
  ensureFreeTileTilesetOwnership(document)
  const tilesets = new Map((document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  const owners: FreeTileSourceOwner[] = []
  for (const layer of document.layers) {
    if (layer.kind !== 'free-tile') continue
    const source = (layer.freeTileSources ?? []).find((candidate) => candidate.id === sourceId || candidate.tilesetId === sourceId)
    if (!source) continue
    const tileset = tilesets.get(source.tilesetId)
    if (tileset) owners.push({ layer, source, tileset })
  }
  return owners
}

export const freeTileLayerIdsForSource = (document: SpriteDocument, sourceId: string): string[] =>
  freeTileSourceOwnersForId(document, sourceId).map((owner) => owner.layer.id)

export const applyFreeTileSourceLayerSnapshot = (document: SpriteDocument, snapshot: FreeTileSourceLayer): boolean => {
  const owners = freeTileSourceOwnersForId(document, snapshot.id)
  if (owners.length === 0) return false
  const updated = new Set<FreeTileSourceLayer>()
  for (const owner of owners) {
    if (!updated.has(owner.source)) {
      const normalized = cloneFreeTileSource(snapshot)
      Object.assign(owner.source, normalized)
      if (normalized.description === undefined) delete owner.source.description
      if (normalized.displayColor === undefined) delete owner.source.displayColor
      updated.add(owner.source)
    }
    owner.tileset.name = snapshot.name
  }
  rerenderFreeTileSourceReferences(document, snapshot.id)
  return true
}

export const freeTileTilesetIdsForLayer = (layer: RasterLayer): string[] => layer.kind === 'free-tile'
  ? (layer.freeTileSources ?? []).map((source) => source.tilesetId)
  : layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []

export const validateFreeTileImageResize = (document: SpriteDocument, width: number, height: number): void => {
  const scaleX = width / document.width
  const scaleY = height / document.height
  for (const { tileset } of freeTileLayerTilesets(document)) {
    const tileWidth = Math.max(1, Math.round(tileset.tileWidth * scaleX))
    const tileHeight = Math.max(1, Math.round(tileset.tileHeight * scaleY))
    if (tileWidth > MAX_TILE_SIZE || tileHeight > MAX_TILE_SIZE
      || tileset.columns * tileset.rows * tileWidth * tileHeight > MAX_TILESET_PIXELS) throw new Error('Free Tile source size is too large')
  }
}

export const captureFreeTileImageResizeState = (document: SpriteDocument): FreeTileImageResizeState => {
  ensureFreeTileTilesetOwnership(document)
  const seen = new Set<FreeTileCelData>()
  const cels: FreeTileImageResizeState['cels'] = []
  for (const cel of ensureAnimationDocument(document).cels) {
    if (!cel.freeTiles || !cel.surface || seen.has(cel.freeTiles)) continue
    seen.add(cel.freeTiles)
    cels.push({
      freeTiles: cel.freeTiles,
      instances: cel.freeTiles.instances.map((instance) => ({ ...instance })),
      offsetX: cel.surface.offsetX,
      offsetY: cel.surface.offsetY
    })
  }
  const seenSources = new Set<string>()
  const sources = document.layers.flatMap((layer) => layer.kind === 'free-tile'
    ? (layer.freeTileSources ?? []).flatMap((source) => {
        if (seenSources.has(source.id)) return []
        seenSources.add(source.id)
        return [{ source, offsetX: source.offsetX, offsetY: source.offsetY }]
      })
    : [])
  return { sourceWidth: document.width, sourceHeight: document.height, sources, cels }
}

export const resizeFreeTileDocumentImage = (
  document: SpriteDocument,
  state: FreeTileImageResizeState,
  interpolation: ImageResizeInterpolation
): void => {
  const scaleX = document.width / state.sourceWidth
  const scaleY = document.height / state.sourceHeight
  const entries = freeTileLayerTilesets(document)
  for (const { tileset } of entries) {
    resizeFreeTileTileset(
      tileset,
      Math.max(1, Math.round(tileset.tileWidth * scaleX)),
      Math.max(1, Math.round(tileset.tileHeight * scaleY)),
      interpolation
    )
    markRasterStorageContentChanged(tileset.pixels)
  }
  for (const entry of state.sources) {
    entry.source.offsetX = Math.round(entry.offsetX * scaleX)
    entry.source.offsetY = Math.round(entry.offsetY * scaleY)
  }
  const timeline = ensureAnimationDocument(document)
  for (const entry of state.cels) {
    const cel = timeline.cels.find((candidate) => candidate.freeTiles === entry.freeTiles && candidate.surface)
    if (!cel?.surface) continue
    entry.freeTiles.instances = entry.instances.map((instance) => ({
      ...instance,
      x: Math.round((entry.offsetX + instance.x) * scaleX) - cel.surface!.offsetX,
      y: Math.round((entry.offsetY + instance.y) * scaleY) - cel.surface!.offsetY
    }))
  }
  for (const { tileset } of entries) rerenderFreeTileReferences(document, tileset.id)
}

export const freeTileCelTargetAt = (document: SpriteDocument, layerId: string, frameId: string): FreeTileCelTarget | null => {
  const layer = document.layers.find((candidate) => candidate.id === layerId && candidate.kind === 'free-tile')
  if (!layer) return null
  ensureFreeTileTilesetOwnership(document)
  const timeline = ensureAnimationDocument(document)
  const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frameId)
  // Free-tile instances are owned by each animation cel. Only the source
  // tileset is shared at layer level; resolving a linked cel here would make
  // edits on a later frame mutate the linked frame's instance container.
  const source = cel
  if (cel && !cel.freeTiles) cel.freeTiles = createFreeTileCelData()
  const sources = freeTileSourcesForLayer(document, layer)
  const tileset = sources[0]?.tileset
  if (!cel || !source?.freeTiles || !source.surface || !tileset || sources.length === 0) return null
  return { layer, cel, source, freeTiles: source.freeTiles, surface: source.surface, tileset, sources }
}

export const activeFreeTileCelTarget = (document: SpriteDocument): FreeTileCelTarget | null => {
  const timeline = ensureAnimationDocument(document)
  return freeTileCelTargetAt(document, document.activeLayerId, timeline.activeFrameId)
}

const assignRenderedFreeTileSurface = (target: AnimationCelSurface, rendered: AnimationCelSurface): void => {
  target.width = rendered.width
  target.height = rendered.height
  target.offsetX = rendered.offsetX
  target.offsetY = rendered.offsetY
  target.storageOriginX = rendered.storageOriginX
  target.storageOriginY = rendered.storageOriginY
  if (target.format === 'rgba' && rendered.format === 'rgba') target.pixels = rendered.pixels
  else if (target.format === 'indexed' && rendered.format === 'indexed') target.pixels = rendered.pixels
  else throw new Error('Free Tile surface format changed unexpectedly')
  markRasterSurfaceContentChanged(target)
}

const rerenderDirectFreeTileCel = (document: SpriteDocument, cel: AnimationCel): boolean => {
  const layer = document.layers.find((candidate) => candidate.id === cel.layerId && candidate.kind === 'free-tile')
  if (!layer || !cel.freeTiles || !cel.surface) return false
  const sources = freeTileSourcesForLayer(document, layer)
  if (sources.length === 0) return false
  const rendered = renderFreeTileSurface(
    cel.freeTiles,
    sources,
    document.colorMode,
    cel.surface.width,
    cel.surface.height,
    cel.surface.offsetX,
    cel.surface.offsetY,
    document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
  )
  assignRenderedFreeTileSurface(cel.surface, rendered)
  return true
}

export const rerenderFreeTileSourceReferences = (document: SpriteDocument, sourceId: string): number => {
  let changed = 0
  for (const cel of ensureAnimationDocument(document).cels) {
    const layer = document.layers.find((candidate) => candidate.id === cel.layerId)
    if (layer?.kind !== 'free-tile' || !cel.freeTiles) continue
    const source = (layer.freeTileSources ?? []).find((candidate) => candidate.id === sourceId || candidate.tilesetId === sourceId)
    if (!source) continue
    const legacyTileId = document.tilesets?.find((tileset) => tileset.id === source.tilesetId)?.tileIds[0]
    const references = cel.freeTiles.instances.filter((instance) => instance.sourceId === source.id
      || (!instance.sourceId && legacyTileId !== undefined && instance.tileId === legacyTileId)).length
    if (references === 0 || !rerenderDirectFreeTileCel(document, cel)) continue
    changed += references
  }
  if (changed > 0) refreshActiveAnimationFrame(document)
  return changed
}

export const rerenderFreeTileReferences = (document: SpriteDocument, tilesetId: string, _tileId?: string): number => {
  const source = freeTileSourceOwnerForId(document, tilesetId)
  return source ? rerenderFreeTileSourceReferences(document, source.source.id) : 0
}

export const captureFreeTileSourceSnapshot = (document: SpriteDocument, sourceId: string): FreeTileSourceEditSnapshot | null => {
  const owner = freeTileSourceOwnerForId(document, sourceId)
  if (!owner) return null
  const tileId = owner.tileset.tileIds[0]
  const pixels = tileId ? readTilesetTilePixels(owner.tileset, tileId) : null
  if (!pixels) return null
  return {
    sourceId: owner.source.id,
    tilesetId: owner.tileset.id,
    width: owner.tileset.tileWidth,
    height: owner.tileset.tileHeight,
    pixels,
    offsetX: owner.source.offsetX,
    offsetY: owner.source.offsetY
  }
}

export const freeTileSourceEditSnapshotsEqual = (left: FreeTileSourceEditSnapshot, right: FreeTileSourceEditSnapshot): boolean => {
  if (left.sourceId !== right.sourceId || left.tilesetId !== right.tilesetId
    || left.width !== right.width || left.height !== right.height
    || left.offsetX !== right.offsetX || left.offsetY !== right.offsetY
    || left.pixels.length !== right.pixels.length) return false
  for (let index = 0; index < left.pixels.length; index += 1) if (left.pixels[index] !== right.pixels[index]) return false
  return true
}

export const freeTileSourceEditSnapshotBytes = (snapshot: FreeTileSourceEditSnapshot): number => snapshot.pixels.byteLength + 64

export const applyFreeTileSourceSnapshot = (document: SpriteDocument, snapshot: FreeTileSourceEditSnapshot): boolean => {
  const owners = freeTileSourceOwnersForId(document, snapshot.sourceId)
  const owner = owners[0]
  const pixelCount = snapshot.width * snapshot.height
  if (!owner || owner.tileset.id !== snapshot.tilesetId
    || !Number.isSafeInteger(snapshot.width) || !Number.isSafeInteger(snapshot.height)
    || snapshot.width < 1 || snapshot.height < 1
    || snapshot.width > MAX_TILE_SIZE || snapshot.height > MAX_TILE_SIZE
    || !Number.isSafeInteger(pixelCount) || pixelCount > MAX_TILESET_PIXELS
    || snapshot.pixels.length !== pixelCount * 4) return false
  const tileId = owner.tileset.tileIds[0] ?? createId('tile')
  owner.tileset.tileWidth = snapshot.width
  owner.tileset.tileHeight = snapshot.height
  owner.tileset.columns = 1
  owner.tileset.rows = 1
  owner.tileset.tileIds = [tileId]
  owner.tileset.tileSlots = [tileId]
  owner.tileset.pixels = snapshot.pixels.slice()
  const updatedSources = new Set<FreeTileSourceLayer>()
  for (const current of owners) {
    if (updatedSources.has(current.source)) continue
    current.source.offsetX = Math.trunc(snapshot.offsetX)
    current.source.offsetY = Math.trunc(snapshot.offsetY)
    updatedSources.add(current.source)
  }
  markRasterStorageContentChanged(owner.tileset.pixels)
  rerenderFreeTileSourceReferences(document, owner.source.id)
  return true
}

export const captureFreeTileReferences = (document: SpriteDocument, tilesetId: string, tileId: string): FreeTileInstanceReference[] => {
  const references: FreeTileInstanceReference[] = []
  for (const cel of ensureAnimationDocument(document).cels) {
    const layer = document.layers.find((candidate) => candidate.id === cel.layerId)
    if (layer?.kind !== 'free-tile' || !cel.freeTiles) continue
    const source = (layer.freeTileSources ?? []).find((candidate) => candidate.tilesetId === tilesetId)
    if (!source) continue
    cel.freeTiles.instances.forEach((instance, index) => {
      if (instance.sourceId === source.id || instance.tileId === tileId) references.push({ celId: cel.id, index, instance: { ...instance } })
    })
  }
  return references
}

export const captureFreeTileSourceReferences = (document: SpriteDocument, sourceId: string): FreeTileInstanceReference[] => {
  const owner = freeTileSourceOwnerForId(document, sourceId)
  if (!owner) return []
  const tileId = owner.tileset.tileIds[0]
  return captureFreeTileReferences(document, owner.tileset.id, tileId ?? '')
}

export const applyFreeTileReferences = (
  document: SpriteDocument,
  references: readonly FreeTileInstanceReference[],
  side: 'clear' | 'restore'
): number => {
  const timeline = ensureAnimationDocument(document)
  const byCel = new Map<string, FreeTileInstanceReference[]>()
  for (const reference of references) {
    const entries = byCel.get(reference.celId) ?? []
    entries.push(reference)
    byCel.set(reference.celId, entries)
  }
  let changed = 0
  for (const [celId, entries] of byCel) {
    const cel = timeline.cels.find((candidate) => candidate.id === celId)
    if (!cel?.freeTiles) continue
    if (side === 'clear') {
      const ids = new Set(entries.map((entry) => entry.instance.id))
      const previousLength = cel.freeTiles.instances.length
      cel.freeTiles.instances = cel.freeTiles.instances.filter((instance) => !ids.has(instance.id))
      changed += previousLength - cel.freeTiles.instances.length
    } else {
      const currentIds = new Set(cel.freeTiles.instances.map((instance) => instance.id))
      for (const entry of [...entries].sort((left, right) => left.index - right.index)) {
        if (currentIds.has(entry.instance.id)) continue
        cel.freeTiles.instances.splice(Math.min(entry.index, cel.freeTiles.instances.length), 0, { ...entry.instance })
        currentIds.add(entry.instance.id)
        changed += 1
      }
    }
    rerenderDirectFreeTileCel(document, cel)
  }
  if (changed > 0) refreshActiveAnimationFrame(document)
  return changed
}

export const freeTileInstanceAtDocumentPoint = (target: FreeTileCelTarget, x: number, y: number): FreeTileInstance | null =>
  freeTileInstanceAtPoint(target.freeTiles, target.sources, x, y, target.surface.offsetX, target.surface.offsetY)

export const createFreeTilePlacementEdit = (
  target: FreeTileCelTarget,
  after: FreeTileCelData,
  dirtyRect: SelectionRect | null = null
): FreeTilePlacementEdit => ({
  layerId: target.layer.id,
  frameId: target.cel.frameId,
  before: cloneFreeTileCelData(target.freeTiles),
  after: cloneFreeTileCelData(after),
  dirtyRect
})

export const applyFreeTilePlacementEdit = (
  document: SpriteDocument,
  edit: FreeTilePlacementEdit,
  side: 'before' | 'after'
): boolean => {
  const target = freeTileCelTargetAt(document, edit.layerId, edit.frameId)
  if (!target) return false
  target.source.freeTiles = cloneFreeTileCelData(edit[side])
  const rendered = renderFreeTileSurface(
    target.source.freeTiles,
    target.sources,
    document.colorMode,
    target.surface.width,
    target.surface.height,
    target.surface.offsetX,
    target.surface.offsetY,
    document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
  )
  assignRenderedFreeTileSurface(target.surface, rendered)
  refreshActiveAnimationFrame(document)
  return true
}
