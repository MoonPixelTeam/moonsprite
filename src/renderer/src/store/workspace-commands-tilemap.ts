import { completeDocumentChange } from './workspace-document-change'
import type { RasterLayer } from '@shared/types-layer'
import type { Tileset } from '@shared/types-tiles'
import { createId, markRasterStorageContentChanged } from '@/core/document-model'
import { applyTilesetTileReferences, captureTilesetTileReferences, rerenderTilesetReferences, rerenderTilesetTileReferences } from '@/core/tilemap-document'
import { appendBlankTilesetTile, cloneTileset, compactTilesetTileSlots, deleteTilesetTiles as deleteTilesetTilesData, reorderTilesetTiles as reorderTilesetTilesData, setTilesetTileSlots as setTilesetTileSlotsData, writeTilesetTilePixels } from '@/core/tilemap'
import { applyFreeTileReferences, captureFreeTileReferences, rerenderFreeTileReferences } from '@/core/free-tile-document'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceTilemapCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { setTimelineActiveContext } from './workspace-animation-selection'
import { clearFreeTileInstanceSelection } from './workspace-free-tile-selection'
import { tr } from './workspace-translation'

const layerOwnsTileset = (layer: RasterLayer, tilesetId: string): boolean =>
  (layer.kind === 'tilemap' && layer.tilemapTilesetId === tilesetId)
  || (layer.kind === 'free-tile' && layer.freeTileSources?.some((source) => source.tilesetId === tilesetId) === true)

const ownerLayerForTileset = (session: DocumentSession, tilesetId: string): RasterLayer | undefined =>
  session.document.layers.find((layer) => layer.id === session.document.activeLayerId && layerOwnsTileset(layer, tilesetId))
  ?? session.document.layers.find((layer) => layerOwnsTileset(layer, tilesetId))

