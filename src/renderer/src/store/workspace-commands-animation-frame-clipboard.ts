import type { RasterLayer } from '@shared/types-layer'
import { createId, createLayer } from '@/core/document-model'
import {
  activateAnimationFrame,
  animationCelKey,
  cloneAnimationCel,
  cloneAnimationGroupMask,
  cloneAnimationLayerMask,
  ensureAnimationDocument,
  inheritAnimationFrameCelLinks,
  refreshActiveAnimationFrame,
  syncActiveAnimationFrame
} from '@/core/animation'
import { cloneAnimationLoopSections, reconcileAnimationLoopSectionsAfterFrameReorder } from '@/core/animation-loop-sections'
import { clipboardService, type AnimationFrameClipboardSnapshot } from './clipboard-service'
import type { AnimationFrameClipboardItem, DocumentSession } from './workspace-types'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { tr } from './workspace-translation'
import { setAnimationLoopSections } from './workspace-animation-commands-helpers'
import { animationCelClipboardSnapshot, animationCelForTarget } from './workspace-animation-cel-conversion'

function pasteCrossDocumentAnimationFrames(session: DocumentSession, snapshot: AnimationFrameClipboardSnapshot): void {
  const timeline = ensureAnimationDocument(session.document)
  const targetLayers = [...session.document.layers]
  const createdLayers: RasterLayer[] = []
  for (let index = targetLayers.length; index < snapshot.layers.length; index += 1) {
    const source = snapshot.layers[index]
    const layer = createLayer(source.name, source.width, source.height, session.document.colorMode)
    layer.id = createId('layer')
    layer.kind = source.kind
    layer.offsetX = source.offsetX
    layer.offsetY = source.offsetY
    layer.visible = source.visible
    layer.locked = source.locked
    layer.opacity = source.opacity
    layer.blendMode = source.blendMode
    if (source.clippingMask === true) layer.clippingMask = true
    targetLayers.push(layer)
    createdLayers.push(layer)
  }
  if (createdLayers.length > 0) {
    session.document.layers.push(...createdLayers)
    ensureAnimationDocument(session.document)
  }
  const selectedIds = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
  const anchorIndex = Math.max(-1, ...timeline.frames.map((frame, index) => (selectedIds.has(frame.id) ? index : -1)))
  const insertIndex = anchorIndex + 1
  const insertedFrames = snapshot.frames.map((frame) => ({
    id: createId('frame'),
    duration: frame.duration,
    ...(frame.disabled === true ? { disabled: true } : {})
  }))
  const insertedCelIdBySourceId = new Map<string, string>()
  const insertedCelItems = snapshot.frames.flatMap((sourceFrame, index) =>
    sourceFrame.cels.flatMap((item) => {
      const layer = targetLayers[item.layerIndex]
      if (!layer) return []
      const cel = animationCelForTarget(session.document, layer, item.cel)
      const id = createId('cel')
      insertedCelIdBySourceId.set(item.cel.id, id)
      return [
        {
          source: item.cel,
          cel: {
            ...cel,
            id,
            layerId: layer.id,
            frameId: insertedFrames[index].id,
            linkedCelId: null
          }
        }
      ]
    })
  )
  const insertedCels = insertedCelItems.map(({ source, cel }) => ({
    ...cel,
    linkedCelId: source.linkedCelId ? (insertedCelIdBySourceId.get(source.linkedCelId) ?? null) : null
  }))
  const destinationLayerMaskIdBySourceId = new Map(snapshot.frames.flatMap((sourceFrame) => sourceFrame.layerMasks.map((item) => [item.mask.mask.id, createId('mask')] as const)))
  const destinationGroupMaskIdBySourceId = new Map(snapshot.frames.flatMap((sourceFrame) => sourceFrame.groupMasks.map((item) => [item.mask.mask.id, createId('mask')] as const)))
  const insertedLayerMasks = snapshot.frames.flatMap((sourceFrame, index) =>
    sourceFrame.layerMasks.flatMap((item) => {
      const layer = targetLayers[item.layerIndex]
      if (!layer) return []
      const mask = cloneAnimationLayerMask(item.mask, layer.id, insertedFrames[index].id, destinationLayerMaskIdBySourceId.get(item.mask.mask.id))
      mask.mask.linkedMaskId = item.mask.mask.linkedMaskId ? (destinationLayerMaskIdBySourceId.get(item.mask.mask.linkedMaskId) ?? null) : null
      return [mask]
    })
  )
  const insertedGroupMasks = snapshot.frames.flatMap((sourceFrame, index) =>
    sourceFrame.groupMasks.flatMap((item) => {
      const group = session.document.groups[item.groupIndex]
      if (!group) return []
      const mask = cloneAnimationGroupMask(item.mask, group.id, insertedFrames[index].id, destinationGroupMaskIdBySourceId.get(item.mask.mask.id))
      mask.mask.linkedMaskId = item.mask.mask.linkedMaskId ? (destinationGroupMaskIdBySourceId.get(item.mask.mask.linkedMaskId) ?? null) : null
      return [mask]
    })
  )
  const previousActiveFrameId = timeline.activeFrameId
  const previousSelectedFrameIds = [...session.selectedAnimationFrameIds]
  const insertedIds = new Set(insertedFrames.map((frame) => frame.id))
  const restoreCreatedLayers = (present: boolean): void => {
    if (present) {
      const missing = createdLayers.filter((layer) => !session.document.layers.some((candidate) => candidate.id === layer.id))
      if (missing.length > 0) session.document.layers.push(...missing)
      ensureAnimationDocument(session.document)
    } else if (createdLayers.length > 0) {
      const createdIds = new Set(createdLayers.map((layer) => layer.id))
      session.document.layers = session.document.layers.filter((layer) => !createdIds.has(layer.id))
      const currentTimeline = ensureAnimationDocument(session.document)
      currentTimeline.cels = currentTimeline.cels.filter((cel) => !createdIds.has(cel.layerId))
    }
  }
  const applyInserted = (): void => {
    const current = ensureAnimationDocument(session.document)
    current.frames.splice(Math.min(insertIndex, current.frames.length), 0, ...insertedFrames.map((frame) => ({ ...frame })))
    current.cels.push(...insertedCels.map((cel) => cloneAnimationCel(cel)))
    current.layerMasks ??= []
    current.layerMasks.push(...insertedLayerMasks.map((entry) => cloneAnimationLayerMask(entry)))
    current.groupMasks ??= []
    current.groupMasks.push(...insertedGroupMasks.map((entry) => cloneAnimationGroupMask(entry)))
    activateAnimationFrame(session.document, insertedFrames[0]?.id ?? current.activeFrameId)
    session.activeLayerMaskId = null
    session.selectedAnimationFrameIds = [...insertedIds]
    session.animationFrameSelectionAnchorId = insertedFrames.at(-1)?.id ?? null
    session.selectedAnimationCellKeys = []
    session.animationCellSelectionExplicit = false
  }
  applyInserted()
  session.history.push({
    label: tr('workspace.history.pasteAnimationFrame'),
    bytes: insertedCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + insertedFrames.length * 64,
    undo: () => {
      const current = ensureAnimationDocument(session.document)
      current.frames = current.frames.filter((frame) => !insertedIds.has(frame.id))
      current.cels = current.cels.filter((cel) => !insertedIds.has(cel.frameId))
      current.layerMasks = (current.layerMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
      current.groupMasks = (current.groupMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
      restoreCreatedLayers(false)
      const fallback = current.frames.find((frame) => frame.id === previousActiveFrameId)?.id ?? current.frames[0]?.id
      if (fallback) activateAnimationFrame(session.document, fallback)
      session.selectedAnimationFrameIds = previousSelectedFrameIds
      session.selectedAnimationCellKeys = []
      session.animationCellSelectionExplicit = false
      refreshActiveAnimationFrame(session.document)
    },
    redo: () => {
      restoreCreatedLayers(true)
      applyInserted()
    }
  })
}

export function createAnimationFrameClipboardCommands({ get }: WorkspaceCommandContext<'mutateActive'>): Pick<WorkspaceAnimationCommands, 'copySelectedAnimationFrames' | 'pasteAnimationFrames' | 'moveSelectedAnimationFrames'> {
  return {
    copySelectedAnimationFrames() {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        syncActiveAnimationFrame(session.document)
        const selectedIds = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
        session.animationFrameClipboard = timeline.frames
          .filter((frame) => selectedIds.has(frame.id))
          .map(
            (frame): AnimationFrameClipboardItem => ({
              frameId: frame.id,
              duration: frame.duration,
              ...(frame.disabled === true ? { disabled: true } : {}),
              cels: timeline.cels
                .filter((cel) => cel.frameId === frame.id)
                .map((cel) => ({
                  ...cloneAnimationCel(cel),
                  linkedCelId: null
                })),
              layerMasks: (timeline.layerMasks ?? []).filter((entry) => entry.frameId === frame.id).map((entry) => cloneAnimationLayerMask(entry)),
              groupMasks: (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frame.id).map((entry) => cloneAnimationGroupMask(entry))
            })
          )
        if (session.animationFrameClipboard.length > 0) {
          const layerIndexById = new Map(session.document.layers.map((layer, index) => [layer.id, index]))
          const groupIndexById = new Map(session.document.groups.map((group, index) => [group.id, index]))
          const crossDocumentSnapshot: AnimationFrameClipboardSnapshot = {
            sourceDocumentId: session.document.id,
            layers: session.document.layers.map((layer) => ({
              name: layer.name,
              kind: layer.kind,
              width: layer.width,
              height: layer.height,
              offsetX: layer.offsetX,
              offsetY: layer.offsetY,
              visible: layer.visible,
              locked: layer.locked,
              opacity: layer.opacity,
              blendMode: layer.blendMode,
              ...(layer.clippingMask === true ? { clippingMask: true } : {})
            })),
            frames: timeline.frames
              .filter((frame) => selectedIds.has(frame.id))
              .map((frame) => ({
                duration: frame.duration,
                ...(frame.disabled === true ? { disabled: true } : {}),
                cels: timeline.cels
                  .filter((cel) => cel.frameId === frame.id)
                  .flatMap((cel) => {
                    const layerIndex = layerIndexById.get(cel.layerId)
                    return layerIndex === undefined
                      ? []
                      : [
                          {
                            layerIndex,
                            cel: animationCelClipboardSnapshot(session.document, cel)
                          }
                        ]
                  }),
                layerMasks: (timeline.layerMasks ?? [])
                  .filter((entry) => entry.frameId === frame.id)
                  .flatMap((entry) => {
                    const layerIndex = layerIndexById.get(entry.layerId)
                    return layerIndex === undefined ? [] : [{ layerIndex, mask: cloneAnimationLayerMask(entry) }]
                  }),
                groupMasks: (timeline.groupMasks ?? [])
                  .filter((entry) => entry.frameId === frame.id)
                  .flatMap((entry) => {
                    const groupIndex = groupIndexById.get(entry.groupId)
                    return groupIndex === undefined ? [] : [{ groupIndex, mask: cloneAnimationGroupMask(entry) }]
                  })
              }))
          }
          clipboardService.setAnimationFrames(crossDocumentSnapshot)
          session.animationCellClipboard = []
          session.animationCellClipboardAnchorKey = null
          session.animationMaskClipboard = []
          session.animationMaskClipboardAnchorKey = null
          clipboardService.captureAnimationCopySystemBaseline(typeof window.moonSprite?.readClipboardImage === 'function' ? () => window.moonSprite.readClipboardImage() : undefined)
        } else clipboardService.clearAnimation()
      }, false)
    },
    pasteAnimationFrames() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const crossDocumentClipboard = clipboardService.getAnimationFrames()
          if (crossDocumentClipboard && crossDocumentClipboard.sourceDocumentId !== session.document.id) {
            pasteCrossDocumentAnimationFrames(session, crossDocumentClipboard)
            return
          }
          const clipboard = session.animationFrameClipboard
          if (!clipboard.length) return
          const selectedIds = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
          const anchorIndex = Math.max(-1, ...timeline.frames.map((frame, index) => (selectedIds.has(frame.id) ? index : -1)))
          const insertIndex = anchorIndex + 1
          const insertedFrames = clipboard.map((item) => ({
            id: createId('frame'),
            duration: item.duration,
            ...(item.disabled === true ? { disabled: true } : {})
          }))
          const insertedCels = clipboard.flatMap((item, index) =>
            item.cels.map((cel) => {
              const id = createId('cel')
              return {
                ...cloneAnimationCel(cel),
                id,
                frameId: insertedFrames[index].id
              }
            })
          )
          const insertedLayerMasks = clipboard.flatMap((item, index) => (item.layerMasks ?? []).map((entry) => cloneAnimationLayerMask(entry, entry.layerId, insertedFrames[index].id, createId('mask'))))
          const insertedGroupMasks = clipboard.flatMap((item, index) => (item.groupMasks ?? []).map((entry) => cloneAnimationGroupMask(entry, entry.groupId, insertedFrames[index].id, createId('mask'))))
          const previousActiveFrameId = timeline.activeFrameId
          const previousSelectedFrameIds = [...session.selectedAnimationFrameIds]
          const insertedIds = new Set(insertedFrames.map((frame) => frame.id))
          const selectInsertedItems = (): void => {
            const onlyFrame = insertedFrames.length === 1 ? insertedFrames[0] : null
            const activeCelKey = onlyFrame ? animationCelKey(session.document.activeLayerId, onlyFrame.id) : null
            const hasActiveCel = activeCelKey !== null && insertedCels.some((cel) => cel.layerId === session.document.activeLayerId && cel.frameId === onlyFrame?.id)
            session.selectedAnimationMaskCellKeys = []
            session.selectedAnimationMaskRowKeys = []
            session.animationMaskCellSelectionAnchorKey = null
            if (hasActiveCel && activeCelKey) {
              session.selectedAnimationFrameIds = []
              session.animationFrameSelectionAnchorId = null
              session.selectedAnimationCellKeys = [activeCelKey]
              session.animationCellSelectionAnchorKey = activeCelKey
              session.animationCellSelectionExplicit = true
              return
            }
            session.selectedAnimationFrameIds = insertedFrames.map((frame) => frame.id)
            session.animationFrameSelectionAnchorId = insertedFrames.at(-1)?.id ?? null
            session.selectedAnimationCellKeys = []
            session.animationCellSelectionAnchorKey = null
            session.animationCellSelectionExplicit = false
          }
          const restoreInserted = (): void => {
            const current = ensureAnimationDocument(session.document)
            current.frames = current.frames.filter((frame) => !insertedIds.has(frame.id))
            current.cels = current.cels.filter((cel) => !insertedIds.has(cel.frameId))
            current.layerMasks = (current.layerMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
            current.groupMasks = (current.groupMasks ?? []).filter((entry) => !insertedIds.has(entry.frameId))
            const fallback = current.frames.find((frame) => frame.id === previousActiveFrameId)?.id ?? current.frames[0]?.id
            if (fallback) activateAnimationFrame(session.document, fallback)
            session.activeLayerMaskId = null
            session.selectedAnimationFrameIds = previousSelectedFrameIds
            session.selectedAnimationCellKeys = []
            session.animationCellSelectionAnchorKey = null
            session.animationCellSelectionExplicit = false
          }
          const reapplyInserted = (): void => {
            const current = ensureAnimationDocument(session.document)
            const index = Math.min(insertIndex, current.frames.length)
            current.frames.splice(index, 0, ...insertedFrames.map((frame) => ({ ...frame })))
            current.cels.push(...insertedCels.map((cel) => cloneAnimationCel(cel)))
            current.layerMasks ??= []
            current.layerMasks.push(...insertedLayerMasks.map((entry) => cloneAnimationLayerMask(entry)))
            current.groupMasks ??= []
            current.groupMasks.push(...insertedGroupMasks.map((entry) => cloneAnimationGroupMask(entry)))
            activateAnimationFrame(session.document, insertedFrames[0].id)
            session.activeLayerMaskId = null
            selectInsertedItems()
          }
          timeline.frames.splice(insertIndex, 0, ...insertedFrames)
          timeline.cels.push(...insertedCels)
          timeline.layerMasks ??= []
          timeline.layerMasks.push(...insertedLayerMasks)
          timeline.groupMasks ??= []
          timeline.groupMasks.push(...insertedGroupMasks)
          for (let index = 0; index < insertedFrames.length; index += 1) {
            const sourceFrameId = timeline.frames[insertIndex + index - 1]?.id
            if (sourceFrameId) inheritAnimationFrameCelLinks(session.document, sourceFrameId, insertedFrames[index].id)
          }
          activateAnimationFrame(session.document, insertedFrames[0].id)
          session.activeLayerMaskId = null
          selectInsertedItems()
          session.history.push({
            label: tr('workspace.history.pasteAnimationFrame'),
            bytes:
              insertedCels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + [...insertedLayerMasks, ...insertedGroupMasks].reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + insertedFrames.length * 64,
            undo: restoreInserted,
            redo: reapplyInserted
          })
        },
        true,
        true
      )
    },
    moveSelectedAnimationFrames(targetFrameId, insertAfter) {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const selected = new Set(session.selectedAnimationFrameIds.length ? session.selectedAnimationFrameIds : [timeline.activeFrameId])
          const beforeIds = timeline.frames.map((frame) => frame.id)
          const beforeLoopSections = cloneAnimationLoopSections(timeline.loopSections)
          const moving = timeline.frames.filter((frame) => selected.has(frame.id))
          const remaining = timeline.frames.filter((frame) => !selected.has(frame.id))
          if (moving.length === 0) return
          const targetIndex = remaining.findIndex((frame) => frame.id === targetFrameId)
          const selectedTarget = selected.has(targetFrameId)
          const selectedTargetIndex = timeline.frames.findIndex((frame) => frame.id === targetFrameId)
          const movingIndexes = timeline.frames.map((frame, index) => (selected.has(frame.id) ? index : -1)).filter((index) => index >= 0)
          const movingStartIndex = movingIndexes.length > 0 ? Math.min(...movingIndexes) : -1
          const movingEndIndex = movingIndexes.length > 0 ? Math.max(...movingIndexes) : -1
          const insertionIndex = targetIndex >= 0 ? targetIndex + (insertAfter ? 1 : 0) : selectedTarget ? timeline.frames.slice(0, selectedTargetIndex).filter((frame) => !selected.has(frame.id)).length : -1
          if (insertionIndex < 0) return
          const dropBoundaryIndex = selectedTarget ? insertionIndex : Math.min(insertionIndex, remaining.length)
          // A boundary can be reported by either adjacent header (the previous
          // frame's right edge or the next frame's left edge). Normalize those
          // equivalent DOM targets to the selected block's actual side so loop
          // membership does not depend on which header received the pointer.
          const targetOriginalIndex = timeline.frames.findIndex((frame) => frame.id === targetFrameId)
          const dropSide = selectedTarget
            ? insertAfter
              ? ('after' as const)
              : ('before' as const)
            : targetOriginalIndex === movingStartIndex - 1 && insertAfter
              ? ('before' as const)
              : targetOriginalIndex === movingEndIndex + 1 && !insertAfter
                ? ('after' as const)
                : null
          remaining.splice(insertionIndex, 0, ...moving)
          const afterIds = remaining.map((frame) => frame.id)
          const afterLoopSections = reconcileAnimationLoopSectionsAfterFrameReorder(
            beforeLoopSections,
            timeline.frames,
            remaining.filter((frame) => !selected.has(frame.id)),
            remaining,
            moving.map((frame) => frame.id),
            dropBoundaryIndex,
            dropSide
          )
          const sectionsChanged =
            beforeLoopSections.length !== afterLoopSections.length ||
            beforeLoopSections.some((section, index) => {
              const next = afterLoopSections[index]
              return !next || section.startFrameId !== next.startFrameId || section.endFrameId !== next.endFrameId
            })
          if (beforeIds.join('|') === afterIds.join('|') && !sectionsChanged) return
          const apply = (ids: readonly string[]): void => {
            const current = ensureAnimationDocument(session.document)
            const byId = new Map(current.frames.map((frame) => [frame.id, frame]))
            current.frames = ids.flatMap((id) => {
              const frame = byId.get(id)
              return frame ? [frame] : []
            })
          }
          apply(afterIds)
          setAnimationLoopSections(session, afterLoopSections)
          session.selectedAnimationFrameIds = afterIds.filter((id) => selected.has(id))
          session.history.push({
            label: tr('workspace.history.moveAnimationFrame'),
            bytes: 64,
            undo: () => {
              apply(beforeIds)
              setAnimationLoopSections(session, beforeLoopSections)
            },
            redo: () => {
              apply(afterIds)
              setAnimationLoopSections(session, afterLoopSections)
            }
          })
        },
        'metadata',
        true
      )
    }
  }
}
