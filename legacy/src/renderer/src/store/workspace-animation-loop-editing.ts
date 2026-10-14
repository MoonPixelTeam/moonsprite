import { createId } from '@/core/document-model'
import { ensureAnimationDocument } from '@/core/animation'
import { cloneAnimationLoopSections, normalizeAnimationLoopSections } from '@/core/animation-loop-sections'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { activeSession } from './workspace-access'
import { clearAnimationLoopPlayback } from './workspace-animation-selection'
import { setAnimationLoopSections } from './workspace-animation-commands-helpers'
import { tr } from './workspace-translation'
export function createAnimationLoopEditingCommands({ get }: Pick<WorkspaceCommandContext<'mutateActive'>, 'get'>): Pick<WorkspaceAnimationCommands, 'createAnimationLoopSection' | 'updateAnimationLoopSection' | 'deleteAnimationLoopSection'> {
  return {
    createAnimationLoopSection(options) {
      const current = activeSession(get())
      if (!current) return null
      const timeline = ensureAnimationDocument(current.document)
      const id = createId('loop-section')
      const section = normalizeAnimationLoopSections([{ id, ...options }], timeline.frames)[0]
      if (!section) return null
      get().mutateActive((session) => {
        const activeTimeline = ensureAnimationDocument(session.document)
        const before = cloneAnimationLoopSections(activeTimeline.loopSections)
        const after = [...before, section]
        setAnimationLoopSections(session, after)
        session.history.push({
          label: tr('workspace.history.createAnimationLoopSection'),
          bytes: 128,
          undo: () => setAnimationLoopSections(session, before),
          redo: () => setAnimationLoopSections(session, after),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
      return id
    },
    updateAnimationLoopSection(id, options) {
      const current = activeSession(get())
      const currentTimeline = current ? ensureAnimationDocument(current.document) : null
      const existing = currentTimeline?.loopSections?.find((section) => section.id === id)
      const normalized = currentTimeline ? normalizeAnimationLoopSections([{ id, ...options }], currentTimeline.frames)[0] : null
      if (!current || !currentTimeline || !existing || !normalized) return
      if (
        existing.name === normalized.name &&
        existing.startFrameId === normalized.startFrameId &&
        existing.endFrameId === normalized.endFrameId &&
        existing.direction === normalized.direction &&
        existing.repeatCount === normalized.repeatCount
      )
        return
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const before = cloneAnimationLoopSections(timeline.loopSections)
        const after = before.map((section) => (section.id === id ? normalized : section))
        if (session.animationPlaybackLoopSectionId === id || session.animationPlaybackTagCycleSectionId === id) {
          session.animationPlaying = false
          session.animationPlaybackStartFrameId = null
          clearAnimationLoopPlayback(session)
        }
        setAnimationLoopSections(session, after)
        session.history.push({
          label: tr('workspace.history.updateAnimationLoopSection'),
          bytes: 256,
          undo: () => setAnimationLoopSections(session, before),
          redo: () => setAnimationLoopSections(session, after),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },
    deleteAnimationLoopSection(id) {
      const current = activeSession(get())
      if (!current?.document.animation?.loopSections?.some((section) => section.id === id)) return
      get().mutateActive((session) => {
        const timeline = ensureAnimationDocument(session.document)
        const before = cloneAnimationLoopSections(timeline.loopSections)
        const after = before.filter((section) => section.id !== id)
        if (session.animationPlaybackLoopSectionId === id || session.animationPlaybackTagCycleSectionId === id) {
          session.animationPlaying = false
          session.animationPlaybackStartFrameId = null
          clearAnimationLoopPlayback(session)
        }
        setAnimationLoopSections(session, after)
        session.history.push({
          label: tr('workspace.history.deleteAnimationLoopSection'),
          bytes: 128,
          undo: () => setAnimationLoopSections(session, before),
          redo: () => setAnimationLoopSections(session, after),
          contentChanged: false,
          requiresAnimationSync: false
        })
      }, 'metadata')
    },
  }
}
