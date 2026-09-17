import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelKey, animationCelOffsetsForKeys, ensureAnimationDocument, setAnimationCelOffsetsForKeys } from '@/core/animation'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { packColor } from '@/core/raster'
import { activeTilemapCelTarget, captureTilemapSelectionMove, previewTilemapSelectionMove, tilemapEditPreviewTilePixels, writeTilemapCell } from '@/core/tilemap-document'
import { activeFreeTileCelTarget, captureFreeTileSourceSnapshot } from '@/core/free-tile-document'
import { freeTileInstanceBounds, freeTileSourceRefs } from '@/core/free-tile'
import { createFreeTileSourceEditRaster, freeTileSelectionToEditRaster, freeTileSourceSnapshotFromEditRaster, freeTileTransformTargetToEditRaster } from '@/core/free-tile-edit'
import { appendBlankTilesetTile, beginTilemapEdit, createBlankTileset, readTilesetTilePixels, tilemapCellBounds, tilemapCellIndexAtPoint, writeTilesetTilePixels } from '@/core/tilemap'
import { applySelectionTranslationPreview, captureSelectionTransform, selectionTranslationPreviewEdit } from '@/core/tools'
import { isToolAvailableForSession } from './workspace-session'
import { useWorkspace } from './workspace'

beforeEach(() => {
  const api = {
    getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })),
    writeClipboardImage: vi.fn(async () => {})
  } as unknown as MoonSpriteApi
  Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: api })
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('workspace Free Tile layer ownership', () => {
  it('makes newly created raster, tilemap, and free-tile layers active without explicitly selecting them', async () => {
    const document = createDocument('new layer activity', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    const assertActivityOnly = (layerId: string): void => {
      const session = useWorkspace.getState().sessions[0]!
      expect(session.document.activeLayerId).toBe(layerId)
      // The Store retains the active layer as its implicit command target;
      // only `layerSelectionExplicit` may request the blue multi-select UI.
      expect(session.selectedLayerIds).toEqual([layerId])
      expect(session.selectedGroupIds).toEqual([])
      expect(session.layerSelectionExplicit).toBe(false)
      expect(session.selectedAnimationFrameIds).toEqual([])
      expect(session.selectedAnimationCellKeys).toEqual([])
      expect(session.selectedAnimationMaskCellKeys).toEqual([])
      expect(session.timelineActiveContext.row).toEqual({ kind: 'layer', ownerKind: 'layer', ownerId: layerId })
    }

    await useWorkspace.getState().addLayer()
    const raster = document.layers.at(-1)!
    assertActivityOnly(raster.id)

    await useWorkspace.getState().createTilemapLayer({ name: 'Terrain', tileWidth: 1, tileHeight: 1 })
    const tilemap = document.layers.find((layer) => layer.kind === 'tilemap')!
    assertActivityOnly(tilemap.id)

    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const freeTile = document.layers.find((layer) => layer.kind === 'free-tile')!
    assertActivityOnly(freeTile.id)
  })

  it('keeps a selected Free Tile layer deletable when it has instances', async () => {
    const document = createDocument('delete free tile layer with instances', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const freeTileLayer = document.layers.find((candidate) => candidate.kind === 'free-tile')!
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'layer-delete-instance', sourceId, x: 1, y: 1 }]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instance')).not.toBeNull()

    await useWorkspace.getState().addLayer()
    useWorkspace.getState().selectLayer(freeTileLayer.id)
    const session = useWorkspace.getState().sessions[0]
    expect(session.freeTileInstanceLayerId).toBeNull()
    expect(session.selectedFreeTileInstanceId).toBeNull()

    useWorkspace.getState().deleteSelectedLayers()
    expect(document.layers.some((layer) => layer.id === freeTileLayer.id)).toBe(false)
  })

  it('mirrors only the picked Free Tile instance after mirroring its selected cel', async () => {
    const document = createDocument('free tile instance mirror priority', 4, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'picked-instance', sourceId, x: 0, y: 0 },
      { id: 'other-instance', sourceId, x: 2, y: 0 }
    ]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instances')).not.toBeNull()

    useWorkspace.getState().selectAnimationCell(animationCelKey(target.layer.id, target.cel.frameId))
    useWorkspace.getState().flipActiveSelection('horizontal')
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.every((instance) => instance.flipHorizontal === true)).toBe(true)

    useWorkspace.getState().setSelectedFreeTileInstance('picked-instance', 'edit')
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([animationCelKey(target.layer.id, target.cel.frameId)])
    useWorkspace.getState().flipActiveSelection('horizontal')

    const instances = activeFreeTileCelTarget(document)!.freeTiles.instances
    expect(instances.find((instance) => instance.id === 'picked-instance')).toMatchObject({ flipHorizontal: false })
    expect(instances.find((instance) => instance.id === 'other-instance')).toMatchObject({ flipHorizontal: true })
  })

  it('clears the Free Tile instance selection when selecting its timeline cel', async () => {
    const document = createDocument('free tile cel clears instance selection', 4, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'picked-instance', sourceId, x: 0, y: 0 },
      { id: 'other-instance', sourceId, x: 2, y: 0 }
    ]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instances')).not.toBeNull()

    useWorkspace.getState().setSelectedFreeTileInstance('picked-instance', 'edit')
    useWorkspace.getState().selectAnimationCell(animationCelKey(target.layer.id, target.cel.frameId))
    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedFreeTileInstanceId).toBeNull()
    expect(session.selectedFreeTileInstanceIds).toEqual([])
    expect(session.freeTileInstanceLayerId).toBeNull()

    useWorkspace.getState().flipActiveSelection('horizontal')
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.every((instance) => instance.flipHorizontal === true)).toBe(true)
  })

  it('reuses one Free Tile source set across multiple layers', async () => {
    const document = createDocument('shared free tile set', 6, 2, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createFreeTileLayer({ name: 'Shared A' })
    const first = document.layers.find((candidate) => candidate.name === 'Shared A')!
    const setId = first.freeTileSetId!
    const sourceId = first.freeTileSources![0].id
    await useWorkspace.getState().createFreeTileLayer({ name: 'Shared B', freeTileSetId: setId })
    const second = document.layers.find((candidate) => candidate.name === 'Shared B')!

    expect(second.freeTileSetId).toBe(setId)
    expect(second.freeTileSources).toBe(first.freeTileSources)
    expect(second.freeTileSources?.map((source) => source.id)).toEqual([sourceId])
    expect(document.tilesets).toHaveLength(1)

    useWorkspace.getState().selectLayer(first.id)
    const firstPlacement = useWorkspace.getState().beginFreeTilePlacement()!
    firstPlacement.after.instances = [{ id: 'shared-first', sourceId, x: 0, y: 0 }]
    expect(useWorkspace.getState().previewFreeTilePlacement(firstPlacement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(firstPlacement, 'Place shared source')).not.toBeNull()

    useWorkspace.getState().selectLayer(second.id)
    const secondPlacement = useWorkspace.getState().beginFreeTilePlacement()!
    secondPlacement.after.instances = [{ id: 'shared-second', sourceId, x: 2, y: 0 }]
    expect(useWorkspace.getState().previewFreeTilePlacement(secondPlacement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(secondPlacement, 'Place shared source')).not.toBeNull()

    const before = captureFreeTileSourceSnapshot(document, sourceId)!
    const after = { ...before, pixels: new Uint8ClampedArray([12, 34, 56, 255]) }
    expect(useWorkspace.getState().commitFreeTileSourceEdit(sourceId, before, after, 'Edit shared source')).not.toBeNull()
    expect(readLayerColorAt(document, first, 0, 0)).toEqual({ r: 12, g: 34, b: 56, a: 255 })
    expect(readLayerColorAt(document, second, 2, 0)).toEqual({ r: 12, g: 34, b: 56, a: 255 })

    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, first, 0, 0).a).toBe(0)
    expect(readLayerColorAt(document, second, 2, 0).a).toBe(0)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, first, 0, 0)).toEqual({ r: 12, g: 34, b: 56, a: 255 })
    expect(readLayerColorAt(document, second, 2, 0)).toEqual({ r: 12, g: 34, b: 56, a: 255 })

    const addedSourceId = useWorkspace.getState().addFreeTileSource(second.id)!
    expect(first.freeTileSources).toBe(second.freeTileSources)
    expect(first.freeTileSources).toHaveLength(2)
    expect(useWorkspace.getState().deleteFreeTileSource(addedSourceId)).toBe(true)
    expect(first.freeTileSources).toBe(second.freeTileSources)
    expect(first.freeTileSources).toHaveLength(1)
    useWorkspace.getState().undo()
    expect(first.freeTileSources).toBe(second.freeTileSources)
    expect(first.freeTileSources).toHaveLength(2)
  })

  it('stores source properties separately from instance appearance', async () => {
    const document = createDocument('free tile source properties', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const layer = document.layers.find((candidate) => candidate.kind === 'free-tile')!
    const source = layer.freeTileSources![0]
    const initialDisplayColor = source.displayColor ? { ...source.displayColor } : undefined
    expect(initialDisplayColor).toBeDefined()

    expect(useWorkspace.getState().setFreeTileSourceProperties(source.id, {
      name: 'Glow',
      description: 'Reusable glow source',
      displayColor: { r: 12, g: 34, b: 56, a: 255 },
      offsetX: -2,
      offsetY: 3,
      locked: true,
      visible: false
    })).toBe(true)
    expect(layer.freeTileSources![0]).toMatchObject({ name: 'Glow', description: 'Reusable glow source', opacity: 1, offsetX: -2, offsetY: 3, locked: true, visible: false, blendMode: 'normal', displayColor: { r: 12, g: 34, b: 56, a: 255 } })

    useWorkspace.getState().undo()
    expect(layer.freeTileSources![0]).toMatchObject({ name: '自由瓦片1', opacity: 1, offsetX: 0, offsetY: 0, locked: false, visible: true, blendMode: 'normal', displayColor: initialDisplayColor })
    expect(layer.freeTileSources![0].description).toBeUndefined()
    useWorkspace.getState().redo()
    expect(layer.freeTileSources![0].displayColor).toEqual({ r: 12, g: 34, b: 56, a: 255 })

    expect(useWorkspace.getState().setFreeTileSourceProperties(source.id, { displayColor: null })).toBe(true)
    expect(layer.freeTileSources![0].displayColor).toBeUndefined()
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'instance-properties', sourceId: source.id, x: 0, y: 0, opacity: 1, blendMode: 'normal' }]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instance')).not.toBeNull()
    expect(useWorkspace.getState().setFreeTileInstanceProperties('instance-properties', { opacity: 0.65, blendMode: 'screen' })).toBe(true)
    expect(layer.freeTileSources![0]).toMatchObject({ opacity: 1, blendMode: 'normal' })
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ opacity: 0.65, blendMode: 'screen' })
  })

  it('previews Free Tile instance properties and commits all fields as one history step', async () => {
    const document = createDocument('free tile instance property transaction', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Instance Transaction' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'transaction-instance', sourceId, x: 1, y: 2 }]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instance')).not.toBeNull()
    const originalUpdatedAt = document.updatedAt
    document.dirty = false

    const canceledTransaction = useWorkspace.getState().beginFreeTileInstancePropertiesTransaction('transaction-instance')!
    expect(useWorkspace.getState().previewFreeTileInstancePropertiesTransaction(canceledTransaction, { x: 4, y: 5, rotation: 1, flipHorizontal: true, opacity: 0.5, blendMode: 'screen' })).toBe(true)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ rotation: 1, flipHorizontal: true, opacity: 0.5, blendMode: 'screen' })
    expect(freeTileInstanceBounds(activeFreeTileCelTarget(document)!.freeTiles.instances[0], activeFreeTileCelTarget(document)!.sources)).toMatchObject({ x: 4, y: 5 })
    expect(document.dirty).toBe(false)
    expect(document.updatedAt).toBe(originalUpdatedAt)
    expect(useWorkspace.getState().cancelFreeTileInstancePropertiesTransaction(canceledTransaction)).toBe(true)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ x: 1, y: 2 })
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).not.toHaveProperty('rotation')

    const committedTransaction = useWorkspace.getState().beginFreeTileInstancePropertiesTransaction('transaction-instance')!
    expect(useWorkspace.getState().previewFreeTileInstancePropertiesTransaction(committedTransaction, { rotation: 1 })).toBe(true)
    const finalChanges = { x: 6, y: 7, rotation: 2 as const, flipVertical: true, opacity: 0.65, blendMode: 'multiply' as const }
    expect(useWorkspace.getState().previewFreeTileInstancePropertiesTransaction(committedTransaction, finalChanges)).toBe(true)
    expect(useWorkspace.getState().commitFreeTileInstancePropertiesTransaction(committedTransaction, finalChanges)).toBe(true)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ rotation: 2, flipVertical: true, opacity: 0.65, blendMode: 'multiply' })
    expect(freeTileInstanceBounds(activeFreeTileCelTarget(document)!.freeTiles.instances[0], activeFreeTileCelTarget(document)!.sources)).toMatchObject({ x: 6, y: 7 })

    useWorkspace.getState().undo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ x: 1, y: 2 })
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).not.toHaveProperty('rotation')
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).not.toHaveProperty('flipVertical')
    useWorkspace.getState().redo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ rotation: 2, flipVertical: true, opacity: 0.65, blendMode: 'multiply' })
  })



  it('commits a Free Tile source transform and its selection as one history step', async () => {
    const document = createDocument('free tile source selection history', 8, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Shared source' })
    const target = activeFreeTileCelTarget(document)!
    const source = target.layer.freeTileSources![0]
    const tileset = document.tilesets!.find((candidate) => candidate.id === source.tilesetId)!
    writeTilesetTilePixels(tileset, tileset.tileIds[0], new Uint8ClampedArray([220, 40, 60, 255]))
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'selected', sourceId: source.id, x: 1, y: 1 },
      { id: 'sibling', sourceId: source.id, x: 5, y: 1 }
    ]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instances')).not.toBeNull()
    const beforeSelection = { x: 1, y: 1, width: 1, height: 1 }
    const afterSelection = { x: 2, y: 1, width: 1, height: 1 }
    useWorkspace.getState().setSelection(beforeSelection)
    useWorkspace.getState().setSelectionPivot({ x: 1.5, y: 1.5 })
    const before = captureFreeTileSourceSnapshot(document, source.id)!
    const after = { ...before, pixels: before.pixels.slice(), offsetX: before.offsetX + 1 }

    expect(useWorkspace.getState().commitFreeTileSourceEdit(
      source.id,
      before,
      after,
      'Transform source selection',
      undefined,
      {
        before: beforeSelection,
        after: afterSelection,
        beforePivot: { x: 1.5, y: 1.5 },
        afterPivot: { x: 2.5, y: 1.5 }
      }
    )).not.toBeNull()
    expect(source.offsetX).toBe(1)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject(afterSelection)
    expect(useWorkspace.getState().sessions[0].selectionPivot).toEqual({ x: 2.5, y: 1.5 })
    expect(readLayerColorAt(document, target.layer, 2, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
    expect(readLayerColorAt(document, target.layer, 6, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })

    useWorkspace.getState().undo()
    expect(source.offsetX).toBe(0)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject(beforeSelection)
    expect(useWorkspace.getState().sessions[0].selectionPivot).toEqual({ x: 1.5, y: 1.5 })
    expect(readLayerColorAt(document, target.layer, 1, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
    expect(readLayerColorAt(document, target.layer, 5, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })

    useWorkspace.getState().redo()
    expect(source.offsetX).toBe(1)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject(afterSelection)
    expect(useWorkspace.getState().sessions[0].selectionPivot).toEqual({ x: 2.5, y: 1.5 })
  })

  it('moves only the selected instance when a selection fully covers it', async () => {
    const document = createDocument('free tile whole instance move', 8, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Whole instance move' })
    const target = activeFreeTileCelTarget(document)!
    const source = target.layer.freeTileSources![0]
    const tileset = document.tilesets!.find((candidate) => candidate.id === source.tilesetId)!
    writeTilesetTilePixels(tileset, tileset.tileIds[0], new Uint8ClampedArray([220, 40, 60, 255]))
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'whole-selected', sourceId: source.id, x: 1, y: 1 },
      { id: 'whole-sibling', sourceId: source.id, x: 5, y: 1 }
    ]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place whole instances')).not.toBeNull()

    useWorkspace.getState().setSelectedFreeTileInstance('whole-selected', 'edit')
    const beforeSelection = { x: 0, y: 0, width: 3, height: 3 }
    const afterSelection = { ...beforeSelection, x: 1 }
    useWorkspace.getState().setSelection(beforeSelection)
    useWorkspace.getState().setSelectionPivot({ x: 1.5, y: 1.5 })
    const sourceSnapshot = captureFreeTileSourceSnapshot(document, source.id)!
    const moveEdit = useWorkspace.getState().beginFreeTilePlacement()!
    moveEdit.after.instances.find((instance) => instance.id === 'whole-selected')!.x = 2
    expect(useWorkspace.getState().previewFreeTilePlacement(moveEdit)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(
      moveEdit,
      'Move whole instance',
      {
        before: beforeSelection,
        after: afterSelection,
        beforePivot: { x: 1.5, y: 1.5 },
        afterPivot: { x: 2.5, y: 1.5 }
      }
    )).not.toBeNull()

    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'whole-selected', x: 2, y: 1 },
      { id: 'whole-sibling', x: 5, y: 1 }
    ])
    expect(readLayerColorAt(document, target.layer, 1, 1).a).toBe(0)
    expect(readLayerColorAt(document, target.layer, 2, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
    expect(readLayerColorAt(document, target.layer, 5, 1)).toEqual({ r: 220, g: 40, b: 60, a: 255 })
    expect(captureFreeTileSourceSnapshot(document, source.id)?.pixels).toEqual(sourceSnapshot.pixels)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject(afterSelection)

    useWorkspace.getState().undo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'whole-selected', x: 1, y: 1 },
      { id: 'whole-sibling', x: 5, y: 1 }
    ])
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject(beforeSelection)
    useWorkspace.getState().redo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ id: 'whole-selected', x: 2, y: 1 })
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[1]).toMatchObject({ id: 'whole-sibling', x: 5, y: 1 })
  })

  it('pastes a copied raster selection into the selected Free Tile instance source', async () => {
    const document = createDocument('paste selection into selected free tile instance', 8, 6, 'rgba')
    const rasterLayer = getActiveLayer(document)
    const red = { r: 220, g: 40, b: 60, a: 255 }
    const blue = { r: 20, g: 80, b: 230, a: 255 }
    writeLayerColor(document, rasterLayer, 2 * document.width + 3, red)
    writeLayerColor(document, rasterLayer, 2 * document.width + 4, blue)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 3, y: 2, width: 2, height: 1 })
    useWorkspace.getState().copySelection()
    await useWorkspace.getState().createFreeTileLayer({ name: 'Shared Props' })
    const freeTileLayer = document.layers.find((candidate) => candidate.kind === 'free-tile')!
    const target = activeFreeTileCelTarget(document)!
    const source = freeTileLayer.freeTileSources![0]
    const tileset = document.tilesets!.find((candidate) => candidate.id === source.tilesetId)!
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'selected-instance', sourceId: source.id, x: 3, y: 2 },
      { id: 'shared-instance', sourceId: source.id, x: 0, y: 0 }
    ]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place shared instances')).not.toBeNull()
    useWorkspace.getState().setSelectedFreeTileInstance('selected-instance', 'edit')

    await useWorkspace.getState().pasteSelection()

    expect(freeTileLayer.freeTileSources).toHaveLength(1)
    expect(document.tilesets).toHaveLength(1)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances).toHaveLength(2)
    expect(tileset).toMatchObject({ tileWidth: 2, tileHeight: 1 })
    expect(readTilesetTilePixels(tileset, tileset.tileIds[0])).toEqual(new Uint8ClampedArray([
      220, 40, 60, 255,
      20, 80, 230, 255
    ]))
    expect(readLayerColorAt(document, freeTileLayer, 3, 2)).toEqual(red)
    expect(readLayerColorAt(document, freeTileLayer, 4, 2)).toEqual(blue)
    expect(readLayerColorAt(document, freeTileLayer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, freeTileLayer, 1, 0)).toEqual(blue)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      selectedTilesetId: tileset.id,
      selectedFreeTileInstanceId: 'selected-instance',
      freeTileMode: 'edit'
    })

    useWorkspace.getState().undo()
    expect(freeTileLayer.freeTileSources).toHaveLength(1)
    expect(document.tilesets).toHaveLength(1)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances).toHaveLength(2)
    expect(tileset).toMatchObject({ tileWidth: 1, tileHeight: 1 })
    expect(readLayerColorAt(document, freeTileLayer, 3, 2).a).toBe(0)
    expect(readLayerColorAt(document, freeTileLayer, 0, 0).a).toBe(0)

    useWorkspace.getState().redo()
    expect(tileset).toMatchObject({ tileWidth: 2, tileHeight: 1 })
    expect(readLayerColorAt(document, freeTileLayer, 1, 0)).toEqual(blue)
  })



  it('deletes multiple selected Free Tile instances as one undoable operation', async () => {
    const document = createDocument('batch delete free tile instances', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Batch Delete' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'delete-a', sourceId, x: 1, y: 1 },
      { id: 'delete-b', sourceId, x: 3, y: 1 },
      { id: 'delete-c', sourceId, x: 5, y: 1 }
    ]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instances')).not.toBeNull()

    const order = ['delete-c', 'delete-b', 'delete-a']
    useWorkspace.getState().selectFreeTileInstanceRow('delete-a', 'replace', order)
    useWorkspace.getState().selectFreeTileInstanceRow('delete-b', 'toggle', order)
    const selectedIds = useWorkspace.getState().sessions[0].selectedFreeTileInstanceIds
    expect(useWorkspace.getState().deleteFreeTileInstances(selectedIds)).toBe(true)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map((instance) => instance.id)).toEqual(['delete-c'])
    expect(useWorkspace.getState().sessions[0].selectedFreeTileInstanceIds).toEqual(['delete-c'])

    useWorkspace.getState().undo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map((instance) => instance.id)).toEqual(['delete-a', 'delete-b', 'delete-c'])
    useWorkspace.getState().redo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map((instance) => instance.id)).toEqual(['delete-c'])
  })









  it('keeps instance visibility undoable and protects locked instances from edits', async () => {
    const document = createDocument('free tile instance state', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'instance-a', sourceId, x: 1, y: 2 }, { id: 'instance-b', sourceId, x: 4, y: 5 }]
    expect(useWorkspace.getState().previewFreeTilePlacement(placement)).toBe(true)
    expect(useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instances')).not.toBeNull()

    expect(useWorkspace.getState().setFreeTileInstanceProperties('instance-a', { locked: true })).toBe(true)
    expect(useWorkspace.getState().setFreeTileInstanceProperties('instance-a', { x: 6, y: 7 })).toBe(false)
    expect(useWorkspace.getState().deleteFreeTileInstance('instance-a')).toBe(false)
    expect(useWorkspace.getState().reorderFreeTileInstance('instance-a', 'instance-b', 'before')).toBe(false)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.find((instance) => instance.id === 'instance-a')).toMatchObject({ x: 1, y: 2, locked: true })

    expect(useWorkspace.getState().setFreeTileInstanceProperties('instance-a', { visible: false })).toBe(true)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.find((instance) => instance.id === 'instance-a')).toMatchObject({ visible: false, locked: true })
    useWorkspace.getState().undo()
    const restored = activeFreeTileCelTarget(document)!.freeTiles.instances.find((instance) => instance.id === 'instance-a')!
    expect(restored.visible).not.toBe(false)
    expect(restored.locked).toBe(true)
    useWorkspace.getState().redo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.find((instance) => instance.id === 'instance-a')).toMatchObject({ visible: false, locked: true })
  })

  it('allows pixel tools while editing a Free Tile source but keeps placement mode restricted', async () => {
    const document = createDocument('free tile tool availability', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Props' })
    const session = useWorkspace.getState().sessions[0]

    useWorkspace.getState().setFreeTileMode('edit')
    expect(isToolAvailableForSession(session, 'fill')).toBe(true)
    expect(isToolAvailableForSession(session, 'shape')).toBe(true)
    expect(isToolAvailableForSession(session, 'line')).toBe(true)
    expect(isToolAvailableForSession(session, 'airbrush')).toBe(true)

    useWorkspace.getState().setFreeTileMode('paint')
    expect(isToolAvailableForSession(session, 'fill')).toBe(false)
    expect(isToolAvailableForSession(session, 'selection')).toBe(false)
  })



describe('workspace Tilemap layers', () => {
  it('keeps the active layer until drawing with another layer\'s tileset', async () => {
    const document = createDocument('tileset owner selection', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createTilemapLayer({ name: 'Tilemap A', tileWidth: 2, tileHeight: 2 })
    const layerA = document.layers.find((candidate) => candidate.name === 'Tilemap A')!
    await useWorkspace.getState().createTilemapLayer({ name: 'Tilemap B', tileWidth: 2, tileHeight: 2 })
    const layerB = document.layers.find((candidate) => candidate.name === 'Tilemap B')!
    const tilesetB = document.tilesets!.find((tileset) => tileset.id === layerB.tilemapTilesetId)!

    useWorkspace.getState().selectLayer(layerA.id)
    expect(document.activeLayerId).toBe(layerA.id)
    useWorkspace.getState().setSelectedTile(tilesetB.id, tilesetB.tileIds[0])

    expect(document.activeLayerId).toBe(layerA.id)
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([layerA.id])
    useWorkspace.getState().setTilemapMode('paint')
    expect(document.activeLayerId).toBe(layerA.id)
    useWorkspace.getState().activateTilemapLayerForDrawing()
    expect(document.activeLayerId).toBe(layerB.id)
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([layerA.id])
    expect(useWorkspace.getState().sessions[0].timelineActiveContext.row).toEqual({
      kind: 'layer',
      ownerKind: 'layer',
      ownerId: layerB.id
    })
    expect(useWorkspace.getState().sessions[0].selectedTilesetId).toBe(tilesetB.id)
  })

  it('resolves the selected Tilemap layer only when drawing starts', async () => {
    const document = createDocument('paint mode tileset owner', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createTilemapLayer({ name: 'Paint A', tileWidth: 2, tileHeight: 2 })
    const layerA = document.layers.find((candidate) => candidate.name === 'Paint A')!
    await useWorkspace.getState().createTilemapLayer({ name: 'Paint B', tileWidth: 1, tileHeight: 1 })
    const layerB = document.layers.find((candidate) => candidate.name === 'Paint B')!
    const tilesetB = document.tilesets!.find((tileset) => tileset.id === layerB.tilemapTilesetId)!
    const session = useWorkspace.getState().sessions[0]

    document.activeLayerId = layerA.id
    session.selectedLayerIds = [layerA.id]
    session.selectedTilesetId = tilesetB.id
    useWorkspace.getState().setTilemapMode('paint')

    expect(document.activeLayerId).toBe(layerA.id)
    useWorkspace.getState().activateTilemapLayerForDrawing()
    expect(document.activeLayerId).toBe(layerB.id)
    expect(session.selectedLayerIds).toEqual([layerA.id])
    expect(session.tilemapMode).toBe('paint')
  })

  it('mirrors a copied selection in paint mode as tile cells and keeps it undoable', async () => {
    const document = createDocument('flip copied tiles', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Flip tiles', tileWidth: 1, tileHeight: 1 })
    let target = activeTilemapCelTarget(document)!
    let tileset = document.tilesets![0]
    const redTileId = tileset.tileIds[0]
    const blueTileId = 'blue-tile'
    tileset = appendBlankTilesetTile(tileset, blueTileId)
    document.tilesets![0] = tileset
    target = activeTilemapCelTarget(document)!
    writeTilesetTilePixels(tileset, redTileId, new Uint8ClampedArray([220, 30, 40, 255]))
    writeTilesetTilePixels(tileset, blueTileId, new Uint8ClampedArray([30, 80, 220, 255]))
    const cells = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, cells, 0, { tilesetId: tileset.id, tileId: redTileId })
    writeTilemapCell(document, target, cells, 1, { tilesetId: tileset.id, tileId: blueTileId })
    useWorkspace.getState().commitTilemapEdit(cells, 'Set source tiles')

    useWorkspace.getState().setTilemapMode('paint')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 1 })
    useWorkspace.getState().flipActiveSelection('horizontal')

    expect(target.tilemap.cells.map((cell) => cell?.tileId)).toEqual([blueTileId, redTileId])
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 30, g: 80, b: 220, a: 255 })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 220, g: 30, b: 40, a: 255 })

    useWorkspace.getState().undo()
    expect(target.tilemap.cells.map((cell) => cell?.tileId)).toEqual([redTileId, blueTileId])
    useWorkspace.getState().redo()
    expect(target.tilemap.cells.map((cell) => cell?.tileId)).toEqual([blueTileId, redTileId])
  })

  it('keeps a mirrored floating copy when committing a hybrid Tilemap edit', async () => {
    const document = createDocument('flip floating tiles', 4, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Flip floating tiles', tileWidth: 1, tileHeight: 1 })
    let target = activeTilemapCelTarget(document)!
    let tileset = document.tilesets![0]
    const redTileId = tileset.tileIds[0]
    const blueTileId = 'floating-blue-tile'
    tileset = appendBlankTilesetTile(tileset, blueTileId)
    document.tilesets![0] = tileset
    target = activeTilemapCelTarget(document)!
    writeTilesetTilePixels(tileset, redTileId, new Uint8ClampedArray([220, 30, 40, 255]))
    writeTilesetTilePixels(tileset, blueTileId, new Uint8ClampedArray([30, 80, 220, 255]))
    const cells = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, cells, 0, { tilesetId: tileset.id, tileId: redTileId })
    writeTilemapCell(document, target, cells, 1, { tilesetId: tileset.id, tileId: blueTileId })
    useWorkspace.getState().commitTilemapEdit(cells, 'Set floating source tiles')

    const selection = { x: 0, y: 0, width: 2, height: 1 }
    const destination = { x: 2, y: 0, width: 2, height: 1 }
    const source = captureSelectionTransform(document, selection, target.layer)!
    const preview = applySelectionTranslationPreview(document, source, destination, true, null, target.layer)
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, destination, true, 'Flip floating copy', preview, destination)
    useWorkspace.getState().flipActiveSelection('horizontal')
    useWorkspace.getState().commitFloatingPaste()

    target = activeTilemapCelTarget(document)!
    expect(target.tilemap.cells.map((cell) => cell?.tileId)).toEqual([redTileId, blueTileId, blueTileId, redTileId])
    expect(readLayerColorAt(document, target.layer, 2, 0)).toEqual({ r: 30, g: 80, b: 220, a: 255 })
    expect(readLayerColorAt(document, target.layer, 3, 0)).toEqual({ r: 220, g: 30, b: 40, a: 255 })
  })

  it('creates an empty Tilemap with one transparent tile and restores the structure through history', async () => {
    const document = createDocument('empty tiles', 4, 2, 'rgba')
    const firstFrameId = ensureAnimationDocument(document).activeFrameId
    addBlankAnimationFrame(document)
    activateAnimationFrame(document, firstFrameId)
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createTilemapLayer({ name: 'Terrain', tileWidth: 2, tileHeight: 1 })

    const tileLayer = document.layers.find((layer) => layer.kind === 'tilemap')
    expect(tileLayer).toBeDefined()
    expect(tileLayer!.name).toBe('Terrain')
    expect(document.tilesets).toHaveLength(1)
    expect(tileLayer!.tilemapTilesetId).toBe(document.tilesets![0].id)
    expect(document.tilesets![0].name).toBe('Terrain')
    expect(document.tilesets![0].tileIds).toHaveLength(1)
    expect(Array.from(readTilesetTilePixels(document.tilesets![0], document.tilesets![0].tileIds[0])!)).toEqual(new Array(8).fill(0))
    const timeline = ensureAnimationDocument(document)
    const tileCels = timeline.cels.filter((cel) => cel.layerId === tileLayer!.id)
    expect(tileCels).toHaveLength(2)
    expect(tileCels.every((cel) => cel.tilemap?.cells.length === 4 && cel.surface)).toBe(true)
    expect(tileCels.every((cel) => cel.tilemap?.cells.every((cell) => cell === null))).toBe(true)
    expect(readLayerColorAt(document, tileLayer!, 0, 0).a).toBe(0)
    expect(useWorkspace.getState().sessions[0].tilemapMode).toBe('hybrid')

    const hidePanel = vi.fn()
    const showPanel = vi.fn()
    window.addEventListener('moonsprite:hide-workspace-panel', hidePanel)
    window.addEventListener('moonsprite:show-workspace-panel', showPanel)

    useWorkspace.getState().undo()
    expect(document.layers.some((layer) => layer.kind === 'tilemap')).toBe(false)
    expect(document.tilesets).toEqual([])
    expect(hidePanel).toHaveBeenCalledTimes(1)
    expect((hidePanel.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'tileset' })

    useWorkspace.getState().redo()
    const restoredLayer = document.layers.find((layer) => layer.kind === 'tilemap')
    const restoredSession = useWorkspace.getState().sessions[0]
    expect(restoredLayer).toBeDefined()
    expect(document.tilesets).toHaveLength(1)
    expect(restoredSession.selectedLayerIds).toEqual([restoredLayer!.id])
    expect(restoredSession.selectedTilesetId).toBe(document.tilesets![0].id)
    expect(restoredSession.selectedTileId).toBe(document.tilesets![0].tileIds[0])
    expect(restoredSession.tilemapMode).toBe('hybrid')
    expect(showPanel).toHaveBeenCalledTimes(1)
    expect((showPanel.mock.calls[0][0] as CustomEvent).detail).toEqual({ id: 'tileset' })

    window.removeEventListener('moonsprite:hide-workspace-panel', hidePanel)
    window.removeEventListener('moonsprite:show-workspace-panel', showPanel)
  })

  it('converts every frame of a background layer into cropped Tilemap cells and restores it through history', async () => {
    const document = createDocument('convert tiles', 3, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.name = 'Source Layer'
    layer.background = { mode: 'canvas' }
    const firstFrameId = ensureAnimationDocument(document).activeFrameId
    const red = { r: 220, g: 30, b: 40, a: 255 }
    const green = { r: 30, g: 190, b: 70, a: 255 }
    writeLayerColor(document, layer, 0, red)
    const secondFrameId = addBlankAnimationFrame(document)
    writeLayerColor(document, getActiveLayer(document), 0, green)
    activateAnimationFrame(document, firstFrameId)
    useWorkspace.getState().addSession(document)
    const showPanel = vi.fn()
    const hidePanel = vi.fn()
    window.addEventListener('moonsprite:show-workspace-panel', showPanel)
    window.addEventListener('moonsprite:hide-workspace-panel', hidePanel)

    await useWorkspace.getState().convertLayerToTilemap(layer.id, { name: 'Converted Tiles', tileWidth: 2, tileHeight: 2 })

    expect(layer).toMatchObject({ name: 'Converted Tiles', kind: 'tilemap' })
    expect(layer.background).toBeUndefined()
    expect(document.tilesets).toHaveLength(1)
    expect(document.tilesets![0].tileIds).toHaveLength(3)
    const convertedCels = ensureAnimationDocument(document).cels.filter((cel) => cel.layerId === layer.id)
    expect(convertedCels).toHaveLength(2)
    expect(convertedCels.every((cel) => cel.tilemap?.columns === 2 && cel.tilemap.rows === 1 && cel.surface?.width === 4)).toBe(true)
    expect(convertedCels.every((cel) => cel.tilemap?.cells[1] === null)).toBe(true)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    activateAnimationFrame(document, secondFrameId)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(green)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ selectedTilesetId: document.tilesets![0].id, tilemapMode: 'hybrid' })
    expect(showPanel).toHaveBeenCalledTimes(1)

    useWorkspace.getState().undo()
    expect(layer.name).toBe('Source Layer')
    expect(layer.kind).toBeUndefined()
    expect(layer.background).toEqual({ mode: 'canvas' })
    expect(document.tilesets).toEqual([])
    expect(ensureAnimationDocument(document).cels.filter((cel) => cel.layerId === layer.id).every((cel) => cel.tilemap === undefined)).toBe(true)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(green)
    activateAnimationFrame(document, firstFrameId)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(hidePanel).toHaveBeenCalledTimes(1)

    useWorkspace.getState().redo()
    expect(layer).toMatchObject({ name: 'Converted Tiles', kind: 'tilemap' })
    expect(layer.background).toBeUndefined()
    expect(document.tilesets).toHaveLength(1)
    expect(showPanel).toHaveBeenCalledTimes(2)

    window.removeEventListener('moonsprite:show-workspace-panel', showPanel)
    window.removeEventListener('moonsprite:hide-workspace-panel', hidePanel)
  })



  it('creates the first real tile when original editing starts from the transparent placeholder', async () => {
    const document = createDocument('first original tile', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'First Tile', tileWidth: 1, tileHeight: 1 })
    useWorkspace.getState().setTilemapMode('edit')
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const placeholderTileId = tileset.tileIds[0]
    const firstColor = { r: 220, g: 40, b: 60, a: 255 }
    const secondColor = { r: 30, g: 80, b: 220, a: 255 }
    const edit = beginPixelEdit(target.layer.id)
    expect(recordPixel(document, target.layer, edit, 0, packColor(firstColor))).toBe(true)
    expect(recordPixel(document, target.layer, edit, 1, packColor(secondColor))).toBe(true)

    expect(useWorkspace.getState().commitPixelEdit(edit, 'Create first original tile')).not.toBeNull()

    expect(tileset.tileIds).toHaveLength(3)
    expect(target.tilemap.cells[0]?.tileId).not.toBe(placeholderTileId)
    expect(target.tilemap.cells[1]?.tileId).not.toBe(placeholderTileId)
    expect(target.tilemap.cells[1]?.tileId).not.toBe(target.tilemap.cells[0]?.tileId)
    expect(Array.from(readTilesetTilePixels(tileset, placeholderTileId)!)).toEqual([0, 0, 0, 0])
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual(firstColor)
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual(secondColor)

    useWorkspace.getState().undo()
    expect(document.tilesets![0].tileIds).toEqual([placeholderTileId])
    expect(activeTilemapCelTarget(document)!.tilemap.cells[0]).toBeNull()
    expect(activeTilemapCelTarget(document)!.tilemap.cells[1]).toBeNull()
  })

  it('extends every Tilemap cel into newly exposed canvas areas and restores the grid through history', async () => {
    const document = createDocument('resize tiles', 4, 2, 'rgba')
    const firstFrameId = ensureAnimationDocument(document).activeFrameId
    addBlankAnimationFrame(document)
    activateAnimationFrame(document, firstFrameId)
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Resizable Tiles', tileWidth: 2, tileHeight: 1 })

    await useWorkspace.getState().resizeActiveCanvas(8, 2, 'w')
    let tileLayer = document.layers.find((layer) => layer.kind === 'tilemap')!
    let tileCels = ensureAnimationDocument(document).cels.filter((cel) => cel.layerId === tileLayer.id)
    expect(tileCels.every((cel) => cel.tilemap?.columns === 4 && cel.tilemap.rows === 2)).toBe(true)
    expect(tileCels.every((cel) => cel.surface?.width === 8 && cel.surface.height === 2)).toBe(true)

    useWorkspace.getState().undo()
    tileLayer = document.layers.find((layer) => layer.kind === 'tilemap')!
    tileCels = ensureAnimationDocument(document).cels.filter((cel) => cel.layerId === tileLayer.id)
    expect(tileCels.every((cel) => cel.tilemap?.columns === 2 && cel.surface?.width === 4)).toBe(true)

    useWorkspace.getState().redo()
    const target = activeTilemapCelTarget(document)!
    const newCellIndex = tilemapCellIndexAtPoint(target.tilemap, target.surface.offsetX, target.surface.offsetY, 7, 0)
    expect(newCellIndex).toBe(3)
    const tileId = document.tilesets![0].tileIds[0]
    const edit = beginTilemapEdit(target.layer.id, target.cel.frameId)
    expect(writeTilemapCell(document, target, edit, newCellIndex!, { tilesetId: document.tilesets![0].id, tileId })).toBe(true)
    expect(target.tilemap.cells[3]).toMatchObject({ tileId })
  })

  it('converts normal pixel-tool edits into created and modified tiles', async () => {
    const document = createDocument('tool edits', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Tool Edits', tileWidth: 1, tileHeight: 1 })
    const session = useWorkspace.getState().sessions[0]
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const red = { r: 220, g: 30, b: 40, a: 255 }

    expect(isToolAvailableForSession(session, 'fill')).toBe(true)
    expect(isToolAvailableForSession(session, 'shape')).toBe(true)
    const createEdit = beginPixelEdit(target.layer.id)
    expect(recordPixel(document, target.layer, createEdit, 0, packColor(red))).toBe(true)
    expect(useWorkspace.getState().commitPixelEdit(createEdit, 'Create with fill')).not.toBeNull()
    const createdTileId = target.tilemap.cells[0]?.tileId
    expect(createdTileId).toBeTruthy()
    expect(tileset.tileIds).toContain(createdTileId)
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual(red)

    const paint = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, paint, 1, { tilesetId: tileset.id, tileId: createdTileId! })
    useWorkspace.getState().commitTilemapEdit(paint, 'Reuse created tile')
    useWorkspace.getState().setTilemapMode('edit')
    const blue = { r: 20, g: 50, b: 230, a: 255 }
    const modifyEdit = beginPixelEdit(target.layer.id)
    expect(recordPixel(document, target.layer, modifyEdit, 0, packColor(blue))).toBe(true)
    expect(useWorkspace.getState().commitPixelEdit(modifyEdit, 'Modify with shape')).not.toBeNull()
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual(blue)
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual(blue)

    useWorkspace.getState().setTilemapMode('paint')
    expect(isToolAvailableForSession(session, 'fill')).toBe(false)
    expect(isToolAvailableForSession(session, 'selection')).toBe(true)
  })

  it('updates an occupied tile in hybrid mode without adding a variant', async () => {
    const document = createDocument('hybrid edits occupied tile', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Occupied Create', tileWidth: 1, tileHeight: 1 })
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const tileId = tileset.tileIds[0]
    const red = new Uint8ClampedArray([220, 20, 30, 255])
    useWorkspace.getState().previewTilesetTilePixels(tileset.id, tileId, red)
    useWorkspace.getState().commitTilesetTileEdit(tileset.id, tileId, new Uint8ClampedArray(4), red)
    const paint = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, paint, 0, { tilesetId: tileset.id, tileId })
    writeTilemapCell(document, target, paint, 1, { tilesetId: tileset.id, tileId })
    useWorkspace.getState().commitTilemapEdit(paint, 'Paint occupied tiles')
    useWorkspace.getState().setTilemapMode('hybrid')

    const beforeTileCount = tileset.tileIds.length
    const blue = { r: 20, g: 50, b: 230, a: 255 }
    const edit = beginPixelEdit(target.layer.id)
    expect(recordPixel(document, target.layer, edit, 0, packColor(blue))).toBe(true)
    expect(useWorkspace.getState().commitPixelEdit(edit, 'Edit occupied tile')).not.toBeNull()

    expect(document.tilesets![0].tileIds).toHaveLength(beforeTileCount)
    expect(target.tilemap.cells.map((cell) => cell?.tileId)).toEqual([tileId, tileId])
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual(blue)
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual(blue)

    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 220, g: 20, b: 30, a: 255 })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 220, g: 20, b: 30, a: 255 })
  })

  it('updates the destination tile when a copied selection stays inside it in hybrid mode', async () => {
    const document = createDocument('hybrid floating selection inside tile', 8, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Hybrid floating selection', tileWidth: 4, tileHeight: 4 })
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const sourceTileId = tileset.tileIds[0]
    const destinationTileId = 'hybrid-destination-tile'
    const sourcePixels = new Uint8ClampedArray(4 * 4 * 4)
    const destinationPixels = new Uint8ClampedArray(4 * 4 * 4)
    for (let offset = 0; offset < sourcePixels.length; offset += 4) {
      sourcePixels[offset + 3] = 255
      destinationPixels[offset] = 20
      destinationPixels[offset + 1] = 40
      destinationPixels[offset + 2] = 220
      destinationPixels[offset + 3] = 255
    }
    for (let y = 1; y < 3; y += 1) for (let x = 1; x < 3; x += 1) {
      const offset = (y * 4 + x) * 4
      sourcePixels[offset] = 220
      sourcePixels[offset + 1] = 30
      sourcePixels[offset + 2] = 40
    }
    const updatedDestinationPixels = new Uint8ClampedArray(destinationPixels)
    for (let y = 1; y < 3; y += 1) for (let x = 1; x < 3; x += 1) {
      const offset = (y * 4 + x) * 4
      updatedDestinationPixels[offset] = 220
      updatedDestinationPixels[offset + 1] = 30
      updatedDestinationPixels[offset + 2] = 40
    }
    writeTilesetTilePixels(tileset, sourceTileId, sourcePixels)
    const withDestination = appendBlankTilesetTile(tileset, destinationTileId)
    document.tilesets![0] = withDestination
    writeTilesetTilePixels(withDestination, destinationTileId, destinationPixels)
    const cells = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, cells, 0, { tilesetId: withDestination.id, tileId: sourceTileId })
    writeTilemapCell(document, target, cells, 1, { tilesetId: withDestination.id, tileId: destinationTileId })
    useWorkspace.getState().commitTilemapEdit(cells, 'Set hybrid floating tiles')
    useWorkspace.getState().setTilemapMode('hybrid')

    const selection = { x: 1, y: 1, width: 2, height: 2 }
    const destination = { x: 5, y: 1, width: 2, height: 2 }
    const source = captureSelectionTransform(document, selection, target.layer)!
    const preview = applySelectionTranslationPreview(document, source, destination, true, null, target.layer)
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, destination, true, 'Copy inside destination tile', preview, destination)
    useWorkspace.getState().commitFloatingPaste()

    expect(withDestination.tileIds).toHaveLength(2)
    expect(target.tilemap.cells.map((cell) => cell?.tileId)).toEqual([sourceTileId, destinationTileId])
    expect(readTilesetTilePixels(withDestination, destinationTileId)).toEqual(updatedDestinationPixels)
    expect(readLayerColorAt(document, target.layer, 5, 1)).toEqual({ r: 220, g: 30, b: 40, a: 255 })

    useWorkspace.getState().undo()
    expect(readTilesetTilePixels(document.tilesets![0], destinationTileId)).toEqual(destinationPixels)
    useWorkspace.getState().redo()
    expect(readTilesetTilePixels(document.tilesets![0], destinationTileId)).toEqual(updatedDestinationPixels)
  })

  it('keeps create mode variant generation for occupied tiles', async () => {
    const document = createDocument('create keeps variants', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Create Variants', tileWidth: 1, tileHeight: 1 })
    useWorkspace.getState().setTilemapMode('create')
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const sourceTileId = tileset.tileIds[0]
    const red = new Uint8ClampedArray([220, 20, 30, 255])
    useWorkspace.getState().previewTilesetTilePixels(tileset.id, sourceTileId, red)
    useWorkspace.getState().commitTilesetTileEdit(tileset.id, sourceTileId, new Uint8ClampedArray(4), red)
    const paint = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, paint, 0, { tilesetId: tileset.id, tileId: sourceTileId })
    writeTilemapCell(document, target, paint, 1, { tilesetId: tileset.id, tileId: sourceTileId })
    useWorkspace.getState().commitTilemapEdit(paint, 'Paint create variants')

    const blue = { r: 20, g: 50, b: 230, a: 255 }
    const edit = beginPixelEdit(target.layer.id)
    expect(recordPixel(document, target.layer, edit, 0, packColor(blue))).toBe(true)
    expect(useWorkspace.getState().commitPixelEdit(edit, 'Create tile variant')).not.toBeNull()

    expect(document.tilesets![0].tileIds).toHaveLength(2)
    expect(target.tilemap.cells[0]?.tileId).not.toBe(sourceTileId)
    expect(target.tilemap.cells[1]?.tileId).toBe(sourceTileId)
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual(blue)
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 220, g: 20, b: 30, a: 255 })
  })





  it('moves whole Tilemap layers only by cel offset in every mode', async () => {
    const document = createDocument('offset-only tile move', 4, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Offset Move', tileWidth: 2, tileHeight: 1 })
    const tileset = document.tilesets![0]
    const tileId = tileset.tileIds[0]
    const pixels = new Uint8ClampedArray([220, 20, 30, 255, 30, 70, 220, 255])
    useWorkspace.getState().previewTilesetTilePixels(tileset.id, tileId, pixels)
    useWorkspace.getState().commitTilesetTileEdit(tileset.id, tileId, new Uint8ClampedArray(8), pixels)
    const target = activeTilemapCelTarget(document)!
    const paint = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, paint, 0, { tilesetId: tileset.id, tileId })
    useWorkspace.getState().commitTilemapEdit(paint, 'Paint offset tile')
    const key = animationCelKey(target.layer.id, target.cel.frameId)
    const beforeOffsets = animationCelOffsetsForKeys(document, [key])
    const originalCells = target.tilemap.cells.map((cell) => cell ? { ...cell } : null)
    const originalTileIds = [...tileset.tileIds]
    const originalTilesetPixels = new Uint8ClampedArray(tileset.pixels)

    for (const mode of ['edit', 'create', 'hybrid', 'paint'] as const) {
      useWorkspace.getState().setTilemapMode(mode)
      const afterOffsets = { [key]: { x: beforeOffsets[key].x + 1, y: beforeOffsets[key].y } }
      setAnimationCelOffsetsForKeys(document, afterOffsets)
      const movedTarget = activeTilemapCelTarget(document)!

      expect(animationCelOffsetsForKeys(document, [key])).toEqual(afterOffsets)
      expect(tilemapCellBounds(movedTarget.tilemap, movedTarget.surface.offsetX, movedTarget.surface.offsetY, 0).x).toBe(1)
      expect(movedTarget.tilemap.cells).toEqual(originalCells)
      expect(tileset.tileIds).toEqual(originalTileIds)
      expect(Array.from(tileset.pixels)).toEqual(Array.from(originalTilesetPixels))
      expect(readLayerColorAt(document, movedTarget.layer, 0, 0).a).toBe(0)
      expect(readLayerColorAt(document, movedTarget.layer, 1, 0)).toEqual({ r: 220, g: 20, b: 30, a: 255 })

      setAnimationCelOffsetsForKeys(document, beforeOffsets)
      expect(animationCelOffsetsForKeys(document, [key])).toEqual(beforeOffsets)
      expect(movedTarget.tilemap.cells).toEqual(originalCells)
    }
  })





  it('modifies the tile under the pointer and synchronizes every reference in one history entry', async () => {
    const document = createDocument('modify tile', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Modify Tile', tileWidth: 1, tileHeight: 1 })
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const tileId = tileset.tileIds[0]
    const red = new Uint8ClampedArray([200, 10, 20, 255])
    useWorkspace.getState().previewTilesetTilePixels(tileset.id, tileId, red)
    useWorkspace.getState().commitTilesetTileEdit(tileset.id, tileId, new Uint8ClampedArray(4), red)
    const paint = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, paint, 0, { tilesetId: tileset.id, tileId })
    writeTilemapCell(document, target, paint, 1, { tilesetId: tileset.id, tileId })
    useWorkspace.getState().commitTilemapEdit(paint, 'Paint references')

    useWorkspace.getState().setTilemapMode('edit')
    const blue = { r: 20, g: 40, b: 220, a: 255 }
    const edit = beginPixelEdit(target.layer.id)
    expect(recordPixel(document, target.layer, edit, 0, packColor(blue))).toBe(true)
    expect(Array.from(tilemapEditPreviewTilePixels(document, edit).get(tileId)!)).toEqual([20, 40, 220, 255])
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 200, g: 10, b: 20, a: 255 })
    expect(useWorkspace.getState().commitPixelEdit(edit, 'Modify Tile')).not.toBeNull()
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 20, g: 40, b: 220, a: 255 })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 20, g: 40, b: 220, a: 255 })

    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 200, g: 10, b: 20, a: 255 })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 200, g: 10, b: 20, a: 255 })
  })











  it('copies Tilemap layers across documents with remapped Tileset references and one undoable paste', async () => {
    const source = createDocument('tile source', 2, 1, 'rgba')
    useWorkspace.getState().addSession(source)
    await useWorkspace.getState().createTilemapLayer({ name: 'Source Tiles', tileWidth: 1, tileHeight: 1 })
    const sourceTarget = activeTilemapCelTarget(source)!
    const sourceTileset = source.tilesets![0]
    const sourceColor = new Uint8ClampedArray([200, 90, 40, 255])
    useWorkspace.getState().previewTilesetTilePixels(sourceTileset.id, sourceTileset.tileIds[0], sourceColor)
    useWorkspace.getState().commitTilesetTileEdit(sourceTileset.id, sourceTileset.tileIds[0], new Uint8ClampedArray(4), sourceColor)
    const sourceEdit = beginTilemapEdit(sourceTarget.layer.id, sourceTarget.cel.frameId)
    writeTilemapCell(source, sourceTarget, sourceEdit, 0, { tilesetId: sourceTileset.id, tileId: sourceTileset.tileIds[0] })
    useWorkspace.getState().commitTilemapEdit(sourceEdit, 'Paint Tiles')
    useWorkspace.getState().copySelectedLayersToClipboard()

    const target = createDocument('tile target', 2, 1, 'rgba')
    useWorkspace.getState().addSession(target)
    expect(useWorkspace.getState().pasteLayersFromClipboard()).toBe(true)

    const pastedLayer = getActiveLayer(target)
    const pastedTileset = target.tilesets?.[0]
    const pastedCel = ensureAnimationDocument(target).cels.find((cel) => cel.layerId === pastedLayer.id)
    expect(pastedLayer.kind).toBe('tilemap')
    expect(pastedTileset).toBeDefined()
    expect(pastedTileset!.id).not.toBe(sourceTileset.id)
    expect(pastedLayer.tilemapTilesetId).toBe(pastedTileset!.id)
    expect(pastedTileset!.name).toBe(pastedLayer.name)
    expect(pastedCel?.tilemap?.cells[0]).toEqual({ tilesetId: pastedTileset!.id, tileId: sourceTileset.tileIds[0] })
    expect(readLayerColorAt(target, pastedLayer, 0, 0)).toEqual({ r: 200, g: 90, b: 40, a: 255 })

    useWorkspace.getState().undo()
    expect(target.layers.some((layer) => layer.kind === 'tilemap')).toBe(false)
    expect(target.tilesets).toEqual([])

    useWorkspace.getState().redo()
    const restoredLayer = getActiveLayer(target)
    const restoredCel = ensureAnimationDocument(target).cels.find((cel) => cel.layerId === restoredLayer.id)
    expect(restoredLayer.kind).toBe('tilemap')
    expect(target.tilesets).toHaveLength(1)
    expect(restoredCel?.tilemap?.cells[0]?.tilesetId).toBe(target.tilesets![0].id)
  })



  it('edits, adds, deletes, and restores tiles while keeping every referenced cel synchronized', async () => {
    const document = createDocument('tile editing', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createTilemapLayer({ name: 'Tile Editing', tileWidth: 1, tileHeight: 1 })
    const target = activeTilemapCelTarget(document)!
    const tileset = document.tilesets![0]
    const originalTileId = tileset.tileIds[0]
    const originalPixels = new Uint8ClampedArray([20, 30, 40, 255])
    useWorkspace.getState().previewTilesetTilePixels(tileset.id, originalTileId, originalPixels)
    useWorkspace.getState().commitTilesetTileEdit(tileset.id, originalTileId, new Uint8ClampedArray(4), originalPixels)
    const originalEdit = beginTilemapEdit(target.layer.id, target.cel.frameId)
    writeTilemapCell(document, target, originalEdit, 0, { tilesetId: tileset.id, tileId: originalTileId })
    writeTilemapCell(document, target, originalEdit, 1, { tilesetId: tileset.id, tileId: originalTileId })
    useWorkspace.getState().commitTilemapEdit(originalEdit, 'Paint original tile')

    const before = readTilesetTilePixels(tileset, originalTileId)!
    const after = new Uint8ClampedArray([90, 80, 70, 255])
    expect(useWorkspace.getState().previewTilesetTilePixels(tileset.id, originalTileId, after)).toBe(true)
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 90, g: 80, b: 70, a: 255 })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 90, g: 80, b: 70, a: 255 })
    expect(useWorkspace.getState().commitTilesetTileEdit(tileset.id, originalTileId, before, after)).toBe(true)
    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 20, g: 30, b: 40, a: 255 })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 20, g: 30, b: 40, a: 255 })
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, target.layer, 0, 0)).toEqual({ r: 90, g: 80, b: 70, a: 255 })

    const addedTileId = useWorkspace.getState().addTilesetTile(tileset.id)
    expect(addedTileId).not.toBeNull()
    expect(Array.from(readTilesetTilePixels(document.tilesets![0], addedTileId!)!)).toEqual([0, 0, 0, 0])
    const addedPixels = new Uint8ClampedArray([1, 2, 3, 255])
    useWorkspace.getState().previewTilesetTilePixels(tileset.id, addedTileId!, addedPixels)
    useWorkspace.getState().commitTilesetTileEdit(tileset.id, addedTileId!, new Uint8ClampedArray(4), addedPixels)
    const addedTarget = activeTilemapCelTarget(document)!
    const addedEdit = beginTilemapEdit(addedTarget.layer.id, addedTarget.cel.frameId)
    writeTilemapCell(document, addedTarget, addedEdit, 1, { tilesetId: tileset.id, tileId: addedTileId! })
    useWorkspace.getState().commitTilemapEdit(addedEdit, 'Paint added tile')

    expect(useWorkspace.getState().deleteTilesetTile(tileset.id, addedTileId!)).toBe(true)
    expect(target.tilemap.cells[1]).toBeNull()
    useWorkspace.getState().undo()
    expect(document.tilesets![0].tileIds).toContain(addedTileId)
    expect(target.tilemap.cells[1]).toEqual({ tilesetId: tileset.id, tileId: addedTileId })
    expect(readLayerColorAt(document, target.layer, 1, 0)).toEqual({ r: 1, g: 2, b: 3, a: 255 })
  })
})
})
