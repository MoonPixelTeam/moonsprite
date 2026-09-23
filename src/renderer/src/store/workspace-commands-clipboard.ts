import { parseAnimationCelKey } from '@/core/animation'
import { createCompositePointSampler } from '@/core/document-composite'
import { captureFreeTileInstances, pasteFreeTileInstances } from './workspace-free-tile-instance-clipboard'
import { floatingSelectionClipboard } from './workspace-floating-clipboard'
import { completeDocumentChange } from './workspace-document-change'
import { type WorkspaceRecording } from './workspace-recording'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { FreeTileCelData, FreeTileInstance, FreeTileSourceLayer, Tileset } from '@shared/types-tiles'
import type { LayerGroup, LayerMask, RasterLayer } from '@shared/types-layer'
import type { SelectionMask } from '@shared/types-selection'
import type { SpriteDocument } from '@shared/types-document'
import { beginPixelEdit } from '@/core/history'
import { animationMaskAt, createDocument, createId, createLayer, createLayerMask as createAttachedLayerMask, findLayerMask, getDescendantGroupIds, getLayerIdsInGroup, getActiveLayer, isLayerEffectivelyLocked, isLayerMask, paletteColorIdForCanvas, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { cloneAnimationCel, cloneAnimationLayerMask, ensureAnimationDocument, inheritAnimationFrameCelLinks, normalizeAnimationCelZIndex, refreshActiveAnimationFrame, restoreAnimationCels, syncActiveAnimationFrame, synchronizeLinkedLayerGroupContents } from '@/core/animation'
import { isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { applySelectionTranslationCommit, type SelectionTransformSource } from '@/core/tools-selection-transform'
import { clampSelection } from '@/core/tools-pixel-edit'
import { applyRelativeLuminance, packColor, relativeLuminanceColor, unpackColor } from '@/core/raster'
import { selectionContains } from '@/core/selection'
import { moveLayerPanelRows as moveLayerPanelRowsOperation } from '@/core/layer-operations'
import { loadEditorPreferences } from '@/core/file-preferences'
import { resolveClipboardPlacement } from '@/core/clipboard-placement'
import { cloneTextCelData } from '@/core/text-raster'
import { cloneLayerStyles } from '@/core/layer-styles'
import { cloneTilemapCelData, cloneTileset, createBlankTileset, MAX_TILESET_PIXELS, writeTilesetTilePixels } from '@/core/tilemap'
import { cloneFreeTileCelData, freeTileInstanceBounds, freeTileSourceForInstance, type FreeTileDrawingMode } from '@/core/free-tile'
import { activeFreeTileCelTarget, applyFreeTilePlacementEdit, freeTileLayersForSet, freeTileSetIdForLayer, rasterSurfaceToFreeTileStamps, replaceFreeTileSetSources, type FreeTileCelTarget, type FreeTilePlacementEdit } from '@/core/free-tile-document'
import { createFreeTileSourceEditRaster, freeTileSourceSnapshotFromEditRaster } from '@/core/free-tile-edit'
import { clipboardService, selectionClipboardImage, type LayerClipboard, type LayerCollectionClipboard, type LayerMaskClipboard, type SelectionClipboard } from './clipboard-service'
import { activePaintLayer, cloneSelectionMask } from './workspace-session'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceClipboardCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import { defaultFreeTileSourceDisplayColor, cloneFreeTileSourceLayer, tilemapTilesetBytes, createLinkedLayerNameAllocator } from './workspace-layer-resources'
import { commitFreeTileSourceEditInSession } from './workspace-free-tile-transaction'
import { setFreeTileInstanceSelectionState } from './workspace-free-tile-selection'
import { setAnimationMaskSlot } from './workspace-animation-mask-slots'
import { activeSession } from './workspace-access'
import { selectedGroupRows, selectedDirectLayerRows, selectedRowInsertionTarget, insertionTargetParent, applyLayerRowSelection, setTimelineActiveContext } from './workspace-animation-selection'
import { assignLayerStyles, layerHistoryBytes, groupHistoryBytes } from './workspace-layer-style-history'
import { requestTilesetPanelVisibility } from './workspace-tileset-panel'
import { rectangularSelection } from './workspace-selection-geometry'
import { markFloatingOverlayChanged, markFloatingPreviewChanged } from './workspace-floating-preview'

const clearAnimationClipboards = (session: DocumentSession): void => {
  session.animationCellClipboard = []
  session.animationCellClipboardAnchorKey = null
  session.animationMaskClipboard = []
  session.animationMaskClipboardAnchorKey = null
  session.animationFrameClipboard = []
}

const DEFERRED_PASTE_AREA_THRESHOLD = 256 * 256

const hasSelectedPaintTarget = (session: DocumentSession): boolean =>
  Boolean(session.activeLayerMaskId && findLayerMask(session.document, session.activeLayerMaskId))
  || session.selectedLayerIds.includes(session.document.activeLayerId)

const targetContainerTopIndex = (document: SpriteDocument, groupId: string | null): number => {
  if (!groupId) return document.layers.length
  const members = new Set(getLayerIdsInGroup(document, groupId))
  return document.layers.reduce((last, layer, index) => members.has(layer.id) ? index + 1 : last, 0)
}

interface FreeTileRasterPasteResult {
  createdSources: FreeTileSourceLayer[]
  createdTilesets: Tileset[]
  createdInstances: FreeTileInstance[]
  edit: FreeTilePlacementEdit
  pixelCount: number
}

interface FreeTilePasteSelectionState {
  selectedTilesetId: string | null
  selectedTileId: string | null
  secondaryTileId: string | null
  selectedFreeTileInstanceId: string | null
  selectedFreeTileInstanceIds: string[]
  freeTileInstanceSelectionAnchorId: string | null
  freeTileMode: FreeTileDrawingMode
}

const captureFreeTilePasteSelectionState = (session: DocumentSession): FreeTilePasteSelectionState => ({
  selectedTilesetId: session.selectedTilesetId,
  selectedTileId: session.selectedTileId,
  secondaryTileId: session.secondaryTileId,
  selectedFreeTileInstanceId: session.selectedFreeTileInstanceId,
  selectedFreeTileInstanceIds: [...session.selectedFreeTileInstanceIds],
  freeTileInstanceSelectionAnchorId: session.freeTileInstanceSelectionAnchorId,
  freeTileMode: session.freeTileMode
})

const applyFreeTilePasteSelectionState = (session: DocumentSession, state: FreeTilePasteSelectionState): void => {
  session.selectedTilesetId = state.selectedTilesetId
  session.selectedTileId = state.selectedTileId
  session.secondaryTileId = state.secondaryTileId
  session.selectedFreeTileInstanceId = state.selectedFreeTileInstanceId
  session.selectedFreeTileInstanceIds = [...state.selectedFreeTileInstanceIds]
  session.freeTileInstanceSelectionAnchorId = state.freeTileInstanceSelectionAnchorId
  session.freeTileMode = state.freeTileMode
}

const selectionClipboardSurface = (clipboard: SelectionClipboard, x: number, y: number): AnimationCelSurface => {
  const pixels = new Uint8ClampedArray(clipboard.width * clipboard.height * 4)
  for (let index = 0; index < clipboard.pixels.length; index += 1) {
    if (clipboard.mask && clipboard.mask[index] !== 1) continue
    const color = unpackColor(clipboard.pixels[index])
    const offset = index * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  return { format: 'rgba', width: clipboard.width, height: clipboard.height, offsetX: x, offsetY: y, pixels }
}

const pasteRasterSurfaceIntoFreeTileTarget = (
  document: SpriteDocument,
  target: FreeTileCelTarget,
  surface: AnimationCelSurface
): FreeTileRasterPasteResult | null => {
  const stamps = rasterSurfaceToFreeTileStamps(surface, document.palette)
  if (stamps.length === 0) return null
  const existingSources = target.layer.freeTileSources ?? []
  const usedNames = new Set(existingSources.map((source) => source.name))
  const createdSources: FreeTileSourceLayer[] = []
  const createdTilesets: Tileset[] = []
  const createdInstances: FreeTileInstance[] = []
  let sourceNumber = 1
  let pixelCount = 0
  for (const stamp of stamps) {
    while (usedNames.has(tr('workspace.freeTile.sourceName', { index: sourceNumber }))) sourceNumber += 1
    const name = tr('workspace.freeTile.sourceName', { index: sourceNumber })
    sourceNumber += 1
    usedNames.add(name)
    const sourceId = createId('free-tile-source')
    const tileId = createId('tile')
    const tileset = createBlankTileset(createId('tileset'), name, stamp.width, stamp.height, tileId, 1)
    if (!writeTilesetTilePixels(tileset, tileId, stamp.pixels)) return null
    const source: FreeTileSourceLayer = {
      id: sourceId,
      name,
      tilesetId: tileset.id,
      displayColor: defaultFreeTileSourceDisplayColor(existingSources.length + createdSources.length),
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      offsetX: 0,
      offsetY: 0
    }
    const instance: FreeTileInstance = {
      id: createId('free-tile-instance'),
      sourceId,
      x: stamp.x - target.surface.offsetX,
      y: stamp.y - target.surface.offsetY,
      opacity: 1,
      blendMode: 'normal'
    }
    createdSources.push(source)
    createdTilesets.push(tileset)
    createdInstances.push(instance)
    for (let offset = 3; offset < stamp.pixels.length; offset += 4) if (stamp.pixels[offset] > 0) pixelCount += 1
  }
  replaceFreeTileSetSources(document, target.layer, [...existingSources, ...createdSources])
  document.tilesets = [...(document.tilesets ?? []), ...createdTilesets]
  const before = cloneFreeTileCelData(target.freeTiles)
  const after: FreeTileCelData = { instances: [...before.instances, ...createdInstances] }
  const edit: FreeTilePlacementEdit = { layerId: target.layer.id, frameId: target.cel.frameId, before, after, dirtyRect: null }
  applyFreeTilePlacementEdit(document, edit, 'after')
  return { createdSources, createdTilesets, createdInstances, edit, pixelCount }
}

const pasteSelectionClipboardIntoFreeTile = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession,
  target: FreeTileCelTarget,
  clipboard: SelectionClipboard,
  x: number,
  y: number
): FreeTileRasterPasteResult | null => {
  const layer = target.layer
  const beforeSources = (layer.freeTileSources ?? []).map(cloneFreeTileSourceLayer)
  const beforeSelection = captureFreeTilePasteSelectionState(session)
  const result = pasteRasterSurfaceIntoFreeTileTarget(session.document, target, selectionClipboardSurface(clipboard, x, y))
  if (!result) return null
  const afterSources = (layer.freeTileSources ?? []).map(cloneFreeTileSourceLayer)
  const createdTilesets = result.createdTilesets.map(cloneTileset)
  const createdTilesetIds = new Set(createdTilesets.map((tileset) => tileset.id))
  const selectedSource = result.createdSources.at(-1) ?? null
  const selectedInstance = result.createdInstances.at(-1) ?? null
  const selectedTileset = selectedSource
    ? session.document.tilesets?.find((tileset) => tileset.id === selectedSource.tilesetId) ?? null
    : null
  const selectedTileId = selectedTileset?.tileIds[0] ?? null
  const afterSelection: FreeTilePasteSelectionState = {
    selectedTilesetId: selectedTileset?.id ?? beforeSelection.selectedTilesetId,
    selectedTileId: selectedTileId ?? beforeSelection.selectedTileId,
    secondaryTileId: selectedTileId ?? beforeSelection.secondaryTileId,
    selectedFreeTileInstanceId: selectedInstance?.id ?? beforeSelection.selectedFreeTileInstanceId,
    selectedFreeTileInstanceIds: selectedInstance ? [selectedInstance.id] : [...beforeSelection.selectedFreeTileInstanceIds],
    freeTileInstanceSelectionAnchorId: selectedInstance?.id ?? beforeSelection.freeTileInstanceSelectionAnchorId,
    freeTileMode: selectedSource ? 'edit' : beforeSelection.freeTileMode
  }
  const restoreBefore = (): void => {
    applyFreeTilePlacementEdit(session.document, result.edit, 'before')
    replaceFreeTileSetSources(session.document, layer, beforeSources)
    session.document.tilesets = (session.document.tilesets ?? []).filter((tileset) => !createdTilesetIds.has(tileset.id))
    applyFreeTilePasteSelectionState(session, beforeSelection)
  }
  const restoreAfter = (): void => {
    for (const tileset of createdTilesets) {
      if (!session.document.tilesets?.some((candidate) => candidate.id === tileset.id)) {
        session.document.tilesets = [...(session.document.tilesets ?? []), cloneTileset(tileset)]
      }
    }
    replaceFreeTileSetSources(session.document, layer, afterSources)
    applyFreeTilePlacementEdit(session.document, result.edit, 'after')
    applyFreeTilePasteSelectionState(session, afterSelection)
  }
  applyFreeTilePasteSelectionState(session, afterSelection)
  session.history.push({
    label: tr('workspace.history.pasteToLayer'),
    bytes: createdTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0)
      + (beforeSources.length + afterSources.length) * 96
      + (result.edit.before.instances.length + result.edit.after.instances.length) * 72,
    undo: restoreBefore,
    redo: restoreAfter,
    invalidation: { kind: 'full' },
    affectedLayerIds: freeTileLayersForSet(session.document, freeTileSetIdForLayer(layer)).map((candidate) => candidate.id),
    contentChanged: true,
    requiresAnimationSync: false
  })
  completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
  return result
}

type FreeTileSelectedInstancePasteResult =
  | { status: 'pasted'; pixelCount: number }
  | { status: 'outside' | 'too-large' | 'unavailable'; pixelCount: 0 }

const pasteSelectionClipboardIntoSelectedFreeTileInstance = (recordDocumentOperation: WorkspaceRecording['recordDocumentOperation'],
  session: DocumentSession,
  target: FreeTileCelTarget,
  instance: FreeTileInstance,
  clipboard: SelectionClipboard,
  x: number,
  y: number
): FreeTileSelectedInstancePasteResult => {
  const source = freeTileSourceForInstance(target.sources, instance)
  const sourceLayer = source ? target.layer.freeTileSources?.find((candidate) => candidate.id === source.id) : null
  if (!source || source.visible === false || sourceLayer?.locked === true || instance.visible === false || instance.locked === true) {
    return { status: 'unavailable', pixelCount: 0 }
  }
  const bounds = freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY)
  const sourceEdit = createFreeTileSourceEditRaster(session.document, source, bounds, { x, y }, instance)
  if (!sourceEdit) return { status: 'outside', pixelCount: 0 }
  let pixelCount = 0
  for (let sourceY = 0; sourceY < clipboard.height; sourceY += 1) {
    for (let sourceX = 0; sourceX < clipboard.width; sourceX += 1) {
      const sourceIndex = sourceY * clipboard.width + sourceX
      if (clipboard.mask && clipboard.mask[sourceIndex] !== 1) continue
      const localX = x + sourceX - sourceEdit.origin.x
      const localY = y + sourceY - sourceEdit.origin.y
      if (localX < 0 || localY < 0 || localX >= sourceEdit.layer.width || localY >= sourceEdit.layer.height) continue
      writeLayerColor(sourceEdit.document, sourceEdit.layer, localY * sourceEdit.layer.width + localX, unpackColor(clipboard.pixels[sourceIndex]))
      pixelCount += 1
    }
  }
  if (pixelCount === 0) return { status: 'outside', pixelCount: 0 }
  const after = freeTileSourceSnapshotFromEditRaster(sourceEdit)
  if (after.width * after.height > MAX_TILESET_PIXELS) return { status: 'too-large', pixelCount: 0 }
  commitFreeTileSourceEditInSession(recordDocumentOperation, session, source.id, sourceEdit.before, after, tr('workspace.history.pasteToLayer'))
  const tileId = source.tileset.tileIds[0] ?? null
  session.selectedTilesetId = source.tileset.id
  session.selectedTileId = tileId
  session.secondaryTileId = tileId
  setFreeTileInstanceSelectionState(session, [instance.id], instance.id)
  session.freeTileMode = 'edit'
  return { status: 'pasted', pixelCount }
}

