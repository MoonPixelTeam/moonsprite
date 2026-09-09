import { afterEach, describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { activateAnimationFrame, addBlankAnimationFrame, cloneAnimationCelsForLayer, connectAnimationCels, duplicateAnimationFrame, ensureAnimationDocument, refreshActiveAnimationFrame, resizeAnimationCelsAt, syncActiveAnimationFrame, syncActiveAnimationLayer } from './animation'
import { animationMaskAt, cachedLayerContentBounds, createDocument, createLayer, createLayerMask, duplicateLayer, getActiveLayer, getLayerStorageOrigin, readLayerColorAt, resizeDocumentAt, writeLayerColor } from './document'
import { applySelectionTranslationPreview, captureSelectionTransform, restoreSelectionTranslationPreview } from './tools'
import { acceptProjectSaveBaseline, compactProjectRasterStorage, decodeProject, encodeProject, encodeProjectAsync, encodeProjectSaveAsync, encodeProjectWorkerPayload, PROJECT_SCHEMA_VERSION, migrateProjectManifest, readProjectGalleryMetadata, registerProjectSaveBaseline, type ProjectEncodeWorkerPayload } from './project-format'
import { rasterStorageIdentity, runtimeRasterForSurface, surfacePixelsMaterialized } from './runtime-raster'
import { createDefaultLayerStyles } from './layer-styles'
import { createSolidTileset, createTilemapCelData, createTilesetFromRgba, deleteTilesetTile, renderTilemapSurface, writeTilesetTilePixels } from './tilemap'
import { freeTileSourceRefs, renderFreeTileSurface } from './free-tile'
import { rerenderFreeTileReferences } from './free-tile-document'

const zipCompressionMethods = (data: Uint8Array): Map<string, number> => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let eocd = data.byteLength - 22
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1
  if (eocd < 0) throw new Error('ZIP end record missing')
  const entries = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const methods = new Map<string, number>()
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP central entry missing')
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength))
    methods.set(name, view.getUint16(offset + 10, true))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return methods
}

interface TestRasterManifestEntry {
  dataFile: string
  linkedContentId?: string
  dataEncoding?: string
  layerStyles?: unknown
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
  text?: {
    text: string
    fontFamily: string
    fontSize: number
    lineSpacing: number
    letterSpacing: number
    spacingMode?: 'font' | 'actual'
    antialias: 'pixel' | 'smooth'
    color: { r: number; g: number; b: number; a: number }
    boxWidth?: number
    boxHeight?: number
    styleRuns?: Array<{
      start: number
      end: number
      fontSize?: number
      lineSpacing?: number
      letterSpacing?: number
      color?: { r: number; g: number; b: number; a: number }
    }>
  }
}

interface TestProjectManifest {
  schemaVersion: number
  document: {
    schemaVersion: number
    layers: Array<TestRasterManifestEntry & { id: string; kind?: 'text' | 'tilemap' | 'free-tile'; tilemapTilesetId?: string; freeTileTilesetId?: string; freeTileSetId?: string; freeTileSources?: Array<{ id: string; name?: string; tilesetId: string; offsetX?: number }> }>
    groups?: Array<{ layerStyles?: unknown }>
    tilesets?: Array<{ id: string; dataFile: string; tileSlots?: Array<string | null> }>
    animation: {
      cels: Array<TestRasterManifestEntry & { id: string; layerId: string; frameId: string; tilemap?: { cells: Array<{ index: number; tilesetId: string; tileId: string }> }; freeTiles?: { instances: Array<{ id: string; sourceId?: string; tileId?: string; x: number; y: number; rotation?: number; flipHorizontal?: boolean; flipVertical?: boolean }> } }>
      loopSections?: Array<{ id: string; name: string; startFrameId: string; endFrameId: string; direction: 'forward' | 'reverse'; repeatCount: number | null }>
    }
  }
}

const readTestManifest = (files: Record<string, Uint8Array>): TestProjectManifest => JSON.parse(strFromU8(files['manifest.json'])) as TestProjectManifest

const activeRasterEntry = (files: Record<string, Uint8Array>): TestRasterManifestEntry => {
  const manifest = readTestManifest(files)
  return manifest.document.animation.cels.find((cel) => cel.dataFile) ?? manifest.document.layers[0]
}

