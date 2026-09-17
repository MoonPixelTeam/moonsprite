import type { AnimationCel } from '@shared/types-animation'
import { type HistoryEntry } from '@/core/history'
import { createId } from '@/core/document-model'
import {
  activateAnimationFrame,
  animationCelKey,
  cloneAnimationCel,
  cloneAnimationCelSurface,
  cloneAnimationLayerMask,
  ensureAnimationDocument,
  inheritAnimationFrameCelLinks,
  mapAnimationCelBlock,
  normalizeAnimationCelZIndex,
  parseAnimationCelKey,
  refreshActiveAnimationFrame,
  resolveAnimationCel,
  restoreAnimationCels
} from '@/core/animation'
import { cloneTextCelData } from '@/core/text-raster'
import { cloneTilemapCelData } from '@/core/tilemap'
import { cloneFreeTileCelData } from '@/core/free-tile'
import { clipboardService, type AnimationCelClipboardSnapshot } from './clipboard-service'
import type { DocumentSession } from './workspace-types'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import {
  cloneAnimationMaskForOwner,
  animationMaskSlotSnapshot,
  AnimationMaskSlotSnapshot,
  setAnimationMaskSlot,
  restoreAnimationMaskSlots
} from './workspace-animation-mask-slots'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import { layerContentKind, animationCelContentKind } from './workspace-animation-commands-helpers'
import { animationCelClipboardSnapshot, animationCelForTarget, clipAnimationCelToSelection } from './workspace-animation-cel-conversion'

