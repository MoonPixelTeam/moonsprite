import type { AnimationCelSurface } from '@shared/types-animation'
import type { AnimationLayerMask } from '@shared/types-layer'
import { checkResourceLimit } from '@/core/resource-policy'
import { type HistoryEntry } from '@/core/history'
import { createId, createLayer, createSparseLayer, findOrAddPaletteColor, getLayerIdsInGroup, layerContentBounds, paletteColorIdForCanvas } from '@/core/document-model'
import { compositeRegion } from '@/core/document-composite'
import { animationCelKey, cloneDocumentForAnimationFrame, connectAnimationCels, detachLinkedLayerContent, ensureAnimationDocument, parseAnimationCelKey, refreshActiveAnimationFrame, removeAnimationCelsForLayers, resolveAnimationCel, restoreAnimationCels, syncActiveAnimationFrame } from '@/core/animation'
import { applyRelativeLuminance } from '@/core/raster'
import { moveLayerPanelRows as moveLayerPanelRowsOperation } from '@/core/layer-operations'
import { hasConfiguredLayerStyles, hasEnabledLayerStyles, layerStyleOutputBounds } from '@/core/layer-styles'
import { renderBackgroundPatternIndexed, renderBackgroundPatternRgba, renderBackgroundTileIndexed, renderBackgroundTileRgba } from '@/core/background-patterns'
import { createBlankTileset, createTilemapCelData, renderTilemapSurface, sliceRasterSurfaceToTilemap, type TilemapDrawingMode } from '@/core/tilemap'
import { createFreeTileCelData, renderFreeTileSurface, type FreeTileDrawingMode } from '@/core/free-tile'
import { ensureFreeTileTilesetOwnership, freeTileSetIdForLayer, freeTileSourcesForLayer } from '@/core/free-tile-document'
import { captureLayerUi } from './workspace-history'
import { captureDocumentStructureSnapshot, captureLayerContentSnapshot, documentStructureDeltaBytes, layerContentSnapshotBytes, restoreDocumentStructureSnapshot, restoreLayerContentSnapshot, type DocumentStructureSnapshot } from './workspace-document-history'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceLayerCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { defaultFreeTileSourceDisplayColor } from './workspace-layer-resources'
import { setTimelineActiveContext, clearAnimationItemSelection, selectedRowInsertionTarget, insertionTargetParent, clearAnimationMaskContext } from './workspace-animation-selection'
import { documentUsesTilesetPanel, requestTilesetPanelVisibility } from './workspace-tileset-panel'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import { cloneAnimationCelsForLayerIds } from './workspace-animation-clone'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import { removableOwnedTilesets, removeTilesetSnapshots } from './workspace-layer-owned-tilesets'

// Creating a layer changes the editing target but must not manufacture an
// explicit timeline selection (the latter owns the blue selection treatment).
const activateNewLayerContext = (session: DocumentSession, layerId: string, frameId: string): void => {
  session.document.activeLayerId = layerId
  session.selectedLayerIds = []
  session.selectedGroupId = null
  session.selectedGroupIds = []
  session.layerSelectionExplicit = false
  session.layerSelectionAnchorId = layerId
  clearAnimationItemSelection(session)
  session.activeLayerMaskId = null
  session.layerMaskIsolatedView = false
  setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layerId }, frameId, null)
}