const layerMaskClipboard = (mask: LayerMask | undefined): LayerMaskClipboard | undefined => mask ? {
  width: mask.width,
  height: mask.height,
  offsetX: mask.offsetX,
  offsetY: mask.offsetY,
  pixels: new Uint8ClampedArray(mask.pixels)
} : undefined

const layerMaskFromClipboard = (source: LayerMaskClipboard | undefined, ownerId: string): LayerMask | undefined => {
  if (!source) return undefined
  const mask = createAttachedLayerMask(ownerId, source.width, source.height)
  mask.offsetX = source.offsetX
  mask.offsetY = source.offsetY
  mask.pixels.set(source.pixels)
  return mask
}

function layerClipboardFromDocument(document: SpriteDocument, layer: RasterLayer, groupKey: string | null = null): LayerClipboard {
  const pixels = new Uint8ClampedArray(layer.width * layer.height * 4)
  for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
    const color = readLayerColorAt(document, layer, layer.offsetX + x, layer.offsetY + y)
    const offset = (y * layer.width + x) * 4
    pixels[offset] = color.r
    pixels[offset + 1] = color.g
    pixels[offset + 2] = color.b
    pixels[offset + 3] = color.a
  }
  const timeline = ensureAnimationDocument(document)
  const paletteById = new Map(document.palette.map((entry) => [entry.id, entry.color]))
  const animationCels = timeline.frames.flatMap((frame, frameIndex) => {
    const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
    const surface = cel?.surface
    if (!surface) return []
    const rgba = new Uint8ClampedArray(surface.width * surface.height * 4)
    if (surface.format === 'rgba') rgba.set(surface.pixels)
    else for (let index = 0; index < surface.pixels.length; index += 1) {
      const color = paletteById.get(surface.pixels[index]) ?? { r: 0, g: 0, b: 0, a: 0 }
      const offset = index * 4
      rgba[offset] = color.r
      rgba[offset + 1] = color.g
      rgba[offset + 2] = color.b
      rgba[offset + 3] = color.a
    }
    return [{
      frameIndex,
      width: surface.width,
      height: surface.height,
      offsetX: surface.offsetX,
      offsetY: surface.offsetY,
      storageOriginX: surface.storageOriginX,
      storageOriginY: surface.storageOriginY,
      zIndex: cel.zIndex,
      opacity: cel.opacity,
      text: cel.text ? cloneTextCelData(cel.text) : undefined,
      tilemap: cel.tilemap ? cloneTilemapCelData(cel.tilemap) : undefined,
      freeTiles: cel.freeTiles ? cloneFreeTileCelData(cel.freeTiles) : undefined,
      pixels: rgba,
      mask: layerMaskClipboard(animationMaskAt(timeline, layer.id, frame.id) ?? undefined)
    }]
  })
  return {
    name: layer.name,
    linkedContentId: layer.linkedContentId,
    kind: layer.kind,
    tilemapTilesetId: layer.tilemapTilesetId,
    freeTileSetId: layer.freeTileSetId,
    freeTileSources: layer.freeTileSources?.map(cloneFreeTileSourceLayer),
    width: layer.width,
    height: layer.height,
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    clippingMask: layer.clippingMask === true,
    layerStyles: cloneLayerStyles(layer.layerStyles),
    background: layer.background ? { ...layer.background } : undefined,
    displayColor: layer.displayColor ? { ...layer.displayColor } : undefined,
    description: layer.description ?? '',
    groupKey,
    pixels,
    animationCels
  }
}