function pasteCrossDocumentAnimationCels(session: DocumentSession, snapshot: AnimationCelClipboardSnapshot): void {
  const timeline = ensureAnimationDocument(session.document)
  const targetKey = session.selectedAnimationCellKeys.at(-1) ?? animationCelKey(session.document.activeLayerId, timeline.activeFrameId)
  const target = parseAnimationCelKey(targetKey)
  if (!target) return
  const targetLayerIndex = session.document.layers.findIndex((layer) => layer.id === target.layerId)
  const targetFrameIndex = timeline.frames.findIndex((frame) => frame.id === target.frameId)
  if (targetLayerIndex < 0 || targetFrameIndex < 0) return
  const previousActiveFrameId = timeline.activeFrameId
  const previousSelection = [...session.selectedAnimationCellKeys]
  const previousSelectedFrameIds = [...session.selectedAnimationFrameIds]
  const previousSelectionExplicit = session.animationCellSelectionExplicit
  const maxFrameIndex = Math.max(...snapshot.items.map((item) => targetFrameIndex + item.frameIndex - snapshot.anchorFrameIndex))
  const minFrameIndex = Math.min(...snapshot.items.map((item) => targetFrameIndex + item.frameIndex - snapshot.anchorFrameIndex))
  if (minFrameIndex < 0) return
  const appendedFrames = Array.from({ length: Math.max(0, maxFrameIndex - timeline.frames.length + 1) }, () => ({ id: createId('frame'), duration: 100 }))
  if (appendedFrames.length > 0) timeline.frames.push(...appendedFrames)
  ensureAnimationDocument(session.document)
  const destinations = snapshot.items.map((item) => ({
    item,
    layer: session.document.layers[targetLayerIndex + item.layerIndex - snapshot.anchorLayerIndex],
    frame: timeline.frames[targetFrameIndex + item.frameIndex - snapshot.anchorFrameIndex]
  }))
  const resolvedDestinations = destinations.flatMap((destination) => {
    if (!destination.layer || !destination.frame) return []
    const cel = timeline.cels.find((candidate) => candidate.layerId === destination.layer!.id && candidate.frameId === destination.frame!.id)
    return cel ? [{ ...destination, cel }] : []
  })
  if (resolvedDestinations.length !== snapshot.items.length) {
    if (appendedFrames.length > 0) timeline.frames.splice(-appendedFrames.length, appendedFrames.length)
    return
  }
  const before = resolvedDestinations.map(({ cel }) => cloneAnimationCel(cel))
  const beforeMasks = resolvedDestinations.map(({ cel }) => animationMaskSlotSnapshot(session.document, cel.layerId, cel.frameId)).filter((entry): entry is AnimationMaskSlotSnapshot => Boolean(entry))
  const destinationBySourceId = new Map(resolvedDestinations.map(({ item, cel }) => [item.cel.id, cel]))
  const destinationMaskIdBySourceId = new Map(resolvedDestinations.flatMap(({ item }) => (item.mask ? [[item.mask.mask.id, createId('mask')] as const] : [])))
  for (const { item, layer, cel } of resolvedDestinations) {
    const next = animationCelForTarget(session.document, layer, item.cel)
    cel.linkedCelId = item.cel.linkedCelId ? (destinationBySourceId.get(item.cel.linkedCelId)?.id ?? null) : null
    cel.zIndex = next.zIndex
    cel.surface = next.surface
    cel.opacity = next.opacity
    cel.text = next.text
    cel.tilemap = next.tilemap
    cel.freeTiles = next.freeTiles
    if (item.mask) {
      const mask = cloneAnimationMaskForOwner(item.mask.mask, 'layer', cel.layerId, {
        id: destinationMaskIdBySourceId.get(item.mask.mask.id) ?? createId('mask'),
        preserveLink: false
      })
      mask.linkedMaskId = item.mask.mask.linkedMaskId ? (destinationMaskIdBySourceId.get(item.mask.mask.linkedMaskId) ?? null) : null
      setAnimationMaskSlot(session.document, cel.layerId, cel.frameId, mask)
    }
  }
  refreshActiveAnimationFrame(session.document)
  session.activeLayerMaskId = null
  session.selectedAnimationFrameIds = []
  session.animationFrameSelectionAnchorId = null
  session.selectedAnimationCellKeys = resolvedDestinations.map(({ cel }) => animationCelKey(cel.layerId, cel.frameId))
  session.animationCellSelectionAnchorKey = session.selectedAnimationCellKeys.at(-1) ?? null
  session.animationCellSelectionExplicit = true
  const after = resolvedDestinations.map(({ cel }) => cloneAnimationCel(cel))
  const afterMasks = resolvedDestinations.map(({ cel }) => animationMaskSlotSnapshot(session.document, cel.layerId, cel.frameId)).filter((entry): entry is AnimationMaskSlotSnapshot => Boolean(entry))
  const appendedIds = new Set(appendedFrames.map((frame) => frame.id))
  const restore = (snapshotCels: readonly AnimationCel[], masks: readonly AnimationMaskSlotSnapshot[], selection: readonly string[], frameSelection: readonly string[], explicit: boolean): void => {
    const current = ensureAnimationDocument(session.document)
    restoreAnimationCels(session.document, snapshotCels)
    restoreAnimationMaskSlots(session.document, masks)
    current.frames = current.frames.filter((frame) => !appendedIds.has(frame.id))
    current.cels = current.cels.filter((cel) => !appendedIds.has(cel.frameId))
    const fallback = current.frames.find((frame) => frame.id === previousActiveFrameId)?.id ?? current.frames[0]?.id
    if (fallback) activateAnimationFrame(session.document, fallback)
    session.selectedAnimationCellKeys = [...selection]
    session.selectedAnimationFrameIds = [...frameSelection]
    session.animationCellSelectionExplicit = explicit
    refreshActiveAnimationFrame(session.document)
  }
  const selectionAfter = [...session.selectedAnimationCellKeys]
  session.history.push({
    label: tr('workspace.history.pasteAnimationCel'),
    bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + appendedFrames.length * 32,
    undo: () => restore(before, beforeMasks, previousSelection, previousSelectedFrameIds, previousSelectionExplicit),
    redo: () => {
      const current = ensureAnimationDocument(session.document)
      const index = Math.min(maxFrameIndex, current.frames.length)
      for (const frame of appendedFrames)
        if (!current.frames.some((candidate) => candidate.id === frame.id))
          current.frames.splice(Math.min(index, current.frames.length), 0, {
            ...frame
          })
      restoreAnimationCels(session.document, after)
      restoreAnimationMaskSlots(session.document, afterMasks)
      session.selectedAnimationCellKeys = selectionAfter
      session.selectedAnimationFrameIds = []
      session.animationCellSelectionExplicit = true
      refreshActiveAnimationFrame(session.document)
    }
  })
}