export function createLayerCreationCommands({ get, set }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive'>): Pick<WorkspaceLayerCommands, 'addLayer' | 'createTilemapLayer' | 'createFreeTileLayer' | 'convertLayerToTilemap' | 'createBackgroundLayer' | 'rasterizeLayer'> {
  return {
    async addLayer() {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current) return
      get().mutateActive((session) => {
        const document = session.document
        const placement = selectedRowInsertionTarget(session)
        const layer = createSparseLayer(tr('workspace.layer.defaultName', { index: document.layers.length + 1 }), document.colorMode)
        const targetGroupId = insertionTargetParent(document, placement)
        if (targetGroupId) layer.groupId = targetGroupId
        const groupMemberIds = targetGroupId ? new Set(getLayerIdsInGroup(document, targetGroupId)) : null
        const lastGroupMember = groupMemberIds ? document.layers.reduce((last, item, index) => groupMemberIds.has(item.id) ? index : last, -1) : -1
        const index = lastGroupMember >= 0 ? lastGroupMember + 1 : document.layers.length
        document.layers.splice(index, 0, layer)
        const timeline = ensureAnimationDocument(document)
        const animationCels = cloneAnimationCelsForLayerIds(document, [layer.id])
        activateNewLayerContext(session, layer.id, timeline.activeFrameId)
        session.history.beginCompound()
        session.history.push({
          label: tr('workspace.history.newLayer'), bytes: layer.pixels.byteLength,
          undo: () => { document.layers = document.layers.filter((item) => item.id !== layer.id); removeAnimationCelsForLayers(document, [layer.id]); document.activeLayerId = document.layers[Math.max(0, index - 1)].id },
          redo: () => { document.layers.splice(index, 0, layer); restoreAnimationCels(document, animationCels); document.activeLayerId = layer.id }
        })
        const placementHistory = moveLayerPanelRowsOperation(session, [layer.id], [], placement)
        if (placementHistory) session.history.push(placementHistory)
        session.history.endCompound(tr('workspace.history.newLayer'))
      }, true, true)
    },
    async createTilemapLayer(options) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current) return
      const documentId = current.document.id
      try {
        let created = false
        const requestedTilesetId = typeof options.tilesetId === 'string' && options.tilesetId.trim() ? options.tilesetId : null
        const requestedTileset = requestedTilesetId
          ? current.document.tilesets?.find((tileset) => tileset.id === requestedTilesetId) ?? null
          : null
        if (requestedTilesetId && (!requestedTileset || !current.document.layers.some((layer) => layer.kind === 'tilemap' && layer.tilemapTilesetId === requestedTilesetId))) {
          throw new Error(tr('workspace.tilemap.tilesetUnavailable'))
        }
        const tileWidth = requestedTileset?.tileWidth ?? Math.max(1, Math.trunc(options.tileWidth))
        const tileHeight = requestedTileset?.tileHeight ?? Math.max(1, Math.trunc(options.tileHeight))
        const layerName = options.name.trim() || tr('workspace.tilemap.layerName')
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          if (session.document.id !== documentId) return
          const document = session.document
          syncActiveAnimationFrame(document)
          const before = captureDocumentStructureSnapshot(document)
          const beforeSelection = captureLayerUi(session)
          const beforeTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
          const tileset = requestedTilesetId
            ? document.tilesets?.find((candidate) => candidate.id === requestedTilesetId) ?? null
            : createBlankTileset(createId('tileset'), layerName, tileWidth, tileHeight, createId('tile'))
          if (!tileset || tileset.tileWidth !== tileWidth || tileset.tileHeight !== tileHeight) throw new Error(tr('workspace.tilemap.tilesetUnavailable'))
          if (!requestedTilesetId) document.tilesets = [...(document.tilesets ?? []), tileset]

          const placement = selectedRowInsertionTarget(session)
          const layer = createSparseLayer(layerName, document.colorMode)
          layer.kind = 'tilemap'
          layer.tilemapTilesetId = tileset.id
          if (!requestedTilesetId) tileset.name = layer.name
          const targetGroupId = insertionTargetParent(document, placement)
          if (targetGroupId) layer.groupId = targetGroupId
          document.layers.push(layer)
          const timeline = ensureAnimationDocument(document)
          for (const frame of timeline.frames) {
            const tilemap = createTilemapCelData(document.width, document.height, tileWidth, tileHeight)
            const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
            if (!cel) continue
            delete cel.linkedCelId
            delete cel.text
            cel.tilemap = tilemap
            cel.surface = renderTilemapSurface(
              tilemap,
              document.tilesets ?? [],
              document.colorMode,
              0,
              0,
              document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
            )
            cel.opacity = layer.opacity
          }
          refreshActiveAnimationFrame(document)
          activateNewLayerContext(session, layer.id, timeline.activeFrameId)
          session.selectedTilesetId = tileset.id
          session.selectedTileId = tileset.tileIds[0] ?? null
          session.secondaryTileId = tileset.tileIds[0] ?? null
          session.tilemapMode = 'hybrid'
          moveLayerPanelRowsOperation(session, [layer.id], [], placement)
          const after = captureDocumentStructureSnapshot(document)
          const afterSelection = captureLayerUi(session)
          const afterTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
          const restore = (
            snapshot: DocumentStructureSnapshot,
            selection: ReturnType<typeof captureLayerUi>,
            tileSelection: { tilesetId: string | null; tileId: string | null; secondaryTileId: string | null; mode: TilemapDrawingMode }
          ): void => {
            restoreDocumentStructureSnapshot(document, snapshot)
            session.selectedLayerIds = [...selection.selectedLayerIds]
            session.selectedGroupId = selection.selectedGroupId
            session.selectedGroupIds = [...selection.selectedGroupIds]
            session.collapsedGroupIds = [...selection.collapsedGroupIds]
            session.selectedTilesetId = tileSelection.tilesetId
            session.selectedTileId = tileSelection.tileId
            session.secondaryTileId = tileSelection.secondaryTileId
            session.tilemapMode = tileSelection.mode
          }
          session.history.push({
            label: tr('workspace.history.newTilemapLayer'),
            bytes: documentStructureDeltaBytes(before, after),
            undo: () => restore(before, beforeSelection, beforeTileSelection),
            redo: () => restore(after, afterSelection, afterTileSelection),
            invalidation: { kind: 'full' },
            requiresAnimationSync: false
          })
          created = true
        }, true, true)
        if (created) requestTilesetPanelVisibility(true)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },
    async createFreeTileLayer(options) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current) return
      const documentId = current.document.id
      try {
        let created = false
        const layerName = options.name.trim() || tr('workspace.freeTile.layerName')
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          if (session.document.id !== documentId) return
          const document = session.document
          syncActiveAnimationFrame(document)
          const before = captureDocumentStructureSnapshot(document)
          const beforeSelection = captureLayerUi(session)
          const beforeTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.freeTileMode }
          ensureFreeTileTilesetOwnership(document)
          const existingSetLayer = options.freeTileSetId
            ? document.layers.find((candidate) => candidate.kind === 'free-tile' && freeTileSetIdForLayer(candidate) === options.freeTileSetId) ?? null
            : null
          let freeTileSetId = existingSetLayer?.freeTileSetId ?? null
          let freeTileSources = existingSetLayer?.freeTileSources ?? null
          if (!freeTileSetId || !freeTileSources?.length) {
            freeTileSetId = createId('free-tile-set')
            const sourceId = createId('free-tile-source')
            const sourceName = tr('workspace.freeTile.sourceName', { index: 1 })
            const tileset = createBlankTileset(createId('tileset'), sourceName, 1, 1, createId('tile'), 1)
            document.tilesets = [...(document.tilesets ?? []), tileset]
            freeTileSources = [{ id: sourceId, name: sourceName, tilesetId: tileset.id, displayColor: defaultFreeTileSourceDisplayColor(0), visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
          }

          const placement = selectedRowInsertionTarget(session)
          const layer = createSparseLayer(layerName, document.colorMode)
          layer.kind = 'free-tile'
          layer.freeTileSetId = freeTileSetId
          layer.freeTileSources = freeTileSources
          const targetGroupId = insertionTargetParent(document, placement)
          if (targetGroupId) layer.groupId = targetGroupId
          document.layers.push(layer)
          const sources = freeTileSourcesForLayer(document, layer)
          const timeline = ensureAnimationDocument(document)
          for (const frame of timeline.frames) {
            const freeTiles = createFreeTileCelData()
            const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === frame.id)
            if (!cel) continue
            delete cel.linkedCelId
            delete cel.text
            delete cel.tilemap
            cel.freeTiles = freeTiles
            cel.surface = renderFreeTileSurface(
              freeTiles,
              sources,
              document.colorMode,
              document.width,
              document.height,
              0,
              0,
              document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
            )
            cel.opacity = layer.opacity
          }
          refreshActiveAnimationFrame(document)
          activateNewLayerContext(session, layer.id, timeline.activeFrameId)
          const selectedSource = sources[0] ?? null
          session.selectedTilesetId = selectedSource?.tileset.id ?? null
          session.selectedTileId = selectedSource?.tileset.tileIds[0] ?? null
          session.secondaryTileId = selectedSource?.tileset.tileIds[0] ?? null
          session.freeTileMode = 'edit'
          moveLayerPanelRowsOperation(session, [layer.id], [], placement)
          const after = captureDocumentStructureSnapshot(document)
          const afterSelection = captureLayerUi(session)
          const afterTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.freeTileMode }
          const restore = (
            snapshot: DocumentStructureSnapshot,
            selection: ReturnType<typeof captureLayerUi>,
            tileSelection: { tilesetId: string | null; tileId: string | null; secondaryTileId: string | null; mode: FreeTileDrawingMode }
          ): void => {
            restoreDocumentStructureSnapshot(document, snapshot)
            session.selectedLayerIds = [...selection.selectedLayerIds]
            session.selectedGroupId = selection.selectedGroupId
            session.selectedGroupIds = [...selection.selectedGroupIds]
            session.collapsedGroupIds = [...selection.collapsedGroupIds]
            session.selectedTilesetId = tileSelection.tilesetId
            session.selectedTileId = tileSelection.tileId
            session.secondaryTileId = tileSelection.secondaryTileId
            session.freeTileMode = tileSelection.mode
          }
          session.history.push({
            label: tr('workspace.history.newFreeTileLayer'),
            bytes: documentStructureDeltaBytes(before, after),
            undo: () => restore(before, beforeSelection, beforeTileSelection),
            redo: () => restore(after, afterSelection, afterTileSelection),
            invalidation: { kind: 'full' },
            requiresAnimationSync: false
          })
          created = true
        }, true, true)
        if (created) requestTilesetPanelVisibility(true)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },
    async convertLayerToTilemap(layerId, options) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current) return
      const sourceLayer = current.document.layers.find((candidate) => candidate.id === layerId)
      if (!sourceLayer || sourceLayer.kind || hasConfiguredLayerStyles(sourceLayer.layerStyles)) return
      const documentId = current.document.id
      try {
        const tileWidth = Math.max(1, Math.trunc(options.tileWidth))
        const tileHeight = Math.max(1, Math.trunc(options.tileHeight))
        const layerName = options.name.trim() || sourceLayer.name
        createTilemapCelData(current.document.width, current.document.height, tileWidth, tileHeight)
        let converted = false
        get().mutateActive((session) => {
          if (session.document.id !== documentId) return
          const document = session.document
          const layer = document.layers.find((candidate) => candidate.id === layerId)
          if (!layer || layer.kind || hasConfiguredLayerStyles(layer.layerStyles)) return
          syncActiveAnimationFrame(document)
          const before = captureLayerContentSnapshot(document, layerId)
          detachLinkedLayerContent(document, layerId)
          const beforeTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
          const timeline = ensureAnimationDocument(document)
          const frameCels = timeline.frames.flatMap((frame) => {
            const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frame.id)
            if (!cel) return []
            return [{ cel, surface: (resolveAnimationCel(timeline, cel) ?? cel).surface }]
          })
          let tileset = createBlankTileset(createId('tileset'), layerName, tileWidth, tileHeight, createId('tile'))
          const convertedCels = frameCels.map(({ cel, surface }) => {
            const sliced = sliceRasterSurfaceToTilemap(surface, document.palette, document.width, document.height, tileset, () => createId('tile'))
            tileset = sliced.tileset
            return { cel, tilemap: sliced.tilemap }
          })
          document.tilesets = [...(document.tilesets ?? []), tileset]
          for (const { cel, tilemap } of convertedCels) {
            delete cel.linkedCelId
            delete cel.text
            cel.tilemap = tilemap
            cel.surface = renderTilemapSurface(
              tilemap,
              document.tilesets,
              document.colorMode,
              0,
              0,
              document.colorMode === 'indexed' ? (color) => paletteColorIdForCanvas(document, color) : undefined
            )
          }
          layer.name = layerName
          layer.kind = 'tilemap'
          layer.tilemapTilesetId = tileset.id
          delete layer.linkedContentId
          delete layer.background
          delete layer.layerStyles
          refreshActiveAnimationFrame(document)
          document.activeLayerId = layer.id
          session.selectedGroupId = null
          session.selectedGroupIds = []
          session.selectedLayerIds = [layer.id]
          session.layerSelectionAnchorId = layer.id
          session.selectedTilesetId = tileset.id
          session.selectedTileId = tileset.tileIds[0] ?? null
          session.secondaryTileId = tileset.tileIds[0] ?? null
          session.tilemapMode = 'hybrid'
          session.selectedAnimationCellKeys = [animationCelKey(layer.id, timeline.activeFrameId)]
          session.animationCellSelectionExplicit = false
          const after = captureLayerContentSnapshot(document, layerId)
          const afterTileSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId, mode: session.tilemapMode }
          const restore = (
            snapshot: ReturnType<typeof captureLayerContentSnapshot>,
            tileSelection: { tilesetId: string | null; tileId: string | null; secondaryTileId: string | null; mode: TilemapDrawingMode }
          ): void => {
            restoreLayerContentSnapshot(document, snapshot)
            session.selectedTilesetId = tileSelection.tilesetId
            session.selectedTileId = tileSelection.tileId
            session.secondaryTileId = tileSelection.secondaryTileId
            session.tilemapMode = tileSelection.mode
          }
          session.history.push({
            label: tr('workspace.history.convertToTilemapLayer'),
            bytes: layerContentSnapshotBytes(before) + layerContentSnapshotBytes(after),
            undo: () => restore(before, beforeTileSelection),
            redo: () => restore(after, afterTileSelection),
            invalidation: { kind: 'full' },
            affectedLayerIds: [layerId],
            requiresAnimationSync: false
          })
          converted = true
        }, true, true)
        if (converted) requestTilesetPanelVisibility(true)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },
    async createBackgroundLayer(pattern) {
      get().commitFloatingPaste()
      const current = activeSession(get())
      if (!current) return
      const documentId = current.document.id
      try {
        const resource = await window.moonSprite.getResourceInfo()
        const check = checkResourceLimit(current.document.width, current.document.height, current.document.layers.length + 1, current.document.colorMode, resource)
        if (!check.allowed) throw new Error(check.reason)
        get().mutateActive((session) => {
          if (session.document.id !== documentId) return
          const document = session.document
          const before = captureDocumentStructureSnapshot(document)
          const beforeSelection = captureLayerUi(session)
          // A background is added underneath the artwork, so it is not an editing
          // target: the active layer and the timeline focus stay exactly as they were.
          const previousActiveLayerId = document.activeLayerId
          const previousActiveContext = { ...session.timelineActiveContext }
          const layer = createLayer(tr('workspace.layer.backgroundName'), document.width, document.height, document.colorMode)
          const presetPattern = typeof pattern === 'string' ? pattern : pattern.pattern
          layer.background = presetPattern ? { mode: 'preset', pattern: presetPattern } : { mode: 'canvas' }
          if (layer.format === 'rgba') layer.pixels = typeof pattern === 'string'
            ? renderBackgroundPatternRgba(document.width, document.height, pattern)
            : renderBackgroundTileRgba(document.width, document.height, pattern)
          else layer.pixels = typeof pattern === 'string'
            ? renderBackgroundPatternIndexed(document.width, document.height, pattern, (color) => findOrAddPaletteColor(document, color, true))
            : renderBackgroundTileIndexed(document.width, document.height, pattern, (color) => findOrAddPaletteColor(document, color, true))
          document.layers.unshift(layer)
          const timeline = ensureAnimationDocument(document)
          connectAnimationCels(document, timeline.cels.filter((cel) => cel.layerId === layer.id).map((cel) => cel.id))
          document.activeLayerId = previousActiveLayerId
          session.timelineActiveContext = previousActiveContext
          refreshActiveAnimationFrame(document)
          const after = captureDocumentStructureSnapshot(document)
          const afterSelection = captureLayerUi(session)
          const restore = (snapshot: DocumentStructureSnapshot, selection: ReturnType<typeof captureLayerUi>): void => {
            restoreDocumentStructureSnapshot(document, snapshot)
            session.selectedLayerIds = [...selection.selectedLayerIds]
            session.selectedGroupId = selection.selectedGroupId
            session.selectedGroupIds = [...selection.selectedGroupIds]
            session.collapsedGroupIds = [...selection.collapsedGroupIds]
          }
          session.history.push({ label: tr('workspace.history.newBackgroundLayer'), bytes: documentStructureDeltaBytes(before, after), undo: () => restore(before, beforeSelection), redo: () => restore(after, afterSelection), invalidation: { kind: 'full' }, requiresAnimationSync: false })
        }, true, true)
      } catch (error) {
        set({ message: error instanceof Error ? error.message : tr('workspace.canvasCreateError') })
      }
    },
    rasterizeLayer(layerId) {
      let shouldHideTilesetPanel = false
      get().mutateActive((session) => {
        const document = session.document
        const layer = document.layers.find((candidate) => candidate.id === layerId)
        if (!layer || (!layer.background && !layer.kind && !hasConfiguredLayerStyles(layer.layerStyles))) return
        const wasFreeTileLayer = layer.kind === 'free-tile'
        syncActiveAnimationFrame(document)
        const rasterizesStyles = hasEnabledLayerStyles(layer.layerStyles)
        const beforeSelection = captureAnimationSelectionHistory(session)
        const before = captureLayerContentSnapshot(document, layerId, { includeLayerMasks: rasterizesStyles })
        detachLinkedLayerContent(document, layerId)
        const timeline = ensureAnimationDocument(document)
        const rasterizedTilesets = removableOwnedTilesets(document, new Set([layerId]))
        if (rasterizesStyles) {
          const rasterizedByFrameId = new Map<string, AnimationCelSurface>()
          for (const frame of timeline.frames) {
            const preview = cloneDocumentForAnimationFrame(document, frame.id)
            const previewLayer = preview.layers.find((candidate) => candidate.id === layerId)
            const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frame.id)
            if (!previewLayer || !cel) continue
            preview.layers = [previewLayer]
            preview.groups = []
            preview.activeLayerId = previewLayer.id
            previewLayer.visible = true
            previewLayer.opacity = 1
            previewLayer.blendMode = 'normal'
            previewLayer.groupId = null
            delete previewLayer.clippingMask
            const sourceBounds = layerContentBounds(preview, previewLayer) ?? { x: previewLayer.offsetX, y: previewLayer.offsetY, width: 1, height: 1 }
            const styledBounds = layerStyleOutputBounds(sourceBounds, previewLayer.layerStyles) ?? sourceBounds
            const x = Math.floor(styledBounds.x)
            const y = Math.floor(styledBounds.y)
            const right = Math.ceil(styledBounds.x + styledBounds.width)
            const bottom = Math.ceil(styledBounds.y + styledBounds.height)
            const width = Math.max(1, right - x)
            const height = Math.max(1, bottom - y)
            const rgba = compositeRegion(preview, x, y, width, height)
            const surface: AnimationCelSurface = layer.format === 'rgba'
              ? { format: 'rgba', width, height, offsetX: x, offsetY: y, pixels: document.colorMode === 'grayscale' ? applyRelativeLuminance(rgba) : rgba }
              : {
                  format: 'indexed', width, height, offsetX: x, offsetY: y,
                  pixels: Uint32Array.from({ length: width * height }, (_, index) => {
                    const offset = index * 4
                    return paletteColorIdForCanvas(document, { r: rgba[offset], g: rgba[offset + 1], b: rgba[offset + 2], a: rgba[offset + 3] })
                  })
                }
            rasterizedByFrameId.set(frame.id, surface)
          }
          for (const frame of timeline.frames) {
            const cel = timeline.cels.find((candidate) => candidate.layerId === layerId && candidate.frameId === frame.id)
            const surface = rasterizedByFrameId.get(frame.id)
            if (!cel || !surface) continue
            delete cel.linkedCelId
            cel.surface = surface
            delete cel.text
          }
          const maskWasBaked = (entry: AnimationLayerMask): boolean => entry.layerId === layerId && rasterizedByFrameId.has(entry.frameId)
          const removedMaskIds = new Set((timeline.layerMasks ?? []).filter(maskWasBaked).map((entry) => entry.mask.id))
          timeline.layerMasks = (timeline.layerMasks ?? []).filter((entry) => !maskWasBaked(entry))
          const consumesMaskContext = Boolean(session.activeLayerMaskId && removedMaskIds.has(session.activeLayerMaskId))
            || session.selectedAnimationMaskCellKeys.some((key) => parseAnimationCelKey(key)?.layerId === layerId)
            || session.selectedAnimationMaskRowKeys.includes(`layer:${layerId}`)
          if (consumesMaskContext) clearAnimationMaskContext(session)
        }
        for (const cel of timeline.cels) if (cel.layerId === layerId) {
          delete cel.text
          delete cel.tilemap
          delete cel.freeTiles
        }
        delete layer.kind
        delete layer.linkedContentId
        delete layer.tilemapTilesetId
        delete layer.freeTileTilesetId
        delete layer.freeTileSetId
        delete layer.freeTileSources
        delete layer.layerStyles
        delete layer.background
        removeTilesetSnapshots(document, rasterizedTilesets)
        refreshActiveAnimationFrame(document)
        const after = captureLayerContentSnapshot(document, layerId, { includeLayerMasks: rasterizesStyles })
        const afterSelection = captureAnimationSelectionHistory(session)
        const entry: HistoryEntry = { label: tr('workspace.history.convertToRasterLayer'), bytes: layerContentSnapshotBytes(before) + layerContentSnapshotBytes(after), undo: () => restoreLayerContentSnapshot(document, before), redo: () => restoreLayerContentSnapshot(document, after), invalidation: { kind: 'full' }, affectedLayerIds: [layerId], requiresAnimationSync: false }
        session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
        shouldHideTilesetPanel = wasFreeTileLayer && !documentUsesTilesetPanel(document)
      }, true, true)
      if (shouldHideTilesetPanel) requestTilesetPanelVisibility(false)
    }
  }
}