function applyLayerClipboardAnimationCel(
  document: SpriteDocument,
  layer: RasterLayer,
  source: NonNullable<LayerClipboard['animationCels']>[number],
  tilesetIdMap: ReadonlyMap<string, string> = new Map(),
  freeTileSourceIdMap?: ReadonlyMap<string, string>
): void {
  const timeline = ensureAnimationDocument(document)
  const frame = timeline.frames[source.frameIndex]
  const cel = frame ? timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id) : null
  if (!cel) return
  cel.zIndex = normalizeAnimationCelZIndex(source.zIndex)
  cel.opacity = source.opacity ?? layer.opacity
  cel.text = source.text ? cloneTextCelData(source.text) : undefined
  cel.tilemap = source.tilemap ? {
    ...cloneTilemapCelData(source.tilemap),
    cells: source.tilemap.cells.map((cell) => cell ? { ...cell, tilesetId: tilesetIdMap.get(cell.tilesetId) ?? cell.tilesetId } : null)
  } : undefined
  cel.freeTiles = source.freeTiles
    ? {
        instances: source.freeTiles.instances.flatMap((instance) => {
          if (!freeTileSourceIdMap || !instance.sourceId) return [{ ...instance }]
          const sourceId = freeTileSourceIdMap.get(instance.sourceId)
          return sourceId ? [{ ...instance, sourceId, tileId: undefined }] : []
        })
      }
    : undefined
  cel.surface = layer.format === 'rgba'
    ? { format: 'rgba', width: source.width, height: source.height, offsetX: source.offsetX, offsetY: source.offsetY, storageOriginX: source.storageOriginX, storageOriginY: source.storageOriginY, pixels: document.colorMode === 'grayscale' ? applyRelativeLuminance(source.pixels.slice()) : source.pixels.slice() }
    : {
        format: 'indexed', width: source.width, height: source.height, offsetX: source.offsetX, offsetY: source.offsetY, storageOriginX: source.storageOriginX, storageOriginY: source.storageOriginY,
        pixels: Uint32Array.from({ length: source.width * source.height }, (_, index) => {
          const offset = index * 4
          return paletteColorIdForCanvas(document, { r: source.pixels[offset], g: source.pixels[offset + 1], b: source.pixels[offset + 2], a: source.pixels[offset + 3] })
        })
      }
  setAnimationMaskSlot(document, layer.id, frame.id, layerMaskFromClipboard(source.mask, layer.id) ?? null)
}

