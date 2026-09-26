import { animationCelKey, ensureAnimationDocument, refreshActiveAnimationFrame, syncActiveAnimationFrame } from '@/core/animation'
import { animationReversedSlotTargets } from '@/core/animation-slot-selection'
import { isLayerEffectivelyLocked } from '@/core/document-model'
import { cloneAnimationLoopSections } from '@/core/animation-loop-sections'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { captureAnimationSelectionHistory, historyEntryWithAnimationSelection } from './workspace-animation-selection-history'
import { setAnimationLoopSections } from './workspace-animation-commands-helpers'
import { tr } from './workspace-translation'

export function createAnimationReverseCommands({ get }: WorkspaceCommandContext<'mutateActive'>): Pick<WorkspaceAnimationCommands, 'reverseSelectedAnimationCels' | 'reverseSelectedAnimationFrames'> {
  return {
    reverseSelectedAnimationCels() {
      get().mutateActive(session => {
        const timeline = ensureAnimationDocument(session.document)
        const targets = animationReversedSlotTargets(session.selectedAnimationCellKeys, timeline.frames.map(frame => frame.id))
        const moved = timeline.cels.filter(cel => targets.has(animationCelKey(cel.layerId, cel.frameId)))
        if (!moved.length || moved.some(cel => {
          const layer = session.document.layers.find(layer => layer.id === cel.layerId)
          return !layer || isLayerEffectivelyLocked(session.document, layer)
        })) return
        syncActiveAnimationFrame(session.document)
        const selection = captureAnimationSelectionHistory(session)
        const before = moved.map(cel => ({ id: cel.id, frameId: cel.frameId }))
        const after = moved.map(cel => ({ id: cel.id, frameId: targets.get(animationCelKey(cel.layerId, cel.frameId))! }))
        const apply = (placements: typeof before) => {
          const current = ensureAnimationDocument(session.document)
          const byId = new Map(current.cels.map(cel => [cel.id, cel]))
          for (const placement of placements) {
            const cel = byId.get(placement.id)
            if (cel) cel.frameId = placement.frameId
          }
          // Cel identities and link targets travel with their content. Masks are
          // independent timeline rows and remain in their unselected slots.
          refreshActiveAnimationFrame(session.document)
        }
        apply(after)
        session.history.push(historyEntryWithAnimationSelection(session, {
          label: tr('timeline.reverseCels'), bytes: moved.length * 64,
          undo: () => apply(before), redo: () => apply(after),
          affectedLayerIds: [...new Set(moved.map(cel => cel.layerId))], requiresAnimationSync: true
        }, selection, selection))
      }, true, true)
    },
    reverseSelectedAnimationFrames() {
      get().mutateActive(session => {
        const timeline = ensureAnimationDocument(session.document)
        const selected = new Set(session.selectedAnimationFrameIds)
        const before = timeline.frames.map(frame => frame.id)
        const reversed = before.filter(id => selected.has(id)).reverse()
        if (reversed.length < 2) return
        let index = 0
        const after = before.map(id => selected.has(id) ? reversed[index++] : id)
        const selectionBefore = captureAnimationSelectionHistory(session)
        const loopsBefore = cloneAnimationLoopSections(timeline.loopSections)
        // Keep loop ranges at the same timeline positions, including partial reversals.
        const loopsAfter = loopsBefore.map(section => ({ ...section,
          startFrameId: after[before.indexOf(section.startFrameId)], endFrameId: after[before.indexOf(section.endFrameId)] }))
        const apply = (ids: readonly string[], loops: typeof loopsBefore) => {
          const current = ensureAnimationDocument(session.document)
          const byId = new Map(current.frames.map(frame => [frame.id, frame]))
          current.frames = ids.flatMap(id => { const frame = byId.get(id); return frame ? [frame] : [] })
          setAnimationLoopSections(session, loops)
        }
        apply(after, loopsAfter)
        session.selectedAnimationFrameIds = after.filter(id => selected.has(id))
        session.history.push(historyEntryWithAnimationSelection(session, {
          label: tr('timeline.reverseFrames'), bytes: before.length * 32 + loopsBefore.length * 256,
          undo: () => apply(before, loopsBefore), redo: () => apply(after, loopsAfter)
        }, selectionBefore, captureAnimationSelectionHistory(session)))
      }, 'metadata', true)
    }
  }
}
