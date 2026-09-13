import type { AnimationCelSurface } from '@shared/types-animation'
import { createId, createLayer, paletteColorIdForCanvas } from '@/core/document-model'
import {
  activateAnimationFrame,
  addBlankAnimationFrame,
  animationCelKey,
  cloneAnimationGroupMask,
  cloneAnimationLayerMask,
  deleteAnimationFrame,
  duplicateAnimationFrame,
  ensureAnimationDocument,
  linkAnimationFrameCels,
  normalizeAnimationCelZIndex,
  parseAnimationCelKey,
  refreshActiveAnimationFrame,
  restoreAnimationCels,
  setAnimationFrameDuration,
  setAnimationLoop
} from '@/core/animation'
import { cloneAnimationLoopSections } from '@/core/animation-loop-sections'
import { captureDocumentStructureSnapshot, documentStructureDeltaBytes, restoreDocumentStructureSnapshot } from './workspace-document-history'
import type { AnimationPlaybackMode } from './workspace-types'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import {
  clearAnimationLoopPlayback,
  setTimelineActiveContext,
  clearAnimationItemSelection,
  applyLayerRowSelection
} from './workspace-animation-selection'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import { captureAnimationSelectionHistory, restoreAnimationSelectionHistory } from './workspace-animation-selection-history'
import { cloneAnimationCelsForLayerIds } from './workspace-animation-clone'
import { updateSelectedAnimationFramesDisabled } from './workspace-animation-commands-helpers'