export function createAnimationCelClipboardCommands({ get, set }: WorkspaceCommandContext<'mutateActive'>): Pick<WorkspaceAnimationCommands, 'copySelectedAnimationCels' | 'pasteAnimationCels' | 'moveSelectedAnimationCels'> {
  return {
    copySelectedAnimationCels() {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const keys = new Set(session.selectedAnimationCellKeys)
        const layerIndexes = new Map(session.document.layers.map((layer, index) => [layer.id, index]))
        const frameIndexes = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
        const selectedCels = timeline.cels
          .filter((cel) => keys.has(animationCelKey(cel.layerId, cel.frameId)))
          .sort((left, right) => (layerIndexes.get(left.layerId) ?? 0) - (layerIndexes.get(right.layerId) ?? 0) || (frameIndexes.get(left.frameId) ?? 0) - (frameIndexes.get(right.frameId) ?? 0))
          .map((cel) => {
            if (!session.selection) return cloneAnimationCel(cel)
            const source = resolveAnimationCel(timeline, cel) ?? cel
            return clipAnimationCelToSelection({ ...cloneAnimationCel(source), id: cel.id, layerId: cel.layerId, frameId: cel.frameId, opacity: cel.opacity, zIndex: cel.zIndex }, session.selection)
          })
        const cels = selectedCels.map((cel) => ({ ...cel, linkedCelId: null }))
        session.animationCellClipboard = cels
        session.animationCellClipboardAnchorKey = cels[0] ? animationCelKey(cels[0].layerId, cels[0].frameId) : null
        if (cels.length > 0) {
          const layerIndexById = new Map(session.document.layers.map((layer, index) => [layer.id, index]))
          const frameIndexById = new Map(timeline.frames.map((frame, index) => [frame.id, index]))
          const anchor = cels[0]
          const anchorLayerIndex = layerIndexById.get(anchor.layerId) ?? 0
          const anchorFrameIndex = frameIndexById.get(anchor.frameId) ?? 0
          const crossDocumentSnapshot: AnimationCelClipboardSnapshot = {
            sourceDocumentId: session.document.id,
            anchorLayerIndex,
            anchorFrameIndex,
            items: selectedCels.flatMap((cel) => {
              const layerIndex = layerIndexById.get(cel.layerId)
              const frameIndex = frameIndexById.get(cel.frameId)
              const mask = timeline.layerMasks?.find((entry) => entry.layerId === cel.layerId && entry.frameId === cel.frameId)
              return layerIndex === undefined || frameIndex === undefined
                ? []
                : [
                    {
                      layerIndex,
                      frameIndex,
                      cel: animationCelClipboardSnapshot(session.document, cel),
                      mask: mask ? cloneAnimationLayerMask(mask) : undefined
                    }
                  ]
            })
          }
          clipboardService.setAnimationCells(crossDocumentSnapshot)
          session.animationFrameClipboard = []
          session.animationMaskClipboard = []
          session.animationMaskClipboardAnchorKey = null
          clipboardService.captureAnimationCopySystemBaseline(typeof window.moonSprite?.readClipboardImage === 'function' ? () => window.moonSprite.readClipboardImage() : undefined)
        } else clipboardService.clearAnimation()
      }, false)
    },
    pasteAnimationCels() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const crossDocumentClipboard = clipboardService.getAnimationCells()
          if (crossDocumentClipboard && crossDocumentClipboard.sourceDocumentId !== session.document.id) {
            pasteCrossDocumentAnimationCels(session, crossDocumentClipboard)
            return
          }
          if (!session.animationCellClipboard.length) return
          const targetKey = session.selectedAnimationCellKeys.at(-1) ?? animationCelKey(session.document.activeLayerId, timeline.activeFrameId)
          const target = parseAnimationCelKey(targetKey)
          const sourceAnchorKey = session.animationCellClipboardAnchorKey ?? animationCelKey(session.animationCellClipboard[0].layerId, session.animationCellClipboard[0].frameId)
          const sourceAnchor = parseAnimationCelKey(sourceAnchorKey)
          if (!target || !sourceAnchor) return
          const sourceAnchorFrameIndex = timeline.frames.findIndex((frame) => frame.id === sourceAnchor.frameId)
          const targetFrameIndex = timeline.frames.findIndex((frame) => frame.id === target.frameId)
          const sourceFrameIndexes = session.animationCellClipboard.map((cel) => timeline.frames.findIndex((frame) => frame.id === cel.frameId))
          if (sourceAnchorFrameIndex < 0 || targetFrameIndex < 0 || sourceFrameIndexes.some((index) => index < 0)) return
          const minimumDestination = targetFrameIndex + Math.min(...sourceFrameIndexes.map((index) => index - sourceAnchorFrameIndex))
          if (minimumDestination < 0) return
          const maximumDestination = targetFrameIndex + Math.max(...sourceFrameIndexes.map((index) => index - sourceAnchorFrameIndex))
          const appendedFrames = Array.from(
            {
              length: Math.max(0, maximumDestination - timeline.frames.length + 1)
            },
            () => ({ id: createId('frame'), duration: 100 })
          )
          const previousSelection = [...session.selectedAnimationCellKeys]
          const previousSelectionExplicit = session.animationCellSelectionExplicit
          if (appendedFrames.length > 0) timeline.frames.push(...appendedFrames)
          ensureAnimationDocument(session.document)
          const appendedFrameIds = new Set(appendedFrames.map((frame) => frame.id))
          const placements = mapAnimationCelBlock(
            timeline,
            session.document.layers.map((layer) => layer.id),
            session.animationCellClipboard,
            sourceAnchorKey,
            target.layerId,
            target.frameId
          )
          if (placements.length !== session.animationCellClipboard.length) {
            timeline.frames = timeline.frames.filter((frame) => !appendedFrameIds.has(frame.id))
            timeline.cels = timeline.cels.filter((cel) => !appendedFrameIds.has(cel.frameId))
            return
          }
          const incompatiblePlacement = placements.some(({ source, target: destination }) => {
            const destinationLayer = session.document.layers.find((layer) => layer.id === destination.layerId)
            return animationCelContentKind(source) !== layerContentKind(destinationLayer)
          })
          if (incompatiblePlacement) {
            timeline.frames = timeline.frames.filter((frame) => !appendedFrameIds.has(frame.id))
            timeline.cels = timeline.cels.filter((cel) => !appendedFrameIds.has(cel.frameId))
            set({ message: tr('workspace.animation.incompatibleCel') })
            return
          }
          for (const frameId of appendedFrames.map((frame) => frame.id)) {
            const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
            const sourceFrameId = timeline.frames[frameIndex - 1]?.id
            if (!sourceFrameId) continue
            const pastedLayerIds = new Set(placements.filter(({ target: destination }) => destination.frameId === frameId).map(({ target: destination }) => destination.layerId))
            const inheritedLayerIds = session.document.layers.map((layer) => layer.id).filter((layerId) => !pastedLayerIds.has(layerId))
            if (inheritedLayerIds.length > 0) inheritAnimationFrameCelLinks(session.document, sourceFrameId, frameId, inheritedLayerIds)
          }
          const appendedBaseCels = timeline.cels.filter((cel) => appendedFrameIds.has(cel.frameId)).map(cloneAnimationCel)
          const destinationIds = new Set(placements.map(({ target: destination }) => destination.id))
          const affectedTargets = new Map<string, AnimationCel>()
          const linkGroups = new Map<string, { source: AnimationCel; members: AnimationCel[] }>()
          for (const { target: destination } of placements) {
            const source = resolveAnimationCel(timeline, destination) ?? destination
            if (!linkGroups.has(source.id)) {
              linkGroups.set(source.id, {
                source,
                members: timeline.cels.filter((cel) => (resolveAnimationCel(timeline, cel) ?? cel).id === source.id)
              })
            }
          }
          for (const { source, members } of linkGroups.values()) {
            for (const member of members) affectedTargets.set(member.id, member)
            const remaining = members.filter((member) => !destinationIds.has(member.id))
            const replacement = remaining[0]
            if (replacement && destinationIds.has(source.id)) {
              replacement.linkedCelId = null
              replacement.zIndex = source.zIndex
              replacement.surface = source.surface
              replacement.opacity = source.opacity
              replacement.text = source.text
              replacement.tilemap = source.tilemap
              replacement.freeTiles = source.freeTiles
              for (const member of remaining.slice(1)) {
                member.linkedCelId = replacement.id
                member.zIndex = replacement.zIndex
                member.surface = replacement.surface
                member.opacity = replacement.opacity
                member.text = replacement.text
                member.tilemap = replacement.tilemap
                member.freeTiles = replacement.freeTiles
              }
            }
          }
          for (const { target: destination } of placements) {
            destination.linkedCelId = null
            affectedTargets.set(destination.id, destination)
          }
          const writeTargets = [...affectedTargets.values()]
          const before = writeTargets.filter((cel) => !appendedFrameIds.has(cel.frameId)).map(cloneAnimationCel)
          for (const { source, target: destination } of placements) {
            destination.zIndex = normalizeAnimationCelZIndex(source.zIndex)
            destination.surface = source.surface ? cloneAnimationCelSurface(source.surface) : undefined
            destination.opacity = source.opacity
            destination.text = source.text ? cloneTextCelData(source.text) : undefined
            destination.tilemap = source.tilemap ? cloneTilemapCelData(source.tilemap) : undefined
            destination.freeTiles = source.freeTiles ? cloneFreeTileCelData(source.freeTiles) : undefined
          }
          refreshActiveAnimationFrame(session.document)
          session.activeLayerMaskId = null
          session.selectedAnimationCellKeys = placements.map(({ target: destination }) => animationCelKey(destination.layerId, destination.frameId))
          session.animationCellSelectionExplicit = true
          const after = writeTargets.map(cloneAnimationCel)
          const afterSelection = [...session.selectedAnimationCellKeys]
          if (after.length)
            session.history.push({
              label: tr('workspace.history.pasteAnimationCel'),
              bytes: [...before, ...after, ...appendedBaseCels].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + appendedFrames.length * 32,
              undo: () => {
                restoreAnimationCels(session.document, before)
                const current = ensureAnimationDocument(session.document)
                current.frames = current.frames.filter((frame) => !appendedFrameIds.has(frame.id))
                current.cels = current.cels.filter((cel) => !appendedFrameIds.has(cel.frameId))
                session.selectedAnimationCellKeys = previousSelection
                session.animationCellSelectionExplicit = previousSelectionExplicit
                refreshActiveAnimationFrame(session.document)
              },
              redo: () => {
                const current = ensureAnimationDocument(session.document)
                for (const frame of appendedFrames) if (!current.frames.some((candidate) => candidate.id === frame.id)) current.frames.push({ ...frame })
                ensureAnimationDocument(session.document)
                restoreAnimationCels(session.document, [...appendedBaseCels, ...after])
                session.selectedAnimationCellKeys = afterSelection
                session.animationCellSelectionExplicit = true
                refreshActiveAnimationFrame(session.document)
              }
            })
        },
        true,
        true
      )
    },
    moveSelectedAnimationCels(layerId, frameId, sourceAnchorKey) {
      get().mutateActive(
        (session) => {
          const beforeSelection = captureAnimationSelectionHistory(session)
          const timeline = ensureAnimationDocument(session.document)
          const selected = new Set(session.selectedAnimationCellKeys)
          const sources = timeline.cels.filter((candidate) => selected.has(animationCelKey(candidate.layerId, candidate.frameId))).map(cloneAnimationCel)
          const placements = mapAnimationCelBlock(
            timeline,
            session.document.layers.map((layer) => layer.id),
            sources,
            sourceAnchorKey,
            layerId,
            frameId
          )
          const affected = new Map<string, AnimationCel>()
          if (!placements.length || placements.length !== sources.length || placements.every(({ source, target }) => source.layerId === target.layerId && source.frameId === target.frameId)) return
          if (placements.some(({ source, target }) => animationCelContentKind(source) !== layerContentKind(session.document.layers.find((layer) => layer.id === target.layerId)))) {
            set({ message: tr('workspace.animation.incompatibleCel') })
            return
          }
          for (const source of sources) {
            const original = timeline.cels.find((cel) => cel.layerId === source.layerId && cel.frameId === source.frameId)
            if (original) affected.set(animationCelKey(original.layerId, original.frameId), cloneAnimationCel(original))
          }
          for (const { target: destination } of placements) affected.set(animationCelKey(destination.layerId, destination.frameId), cloneAnimationCel(destination))
          for (const source of sources) {
            const original = timeline.cels.find((cel) => cel.layerId === source.layerId && cel.frameId === source.frameId)
            if (original?.surface)
              original.surface =
                original.surface.format === 'rgba'
                  ? {
                      ...original.surface,
                      pixels: new Uint8ClampedArray(original.surface.pixels.length)
                    }
                  : {
                      ...original.surface,
                      pixels: new Uint32Array(original.surface.pixels.length)
                    }
            if (original) original.zIndex = 0
            if (original) delete original.text
            if (original) delete original.tilemap
          }
          for (const { source, target: destination } of placements) {
            destination.linkedCelId = null
            destination.zIndex = normalizeAnimationCelZIndex(source.zIndex)
            destination.surface = source.surface ? cloneAnimationCelSurface(source.surface) : undefined
            destination.opacity = source.opacity
            destination.text = source.text ? cloneTextCelData(source.text) : undefined
            destination.tilemap = source.tilemap ? cloneTilemapCelData(source.tilemap) : undefined
          }
          refreshActiveAnimationFrame(session.document)
          if (ensureAnimationDocument(session.document).activeFrameId !== frameId) activateAnimationFrame(session.document, frameId)
          session.document.activeLayerId = layerId
          session.activeLayerMaskId = null
          session.selectedAnimationCellKeys = placements.map(({ target: destination }) => animationCelKey(destination.layerId, destination.frameId))
          const sourceAnchor = parseAnimationCelKey(sourceAnchorKey)
          const mappedAnchor = sourceAnchor ? placements.find(({ source }) => source.layerId === sourceAnchor.layerId && source.frameId === sourceAnchor.frameId)?.target : undefined
          session.animationCellSelectionAnchorKey = mappedAnchor ? animationCelKey(mappedAnchor.layerId, mappedAnchor.frameId) : (session.selectedAnimationCellKeys.at(-1) ?? null)
          session.animationCellSelectionExplicit = true
          const after = [...affected.keys()].flatMap((key) => {
            const parsed = parseAnimationCelKey(key)
            const cel = parsed ? timeline.cels.find((candidate) => candidate.layerId === parsed.layerId && candidate.frameId === parsed.frameId) : null
            return cel ? [cloneAnimationCel(cel)] : []
          })
          const before = [...affected.values()]
          if (after.length) {
            const afterSelection = captureAnimationSelectionHistory(session)
            const entry: HistoryEntry = {
              label: tr('workspace.history.moveAnimationCel'),
              bytes: [...before, ...after].reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0),
              undo: () => restoreAnimationCels(session.document, before),
              redo: () => restoreAnimationCels(session.document, after),
              affectedLayerIds: [...new Set(placements.flatMap(({ source, target }) => [source.layerId, target.layerId]))],
              requiresAnimationSync: true
            }
            session.history.push(historyEntryWithAnimationSelection(session, entry, beforeSelection, afterSelection))
          }
        },
        true,
        true
      )
    }
  }
}
