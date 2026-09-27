import { activateAnimationFrame, refreshActiveAnimationFrame, resizeAnimationCelsAt, syncActiveAnimationFrame } from '@/core/animation'
import { prepareAnimationTween } from '@/core/animation-tween'
import { createId, resizeDocumentAt } from '@/core/document-model'
import { shiftSelection } from '@/core/selection'
import { reconcileAnimationLoopSectionsAfterFrameInsertion } from '@/core/animation-loop-sections'
import { captureDocumentStructureSnapshot, restoreDocumentStructureSnapshot, documentStructureDeltaBytes, captureDocumentCanvasResizeSnapshot, restoreDocumentCanvasResizeSnapshot, documentCanvasResizeSnapshotBytes } from './workspace-document-history'
import { captureAnimationSelectionHistory, restoreAnimationSelectionHistory } from './workspace-animation-selection-history'
import { clearAnimationItemSelection } from './workspace-animation-selection'
import { setTimelineActiveFrame } from './workspace-animation-commands-helpers'
import { activeSession } from './workspace-access'
import { tr } from './workspace-translation'
import type { WorkspaceCommandContext } from './workspace-command-context'
import type { WorkspaceAnimationCommands } from './workspace-state'

export function createAnimationTweenCommands({ get, set }: WorkspaceCommandContext<'commitFloatingPaste' | 'mutateActive'>): Pick<WorkspaceAnimationCommands, 'generateAnimationTween'> {
  return {
    generateAnimationTween(documentId, frameId, layerId, options) {
      const current = activeSession(get())
      if (!current || current.document.id !== documentId) return false
      get().commitFloatingPaste()
      syncActiveAnimationFrame(current.document)
      let generated: ReturnType<typeof prepareAnimationTween>
      try { generated = prepareAnimationTween(current.document, frameId, layerId, options) }
      catch (error) {
        set({ message: error instanceof Error ? error.message : String(error) })
        return false
      }
      get().mutateActive((session) => {
        const document = session.document
        const before = captureDocumentStructureSnapshot(document)
        const canvas = generated.canvasBounds
        const resize = canvas && (canvas.x !== 0 || canvas.y !== 0 || canvas.width !== document.width || canvas.height !== document.height) ? canvas : undefined
        const canvasBefore = resize ? captureDocumentCanvasResizeSnapshot(document) : undefined
        const regionBefore = session.selection
        const pivotBefore = session.selectionPivot
        const selectionBefore = captureAnimationSelectionHistory(session)
        const timeline = document.animation!
        const index = timeline.frames.findIndex((frame) => frame.id === generated.insertionFrameId)
        if (options.scope !== 'loop') timeline.loopSections = reconcileAnimationLoopSectionsAfterFrameInsertion(timeline.loopSections, timeline.frames, generated.insertionFrameId, generated.frames.at(-1)!.id)
        timeline.frames.splice(index + 1, 0, ...generated.frames)
        const existingNames = new Set(timeline.loopSections?.map((section) => section.name))
        let loopNumber = 1
        while (existingNames.has(tr('timeline.tween.loopName', { index: loopNumber }))) loopNumber++
        timeline.loopSections = [...(timeline.loopSections ?? []), {
          id: createId('loop-section'), name: tr('timeline.tween.loopName', { index: loopNumber }),
          startFrameId: options.scope === 'between' ? frameId : generated.frames[0].id,
          endFrameId: options.scope === 'between' ? timeline.frames[index + generated.frames.length + 1].id : generated.frames.at(-1)!.id,
          direction: 'forward', repeatCount: null
        }]
        timeline.cels.push(...generated.cels)
        timeline.layerMasks = [...(timeline.layerMasks ?? []), ...generated.layerMasks]
        timeline.groupMasks = [...(timeline.groupMasks ?? []), ...generated.groupMasks]
        session.animationPlaying = false
        session.activeLayerMaskId = null
        session.layerMaskIsolatedView = false
        document.activeLayerId = layerId
        clearAnimationItemSelection(session)
        session.selectedAnimationFrameIds = generated.frames.map((frame) => frame.id)
        session.animationFrameSelectionAnchorId = generated.frames[0].id
        activateAnimationFrame(document, generated.frames[0].id, false)
        setTimelineActiveFrame(session, generated.frames[0].id)
        if (resize) {
          const oldWidth = document.width, oldHeight = document.height
          resizeDocumentAt(document, resize.width, resize.height, -resize.x, -resize.y, false)
          resizeAnimationCelsAt(document, -resize.x, -resize.y, false, oldWidth, oldHeight)
          session.selection = shiftSelection(regionBefore, -resize.x, -resize.y, resize.width, resize.height)
          session.selectionPivot = pivotBefore ? { x: pivotBefore.x - resize.x, y: pivotBefore.y - resize.y } : null
          session.canvasResizePreview = null
          session.lastPencilPoint = null
          session.lastEraserPoint = null
        }
        const after = captureDocumentStructureSnapshot(document)
        const canvasAfter = resize ? captureDocumentCanvasResizeSnapshot(document) : undefined
        const regionAfter = session.selection
        const pivotAfter = session.selectionPivot
        const selectionAfter = captureAnimationSelectionHistory(session)
        session.history.push({
          label: tr('timeline.tween.title'), bytes: documentStructureDeltaBytes(before, after) + (canvasBefore && canvasAfter ? documentCanvasResizeSnapshotBytes(canvasBefore) + documentCanvasResizeSnapshotBytes(canvasAfter) : 0),
          undo: () => {
            restoreDocumentStructureSnapshot(document, before)
            if (canvasBefore) { restoreDocumentCanvasResizeSnapshot(document, canvasBefore); refreshActiveAnimationFrame(document); session.selection = regionBefore; session.selectionPivot = pivotBefore }
            restoreAnimationSelectionHistory(session, selectionBefore)
          },
          redo: () => {
            restoreDocumentStructureSnapshot(document, after)
            if (canvasAfter) { restoreDocumentCanvasResizeSnapshot(document, canvasAfter); refreshActiveAnimationFrame(document); session.selection = regionAfter; session.selectionPivot = pivotAfter }
            restoreAnimationSelectionHistory(session, selectionAfter)
          },
          invalidation: { kind: 'full' }, requiresAnimationSync: false
        })
      }, true, true)
      return true
    }
  }
}
