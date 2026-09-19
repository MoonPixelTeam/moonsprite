import { activateAnimationFrame, syncActiveAnimationFrame } from '@/core/animation'
import { prepareAnimationTween } from '@/core/animation-tween'
import { createId } from '@/core/document-model'
import { reconcileAnimationLoopSectionsAfterFrameInsertion } from '@/core/animation-loop-sections'
import { captureDocumentStructureSnapshot, restoreDocumentStructureSnapshot, documentStructureDeltaBytes } from './workspace-document-history'
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
          startFrameId: generated.frames[0].id, endFrameId: generated.frames.at(-1)!.id,
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
        const after = captureDocumentStructureSnapshot(document)
        const selectionAfter = captureAnimationSelectionHistory(session)
        session.history.push({
          label: tr('timeline.tween.title'), bytes: documentStructureDeltaBytes(before, after),
          undo: () => { restoreDocumentStructureSnapshot(document, before); restoreAnimationSelectionHistory(session, selectionBefore) },
          redo: () => { restoreDocumentStructureSnapshot(document, after); restoreAnimationSelectionHistory(session, selectionAfter) },
          invalidation: { kind: 'full' }, requiresAnimationSync: false
        })
      }, true, true)
      return true
    }
  }
}