export function createWorkspaceTilemapCommands({ get, recording }: WorkspaceCommandContext<'deleteTilesetTiles' | 'mutateActive'>): WorkspaceTilemapCommands {
  const { recordDocumentOperation } = recording
  return {
    setTilemapMode(mode) {
      get().mutateActive((session) => {
        session.tilemapMode = mode
      }, false)
    },

    activateTilemapLayerForDrawing(layerId) {
      get().mutateActive((session) => {
        if (session.tilemapMode !== 'paint') return
        const requestedOwner = layerId
          ? session.document.layers.find((layer) => layer.id === layerId && layer.kind === 'tilemap')
          : undefined
        const owner = requestedOwner
          ?? (session.selectedTilesetId ? ownerLayerForTileset(session, session.selectedTilesetId) : undefined)
        if (owner?.kind !== 'tilemap') return
        const activeLayer = session.document.layers.find((layer) => layer.id === session.document.activeLayerId)
        // A shared tileset is intentionally not an implicit layer switch. For
        // a concrete edit target, however, the target layer is authoritative;
        // this prevents pointer-up from restoring the layer that was active
        // before the stroke began.
        if (activeLayer?.kind === 'tilemap' && activeLayer.tilemapTilesetId === owner.tilemapTilesetId) {
          const frameId = session.document.animation?.activeFrameId ?? null
          setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: activeLayer.id }, frameId, null)
          return
        }
        // Drawing with another layer's tileset changes the active paint target,
        // but it must not replace the user's layer selection. Selection visuals
        // and active-row visuals are separate timeline states.
        session.document.activeLayerId = owner.id
        // Keep the timeline focus in the same transition as the active paint
        // target; otherwise the old layer can reappear after pointer-up.
        const frameId = session.document.animation?.activeFrameId ?? null
        setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: owner.id }, frameId, null)
      }, false)
    },

    setSelectedTileset(id) {
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === id)
        if (!tileset) return
        session.selectedTilesetId = tileset.id
        clearFreeTileInstanceSelection(session)
        session.selectedTileId = tileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : tileset.tileIds[0] ?? null
        session.secondaryTileId = tileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : tileset.tileIds[0] ?? null
      }, false)
    },

    setSelectedTile(tilesetId, tileId, role = 'primary') {
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset?.tileIds.includes(tileId)) return
        session.selectedTilesetId = tileset.id
        clearFreeTileInstanceSelection(session)
        if (role === 'secondary') session.secondaryTileId = tileId
        else session.selectedTileId = tileId
        session.selectedTileId = tileset.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : tileset.tileIds[0] ?? null
        session.secondaryTileId = tileset.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : tileset.tileIds[0] ?? null
      }, false)
    },

    reorderTilesetTiles(tilesetId, orderedTileIds) {
      let reordered = false
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset) return
        const before = cloneTileset(tileset)
        const after = reorderTilesetTilesData(tileset, orderedTileIds)
        if (!after) return
        const replace = (snapshot: Tileset): void => {
          const replacement = cloneTileset(snapshot)
          session.document.tilesets = (session.document.tilesets ?? []).map((candidate) => candidate.id === tilesetId ? replacement : candidate)
          markRasterStorageContentChanged(replacement.pixels)
          rerenderTilesetReferences(session.document, tilesetId)
          rerenderFreeTileReferences(session.document, tilesetId)
        }
        replace(after)
        session.history.push({
          label: tr('workspace.history.reorderTilesetTiles'),
          bytes: before.pixels.byteLength + after.pixels.byteLength + (before.tileIds.length + after.tileIds.length) * 32,
          undo: () => replace(before),
          redo: () => replace(after),
          invalidation: { kind: 'full' },
          affectedLayerIds: session.document.layers.flatMap((layer) => (layer.kind === 'tilemap' && layer.tilemapTilesetId === tilesetId) || (layer.kind === 'free-tile' && layer.freeTileSources?.some((source) => source.tilesetId === tilesetId)) ? [layer.id] : []),
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        reordered = true
      }, false)
      return reordered
    },

    setTilesetTileSlots(tilesetId, requestedSlots) {
      let repositioned = false
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset) return
        const before = compactTilesetTileSlots(tileset.tileIds, tileset.tileSlots)
        const after = setTilesetTileSlotsData(tileset, requestedSlots)
        if (!after?.tileSlots) return
        const afterSlots = [...after.tileSlots]
        const apply = (tileSlots: Array<string | null>): void => {
          const current = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
          if (current) current.tileSlots = [...tileSlots]
        }
        apply(afterSlots)
        session.history.push({
          label: tr('workspace.history.reorderTilesetTiles'),
          bytes: (before.length + afterSlots.length) * 24,
          undo: () => apply(before),
          redo: () => apply(afterSlots),
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        repositioned = true
      }, false)
      return repositioned
    },

    addTilesetTile(tilesetId) {
      let addedTileId: string | null = null
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset) return
        const before = cloneTileset(tileset)
        const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
        const tileId = createId('tile')
        const after = appendBlankTilesetTile(tileset, tileId)
        const replace = (snapshot: Tileset): void => {
          const replacement = cloneTileset(snapshot)
          session.document.tilesets = (session.document.tilesets ?? []).map((candidate) => candidate.id === tilesetId ? replacement : candidate)
          markRasterStorageContentChanged(replacement.pixels)
        }
        replace(after)
        session.selectedTilesetId = tilesetId
        session.selectedTileId = tileId
        const afterSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
        session.history.push({
          label: tr('workspace.history.addTilesetTile'),
          bytes: before.pixels.byteLength + after.pixels.byteLength + (before.tileIds.length + after.tileIds.length) * 32,
          undo: () => { replace(before); session.selectedTilesetId = beforeSelection.tilesetId; session.selectedTileId = beforeSelection.tileId; session.secondaryTileId = beforeSelection.secondaryTileId },
          redo: () => { replace(after); session.selectedTilesetId = afterSelection.tilesetId; session.selectedTileId = afterSelection.tileId; session.secondaryTileId = afterSelection.secondaryTileId },
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        addedTileId = tileId
      }, false)
      return addedTileId
    },

    deleteTilesetTile(tilesetId, tileId) {
      return get().deleteTilesetTiles(tilesetId, [tileId])
    },

    deleteTilesetTiles(tilesetId, tileIds) {
      let deleted = false
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset) return
        const after = deleteTilesetTilesData(tileset, tileIds)
        if (!after) return
        const before = cloneTileset(tileset)
        const retainedTileIds = new Set(after.tileIds)
        const deletedTileIds = before.tileIds.filter((tileId) => !retainedTileIds.has(tileId))
        const references = deletedTileIds.flatMap((tileId) => captureTilesetTileReferences(session.document, tilesetId, tileId))
        const freeTileReferences = deletedTileIds.flatMap((tileId) => captureFreeTileReferences(session.document, tilesetId, tileId))
        const beforeSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
        const replace = (snapshot: Tileset): void => {
          const replacement = cloneTileset(snapshot)
          session.document.tilesets = (session.document.tilesets ?? []).map((candidate) => candidate.id === tilesetId ? replacement : candidate)
          markRasterStorageContentChanged(replacement.pixels)
        }
        replace(after)
        applyTilesetTileReferences(session.document, references, 'clear')
        applyFreeTileReferences(session.document, freeTileReferences, 'clear')
        session.selectedTilesetId = tilesetId
        const firstDeletedIndex = Math.min(...deletedTileIds.map((tileId) => before.tileIds.indexOf(tileId)))
        const fallbackTileId = after.tileIds[Math.min(firstDeletedIndex, after.tileIds.length - 1)] ?? after.tileIds[0] ?? null
        session.selectedTileId = after.tileIds.includes(session.selectedTileId ?? '') ? session.selectedTileId : fallbackTileId
        session.secondaryTileId = after.tileIds.includes(session.secondaryTileId ?? '') ? session.secondaryTileId : fallbackTileId
        const afterSelection = { tilesetId: session.selectedTilesetId, tileId: session.selectedTileId, secondaryTileId: session.secondaryTileId }
        session.history.push({
          label: tr('workspace.history.deleteTilesetTile'),
          bytes: before.pixels.byteLength + after.pixels.byteLength + references.length * 96 + freeTileReferences.length * 72,
          undo: () => {
            replace(before)
            applyTilesetTileReferences(session.document, references, 'restore')
            applyFreeTileReferences(session.document, freeTileReferences, 'restore')
            session.selectedTilesetId = beforeSelection.tilesetId
            session.selectedTileId = beforeSelection.tileId
            session.secondaryTileId = beforeSelection.secondaryTileId
          },
          redo: () => {
            replace(after)
            applyTilesetTileReferences(session.document, references, 'clear')
            applyFreeTileReferences(session.document, freeTileReferences, 'clear')
            session.selectedTilesetId = afterSelection.tilesetId
            session.selectedTileId = afterSelection.tileId
            session.secondaryTileId = afterSelection.secondaryTileId
          },
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        deleted = true
      }, false)
      return deleted
    },

    previewTilesetTilePixels(tilesetId, tileId, pixels) {
      let changed = false
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset || !writeTilesetTilePixels(tileset, tileId, pixels)) return
        markRasterStorageContentChanged(tileset.pixels)
        rerenderTilesetTileReferences(session.document, tilesetId, tileId)
        rerenderFreeTileReferences(session.document, tilesetId, tileId)
        changed = true
      }, false)
      return changed
    },

    commitTilesetTileEdit(tilesetId, tileId, before, after) {
      if (before.length !== after.length || before.every((value, index) => value === after[index])) return false
      let committed = false
      get().mutateActive((session) => {
        const tileset = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
        if (!tileset || before.length !== tileset.tileWidth * tileset.tileHeight * 4) return
        const beforePixels = before.slice()
        const afterPixels = after.slice()
        const apply = (pixels: Uint8ClampedArray): void => {
          const current = session.document.tilesets?.find((candidate) => candidate.id === tilesetId)
          if (!current || !writeTilesetTilePixels(current, tileId, pixels)) return
          markRasterStorageContentChanged(current.pixels)
          rerenderTilesetTileReferences(session.document, tilesetId, tileId)
          rerenderFreeTileReferences(session.document, tilesetId, tileId)
        }
        apply(afterPixels)
        session.history.push({
          label: tr('workspace.history.editTilesetTile'),
          bytes: beforePixels.byteLength + afterPixels.byteLength,
          undo: () => apply(beforePixels),
          redo: () => apply(afterPixels),
          invalidation: { kind: 'full' },
          requiresAnimationSync: false
        })
        completeDocumentChange(session, 'content', recordDocumentOperation, { kind: 'full' })
        committed = true
      }, false)
      return committed
    }
  }
}