export function createWorkspaceClipboardCommands({ get, set, recording }: WorkspaceCommandContext<'addSession' | 'cancelFloatingPaste' | 'commitFloatingPaste' | 'copySelectedLayersToClipboard' | 'copyFreeTileInstances' | 'copySelection' | 'deleteSelection' | 'mutateActive' | 'pasteAnimationCels' | 'pasteAnimationFrames' | 'pasteAnimationMasks' | 'pasteAsNewDocument' | 'pasteAsNewLayer' | 'pasteLayersFromClipboard' | 'pasteSelection' | 'setSelection'>): WorkspaceClipboardCommands {
  const { recordDocumentOperation } = recording
  return {
    copyFreeTileInstances() {
      get().commitFloatingPaste()
      const session = activeSession(get())
      const clipboard = session ? captureFreeTileInstances(session) : null
      if (!clipboard) return false
      clipboardService.setLayers(clipboard)
      clipboardService.captureLayerCopySystemBaseline(() => window.moonSprite.readClipboardImage())
      get().mutateActive(current => clearAnimationClipboards(current), false)
      return true
    },

    copyActiveLayerToClipboard() {
      get().copySelectedLayersToClipboard()
    },

    copySelectedLayersToClipboard() {
      get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session) return false
      const document = session.document
      syncActiveAnimationFrame(document)
      const selectedGroupIdSet = new Set<string>()
      for (const groupId of selectedGroupRows(session)) {
        selectedGroupIdSet.add(groupId)
        for (const descendantId of getDescendantGroupIds(document, groupId)) selectedGroupIdSet.add(descendantId)
      }
      const selectedLayerIdSet = new Set(selectedDirectLayerRows(session))
      for (const groupId of selectedGroupIdSet) for (const layerId of getLayerIdsInGroup(document, groupId)) selectedLayerIdSet.add(layerId)
      const layers = document.layers.filter((layer) => selectedLayerIdSet.has(layer.id))
      if (layers.length === 0) {
        set({ message: tr('workspace.copy.layerRequired') })
        return false
      }
      const layerClipboards = layers.map((layer) => layerClipboardFromDocument(document, layer, layer.groupId && selectedGroupIdSet.has(layer.groupId) ? layer.groupId : null))
      const referencedTilesetIds = new Set([
        ...layerClipboards.flatMap((layer) => layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []),
        ...layerClipboards.flatMap((layer) => layer.freeTileSources?.map((source) => source.tilesetId) ?? []),
        ...layerClipboards.flatMap((layer) => layer.animationCels ?? [])
          .flatMap((cel) => cel.tilemap?.cells ?? [])
          .flatMap((cell) => cell ? [cell.tilesetId] : [])
      ])
      const clipboard: LayerCollectionClipboard = {
        sourceDocumentId: document.id,
        animationFrames: ensureAnimationDocument(document).frames.map((frame) => ({ duration: frame.duration })),
        tilesets: (document.tilesets ?? []).filter((tileset) => referencedTilesetIds.has(tileset.id)).map((tileset) => ({ ...tileset, tileIds: [...tileset.tileIds], tileSlots: tileset.tileSlots ? [...tileset.tileSlots] : undefined, pixels: tileset.pixels.slice() })),
        layers: layerClipboards,
        groups: document.groups.filter((group) => selectedGroupIdSet.has(group.id)).map((group) => ({
          key: group.id,
          name: group.name,
          visible: group.visible,
          locked: group.locked,
          opacity: group.opacity,
          blendMode: group.blendMode,
          clippingMask: group.clippingMask === true,
          layerStyles: cloneLayerStyles(group.layerStyles),
          cumulativeBlend: group.cumulativeBlend === true,
          displayColor: group.displayColor ? { ...group.displayColor } : undefined,
          description: group.description ?? '',
          parentKey: group.parentGroupId ?? null,
          collapsed: session.collapsedGroupIds.includes(group.id)
        }))
      }
      clipboardService.setLayers(clipboard)
      if (typeof window.moonSprite.readClipboardImage === 'function') {
        clipboardService.captureLayerCopySystemBaseline(() => window.moonSprite.readClipboardImage())
      }
      if (typeof window.moonSprite.readClipboardImageSize === 'function') {
        clipboardService.captureLayerCopySystemBaselineSize(() => window.moonSprite.readClipboardImageSize())
      }
      set({ message: clipboard.groups.length > 0 ? tr('workspace.copy.group', { name: clipboard.groups[0].name, count: layers.length }) : layers.length === 1 ? tr('workspace.copy.layer', { name: layers[0].name }) : tr('workspace.copy.layers', { count: layers.length }) })
      return true
    },

    pasteLayerFromClipboard() {
      return get().pasteLayersFromClipboard()
    },

    pasteLayersFromClipboard() {
      const clipboard = clipboardService.getLayers()
      const current = activeSession(get())
      if (!clipboard || !current) return false
      if (clipboard.freeTileInstances) {
        let pasted = false
        get().mutateActive(session => { pasted = pasteFreeTileInstances(session, clipboard, recordDocumentOperation) }, false)
        return pasted
      }
      if (clipboard.layers.length === 0) return false
      get().mutateActive((session) => {
        const document = session.document
        const timeline = ensureAnimationDocument(document)
        syncActiveAnimationFrame(document)
        const tilesetIdMap = new Map<string, string>()
        const freeTileSourceIdMaps = new Map<string, Map<string, string>>()
        const pastedFreeTileSetIds = new Map<string, string>()
        const pastedFreeTileSourceIds = new Map<string, Map<string, string>>()
        const pastedFreeTileSources = new Map<string, FreeTileSourceLayer[]>()
        const pastedTilesets: Tileset[] = []
        for (const source of clipboard.tilesets ?? []) {
          const id = createId('tileset')
          tilesetIdMap.set(source.id, id)
          pastedTilesets.push({ ...source, id, name: `${source.name} ${tr('canvas.history.copySuffix')}`, tileIds: [...source.tileIds], tileSlots: source.tileSlots ? [...source.tileSlots] : undefined, pixels: source.pixels.slice() })
        }
        if (pastedTilesets.length > 0) document.tilesets = [...(document.tilesets ?? []), ...pastedTilesets]
        const clipboardFrameCount = Math.max(
          clipboard.animationFrames?.length ?? 0,
          ...clipboard.layers.flatMap((layer) => layer.animationCels?.map((cel) => cel.frameIndex + 1) ?? []),
          1
        )
        const appendedFrames = Array.from({ length: Math.max(0, clipboardFrameCount - timeline.frames.length) }, (_, index) => ({
          id: createId('frame'),
          duration: clipboard.animationFrames?.[timeline.frames.length + index]?.duration ?? 100
        }))
        if (appendedFrames.length > 0) {
          timeline.frames.push(...appendedFrames)
          ensureAnimationDocument(document)
        }
        const placement = selectedRowInsertionTarget(session)
        const targetGroupId = insertionTargetParent(document, placement)
        const groupIdByKey = new Map(clipboard.groups.map((group) => [group.key, createId('group')]))
        const resolveGroupParent = (parentKey?: string | null): string | null => {
          if (!parentKey) return targetGroupId
          const pastedParent = groupIdByKey.get(parentKey)
          if (pastedParent) return pastedParent
          return targetGroupId
        }
        const groups: LayerGroup[] = clipboard.groups.map((group) => {
          const id = groupIdByKey.get(group.key)!
          return {
          id,
          name: `${group.name} ${tr('canvas.history.copySuffix')}`,
          description: group.description ?? '',
          displayColor: group.displayColor ? { ...group.displayColor } : undefined,
          parentGroupId: resolveGroupParent(group.parentKey),
          visible: group.visible,
          locked: group.locked,
          opacity: group.opacity,
          blendMode: group.blendMode,
          clippingMask: group.clippingMask === true,
          layerStyles: cloneLayerStyles(group.layerStyles),
          cumulativeBlend: group.cumulativeBlend === true
        }})
        const sameSourceDocument = clipboard.sourceDocumentId === document.id
        const linkedContentIdMap = new Map<string, string>()
        const pastedLinkedContentId = (source: LayerClipboard): string | undefined => {
          if (!source.linkedContentId || source.kind || source.background) return undefined
          if (sameSourceDocument) return source.linkedContentId
          const existing = linkedContentIdMap.get(source.linkedContentId)
          if (existing) return existing
          const id = createId('layer-link')
          linkedContentIdMap.set(source.linkedContentId, id)
          return id
        }
        const allocateLinkedLayerName = createLinkedLayerNameAllocator(document)
        const layers = clipboard.layers.map((source, sourceIndex) => {
          const linkedContentId = pastedLinkedContentId(source)
          const name = linkedContentId
            ? allocateLinkedLayerName(linkedContentId, source.name)
            : `${source.name} ${tr('canvas.history.copySuffix')}`
          const layer = createLayer(name, source.width, source.height, document.colorMode)
          if (linkedContentId) layer.linkedContentId = linkedContentId
          layer.kind = source.kind
          if (source.kind === 'tilemap' && source.tilemapTilesetId) layer.tilemapTilesetId = tilesetIdMap.get(source.tilemapTilesetId)
          if (source.kind === 'free-tile' && source.freeTileSources) {
            const sourceSetKey = source.freeTileSetId ?? `clipboard-free-tile-set-${sourceIndex}`
            const freeTileSetId = pastedFreeTileSetIds.get(sourceSetKey) ?? createId('free-tile-set')
            pastedFreeTileSetIds.set(sourceSetKey, freeTileSetId)
            const sourceIdMap = pastedFreeTileSourceIds.get(sourceSetKey) ?? new Map<string, string>()
            pastedFreeTileSourceIds.set(sourceSetKey, sourceIdMap)
            let sharedSources = pastedFreeTileSources.get(sourceSetKey)
            if (!sharedSources) {
              sharedSources = source.freeTileSources.flatMap((sourceLayer) => {
                const tilesetId = tilesetIdMap.get(sourceLayer.tilesetId)
                if (!tilesetId) return []
                const sourceId = createId('free-tile-source')
                sourceIdMap.set(sourceLayer.id, sourceId)
                return [{ ...cloneFreeTileSourceLayer(sourceLayer), id: sourceId, tilesetId }]
              })
              pastedFreeTileSources.set(sourceSetKey, sharedSources)
            }
            layer.freeTileSetId = freeTileSetId
            layer.freeTileSources = sharedSources
            freeTileSourceIdMaps.set(layer.id, sourceIdMap)
            delete layer.freeTileTilesetId
          }
          layer.offsetX = source.offsetX
          layer.offsetY = source.offsetY
          layer.visible = source.visible
          layer.locked = source.locked
          layer.opacity = source.opacity
          layer.blendMode = source.blendMode
          if (source.clippingMask === true) layer.clippingMask = true
          assignLayerStyles(layer, source.layerStyles)
          if (source.background) layer.background = { ...source.background }
          layer.description = source.description ?? ''
          if (source.displayColor) layer.displayColor = { ...source.displayColor }
          layer.groupId = source.groupKey ? groupIdByKey.get(source.groupKey) ?? targetGroupId : targetGroupId
          if (layer.format === 'rgba') layer.pixels.set(document.colorMode === 'grayscale' ? applyRelativeLuminance(source.pixels.slice()) : source.pixels)
          else for (let index = 0; index < source.width * source.height; index += 1) {
            const offset = index * 4
            layer.pixels[index] = paletteColorIdForCanvas(document, { r: source.pixels[offset], g: source.pixels[offset + 1], b: source.pixels[offset + 2], a: source.pixels[offset + 3] })
          }
          return layer
        })
        for (const layer of layers) {
          const ownedTilesetIds = layer.kind === 'tilemap'
            ? layer.tilemapTilesetId ? [layer.tilemapTilesetId] : []
            : layer.kind === 'free-tile' ? (layer.freeTileSources ?? []).map((source) => source.tilesetId) : []
          for (const ownedTilesetId of ownedTilesetIds) {
            const tileset = pastedTilesets.find((candidate) => candidate.id === ownedTilesetId)
            const source = layer.freeTileSources?.find((candidate) => candidate.tilesetId === ownedTilesetId)
            const sharedTilemap = layer.kind === 'tilemap' && layers.filter((candidate) => candidate.kind === 'tilemap' && candidate.tilemapTilesetId === ownedTilesetId).length > 1
            if (tileset && !sharedTilemap) tileset.name = source?.name ?? layer.name
          }
        }
        const index = targetContainerTopIndex(document, targetGroupId)
        const previousActiveId = document.activeLayerId
        const previousSelection = [...session.selectedLayerIds]
        const previousGroupId = session.selectedGroupId
        const previousGroupIds = [...session.selectedGroupIds]
        const previousCollapsedGroupIds = [...session.collapsedGroupIds]
        document.groups.push(...groups)
        document.layers.splice(index, 0, ...layers)
        ensureAnimationDocument(document)
        layers.forEach((layer, layerIndex) => {
          for (const cel of clipboard.layers[layerIndex].animationCels ?? []) applyLayerClipboardAnimationCel(document, layer, cel, tilesetIdMap, freeTileSourceIdMaps.get(layer.id))
        })
        for (const frame of appendedFrames) {
          const frameIndex = timeline.frames.findIndex((candidate) => candidate.id === frame.id)
          const sourceFrameId = timeline.frames[frameIndex - 1]?.id
          if (sourceFrameId) inheritAnimationFrameCelLinks(document, sourceFrameId, frame.id)
        }
        const pastedIds = layers.map((layer) => layer.id)
        const pastedIdSet = new Set(pastedIds)
        const synchronizePastedLinkedLayers = (): void => {
          for (const linkedContentId of new Set(layers.flatMap((layer) => layer.linkedContentId ? [layer.linkedContentId] : []))) {
            const existing = sameSourceDocument
              ? document.layers.find((candidate) => candidate.linkedContentId === linkedContentId && !pastedIdSet.has(candidate.id))
              : null
            const preferred = existing ?? layers.find((candidate) => candidate.linkedContentId === linkedContentId)
            synchronizeLinkedLayerGroupContents(document, linkedContentId, preferred?.id)
          }
        }
        synchronizePastedLinkedLayers()
        refreshActiveAnimationFrame(document)
        const pastedGroupIds = new Set(groups.map((group) => group.id))
        const appendedFrameIds = new Set(appendedFrames.map((frame) => frame.id))
        const animationCels = ensureAnimationDocument(document).cels
          .filter((cel) => pastedIds.includes(cel.layerId) || appendedFrameIds.has(cel.frameId))
          .map(cloneAnimationCel)
        const animationLayerMasks = (ensureAnimationDocument(document).layerMasks ?? [])
          .filter((entry) => pastedIds.includes(entry.layerId) || appendedFrameIds.has(entry.frameId))
          .map((entry) => cloneAnimationLayerMask(entry))
        const pastedCollapsedGroupIds = clipboard.groups
          .filter((group) => group.collapsed)
          .map((group) => groupIdByKey.get(group.key)!)
        document.activeLayerId = layers.at(-1)!.id
        session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...pastedCollapsedGroupIds])]
        applyLayerRowSelection(session, pastedIds, groups.map((group) => group.id), { kind: 'layer', id: layers.at(-1)!.id })
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layers.at(-1)!.id })
        session.history.beginCompound()
        session.history.push({
          label: layers.length === 1 && groups.length === 0 ? tr('workspace.history.pasteLayer') : tr('workspace.history.pasteCollection'),
          bytes: layers.reduce((sum, layer) => sum + layerHistoryBytes(layer), 0) + animationCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + animationLayerMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + pastedTilesets.reduce((sum, tileset) => sum + tilemapTilesetBytes(tileset), 0) + groups.reduce((sum, group) => sum + groupHistoryBytes(group), 0) + appendedFrames.length * 32,
          undo: () => {
            const currentTimeline = ensureAnimationDocument(document)
            currentTimeline.cels = currentTimeline.cels.filter((cel) => !pastedIds.includes(cel.layerId) && !appendedFrameIds.has(cel.frameId))
            currentTimeline.layerMasks = (currentTimeline.layerMasks ?? []).filter((entry) => !pastedIds.includes(entry.layerId) && !appendedFrameIds.has(entry.frameId))
            currentTimeline.frames = currentTimeline.frames.filter((frame) => !appendedFrameIds.has(frame.id))
            if (appendedFrameIds.has(currentTimeline.activeFrameId)) currentTimeline.activeFrameId = currentTimeline.frames[0].id
            document.layers = document.layers.filter((candidate) => !pastedIds.includes(candidate.id))
            document.groups = document.groups.filter((candidate) => !pastedGroupIds.has(candidate.id))
            if (pastedTilesets.length > 0) {
              const pastedTilesetIds = new Set(pastedTilesets.map((tileset) => tileset.id))
              document.tilesets = (document.tilesets ?? []).filter((tileset) => !pastedTilesetIds.has(tileset.id))
            }
            document.activeLayerId = previousActiveId
            session.selectedLayerIds = previousSelection
            session.selectedGroupId = previousGroupId
            session.selectedGroupIds = previousGroupIds
            session.collapsedGroupIds = previousCollapsedGroupIds
            refreshActiveAnimationFrame(document)
          },
          redo: () => {
            const currentTimeline = ensureAnimationDocument(document)
            for (const frame of appendedFrames) if (!currentTimeline.frames.some((candidate) => candidate.id === frame.id)) currentTimeline.frames.push({ ...frame })
            for (const group of groups) if (!document.groups.some((candidate) => candidate.id === group.id)) document.groups.push(group)
            for (const tileset of pastedTilesets) if (!document.tilesets?.some((candidate) => candidate.id === tileset.id)) document.tilesets = [...(document.tilesets ?? []), tileset]
            const missingLayers = layers.filter((layer) => !document.layers.some((candidate) => candidate.id === layer.id))
            if (missingLayers.length > 0) document.layers.splice(Math.min(index, document.layers.length), 0, ...missingLayers)
            restoreAnimationCels(document, animationCels)
            currentTimeline.layerMasks ??= []
            currentTimeline.layerMasks.push(...animationLayerMasks.filter((entry) => !currentTimeline.layerMasks!.some((candidate) => candidate.layerId === entry.layerId && candidate.frameId === entry.frameId)).map((entry) => cloneAnimationLayerMask(entry)))
            synchronizePastedLinkedLayers()
            document.activeLayerId = layers.at(-1)!.id
            session.collapsedGroupIds = [...new Set([...previousCollapsedGroupIds, ...pastedCollapsedGroupIds])]
            applyLayerRowSelection(session, pastedIds, groups.map((group) => group.id), { kind: 'layer', id: layers.at(-1)!.id })
          }
        })
        const createdGroupIds = new Set(groups.map((group) => group.id))
        const rootGroupIds = groups.filter((group) => !group.parentGroupId || !createdGroupIds.has(group.parentGroupId)).map((group) => group.id)
        const directLayerIds = layers.filter((layer) => !layer.groupId || !createdGroupIds.has(layer.groupId)).map((layer) => layer.id)
        const placementHistory = moveLayerPanelRowsOperation(session, directLayerIds, rootGroupIds, placement)
        if (placementHistory) session.history.push(placementHistory)
        session.history.endCompound(layers.length === 1 && groups.length === 0 ? tr('workspace.history.pasteLayer') : tr('workspace.history.pasteCollection'))
      })
      set({ message: clipboard.groups.length > 0 ? tr('workspace.clipboard.pastedLayer') : clipboard.layers.length === 1 ? tr('workspace.copy.layer', { name: clipboard.layers[0].name }) : tr('workspace.copy.layers', { count: clipboard.layers.length }) })
      if (clipboard.layers.some((layer) => layer.kind === 'free-tile')) requestTilesetPanelVisibility(true)
      return true
    },

    copySelection(merged = false) {
      if (merged) get().commitFloatingPaste()
      const session = activeSession(get())
      if (!session) return
      if (!merged && !session.selection && get().copyFreeTileInstances()) return
      if (!merged && !session.selection) { set({ message: tr('workspace.selectionRequired') }); return }
      const layer = getActiveLayer(session.document)
      const document = session.document
      const floating = floatingSelectionClipboard(session)
      if (session.pendingPaste && !floating) return
      const sourceSelection = session.selection ?? { x: 0, y: 0, width: document.width, height: document.height }
      const sampleMerged = merged ? createCompositePointSampler(document) : null
      const selection = floating ? { x: floating.originX!, y: floating.originY!, width: floating.width, height: floating.height } : clampSelection(document, sourceSelection)
      if (!selection) { set({ message: tr('workspace.clipboard.outside') }); return }
      const pixels = new Uint32Array(selection.width * selection.height)
      const mask = new Uint8Array(selection.width * selection.height)
      let copied = 0
      for (let y = 0; y < selection.height; y += 1) for (let x = 0; x < selection.width; x += 1) {
        const index = y * selection.width + x
        if (floating ? !floating.mask?.[index] : !selectionContains(sourceSelection, selection.x + x, selection.y + y)) continue
        const color = sampleMerged ? sampleMerged(selection.x + x, selection.y + y) : floating ? unpackColor(floating.pixels[index]) : readLayerColorAt(document, layer, selection.x + x, selection.y + y)
        if (color.a === 0) continue
        const clipboardIndex = y * selection.width + x
        pixels[clipboardIndex] = packColor(color)
        mask[clipboardIndex] = 1
        copied += 1
      }
      if (copied === 0) { clipboardService.clearSelection(); set({ message: tr('workspace.copyContent.empty') }); return }
      clipboardService.setSelection({ width: selection.width, height: selection.height, originX: selection.x, originY: selection.y, pixels, mask })
      // A selection copy is the active clipboard payload. Clear timeline
      // payloads so a later paste cannot be redirected to the old cel/frame.
      get().mutateActive((current) => clearAnimationClipboards(current), false)
      const clipboard = clipboardService.getSelection()
      if (!clipboard) return
      void window.moonSprite.writeClipboardImage(selectionClipboardImage(clipboard)).catch(() => {
        set({ message: tr('workspace.copyContent.internalOnly') })
      })
      set({ message: tr('workspace.copyContent.done', { count: copied }) })
    },

    cutSelection() {
      const pending = activeSession(get())?.pendingPaste
      get().copySelection()
      if (pending) {
        // Restore the destination before removing the original lifted pixels.
        // Clipboard/duplicate payloads have no original pixels to remove.
        get().cancelFloatingPaste()
      }
      if (!pending || (!pending.copy && pending.source.origin !== 'clipboard')) get().deleteSelection()
      // Cutting completes the selection interaction, including floating copies
      // whose cancellation temporarily restores the original selection box.
      get().setSelection(null)
    },

    async pasteClipboard() {
      if (isCanvasToolGestureLocked()) return
      const pasteTarget = loadEditorPreferences().pasteTarget
      if (pasteTarget === 'new-layer') {
        await get().pasteAsNewLayer()
        return
      }
      if (pasteTarget === 'new-project') {
        await get().pasteAsNewDocument()
        return
      }
      const current = activeSession(get())
      const globalAnimationCells = clipboardService.getAnimationCells()
      const globalAnimationFrames = clipboardService.getAnimationFrames()
      const hasGlobalAnimationClipboard = Boolean(globalAnimationCells || globalAnimationFrames)
      const hasAnimationTarget = Boolean(current && (
        current.selectedAnimationMaskCellKeys.length
        || current.selectedAnimationCellKeys.length
        || current.selectedAnimationFrameIds.length
        // A newly opened document has a valid active layer/frame context even
        // though no timeline item is explicitly selected yet. Allow a global
        // animation payload to use that context as its paste target.
        || hasGlobalAnimationClipboard
      ))
      if (!current || (!hasAnimationTarget && !current.activeLayerMaskId && current.selectedLayerIds.length === 0 && current.selectedGroupIds.length === 0 && !current.selectedGroupId)) {
        set({ message: tr('workspace.clipboard.selectTarget') })
        return
      }
      // Probe the OS clipboard first. Internal payloads are only considered
      // when no newer external image is present, so a copy made in another app
      // cannot be shadowed by a stale layer/cel clipboard.
      const externalImage = await clipboardService.readSystemSelection(() => window.moonSprite.readClipboardImage())
      const active = activeSession(get())
      // Cutting the last mask removes its row; allow its owner cel as a paste target.
      if (active?.animationMaskClipboard.length && !active.selectedAnimationMaskCellKeys.length && active.selectedAnimationCellKeys.length
        && await clipboardService.preferInternalAnimation(externalImage)) {
        const target = parseAnimationCelKey(active.selectedAnimationCellKeys.at(-1)!)
        if (target) { get().pasteAnimationMasks(target.layerId, target.frameId); return }
      }
      const hasAnimationClipboardTarget = Boolean(active && (
        active.selectedAnimationMaskCellKeys.length && active.animationMaskClipboard.length
        || active.selectedAnimationCellKeys.length && (active.animationCellClipboard.length || globalAnimationCells)
        || active.selectedAnimationFrameIds.length && (active.animationFrameClipboard.length || globalAnimationFrames)
        || !active.selectedAnimationMaskCellKeys.length && !active.selectedAnimationCellKeys.length && !active.selectedAnimationFrameIds.length && hasGlobalAnimationClipboard
      ))
      if (hasAnimationClipboardTarget && await clipboardService.preferInternalAnimation(externalImage)) {
        if (active!.selectedAnimationMaskCellKeys.length && active!.animationMaskClipboard.length) { get().pasteAnimationMasks(); return }
        if (active!.selectedAnimationCellKeys.length && (active!.animationCellClipboard.length || globalAnimationCells)) { get().pasteAnimationCels(); return }
        if (active!.selectedAnimationFrameIds.length && (active!.animationFrameClipboard.length || globalAnimationFrames)) { get().pasteAnimationFrames(); return }
        if (globalAnimationCells) { get().pasteAnimationCels(); return }
        if (globalAnimationFrames) { get().pasteAnimationFrames(); return }
      }
      if (clipboardService.getLayers() && await clipboardService.preferInternalLayers(externalImage)) {
        get().pasteLayersFromClipboard()
        return
      }
      if (externalImage) {
        await get().pasteSelection()
        return
      }
      const session = activeSession(get())
      if (!session) return
      if (session.selectedAnimationMaskCellKeys.length && session.animationMaskClipboard.length) { get().pasteAnimationMasks(); return }
      if (session.activeLayerMaskId) { await get().pasteSelection(); return }
      if (session.selectedAnimationCellKeys.length && (session.animationCellClipboard.length || globalAnimationCells)) { get().pasteAnimationCels(); return }
      if (session.selectedAnimationFrameIds.length && (session.animationFrameClipboard.length || globalAnimationFrames)) { get().pasteAnimationFrames(); return }
      if (globalAnimationCells) { get().pasteAnimationCels(); return }
      if (globalAnimationFrames) { get().pasteAnimationFrames(); return }
      if (clipboardService.getLayers()) { get().pasteLayersFromClipboard(); return }
      await get().pasteSelection()
    },

    async pasteSelection() {
      if (isCanvasToolGestureLocked()) return
      const targetSession = activeSession(get())
      if (!targetSession || !hasSelectedPaintTarget(targetSession)) {
        set({ message: tr('workspace.clipboard.selectTarget') })
        return
      }
      get().commitFloatingPaste()
      const clipboard = await clipboardService.readSelection(() => window.moonSprite.readClipboardImage())
      if (isCanvasToolGestureLocked()) return
      // A layer copy has no selection-image payload. Preserve the unified paste
      // entry point by falling back only after the live system image has been
      // checked, so external copies win over stale internal layer data.
      if (!clipboard && clipboardService.getLayers()) {
        get().pasteLayersFromClipboard()
        return
      }
      get().mutateActive((session) => {
        if (!clipboard) { set({ message: tr('workspace.clipboard.emptyPixels') }); return }
        const document = session.document
        const layer = activePaintLayer(session)
        if (layer.kind && layer.kind !== 'free-tile') { set({ message: tr('workspace.animation.incompatibleCel') }); return }
        if (isLayerEffectivelyLocked(document, layer)) { set({ message: tr('workspace.clipboard.layerLocked') }); return }
        // Keep the entire clipboard image, even when it is larger than the
        // document. The floating selection can then be moved until any part of
        // it reaches the canvas instead of losing off-canvas pixels on paste.
        const { x, y } = resolveClipboardPlacement({
          width: clipboard.width,
          height: clipboard.height,
          originX: clipboard.originX,
          originY: clipboard.originY,
          documentWidth: document.width,
          documentHeight: document.height,
          viewportWidth: session.viewportSize.width || document.width * session.view.zoom,
          viewportHeight: session.viewportSize.height || document.height * session.view.zoom,
          view: session.view,
          rotationIndicatorPosition: loadEditorPreferences().rotationIndicatorPosition
        })
        const width = clipboard.width
        const height = clipboard.height
        if (layer.kind === 'free-tile') {
          const target = activeFreeTileCelTarget(document)
          const selectedInstance = target && session.selectedFreeTileInstanceId
            ? target.freeTiles.instances.find((instance) => instance.id === session.selectedFreeTileInstanceId) ?? null
            : null
          if (target && selectedInstance) {
            const result = pasteSelectionClipboardIntoSelectedFreeTileInstance(recordDocumentOperation, session, target, selectedInstance, clipboard, x, y)
            if (result.status === 'unavailable') set({ message: tr('workspace.clipboard.freeTileInstanceUnavailable') })
            else if (result.status === 'too-large') set({ message: tr('workspace.clipboard.freeTileSourceTooLarge') })
            else if (result.status === 'outside') set({ message: tr('workspace.clipboard.outside') })
            else set({ message: tr('workspace.clipboard.pastedFreeTileSource', { count: result.pixelCount }) })
            if (result.status === 'pasted') requestTilesetPanelVisibility(true)
            return
          }
          const pasted = target ? pasteSelectionClipboardIntoFreeTile(recordDocumentOperation, session, target, clipboard, x, y) : null
          if (!pasted) { set({ message: tr('workspace.clipboard.outside') }); return }
          set({ message: tr('workspace.clipboard.pastedFreeTiles', { count: pasted.pixelCount }) })
          requestTilesetPanelVisibility(true)
          return
        }
        const beforeSelection = cloneSelectionMask(session.selection)
        const beforeSelectionPivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const pastedMask = clipboard.mask
        const convertsRgbaValues = layer.format === 'rgba' && (isLayerMask(layer) || document.colorMode === 'grayscale')
        const values = layer.format === 'rgba'
          ? convertsRgbaValues ? clipboard.pixels.slice() : clipboard.pixels
          : new Uint32Array(width * height)
        if (convertsRgbaValues) {
          for (let offset = 0; offset < values.length; offset += 1) {
            const color = unpackColor(values[offset])
            values[offset] = packColor(relativeLuminanceColor(color))
          }
        }
        let pasted = 0
        if (layer.format === 'rgba') {
          if (pastedMask) for (const selected of pastedMask) pasted += selected
          else pasted = width * height
        } else {
          for (let offset = 0; offset < width * height; offset += 1) {
            if (pastedMask && pastedMask[offset] !== 1) continue
            values[offset] = paletteColorIdForCanvas(document, unpackColor(clipboard.pixels[offset]))
            pasted += 1
          }
        }
        if (pasted === 0) { set({ message: tr('workspace.clipboard.outside') }); return }
        // Keep the visible selection rectangular while the source mask prevents
        // transparent clipboard pixels from touching the destination.
        const sourceSelection: SelectionMask = !pastedMask || pasted === width * height
          ? { x, y, width, height }
          : { x, y, width, height, mask: pastedMask }
        const target = rectangularSelection(sourceSelection)
        const source: SelectionTransformSource = {
          selection: cloneSelectionMask(sourceSelection)!,
          values,
          // Floating copies use the visible destination fast path and retain the
          // full source arrays above. Avoid allocating huge JS offset arrays for
          // pasted images that extend beyond a small document.
          selectedOffsets: new Uint32Array(0),
          opaqueOffsets: new Uint32Array(0),
          opaqueIndices: new Uint32Array(0),
          opaqueValues: new Uint32Array(0),
          origin: 'clipboard'
        }
        const previewDeferred = width * height > DEFERRED_PASTE_AREA_THRESHOLD
        const edit = previewDeferred
          ? null
          : applySelectionTranslationCommit(document, source, target, true, layer) ?? beginPixelEdit(layer.id)
        session.selection = cloneSelectionMask(target)
        session.pendingPaste = { layerId: layer.id, beforeSelection, beforeSelectionPivot, source, target: cloneSelectionMask(target)!, transformTarget: { x: target.x, y: target.y, width: target.width, height: target.height }, transformAngle: 0, previewEdit: edit, translationPreview: null, previewDeferred, copy: true, label: tr('workspace.history.pasteToLayer') }
        session.selectionPivot = null
        // A paste remains floating until confirmed, so its first drag should move
        // the pasted pixels instead of beginning a new pencil stroke.
        session.tool = 'selection'
        if (previewDeferred) markFloatingOverlayChanged(session)
        else markFloatingPreviewChanged(session, target, target)
        set({ message: tr('workspace.clipboard.pastedPixels', { count: pasted }) })
      }, false)
    },

    async pasteAsNewLayer() {
      if (isCanvasToolGestureLocked()) return false
      const systemSelection = await clipboardService.readSystemSelection(() => window.moonSprite.readClipboardImage())
      if (clipboardService.getLayers() && await clipboardService.preferInternalLayers(systemSelection)) return get().pasteLayersFromClipboard()
      const clipboard = await clipboardService.readSelection(() => window.moonSprite.readClipboardImage())
      const current = activeSession(get())
      if (!current) { set({ message: tr('workspace.clipboard.noContent') }); return false }
      if (!clipboard) {
        if (clipboardService.getLayers()) return get().pasteLayersFromClipboard()
        set({ message: tr('workspace.clipboard.noContent') })
        return false
      }
      if (isCanvasToolGestureLocked()) return false
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const document = session.document
        const previousPixelSelection = cloneSelectionMask(session.selection)
        const previousPivot = session.selectionPivot ? { ...session.selectionPivot } : null
        const placement = resolveClipboardPlacement({
          width: clipboard.width,
          height: clipboard.height,
          originX: clipboard.originX,
          originY: clipboard.originY,
          documentWidth: document.width,
          documentHeight: document.height,
          viewportWidth: session.viewportSize.width || document.width * session.view.zoom,
          viewportHeight: session.viewportSize.height || document.height * session.view.zoom,
          view: session.view,
          rotationIndicatorPosition: loadEditorPreferences().rotationIndicatorPosition
        })
        const layer = createLayer(tr('layers.pasteLayer'), clipboard.width, clipboard.height, document.colorMode)
        layer.offsetX = placement.x
        layer.offsetY = placement.y
        for (let index = 0; index < clipboard.width * clipboard.height; index += 1) {
          if (clipboard.mask && clipboard.mask[index] !== 1) continue
          writeLayerColor(document, layer, index, unpackColor(clipboard.pixels[index]))
        }
        const activeLayer = document.layers.find((candidate) => candidate.id === document.activeLayerId)
        const activeLayerIndex = activeLayer ? document.layers.indexOf(activeLayer) : -1
        const insertionIndex = activeLayerIndex >= 0 ? activeLayerIndex + 1 : document.layers.length
        layer.groupId = activeLayer?.groupId
        const previousActiveId = document.activeLayerId
        const previousSelection = [...session.selectedLayerIds]
        const previousGroupId = session.selectedGroupId
        const previousGroupIds = [...session.selectedGroupIds]
        document.layers.splice(insertionIndex, 0, layer)
        document.activeLayerId = layer.id
        session.selectedGroupId = null
        session.selectedGroupIds = []
        session.selectedLayerIds = [layer.id]
        session.layerSelectionAnchorId = layer.id
        const pastedSelection = { x: placement.x, y: placement.y, width: clipboard.width, height: clipboard.height }
        session.activeLayerMaskId = null
        session.selection = cloneSelectionMask(pastedSelection)
        session.selectionPivot = null
        session.tool = 'selection'
        session.selectionKind = 'rectangle'
        session.selectionMode = 'replace'
        session.freeTransformActive = false
        session.freeTransformQuad = null
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layer.id })
        session.history.push({
          label: tr('workspace.history.pasteAsLayer'),
          bytes: layer.pixels.byteLength + 64,
          undo: () => {
            document.layers = document.layers.filter((candidate) => candidate.id !== layer.id)
            document.activeLayerId = previousActiveId
            session.selectedLayerIds = previousSelection
            session.selectedGroupId = previousGroupId
            session.selectedGroupIds = previousGroupIds
            session.selection = cloneSelectionMask(previousPixelSelection)
            session.selectionPivot = previousPivot ? { ...previousPivot } : null
          },
          redo: () => {
            if (!document.layers.some((candidate) => candidate.id === layer.id)) document.layers.splice(Math.min(insertionIndex, document.layers.length), 0, layer)
            document.activeLayerId = layer.id
            session.selectedGroupId = null
            session.selectedGroupIds = []
            session.selectedLayerIds = [layer.id]
            session.selection = cloneSelectionMask(pastedSelection)
            session.selectionPivot = null
          }
        })
      })
      set({ message: tr('workspace.clipboard.pastedLayer') })
      return true
    },

    async pasteAsNewDocument() {
      const clipboard = await clipboardService.readSelection(() => window.moonSprite.readClipboardImage())
      if (!clipboard) { set({ message: tr('workspace.clipboard.noImage') }); return false }
      const document = createDocument(tr('document.pastedImage'), clipboard.width, clipboard.height, 'rgba')
      const layer = getActiveLayer(document)
      for (let index = 0; index < clipboard.width * clipboard.height; index += 1) {
        if (!clipboard.mask || clipboard.mask[index] === 1) writeLayerColor(document, layer, index, unpackColor(clipboard.pixels[index]))
      }
      document.dirty = true
      get().addSession(document)
      set({ message: tr('workspace.clipboard.pastedDocument') })
      return true
    }
  }
}