export function createAnimationFrameCommands({ get, set }: WorkspaceCommandContext<'advanceAnimationFrame' | 'deleteAnimationFrame' | 'mutateActive' | 'setAnimationLoop'>): Pick<WorkspaceAnimationCommands, 'addAnimationFrame' | 'addLinkedAnimationFrame' | 'duplicateAnimationFrame' | 'importGifAnimationLayer' | 'deleteAnimationFrame' | 'setActiveAnimationFrameDuration' | 'setSelectedAnimationFramesDisabled' | 'toggleSelectedAnimationFramesDisabled' | 'setAnimationLoop'> {
  return {
    addAnimationFrame() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const previousFrameId = timeline.activeFrameId
          const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
          const frameId = addBlankAnimationFrame(session.document)
          const loopSectionsAfter = cloneAnimationLoopSections(timeline.loopSections)
          const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
          const frame = { ...timeline.frames[frameIndex] }
          const cels = cloneAnimationCelsForLayerIds(
            session.document,
            session.document.layers.map((layer) => layer.id),
            frameId
          )
          const restore = (): void => {
            const current = ensureAnimationDocument(session.document)
            if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
            restoreAnimationCels(session.document, cels)
            current.loopSections = cloneAnimationLoopSections(loopSectionsAfter)
            activateAnimationFrame(session.document, frameId)
            clearAnimationItemSelection(session)
          }
          session.history.push({
            label: tr('workspace.history.addAnimationFrame'),
            bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64,
            undo: () => {
              deleteAnimationFrame(session.document, frameId)
              ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsBefore)
              activateAnimationFrame(session.document, previousFrameId)
              session.activeLayerMaskId = null
            },
            redo: () => {
              restore()
              session.activeLayerMaskId = null
            }
          })
          session.animationPlaying = false
          session.activeLayerMaskId = null
          session.selection = null
          session.selectionPivot = null
          clearAnimationItemSelection(session)
        },
        true,
        true
      )
    },
    addLinkedAnimationFrame() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const previousFrameId = timeline.activeFrameId
          const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
          const selectedCellKey =
            session.animationCellSelectionAnchorKey && session.selectedAnimationCellKeys.includes(session.animationCellSelectionAnchorKey) ? session.animationCellSelectionAnchorKey : session.selectedAnimationCellKeys.at(-1)
          const parsedCell = selectedCellKey ? parseAnimationCelKey(selectedCellKey) : null
          const selectedCell = parsedCell && timeline.frames.some((frame) => frame.id === parsedCell.frameId) && session.document.layers.some((layer) => layer.id === parsedCell.layerId) ? parsedCell : null
          const selectedFrameId =
            session.animationFrameSelectionAnchorId && session.selectedAnimationFrameIds.includes(session.animationFrameSelectionAnchorId) ? session.animationFrameSelectionAnchorId : session.selectedAnimationFrameIds.at(-1)
          const sourceFrameId = selectedCell?.frameId ?? (selectedFrameId && timeline.frames.some((frame) => frame.id === selectedFrameId) ? selectedFrameId : timeline.activeFrameId)
          const layerIds = selectedCell ? [selectedCell.layerId] : session.document.layers.map((layer) => layer.id)
          if (sourceFrameId !== timeline.activeFrameId) activateAnimationFrame(session.document, sourceFrameId)
          const frameId = addBlankAnimationFrame(session.document)
          const loopSectionsAfter = cloneAnimationLoopSections(timeline.loopSections)
          const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
          const frame = { ...timeline.frames[frameIndex] }
          const groupMasks = selectedCell ? [] : (timeline.groupMasks ?? []).filter((entry) => entry.frameId === sourceFrameId).map((entry) => cloneAnimationGroupMask(entry, entry.groupId, frameId, createId('mask')))
          timeline.groupMasks ??= []
          timeline.groupMasks.push(...groupMasks)
          linkAnimationFrameCels(session.document, sourceFrameId, frameId, layerIds)
          const cels = cloneAnimationCelsForLayerIds(
            session.document,
            session.document.layers.map((layer) => layer.id),
            frameId
          )
          const restore = (): void => {
            const current = ensureAnimationDocument(session.document)
            if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
            restoreAnimationCels(session.document, cels)
            current.groupMasks ??= []
            current.groupMasks.push(...groupMasks.filter((entry) => !current.groupMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationGroupMask(entry)))
            current.loopSections = cloneAnimationLoopSections(loopSectionsAfter)
            activateAnimationFrame(session.document, frameId)
            clearAnimationItemSelection(session)
          }
          session.history.push({
            label: tr('workspace.history.addLinkedAnimationFrame'),
            bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + groupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64,
            undo: () => {
              deleteAnimationFrame(session.document, frameId)
              ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsBefore)
              activateAnimationFrame(session.document, previousFrameId)
              session.activeLayerMaskId = null
            },
            redo: () => {
              restore()
              session.activeLayerMaskId = null
            }
          })
          session.animationPlaying = false
          session.activeLayerMaskId = null
          session.selection = null
          session.selectionPivot = null
          clearAnimationItemSelection(session)
        },
        true,
        true
      )
    },
    duplicateAnimationFrame() {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const previousFrameId = timeline.activeFrameId
          const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
          const frameId = duplicateAnimationFrame(session.document)
          const loopSectionsAfter = cloneAnimationLoopSections(timeline.loopSections)
          const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
          const frame = { ...timeline.frames[frameIndex] }
          const cels = cloneAnimationCelsForLayerIds(
            session.document,
            session.document.layers.map((layer) => layer.id),
            frameId
          )
          const groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frameId).map((entry) => cloneAnimationGroupMask(entry))
          const restore = (): void => {
            const current = ensureAnimationDocument(session.document)
            if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
            restoreAnimationCels(session.document, cels)
            current.groupMasks ??= []
            current.groupMasks.push(...groupMasks.filter((entry) => !current.groupMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationGroupMask(entry)))
            current.loopSections = cloneAnimationLoopSections(loopSectionsAfter)
            activateAnimationFrame(session.document, frameId)
            clearAnimationItemSelection(session)
          }
          session.history.push({
            label: tr('workspace.history.duplicateAnimationFrame'),
            bytes: cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) + groupMasks.reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) + (loopSectionsBefore.length + loopSectionsAfter.length) * 128 + 64,
            undo: () => {
              deleteAnimationFrame(session.document, frameId)
              ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsBefore)
              activateAnimationFrame(session.document, previousFrameId)
              session.activeLayerMaskId = null
            },
            redo: () => {
              restore()
              session.activeLayerMaskId = null
            }
          })
          session.animationPlaying = false
          session.activeLayerMaskId = null
          session.selection = null
          session.selectionPivot = null
          clearAnimationItemSelection(session)
        },
        true,
        true
      )
    },
    importGifAnimationLayer(source, startFrameIndex) {
      const current = activeSession(get())
      const sourceTimeline = source.animation
      const sourceLayer = source.layers[0]
      if (!current || !sourceTimeline || !sourceLayer || sourceTimeline.frames.length === 0) return false

      let imported = false
      get().mutateActive(
        (session) => {
          const document = session.document
          const timeline = ensureAnimationDocument(document)
          const beforeDocument = captureDocumentStructureSnapshot(document)
          const beforeSelection = captureAnimationSelectionHistory(session)
          const start = Math.max(0, Math.min(timeline.frames.length, Math.trunc(startFrameIndex)))
          const insertedFrames = sourceTimeline.frames.map((sourceFrame) => ({
            id: createId('frame'),
            duration: sourceFrame.duration,
            ...(sourceFrame.disabled ? { disabled: true } : {})
          }))
          timeline.frames.splice(start, 0, ...insertedFrames)

          const layer = createLayer(source.name || 'GIF', sourceLayer.width, sourceLayer.height, document.colorMode)
          layer.offsetX = sourceLayer.offsetX
          layer.offsetY = sourceLayer.offsetY
          document.layers.push(layer)

          // Add the complete set of layer/frame slots first, then replace the
          // imported slots. This keeps the new layer a normal timeline layer and
          // lets the existing animation normalization handle blank slots.
          ensureAnimationDocument(document)
          const sourceCels = new Map(sourceTimeline.cels.filter((cel) => cel.layerId === sourceLayer.id).map((cel) => [cel.frameId, cel]))
          const importedKeys: string[] = []
          let firstSurface: AnimationCelSurface | null = null

          for (let index = 0; index < sourceTimeline.frames.length; index += 1) {
            const sourceFrame = sourceTimeline.frames[index]
            const sourceCel = sourceCels.get(sourceFrame.id)
            const sourceSurface = sourceCel?.surface
            const targetFrame = insertedFrames[index]
            if (!sourceSurface || !targetFrame) continue
            const rgbaPixels = sourceSurface.format === 'rgba' ? new Uint8ClampedArray(sourceSurface.pixels) : new Uint8ClampedArray(sourceSurface.width * sourceSurface.height * 4)
            if (sourceSurface.format === 'indexed') {
              for (let pixelIndex = 0; pixelIndex < sourceSurface.pixels.length; pixelIndex += 1) {
                const color = source.palette.find((entry) => entry.id === sourceSurface.pixels[pixelIndex])?.color ?? { r: 0, g: 0, b: 0, a: 0 }
                const offset = pixelIndex * 4
                rgbaPixels[offset] = color.r
                rgbaPixels[offset + 1] = color.g
                rgbaPixels[offset + 2] = color.b
                rgbaPixels[offset + 3] = color.a
              }
            }
            const surface: AnimationCelSurface =
              document.colorMode === 'indexed'
                ? {
                    format: 'indexed',
                    width: sourceSurface.width,
                    height: sourceSurface.height,
                    offsetX: sourceSurface.offsetX,
                    offsetY: sourceSurface.offsetY,
                    pixels: Uint32Array.from({ length: sourceSurface.width * sourceSurface.height }, (_, pixelIndex) => {
                      const offset = pixelIndex * 4
                      return paletteColorIdForCanvas(document, {
                        r: rgbaPixels[offset],
                        g: rgbaPixels[offset + 1],
                        b: rgbaPixels[offset + 2],
                        a: rgbaPixels[offset + 3]
                      })
                    })
                  }
                : {
                    format: 'rgba',
                    width: sourceSurface.width,
                    height: sourceSurface.height,
                    offsetX: sourceSurface.offsetX,
                    offsetY: sourceSurface.offsetY,
                    pixels: rgbaPixels
                  }
            const targetCel = timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === targetFrame.id)
            if (!targetCel) continue
            targetCel.linkedCelId = null
            targetCel.opacity = sourceCel.opacity ?? layer.opacity
            targetCel.zIndex = normalizeAnimationCelZIndex(sourceCel.zIndex)
            targetCel.surface = surface
            delete targetCel.text
            delete targetCel.tilemap
            delete targetCel.freeTiles
            importedKeys.push(animationCelKey(layer.id, targetFrame.id))
            if (!firstSurface) firstSurface = surface
          }

          if (importedKeys.length === 0) return
          if (firstSurface) layer.pixels = firstSurface.pixels instanceof Uint8ClampedArray ? new Uint8ClampedArray(firstSurface.pixels) : new Uint32Array(firstSurface.pixels)
          const firstFrameId = timeline.frames[start]?.id
          if (!firstFrameId) return
          applyLayerRowSelection(session, [layer.id], [], {
            kind: 'layer',
            id: layer.id
          })
          activateAnimationFrame(document, firstFrameId)
          session.activeLayerMaskId = null
          session.layerMaskIsolatedView = false
          session.selectedAnimationFrameIds = []
          session.animationFrameSelectionAnchorId = null
          session.selectedAnimationCellKeys = importedKeys
          session.animationCellSelectionAnchorKey = importedKeys.at(-1) ?? null
          session.animationCellSelectionExplicit = true
          session.selectedAnimationMaskCellKeys = []
          session.selectedAnimationMaskRowKeys = []
          session.animationMaskCellSelectionAnchorKey = null
          setTimelineActiveContext(session, { kind: 'layer', ownerKind: 'layer', ownerId: layer.id }, firstFrameId, null)
          refreshActiveAnimationFrame(document)
          const afterDocument = captureDocumentStructureSnapshot(document)
          const afterSelection = captureAnimationSelectionHistory(session)
          session.history.push({
            label: '导入 GIF 到时间轴',
            bytes: documentStructureDeltaBytes(beforeDocument, afterDocument),
            undo: () => {
              restoreDocumentStructureSnapshot(document, beforeDocument)
              restoreAnimationSelectionHistory(session, beforeSelection)
            },
            redo: () => {
              restoreDocumentStructureSnapshot(document, afterDocument)
              restoreAnimationSelectionHistory(session, afterSelection)
            },
            invalidation: { kind: 'full' },
            requiresAnimationSync: false
          })
          imported = true
        },
        true,
        true
      )
      if (imported) set({ message: 'GIF 已导入时间轴' })
      return imported
    },
    deleteAnimationFrame(normalizeSelection = true, markSelectionNormalizationHistory = normalizeSelection) {
      get().mutateActive(
        (session) => {
          const timeline = ensureAnimationDocument(session.document)
          const frameId = timeline.activeFrameId
          const frameIndex = timeline.frames.findIndex((frame) => frame.id === frameId)
          const frame = { ...timeline.frames[frameIndex] }
          const cels = cloneAnimationCelsForLayerIds(
            session.document,
            session.document.layers.map((layer) => layer.id),
            frameId
          )
          const layerMasks = (timeline.layerMasks ?? []).filter((entry) => entry.frameId === frameId).map((entry) => cloneAnimationLayerMask(entry))
          const groupMasks = (timeline.groupMasks ?? []).filter((entry) => entry.frameId === frameId).map((entry) => cloneAnimationGroupMask(entry))
          const loopSectionsBefore = cloneAnimationLoopSections(timeline.loopSections)
          if (!deleteAnimationFrame(session.document, frameId)) {
            set({ message: tr('workspace.animation.minimumFrame') })
            return
          }
          const nextTimeline = ensureAnimationDocument(session.document)
          const nextFrameId = nextTimeline.activeFrameId
          const loopSectionsAfter = cloneAnimationLoopSections(nextTimeline.loopSections)
          const restore = (): void => {
            const current = ensureAnimationDocument(session.document)
            if (!current.frames.some((candidate) => candidate.id === frameId)) current.frames.splice(Math.min(frameIndex, current.frames.length), 0, { ...frame })
            restoreAnimationCels(session.document, cels)
            current.layerMasks ??= []
            current.layerMasks.push(...layerMasks.filter((entry) => !current.layerMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationLayerMask(entry)))
            current.groupMasks ??= []
            current.groupMasks.push(...groupMasks.filter((entry) => !current.groupMasks!.some((candidate) => candidate.mask.id === entry.mask.id)).map((entry) => cloneAnimationGroupMask(entry)))
            current.loopSections = cloneAnimationLoopSections(loopSectionsBefore)
            activateAnimationFrame(session.document, frameId)
          }
          session.history.push({
            label: tr('workspace.history.deleteAnimationFrame'),
            bytes:
              cels.reduce((sum, cel) => sum + (cel.surface?.pixels.byteLength ?? 0), 0) +
              [...layerMasks, ...groupMasks].reduce((sum, entry) => sum + entry.mask.pixels.byteLength, 0) +
              (loopSectionsBefore.length + loopSectionsAfter.length) * 128 +
              64,
            undo: () => {
              restore()
              session.activeLayerMaskId = null
            },
            redo: () => {
              deleteAnimationFrame(session.document, frameId)
              ensureAnimationDocument(session.document).loopSections = cloneAnimationLoopSections(loopSectionsAfter)
              activateAnimationFrame(session.document, nextFrameId)
              session.activeLayerMaskId = null
            }
          })
          session.animationPlaying = false
          session.animationPlaybackStartFrameId = null
          clearAnimationLoopPlayback(session)
          session.activeLayerMaskId = null
          session.selection = null
          session.selectionPivot = null
        },
        true,
        normalizeSelection,
        markSelectionNormalizationHistory
      )
    },
    setActiveAnimationFrameDuration(duration) {
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const selected = session.selectedAnimationFrameIds.includes(timeline.activeFrameId) ? new Set(session.selectedAnimationFrameIds) : new Set([timeline.activeFrameId])
        const frames = timeline.frames.filter((frame) => selected.has(frame.id))
        const nextDuration = Math.max(1, Math.min(60_000, Math.trunc(duration) || 100))
        const before = frames.map((frame) => ({
          id: frame.id,
          duration: frame.duration
        }))
        if (!before.some((frame) => frame.duration !== nextDuration)) return
        for (const frame of frames) setAnimationFrameDuration(session.document, frame.id, nextDuration)
        const apply = (values: Array<{ id: string; duration: number }>): void => {
          const current = ensureAnimationDocument(session.document)
          for (const value of values) {
            const target = current.frames.find((frame) => frame.id === value.id)
            if (target) target.duration = value.duration
          }
        }
        const after = frames.map((frame) => ({
          id: frame.id,
          duration: frame.duration
        }))
        session.history.push({
          label: tr('workspace.history.animationFrameDuration'),
          bytes: frames.length * 32,
          undo: () => apply(before),
          redo: () => apply(after)
        })
        // Editing frame timing must not look like canvas drawing and dismiss
        // the explicit multi-frame selection.
        session.selectionGuidesPreservedAtContentRevision = session.contentRevision + 1
      })
    },
    setSelectedAnimationFramesDisabled(disabled) {
      get().mutateActive((session) => updateSelectedAnimationFramesDisabled(session, disabled), 'metadata')
      const session = activeSession(get())
      const timeline = session?.document.animation
      const activeFrame = timeline?.frames.find((frame) => frame.id === timeline.activeFrameId)
      // Keep the playhead out of a frame that was just disabled. Advancing
      // through the normal playback path also preserves the selected mask row
      // and handles tags/looping consistently.
      if (session?.animationPlaying && activeFrame?.disabled === true) get().advanceAnimationFrame()
    },
    toggleSelectedAnimationFramesDisabled() {
      get().mutateActive((session) => updateSelectedAnimationFramesDisabled(session, 'toggle'), 'metadata')
      const session = activeSession(get())
      const timeline = session?.document.animation
      const activeFrame = timeline?.frames.find((frame) => frame.id === timeline.activeFrameId)
      if (session?.animationPlaying && activeFrame?.disabled === true) get().advanceAnimationFrame()
    },
    setAnimationLoop(loop) {
      const playbackMode: AnimationPlaybackMode = loop ? 'all' : 'once'
      const current = activeSession(get())
      if (!current) return
      if (current.animationPlaybackMode !== playbackMode || current.animationPlaybackLoopSectionId) {
        get().mutateActive((session) => {
          session.animationPlaybackMode = playbackMode
          clearAnimationLoopPlayback(session)
        }, false)
      }
      if (ensureAnimationDocument(current.document).loop === loop) return
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const before = timeline.loop
        setAnimationLoop(session.document, loop)
        session.history.push({
          label: tr('workspace.history.animationLoop'),
          bytes: 16,
          undo: () => {
            ensureAnimationDocument(session.document).loop = before
            session.animationPlaybackMode = before ? 'all' : 'once'
            clearAnimationLoopPlayback(session)
          },
          redo: () => {
            ensureAnimationDocument(session.document).loop = loop
            session.animationPlaybackMode = playbackMode
            clearAnimationLoopPlayback(session)
          }
        })
      })
    }
  }
}