describe('project manifest migration boundary', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts the current schema through the migration entry point', () => {
    const manifest = { app: 'MoonSprite', schemaVersion: PROJECT_SCHEMA_VERSION, document: { schemaVersion: PROJECT_SCHEMA_VERSION } }
    expect(migrateProjectManifest(manifest)).toMatchObject({ ...manifest, document: { ...manifest.document, animation: { activeFrameId: 'frame-1' } } })
  })

  it('opens v16 projects saved before linked layers were introduced', () => {
    const files = unzipSync(encodeProject(createDocument('v16 project', 8, 6, 'rgba')))
    const manifest = readTestManifest(files)
    manifest.schemaVersion = 16
    manifest.document.schemaVersion = 16
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    expect(decodeProject(zipSync(files))).toMatchObject({
      name: 'v16 project',
      width: 8,
      height: 6,
      schemaVersion: PROJECT_SCHEMA_VERSION
    })
  })

  it('round-trips the per-layer automatic animation cel link setting', () => {
    const document = createDocument('automatic cel link setting', 2, 2, 'rgba')
    document.layers[0].autoLinkAnimationCels = true
    document.layers.push(createLayer('Untoggled', 2, 2, 'rgba'))
    const reopened = decodeProject(encodeProject(document))
    expect(reopened.layers[0].autoLinkAnimationCels).toBe(true)
    expect(reopened.layers[1].autoLinkAnimationCels).toBeUndefined()
  })

  it('writes shared pixel storage with one canonical geometry after a non-active cel diverges', () => {
    const document = createDocument('shared raster geometry save', 42, 39, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    activateAnimationFrame(document, firstFrameId)
    const firstCel = timeline.cels.find((cel) => cel.frameId === firstFrameId)!
    const secondCel = timeline.cels.find((cel) => cel.frameId === secondFrameId)!
    if (!firstCel.surface || firstCel.surface.format !== 'rgba') throw new Error('Expected an RGBA animation cel')
    secondCel.surface = { ...firstCel.surface, width: 44, height: 40, offsetX: -1, offsetY: 0, pixels: firstCel.surface.pixels }

    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    const savedSecondCel = manifest.document.animation.cels.find((cel) => cel.id === secondCel.id)!

    expect(savedSecondCel).toMatchObject({ width: 42, height: 39, offsetX: -1, offsetY: 0 })
    expect(() => decodeProject(zipSync(files))).not.toThrow()
  })

  it('does not reuse one incremental archive path for conflicting raster geometries', async () => {
    const document = createDocument('incremental raster path conflict', 42, 39, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    activateAnimationFrame(document, firstFrameId)
    const secondCel = timeline.cels.find((cel) => cel.frameId === secondFrameId)!
    secondCel.surface = { format: 'rgba', width: 44, height: 40, offsetX: -1, offsetY: 0, pixels: new Uint8ClampedArray(44 * 40 * 4) }
    secondCel.surface.pixels.set([12, 34, 56, 255], 4)

    const healthyArchive = encodeProject(document)
    const sourceFiles = unzipSync(healthyArchive)
    const corruptManifest = readTestManifest(sourceFiles)
    const layerEntry = corruptManifest.document.layers[0]
    const secondCelEntry = corruptManifest.document.animation.cels.find((cel) => cel.id === secondCel.id)!
    secondCelEntry.dataFile = layerEntry.dataFile
    secondCelEntry.dataEncoding = layerEntry.dataEncoding
    sourceFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(corruptManifest))
    const corruptArchive = zipSync(sourceFiles)
    expect(registerProjectSaveBaseline(document, 'D:/gallery/incremental-raster-path-conflict.moonsprite', corruptArchive)).toBe(true)

    const encoded = await encodeProjectSaveAsync(document)
    const patchFiles = unzipSync(encoded.data)
    const repairedManifest = readTestManifest(patchFiles)
    const repairedLayerEntry = repairedManifest.document.layers[0]
    const repairedCelEntry = repairedManifest.document.animation.cels.find((cel) => cel.id === secondCel.id)!

    expect(repairedCelEntry.dataFile).not.toBe(repairedLayerEntry.dataFile)
    expect(repairedCelEntry).toMatchObject({ width: 44, height: 40, offsetX: -1, offsetY: 0 })
    expect(patchFiles[repairedCelEntry.dataFile]).toBeDefined()
  })

  it('does not reuse one incremental archive path for distinct same-size frame pixels', async () => {
    const document = createDocument('incremental same-size raster conflict', 4, 4, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    activateAnimationFrame(document, firstFrameId)
    const secondCel = timeline.cels.find((cel) => cel.frameId === secondFrameId)!
    secondCel.surface = { format: 'rgba', width: 4, height: 4, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(4 * 4 * 4) }
    secondCel.surface.pixels.set([220, 30, 40, 255])

    const healthyArchive = encodeProject(document)
    const sourceFiles = unzipSync(healthyArchive)
    const corruptManifest = readTestManifest(sourceFiles)
    const layerEntry = corruptManifest.document.layers[0]
    const secondCelEntry = corruptManifest.document.animation.cels.find((cel) => cel.id === secondCel.id)!
    secondCelEntry.dataFile = layerEntry.dataFile
    secondCelEntry.dataEncoding = layerEntry.dataEncoding
    sourceFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(corruptManifest))
    const corruptArchive = zipSync(sourceFiles)
    expect(registerProjectSaveBaseline(document, 'D:/gallery/incremental-same-size-raster-conflict.moonsprite', corruptArchive)).toBe(true)

    const encoded = await encodeProjectSaveAsync(document)
    const patchFiles = unzipSync(encoded.data)
    const repairedManifest = readTestManifest(patchFiles)
    const repairedLayerEntry = repairedManifest.document.layers[0]
    const repairedCelEntry = repairedManifest.document.animation.cels.find((cel) => cel.id === secondCel.id)!

    expect(repairedCelEntry.dataFile).not.toBe(repairedLayerEntry.dataFile)
    expect(patchFiles[repairedCelEntry.dataFile]).toBeDefined()
    expect(Array.from(patchFiles[repairedCelEntry.dataFile].subarray(0, 4))).toEqual([220, 30, 40, 255])
  })

  it('does not reuse a tileset resource after its layout grows', async () => {
    const document = createDocument('incremental tileset layout change', 2, 2, 'rgba')
    const tileset = createSolidTileset('tileset-1', 'Tiles', 2, 2, { r: 10, g: 20, b: 30, a: 255 }, 'tile-1')
    document.tilesets = [tileset]
    const archive = encodeProject(document)
    expect(registerProjectSaveBaseline(document, 'D:/gallery/incremental-tileset-layout-change.moonsprite', archive)).toBe(true)

    tileset.rows = 2
    tileset.pixels = new Uint8ClampedArray(tileset.columns * tileset.rows * tileset.tileWidth * tileset.tileHeight * 4)
    const encoded = await encodeProjectSaveAsync(document)
    const files = unzipSync(encoded.data)

    expect(files['tilesets/tileset-1.rgba']).toHaveLength(32)
    expect(encoded.reusableEntries.some((entry) => entry.path === 'tilesets/tileset-1.rgba')).toBe(false)
    expect(() => decodeProject(encodeProject(document))).not.toThrow()
  })

  it('does not reuse a corrupt tileset resource from an incremental baseline', async () => {
    const document = createDocument('incremental corrupt tileset baseline', 2, 2, 'rgba')
    const tileset = createSolidTileset('tileset-1', 'Tiles', 2, 2, { r: 10, g: 20, b: 30, a: 255 }, 'tile-1')
    document.tilesets = [tileset]
    const files = unzipSync(encodeProject(document))
    files['tilesets/tileset-1.rgba'] = files['tilesets/tileset-1.rgba'].subarray(0, 12)
    const corruptArchive = zipSync(files)
    expect(registerProjectSaveBaseline(document, 'D:/gallery/incremental-corrupt-tileset-baseline.moonsprite', corruptArchive)).toBe(true)

    const encoded = await encodeProjectSaveAsync(document)
    const repairedFiles = unzipSync(encoded.data)

    expect(repairedFiles['tilesets/tileset-1.rgba']).toHaveLength(16)
    expect(encoded.reusableEntries.some((entry) => entry.path === 'tilesets/tileset-1.rgba')).toBe(false)
    expect(() => decodeProject(encodeProject(document))).not.toThrow()
  })

  it('records reusable resource lengths and raster metadata in the save plan', async () => {
    const document = createDocument('incremental save plan metadata', 4, 3, 'rgba')
    const archive = encodeProject(document)
    expect(registerProjectSaveBaseline(document, 'D:/gallery/incremental-save-plan-metadata.moonsprite', archive)).toBe(true)

    const encoded = await encodeProjectSaveAsync(document)
    const files = unzipSync(encoded.data)
    const plan = JSON.parse(strFromU8(files['.moonsprite-save-plan.json'])) as { version: number; entries: Array<{ path: string; crc32: number; byteLength: number; encoding?: string; width?: number; height?: number }> }

    expect(plan.version).toBe(2)
    expect(plan.entries.length).toBeGreaterThan(0)
    expect(plan.entries.every((entry) => entry.crc32 >= 0 && entry.byteLength > 0)).toBe(true)
    expect(plan.entries.some((entry) => (entry.encoding === 'raw' || entry.encoding === 'sparse-tiles-v1') && entry.width === 4 && entry.height === 3)).toBe(true)
  })

  it('refuses to save a tileset whose pixels do not match its declared layout', () => {
    const document = createDocument('invalid tileset storage', 2, 2, 'rgba')
    const tileset = createSolidTileset('tileset-1', 'Tiles', 2, 2, { r: 10, g: 20, b: 30, a: 255 }, 'tile-1')
    tileset.rows = 2
    document.tilesets = [tileset]

    expect(() => encodeProject(document)).toThrow()
  })

  it('rejects a raw raster size mismatch instead of substituting another frame resource', () => {
    const document = createDocument('ambiguous raster corruption', 4, 4, 'rgba')
    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    manifest.document.layers[0].width = 8
    manifest.document.layers[0].height = 3
    manifest.document.animation.cels = []
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    expect(() => decodeProject(zipSync(files))).toThrow()
  })

  it('round-trips linked layer frame content while preserving independent placement', () => {
    const document = createDocument('linked layer project', 4, 1, 'rgba')
    const source = getActiveLayer(document)
    writeLayerColor(document, source, 0, { r: 255, g: 0, b: 0, a: 255 })
    syncActiveAnimationLayer(document, source.id)
    const secondFrameId = addBlankAnimationFrame(document)
    activateAnimationFrame(document, secondFrameId)
    writeLayerColor(document, source, 0, { r: 0, g: 80, b: 255, a: 255 })
    syncActiveAnimationLayer(document, source.id)
    source.linkedContentId = 'layer-link-roundtrip'
    const linked = duplicateLayer(document, source.id)
    cloneAnimationCelsForLayer(document, source.id, linked)
    linked.offsetX = 3
    syncActiveAnimationLayer(document, linked.id)

    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    const sourceMetadata = manifest.document.layers.find((layer) => layer.id === source.id)!
    const linkedMetadata = manifest.document.layers.find((layer) => layer.id === linked.id)!
    expect(sourceMetadata.linkedContentId).toBe('layer-link-roundtrip')
    expect(linkedMetadata.linkedContentId).toBe(sourceMetadata.linkedContentId)
    expect(linkedMetadata.dataFile).toBe(sourceMetadata.dataFile)
    for (const frame of ensureAnimationDocument(document).frames) {
      const sourceCel = manifest.document.animation.cels.find((cel) => cel.layerId === source.id && cel.frameId === frame.id)!
      const linkedCel = manifest.document.animation.cels.find((cel) => cel.layerId === linked.id && cel.frameId === frame.id)!
      expect(linkedCel.dataFile).toBe(sourceCel.dataFile)
    }

    const reopened = decodeProject(zipSync(files))
    const reopenedSource = reopened.layers.find((layer) => layer.id === source.id)!
    const reopenedLinked = reopened.layers.find((layer) => layer.id === linked.id)!
    expect(reopenedSource.linkedContentId).toBe('layer-link-roundtrip')
    expect(reopenedLinked.linkedContentId).toBe(reopenedSource.linkedContentId)
    expect(reopenedSource.offsetX).toBe(0)
    expect(reopenedLinked.offsetX).toBe(3)
    expect(rasterStorageIdentity(reopenedLinked)).toBe(rasterStorageIdentity(reopenedSource))
    const reopenedTimeline = ensureAnimationDocument(reopened)
    for (const frame of reopenedTimeline.frames) {
      const sourceCel = reopenedTimeline.cels.find((cel) => cel.layerId === source.id && cel.frameId === frame.id)!
      const linkedCel = reopenedTimeline.cels.find((cel) => cel.layerId === linked.id && cel.frameId === frame.id)!
      expect(rasterStorageIdentity(linkedCel.surface!)).toBe(rasterStorageIdentity(sourceCel.surface!))
    }
  })

  it('rejects linked layer groups whose manifest points members at different raster storage', () => {
    const document = createDocument('corrupt linked layer project', 2, 1, 'rgba')
    const source = getActiveLayer(document)
    source.linkedContentId = 'layer-link-corrupt'
    const linked = duplicateLayer(document, source.id)
    cloneAnimationCelsForLayer(document, source.id, linked)
    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    const linkedMetadata = manifest.document.layers.find((layer) => layer.id === linked.id)!
    const linkedCel = manifest.document.animation.cels.find((cel) => cel.layerId === linked.id)!
    const corruptDataFile = 'cels/corrupt-linked-storage.rgba'
    files[corruptDataFile] = files[linkedCel.dataFile].slice()
    linkedMetadata.dataFile = corruptDataFile
    linkedCel.dataFile = corruptDataFile
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    expect(() => decodeProject(zipSync(files))).toThrow()
  })





  it('round-trips v13 tilesets and editable tilemap cells', () => {
    const document = createDocument('tilemap project', 4, 2, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const tileset = createSolidTileset('tileset-1', 'Solid', 2, 2, { r: 10, g: 20, b: 30, a: 255 }, 'tile-1')
    tileset.tileSlots = [null, null, 'tile-1']
    const tilemap = createTilemapCelData(document.width, document.height, 2, 2)
    tilemap.cells[1] = { tilesetId: tileset.id, tileId: tileset.tileIds[0] }
    document.tilesets = [tileset]
    layer.kind = 'tilemap'
    layer.tilemapTilesetId = tileset.id
    cel.tilemap = tilemap
    cel.surface = renderTilemapSurface(tilemap, document.tilesets, document.colorMode)
    refreshActiveAnimationFrame(document)

    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    expect(manifest.document.layers[0].kind).toBe('tilemap')
    expect(manifest.document.layers[0].tilemapTilesetId).toBe('tileset-1')
    expect(manifest.document.tilesets).toEqual([expect.objectContaining({ id: 'tileset-1', tileSlots: [null, null, 'tile-1'], dataFile: 'tilesets/tileset-1.rgba' })])
    expect(manifest.document.animation.cels[0].tilemap?.cells).toEqual([{ index: 1, tilesetId: 'tileset-1', tileId: 'tile-1' }])

    const reopened = decodeProject(zipSync(files))
    const reopenedCel = ensureAnimationDocument(reopened).cels[0]
    expect(reopened.layers[0].kind).toBe('tilemap')
    expect(reopened.layers[0].tilemapTilesetId).toBe('tileset-1')
    expect(reopened.tilesets?.[0]).toMatchObject({ id: 'tileset-1', tileWidth: 2, tileHeight: 2, tileIds: ['tile-1'], tileSlots: [null, null, 'tile-1'] })
    expect(reopenedCel.tilemap?.cells[1]).toEqual({ tilesetId: 'tileset-1', tileId: 'tile-1' })
    expect(readLayerColorAt(reopened, getActiveLayer(reopened), 2, 0)).toEqual({ r: 10, g: 20, b: 30, a: 255 })
  })

  it('round-trips one Tileset referenced by multiple Tilemap layers', () => {
    const document = createDocument('shared tilemap tileset project', 4, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const firstCel = ensureAnimationDocument(document).cels[0]
    const tileset = createSolidTileset('shared-tileset', 'Shared Tiles', 2, 1, { r: 10, g: 20, b: 30, a: 255 }, 'tile-1')
    document.tilesets = [tileset]
    firstLayer.kind = 'tilemap'
    firstLayer.tilemapTilesetId = tileset.id
    const firstTilemap = createTilemapCelData(document.width, document.height, 2, 1)
    firstTilemap.cells[0] = { tilesetId: tileset.id, tileId: tileset.tileIds[0] }
    firstCel.tilemap = firstTilemap
    firstCel.surface = renderTilemapSurface(firstTilemap, document.tilesets, document.colorMode)

    const secondLayer = createLayer('Props', document.width, document.height, document.colorMode)
    secondLayer.kind = 'tilemap'
    secondLayer.tilemapTilesetId = tileset.id
    document.layers.push(secondLayer)
    const secondTilemap = createTilemapCelData(document.width, document.height, 2, 1)
    secondTilemap.cells[1] = { tilesetId: tileset.id, tileId: tileset.tileIds[0] }
    const timeline = ensureAnimationDocument(document)
    const secondCel = timeline.cels.find((cel) => cel.layerId === secondLayer.id && cel.frameId === timeline.activeFrameId)!
    secondCel.tilemap = secondTilemap
    secondCel.surface = renderTilemapSurface(secondTilemap, document.tilesets, document.colorMode)
    refreshActiveAnimationFrame(document)

    const reopened = decodeProject(encodeProject(document))
    const reopenedTimeline = ensureAnimationDocument(reopened)
    expect(reopened.tilesets).toHaveLength(1)
    expect(reopened.layers.filter((layer) => layer.kind === 'tilemap').map((layer) => layer.tilemapTilesetId)).toEqual(['shared-tileset', 'shared-tileset'])
    expect(reopenedTimeline.cels.filter((cel) => cel.tilemap)).toHaveLength(2)
    expect(reopenedTimeline.cels.find((cel) => cel.layerId === secondLayer.id)?.tilemap?.cells[1]).toEqual({ tilesetId: 'shared-tileset', tileId: 'tile-1' })
  })


  it('round-trips multiple Free Tile layers that share one source set', () => {
    const document = createDocument('shared free tile project', 4, 2, 'rgba')
    const first = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstCel = timeline.cels[0]
    const tileset = createSolidTileset('shared-free-tileset', 'Shared Source', 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'shared-tile')
    document.tilesets = [tileset]
    first.kind = 'free-tile'
    first.freeTileSetId = 'shared-free-set'
    first.freeTileSources = [{ id: 'shared-source', name: 'Shared Source', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    firstCel.freeTiles = { instances: [{ id: 'shared-instance-a', sourceId: 'shared-source', x: 0, y: 0 }] }
    firstCel.surface = renderFreeTileSurface(firstCel.freeTiles, freeTileSourceRefs(first.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)

    const second = createLayer('Second Shared Layer', document.width, document.height, document.colorMode)
    second.kind = 'free-tile'
    second.freeTileSetId = first.freeTileSetId
    second.freeTileSources = first.freeTileSources
    document.layers.push(second)
    timeline.cels.push({
      id: 'shared-free-cel-b',
      layerId: second.id,
      frameId: timeline.activeFrameId,
      opacity: second.opacity,
      freeTiles: { instances: [{ id: 'shared-instance-b', sourceId: 'shared-source', x: 2, y: 0 }] },
      surface: renderFreeTileSurface({ instances: [{ id: 'shared-instance-b', sourceId: 'shared-source', x: 2, y: 0 }] }, freeTileSourceRefs(second.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)
    })
    refreshActiveAnimationFrame(document)

    const reopened = decodeProject(encodeProject(document))
    const sharedLayers = reopened.layers.filter((layer) => layer.kind === 'free-tile')
    expect(sharedLayers).toHaveLength(2)
    expect(sharedLayers.map((layer) => layer.freeTileSetId)).toEqual(['shared-free-set', 'shared-free-set'])
    expect(sharedLayers[0].freeTileSources).toBe(sharedLayers[1].freeTileSources)
    expect(sharedLayers.map((layer) => layer.freeTileSources?.[0].id)).toEqual(['shared-source', 'shared-source'])
    expect(reopened.tilesets).toHaveLength(1)

    expect(writeTilesetTilePixels(reopened.tilesets![0], 'shared-tile', new Uint8ClampedArray([0, 255, 0, 255]))).toBe(true)
    expect(rerenderFreeTileReferences(reopened, reopened.tilesets![0].id, 'shared-tile')).toBe(2)
    expect(readLayerColorAt(reopened, sharedLayers[0], 0, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 })
    expect(readLayerColorAt(reopened, sharedLayers[1], 2, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 })
  })

  it('migrates v14 multi-tile Free Tile ownership into independent v15 sources', () => {
    const document = createDocument('legacy free tile project', 5, 2, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const pixels = new Uint8ClampedArray(4 * 1 * 4)
    pixels.set([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255])
    const tileset = createTilesetFromRgba('legacy-free-tileset', 'Legacy Free Tiles', 4, 1, pixels, 2, 1, (index) => `tile-${index}`)
    document.tilesets = [tileset]
    layer.kind = 'tilemap'
    layer.tilemapTilesetId = tileset.id
    const tilemap = createTilemapCelData(document.width, document.height, 2, 1)
    tilemap.cells[0] = { tilesetId: tileset.id, tileId: 'tile-0' }
    tilemap.cells[1] = { tilesetId: tileset.id, tileId: 'tile-1' }
    cel.tilemap = tilemap
    cel.surface = renderTilemapSurface(tilemap, document.tilesets, document.colorMode)
    refreshActiveAnimationFrame(document)

    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    const layerManifest = manifest.document.layers[0]
    layerManifest.kind = 'free-tile'
    layerManifest.freeTileTilesetId = tileset.id
    delete layerManifest.tilemapTilesetId
    const celManifest = manifest.document.animation.cels[0]
    celManifest.freeTiles = { instances: [
      { id: 'legacy-red', tileId: 'tile-0', x: 0, y: 0 },
      { id: 'legacy-blue', tileId: 'tile-1', x: 1, y: 0 }
    ] }
    delete celManifest.tilemap
    manifest.schemaVersion = 14
    manifest.document.schemaVersion = 14
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    const reopened = decodeProject(zipSync(files))
    const migratedLayer = reopened.layers[0]
    const migratedCel = ensureAnimationDocument(reopened).cels[0]
    expect(migratedLayer).toMatchObject({ kind: 'free-tile' })
    expect(migratedLayer.freeTileSources).toHaveLength(2)
    expect(reopened.tilesets).toHaveLength(2)
    expect(reopened.tilesets?.some((candidate) => candidate.id === tileset.id)).toBe(false)
    expect(migratedCel.freeTiles?.instances).toEqual([
      expect.objectContaining({ id: 'legacy-red', sourceId: migratedLayer.freeTileSources![0].id }),
      expect.objectContaining({ id: 'legacy-blue', sourceId: migratedLayer.freeTileSources![1].id })
    ])
    expect(readLayerColorAt(reopened, getActiveLayer(reopened), 1, 0)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
  })

  it('migrates v17 Free Tile layers into distinct source sets and rejects missing v18 identities', () => {
    const document = createDocument('free tile set migration', 3, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const first = getActiveLayer(document)
    const firstTileset = createSolidTileset('migration-free-a', 'Migration A', 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'migration-tile-a')
    const secondTileset = createSolidTileset('migration-free-b', 'Migration B', 1, 1, { r: 0, g: 0, b: 255, a: 255 }, 'migration-tile-b')
    document.tilesets = [firstTileset, secondTileset]
    first.kind = 'free-tile'
    first.freeTileSetId = 'migration-set-a'
    first.freeTileSources = [{ id: 'migration-source-a', name: 'Migration A', tilesetId: firstTileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    timeline.cels[0].freeTiles = { instances: [] }
    timeline.cels[0].surface = renderFreeTileSurface({ instances: [] }, freeTileSourceRefs(first.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)

    const second = createLayer('Migration B', document.width, document.height, document.colorMode)
    second.kind = 'free-tile'
    second.freeTileSetId = 'migration-set-b'
    second.freeTileSources = [{ id: 'migration-source-b', name: 'Migration B', tilesetId: secondTileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    document.layers.push(second)
    timeline.cels.push({
      id: 'migration-free-cel-b',
      layerId: second.id,
      frameId: timeline.activeFrameId,
      opacity: second.opacity,
      freeTiles: { instances: [] },
      surface: renderFreeTileSurface({ instances: [] }, freeTileSourceRefs(second.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)
    })
    refreshActiveAnimationFrame(document)

    const legacyFiles = unzipSync(encodeProject(document))
    const legacyManifest = readTestManifest(legacyFiles)
    legacyManifest.schemaVersion = 17
    legacyManifest.document.schemaVersion = 17
    for (const layer of legacyManifest.document.layers) delete layer.freeTileSetId
    legacyFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(legacyManifest))
    const migrated = decodeProject(zipSync(legacyFiles))
    const migratedSetIds = migrated.layers.filter((layer) => layer.kind === 'free-tile').map((layer) => layer.freeTileSetId)
    expect(migratedSetIds).toHaveLength(2)
    expect(migratedSetIds.every(Boolean)).toBe(true)
    expect(new Set(migratedSetIds).size).toBe(2)

    const invalidFiles = unzipSync(encodeProject(document))
    const invalidManifest = readTestManifest(invalidFiles)
    invalidManifest.document.layers.find((layer) => layer.kind === 'free-tile')!.freeTileSetId = ''
    invalidFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(invalidManifest))
    expect(() => decodeProject(zipSync(invalidFiles))).toThrow()
  })

  it('rejects corrupt Free Tile instances and invalid shared-set ownership', () => {
    const createFreeTileProject = () => {
      const document = createDocument('free tile validation', 2, 2, 'rgba')
      const layer = getActiveLayer(document)
      const cel = ensureAnimationDocument(document).cels[0]
      const tileset = createSolidTileset('free-tileset', 'Free Tiles', 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'tile-1')
      document.tilesets = [tileset]
      layer.kind = 'free-tile'
      layer.freeTileSetId = 'free-set-a'
      layer.freeTileSources = [{ id: 'source-1', name: 'Free Tiles', tilesetId: tileset.id, visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
      cel.freeTiles = { instances: [
        { id: 'instance-1', sourceId: 'source-1', x: 0, y: 0 },
        { id: 'instance-2', sourceId: 'source-1', x: 1, y: 0 }
      ] }
      cel.surface = renderFreeTileSurface(cel.freeTiles, freeTileSourceRefs(layer.freeTileSources, document.tilesets), document.colorMode, document.width, document.height)
      refreshActiveAnimationFrame(document)
      return document
    }

    for (const corrupt of [
      (manifest: TestProjectManifest) => { manifest.document.animation.cels[0].freeTiles!.instances[1].id = 'instance-1' },
      (manifest: TestProjectManifest) => { manifest.document.animation.cels[0].freeTiles!.instances[0].sourceId = 'missing' },
      (manifest: TestProjectManifest) => { manifest.document.animation.cels[0].freeTiles!.instances[0].tileId = 'tile-1' },
      (manifest: TestProjectManifest) => { manifest.document.animation.cels[0].freeTiles!.instances[0].rotation = 4 }
    ]) {
      const files = unzipSync(encodeProject(createFreeTileProject()))
      const manifest = readTestManifest(files)
      corrupt(manifest)
      files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))
      expect(() => decodeProject(zipSync(files))).toThrow()
    }

    const invalidSetFiles = unzipSync(encodeProject(createFreeTileProject()))
    const invalidSetManifest = readTestManifest(invalidSetFiles)
    const firstLayer = invalidSetManifest.document.layers[0]
    const firstCel = invalidSetManifest.document.animation.cels[0]
    invalidSetManifest.document.layers.push({ ...firstLayer, id: 'second-free-layer', freeTileSetId: 'free-set-b' })
    invalidSetManifest.document.animation.cels.push({ ...firstCel, id: 'second-free-cel', layerId: 'second-free-layer', freeTiles: { instances: [] } })
    invalidSetFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(invalidSetManifest))
    expect(() => decodeProject(zipSync(invalidSetFiles))).toThrow()

    const mismatchedSetFiles = unzipSync(encodeProject(createFreeTileProject()))
    const mismatchedSetManifest = readTestManifest(mismatchedSetFiles)
    const canonicalLayer = mismatchedSetManifest.document.layers[0]
    const canonicalCel = mismatchedSetManifest.document.animation.cels[0]
    mismatchedSetManifest.document.layers.push({
      ...canonicalLayer,
      id: 'mismatched-free-layer',
      freeTileSources: canonicalLayer.freeTileSources!.map((source) => ({ ...source, offsetX: (source.offsetX ?? 0) + 1 }))
    })
    mismatchedSetManifest.document.animation.cels.push({ ...canonicalCel, id: 'mismatched-free-cel', layerId: 'mismatched-free-layer', freeTiles: { instances: [] } })
    mismatchedSetFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(mismatchedSetManifest))
    expect(() => decodeProject(zipSync(mismatchedSetFiles))).toThrow()

    const sharedAcrossKinds = createFreeTileProject()
    const sharedTileset = sharedAcrossKinds.tilesets![0]
    const tilemapLayer = createLayer('Tilemap Owner', sharedAcrossKinds.width, sharedAcrossKinds.height, sharedAcrossKinds.colorMode)
    tilemapLayer.kind = 'tilemap'
    tilemapLayer.tilemapTilesetId = sharedTileset.id
    sharedAcrossKinds.layers.push(tilemapLayer)
    const tilemap = createTilemapCelData(sharedAcrossKinds.width, sharedAcrossKinds.height, 1, 1)
    ensureAnimationDocument(sharedAcrossKinds).cels.push({
      id: 'shared-tilemap-cel',
      layerId: tilemapLayer.id,
      frameId: ensureAnimationDocument(sharedAcrossKinds).activeFrameId,
      opacity: tilemapLayer.opacity,
      tilemap,
      surface: renderTilemapSurface(tilemap, sharedAcrossKinds.tilesets!, sharedAcrossKinds.colorMode)
    })
    expect(() => decodeProject(encodeProject(sharedAcrossKinds))).toThrow()
  })

  it('rejects tilemap cells that reference a missing tile', () => {
    const document = createDocument('broken tilemap project', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const tileset = createSolidTileset('tileset-1', 'Solid', 2, 2, { r: 255, g: 0, b: 0, a: 255 }, 'tile-1')
    const tilemap = createTilemapCelData(2, 2, 2, 2)
    tilemap.cells[0] = { tilesetId: 'tileset-1', tileId: 'tile-1' }
    document.tilesets = [tileset]
    layer.kind = 'tilemap'
    cel.tilemap = tilemap
    cel.surface = renderTilemapSurface(tilemap, document.tilesets, document.colorMode)
    refreshActiveAnimationFrame(document)
    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    manifest.document.animation.cels[0].tilemap!.cells[0].tileId = 'missing'
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    expect(() => decodeProject(zipSync(files))).toThrow()
  })

  it('rejects Tileset layouts that omit or duplicate stable tile IDs', () => {
    const document = createDocument('broken tileset layout', 2, 2, 'rgba')
    document.tilesets = [createSolidTileset('tileset-1', 'Solid', 1, 1, { r: 255, g: 0, b: 0, a: 255 }, 'tile-1')]
    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    manifest.document.tilesets![0].tileSlots = [null, null]
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    expect(() => decodeProject(zipSync(files))).toThrow()
  })

  it('rejects unknown versions without guessing their fields', () => {
    expect(() => migrateProjectManifest({ app: 'MoonSprite', schemaVersion: PROJECT_SCHEMA_VERSION + 1, document: { schemaVersion: PROJECT_SCHEMA_VERSION + 1 } })).toThrow()
    expect(() => migrateProjectManifest({ app: 'Other', schemaVersion: 1, document: { schemaVersion: 1 } })).toThrow()
  })



  it('round-trips editable text layer and cel metadata with the rendered surface', () => {
    const document = createDocument('editable text', 8, 8, 'rgba')
    const layer = getActiveLayer(document)
    const cel = ensureAnimationDocument(document).cels[0]
    layer.kind = 'text'
    cel.text = {
      text: 'Moon\nSprite',
      fontFamily: 'Consolas',
      fontSize: 18,
      lineSpacing: 3,
      letterSpacing: 1,
      spacingMode: 'actual',
      antialias: 'smooth',
      color: { r: 12, g: 34, b: 56, a: 200 },
      styleRuns: [
        { start: 0, end: 4, fontSize: 24, letterSpacing: 0, color: { r: 255, g: 0, b: 0, a: 255 } },
        { start: 5, end: 11, lineSpacing: 2, color: { r: 0, g: 0, b: 255, a: 255 } }
      ],
      originX: 3,
      originY: 4,
      boxWidth: 7,
      boxHeight: 6,
      transforms: [{ source: { x: 3, y: 4, width: 4, height: 2 }, target: { x: 2, y: 3, width: 8, height: 4 }, angle: 45, shear: { axis: 'x', edge: 'n', amount: 2 } }]
    }
    layer.offsetX = 3
    layer.offsetY = 4
    cel.surface!.offsetX = 3
    cel.surface!.offsetY = 4
    cel.surface!.pixels.set([12, 34, 56, 200])

    const archive = encodeProject(document)
    const manifest = readTestManifest(unzipSync(archive))
    const restored = decodeProject(archive)
    const restoredCel = ensureAnimationDocument(restored).cels[0]

    expect(manifest.document.layers[0].kind).toBe('text')
    expect(manifest.document.animation.cels[0].text).toEqual(cel.text)
    expect(getActiveLayer(restored).kind).toBe('text')
    expect(restoredCel.text).toEqual(cel.text)
    expect(restoredCel.surface).toMatchObject({ offsetX: 3, offsetY: 4 })
    expect(restoredCel.surface?.pixels.slice(0, 4)).toEqual(new Uint8ClampedArray([12, 34, 56, 200]))
  })

  it('round-trips sparse RGBA bytes exactly, including transparent RGB values', () => {
    const document = createDocument('sparse rgba', 128, 128, 'rgba')
    const pixels = getActiveLayer(document).pixels as Uint8ClampedArray
    pixels.set([17, 34, 51, 0], 4)
    pixels.set([255, 0, 128, 255], ((80 * 128) + 96) * 4)

    const files = unzipSync(encodeProject(document))
    const entry = activeRasterEntry(files)
    const restored = decodeProject(zipSync(files))

    expect(entry.dataEncoding).toBe('sparse-tiles-v1')
    expect(entry.dataFile).toMatch(/\.tiles$/)
    expect(getActiveLayer(restored).pixels).toEqual(pixels)
  })

  it('prewarms sparse visible bounds for magic wand', () => {
    const document = createDocument('sparse visible bounds', 128, 128, 'rgba')
    const pixels = getActiveLayer(document).pixels as Uint8ClampedArray
    pixels[(80 * 128 + 96) * 4 + 3] = 255

    const restored = decodeProject(encodeProject(document))
    const layer = getActiveLayer(restored)

    expect(cachedLayerContentBounds(restored, layer)).toEqual({ x: 64, y: 64, width: 64, height: 64 })
  })

  it('rejects malformed sparse raster containers', () => {
    const document = createDocument('corrupt sparse', 128, 128, 'rgba')
    const pixels = getActiveLayer(document).pixels as Uint8ClampedArray
    pixels[3] = 255
    pixels[(70 * 128 + 70) * 4 + 3] = 255
    const original = unzipSync(encodeProject(document))
    const dataFile = activeRasterEntry(original).dataFile
    const corruptions: Array<(bytes: Uint8Array) => Uint8Array> = [
      (bytes) => { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(0, 0, true); return bytes },
      (bytes) => { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(8, 127, true); return bytes },
      (bytes) => { const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); view.setUint32(40, 0, true); view.setUint32(44, 0, true); return bytes },
      (bytes) => { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(24, 128, true); return bytes },
      (bytes) => bytes.subarray(0, bytes.byteLength - 1)
    ]

    for (const corrupt of corruptions) {
      const files = { ...original, [dataFile]: corrupt(original[dataFile].slice()) }
      expect(() => decodeProject(zipSync(files))).toThrow()
    }
})
  it('round-trips the async archive and reports monotonic progress', async () => {
    const document = createDocument('async archive', 320, 256, 'rgba')
    writeLayerColor(document, getActiveLayer(document), 42, { r: 25, g: 50, b: 75, a: 255 })
    const progress: number[] = []

    const restored = decodeProject(await encodeProjectAsync(document, { onProgress: (value) => progress.push(value) }))

    expect(readLayerColorAt(restored, getActiveLayer(restored), 42, 0)).toEqual({ r: 25, g: 50, b: 75, a: 255 })
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(1)
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true)
  })

  it('persists canvas expansion offsets instead of reusing stale incremental raster geometry', async () => {
    const document = createDocument('expanded canvas save', 32, 32, 'rgba')
    writeLayerColor(document, getActiveLayer(document), 15 * 32 + 15, { r: 120, g: 70, b: 80, a: 255 })
    const archive = encodeProject(document)
    const restored = decodeProject(archive)
    registerProjectSaveBaseline(restored, 'D:/gallery/expanded-canvas-save.moonsprite', archive)

    resizeDocumentAt(restored, 96, 96, 32, 32)
    resizeAnimationCelsAt(restored, 32, 32, false, 32, 32)
    const encoded = await encodeProjectSaveAsync(restored)
    const patch = unzipSync(encoded.data)
    const savedEntry = activeRasterEntry(patch)
    const plan = patch['.moonsprite-save-plan.json']
      ? JSON.parse(strFromU8(patch['.moonsprite-save-plan.json'])) as { entries: Array<{ path: string }> }
      : { entries: [] }
    const sourceFiles = unzipSync(archive)
    const mergedFiles: Zippable = { ...patch }
    delete mergedFiles['.moonsprite-save-plan.json']
    for (const entry of plan.entries) mergedFiles[entry.path] = sourceFiles[entry.path]
    const reopened = decodeProject(zipSync(mergedFiles))

    expect(savedEntry).toMatchObject({ width: 32, height: 32, offsetX: 32, offsetY: 32 })
    expect(getActiveLayer(reopened)).toMatchObject({ width: 32, height: 32, offsetX: 32, offsetY: 32 })
    expect(readLayerColorAt(reopened, getActiveLayer(reopened), 47, 47)).toEqual({ r: 120, g: 70, b: 80, a: 255 })
    expect(readLayerColorAt(reopened, getActiveLayer(reopened), 15, 15).a).toBe(0)
  })

  it('keeps v5 sparse raster storage lazy while migrating document metadata to v6', () => {
    const document = createDocument('v5 sparse migration', 128, 128, 'rgba')
    writeLayerColor(document, getActiveLayer(document), 65 * 128 + 66, { r: 255, g: 0, b: 0, a: 255 })
    const files = unzipSync(encodeProject(document))
    const manifest = readTestManifest(files)
    manifest.schemaVersion = 5
    manifest.document.schemaVersion = 5
    delete (manifest.document as TestProjectManifest['document'] & { slices?: unknown }).slices
    files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest))

    const restored = decodeProject(zipSync(files))
    const layer = getActiveLayer(restored)

    expect(restored.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(restored.slices).toEqual([])
    expect(runtimeRasterForSurface(layer)).not.toBeNull()
    expect(surfacePixelsMaterialized(layer)).toBe(false)
    expect(readLayerColorAt(restored, layer, 66, 65)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(surfacePixelsMaterialized(layer)).toBe(false)
  })






})
