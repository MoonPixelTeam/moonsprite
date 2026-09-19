import { createId } from '@/core/document-model'
import {
  activateAnimationFrame,
  ensureAnimationDocument,
  firstPlayableAnimationFrameId,
  nextAnimationFrameId,
  setAnimationLoop
} from '@/core/animation'
import {
  advanceAnimationLoopSectionPlayback,
  animationLoopSectionAtFrame,
  animationLoopSectionStartFrameId,
  cloneAnimationLoopSections,
  normalizeAnimationLoopSections
} from '@/core/animation-loop-sections'
import type { AnimationPlaybackMode } from './workspace-types'
import type { WorkspaceAnimationCommands } from './workspace-state'
import type { WorkspaceCommandContext } from './workspace-command-context'
import { clearAnimationLoopPlayback } from './workspace-animation-selection'
import { tr } from './workspace-translation'
import { activeSession } from './workspace-access'
import {
  setAnimationLoopPlaybackSection,
  activateAnimationPlaybackFrame,
  animationLoopSectionContainsFrame,
  nestedAnimationLoopSectionAtFrame,
  animationLoopSectionBoundaryFrameId,
  setAnimationLoopSections,
  persistAnimationPlaybackPreferences
} from './workspace-animation-commands-helpers'



export function createAnimationPlaybackCommands({ get }: WorkspaceCommandContext<'advanceAnimationFrame' | 'commitFloatingPaste' | 'mutateActive' | 'setActiveAnimationFrame' | 'setAnimationLoop' | 'setAnimationPlaying'>): Pick<WorkspaceAnimationCommands, 'setAnimationPlaying' | 'pauseAnimationAtCurrentFrame' | 'setAnimationPlaybackRate' | 'setAnimationPlaybackMode' | 'setAnimationReturnToStart' | 'advanceAnimationFrame' | 'createAnimationLoopSection' | 'updateAnimationLoopSection' | 'deleteAnimationLoopSection' | 'playAnimationLoopSection'> {
  return {
    setAnimationPlaying(playing, completed = false) {
      // A floating selection belongs to the frame on which the transform was
      // started. Commit it before playback can advance the document surface
      // the committed selection geometry remains available on later frames.
      if (playing) get().commitFloatingPaste()
      get().mutateActive((session) => {
        if (session.animationPlaying === playing) return
        const timeline = ensureAnimationDocument(session.document)
        const playbackMode = session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once')
        if (playing) {
          const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0 || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0 || session.activeLayerMaskId !== null
          clearAnimationLoopPlayback(session)
          const firstPlayableFrameId = firstPlayableAnimationFrameId(timeline)
          if (!firstPlayableFrameId) return
          session.animationPlaybackStartFrameId = timeline.activeFrameId
          const loopSection = playbackMode === 'tag' ? animationLoopSectionAtFrame(timeline, timeline.activeFrameId) : null
          const targetFrameId = loopSection
            ? animationLoopSectionStartFrameId(timeline, loopSection)
            : playbackMode === 'once'
              ? firstPlayableFrameId
              : timeline.frames.find((frame) => frame.id === timeline.activeFrameId)?.disabled === true
                ? nextAnimationFrameId({ ...timeline, loop: true }, timeline.activeFrameId)
                : timeline.activeFrameId
          if (!targetFrameId) return
          if (loopSection) {
            setAnimationLoopPlaybackSection(session, loopSection)
            session.animationPlaybackTagCycleSectionId = playbackMode === 'tag' && loopSection.repeatCount !== null ? loopSection.id : null
          }
          if (targetFrameId && targetFrameId !== timeline.activeFrameId) {
            activateAnimationFrame(session.document, targetFrameId)
            if (!preserveMaskContext) {
              session.activeLayerMaskId = null
              session.layerMaskIsolatedView = false
            }
            session.lastPencilPoint = null
            session.lastEraserPoint = null
            session.revision += 1
          }
          session.animationPlaying = true
          return
        }
        session.animationPlaying = false
        const loopSectionId = session.animationPlaybackLoopSectionId
        const startFrameId = session.animationPlaybackStartFrameId
        session.animationPlaybackStartFrameId = null
        clearAnimationLoopPlayback(session)
        const returnFrameId = session.animationReturnToStart ? startFrameId : completed && !loopSectionId && playbackMode === 'once' ? firstPlayableAnimationFrameId(timeline) : null
        if (returnFrameId && returnFrameId !== timeline.activeFrameId && activateAnimationFrame(session.document, returnFrameId)) {
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          session.revision += 1
        }
        // Playback only moves the playhead. Keep the user's layer/frame/cel
        // selection intact so stopping playback cannot rewrite the timeline
        // focus or discard a selection made while the animation was running.
      }, false)
    },
    pauseAnimationAtCurrentFrame() {
      get().mutateActive((session) => {
        if (!session.animationPlaying) return
        session.animationPlaying = false
        session.animationPlaybackStartFrameId = null
        clearAnimationLoopPlayback(session)
        // Pausing is also a playhead operation. Do not turn the paused frame
        // into a new selection or clear an existing multi-selection.
      }, false)
    },
    setAnimationPlaybackRate(rate) {
      const normalized = [0.25, 0.5, 1, 1.5, 2, 3].includes(rate) ? rate : 1
      get().mutateActive((session) => {
        session.animationPlaybackRate = normalized
      }, false)
      persistAnimationPlaybackPreferences({
        animationPlaybackRate: normalized
      })
    },
    setAnimationPlaybackMode(mode) {
      const normalized: AnimationPlaybackMode = mode === 'tag' ? 'tag' : mode === 'all' ? 'all' : 'once'
      if (normalized !== 'tag') {
        get().setAnimationLoop(normalized === 'all')
        persistAnimationPlaybackPreferences({
          animationPlaybackMode: normalized
        })
        return
      }
      get().mutateActive((session) => {
        if (session.animationPlaybackMode === 'tag' && (!session.animationPlaying || session.animationPlaybackLoopSectionRepeatIndefinitely)) return
        session.animationPlaybackMode = 'tag'
        if (!session.animationPlaying) return
        const preserveMaskContext = session.selectedAnimationMaskRowKeys.length > 0 || session.selectedAnimationMaskCellKeys.length > 0 || session.activeLayerMaskId !== null
        const timeline = ensureAnimationDocument(session.document)
        clearAnimationLoopPlayback(session)
        const section = animationLoopSectionAtFrame(timeline, timeline.activeFrameId)
        const firstFrameId = section ? animationLoopSectionStartFrameId(timeline, section) : null
        if (!section || !firstFrameId) {
          session.animationPlaying = false
          return
        }
        setAnimationLoopPlaybackSection(session, section)
        session.animationPlaybackTagCycleSectionId = section.repeatCount !== null ? section.id : null
        if (firstFrameId !== timeline.activeFrameId && activateAnimationFrame(session.document, firstFrameId)) {
          if (!preserveMaskContext) {
            session.activeLayerMaskId = null
            session.layerMaskIsolatedView = false
          }
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          session.revision += 1
        }
      }, false)
      persistAnimationPlaybackPreferences({
        animationPlaybackMode: normalized
      })
    },
    setAnimationReturnToStart(enabled) {
      get().mutateActive((session) => {
        session.animationReturnToStart = enabled
      }, false)
      persistAnimationPlaybackPreferences({ animationReturnToStart: enabled })
    },
    advanceAnimationFrame() {
      const session = activeSession(get())
      if (!session) return
      const timeline = ensureAnimationDocument(session.document)
      const loopSection = session.animationPlaybackLoopSectionId ? (timeline.loopSections ?? []).find((section) => section.id === session.animationPlaybackLoopSectionId) : null
      if (session.animationPlaybackLoopSectionId && !loopSection) {
        get().setAnimationPlaying(false)
        return
      }
      if (loopSection) {
        const playbackSection = session.animationPlaybackLoopSectionRepeatIndefinitely ? (session.animationPlaybackLoopStack.length > 0 ? { ...loopSection, repeatCount: 1 } : { ...loopSection, repeatCount: null }) : loopSection
        const step = advanceAnimationLoopSectionPlayback(timeline, playbackSection, timeline.activeFrameId, session.animationPlaybackLoopIteration, session.animationPlaybackLoopPosition)
        const playbackMode = session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once')
        const nestedSection = step && !step.completed ? nestedAnimationLoopSectionAtFrame(timeline, loopSection, step.frameId) : null
        if (step && nestedSection) {
          const nestedStartFrameId = animationLoopSectionStartFrameId(timeline, nestedSection)
          if (!nestedStartFrameId) return
          get().mutateActive((current) => {
            current.animationPlaybackLoopStack.push({
              sectionId: loopSection.id,
              iteration: step.completedIterations,
              position: step.position
            })
            setAnimationLoopPlaybackSection(current, nestedSection)
            activateAnimationPlaybackFrame(current, nestedStartFrameId)
          }, false)
          return
        }
        if (step?.completed && session.animationPlaybackLoopStack.length > 0) {
          const parentContext = session.animationPlaybackLoopStack.at(-1)
          const parentSection = parentContext ? ((timeline.loopSections ?? []).find((section) => section.id === parentContext.sectionId) ?? null) : null
          const boundaryFrameId = parentSection ? animationLoopSectionBoundaryFrameId(timeline, loopSection, parentSection, parentContext?.position) : null
          if (!parentSection || !boundaryFrameId) {
            get().setAnimationPlaying(false)
            return
          }
          get().mutateActive((current) => {
            current.animationPlaybackLoopStack = current.animationPlaybackLoopStack.slice(0, -1)
            setAnimationLoopPlaybackSection(current, parentSection)
            activateAnimationPlaybackFrame(current, boundaryFrameId)
            current.animationPlaybackLoopIteration = parentContext!.iteration
            current.animationPlaybackLoopPosition = parentContext!.position
          }, false)
          return
        }
        if (step?.completed && playbackMode === 'tag' && !session.animationPlaybackLoopSectionRepeatIndefinitely && loopSection.repeatCount !== null) {
          const nextFrameId = nextAnimationFrameId({ ...timeline, loop: true }, loopSection.endFrameId)
          if (nextFrameId) {
            const cycleSectionId = session.animationPlaybackTagCycleSectionId
            const cycleSection = cycleSectionId ? ((timeline.loopSections ?? []).find((section) => section.id === cycleSectionId) ?? null) : null
            if (cycleSection && animationLoopSectionContainsFrame(timeline, cycleSection, nextFrameId)) {
              get().mutateActive((current) => {
                setAnimationLoopPlaybackSection(current, cycleSection)
                const cycleStartFrameId = animationLoopSectionStartFrameId(timeline, cycleSection)
                if (cycleStartFrameId) activateAnimationPlaybackFrame(current, cycleStartFrameId)
              }, false)
            } else if (cycleSectionId) {
              get().mutateActive((current) => {
                const nextSection = animationLoopSectionAtFrame(timeline, nextFrameId)
                if (nextSection && nextSection.repeatCount !== null) {
                  setAnimationLoopPlaybackSection(current, nextSection)
                  const nextSectionStartFrameId = animationLoopSectionStartFrameId(timeline, nextSection)
                  if (nextSectionStartFrameId) activateAnimationPlaybackFrame(current, nextSectionStartFrameId)
                } else {
                  current.animationPlaybackLoopSectionId = null
                  current.animationPlaybackLoopIteration = 0
                  current.animationPlaybackLoopPosition = undefined
                  current.animationPlaybackLoopSectionRepeatIndefinitely = false
                  activateAnimationPlaybackFrame(current, nextFrameId)
                }
              }, false)
            } else {
              get().setActiveAnimationFrame(nextFrameId)
            }
            return
          }
        }
        if (!step || step.completed) {
          get().setAnimationPlaying(false, Boolean(step?.completed))
          return
        }
        get().mutateActive((current) => {
          current.animationPlaybackLoopIteration = step.completedIterations
          current.animationPlaybackLoopPosition = step.position
          if (!activateAnimationPlaybackFrame(current, step.frameId)) return
          const preserveMaskContext = (current.selectedAnimationMaskRowKeys?.length ?? 0) > 0 || (current.selectedAnimationMaskCellKeys?.length ?? 0) > 0 || current.activeLayerMaskId !== null
          if (!preserveMaskContext) {
            current.activeLayerMaskId = null
            current.layerMaskIsolatedView = false
          }
          current.lastPencilPoint = null
          current.lastEraserPoint = null
          current.revision += 1
        }, false)
        return
      }
      const playbackMode = session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once')
      const loopAllFrames = playbackMode !== 'once'
      const playbackTimeline = loopAllFrames === timeline.loop ? timeline : { ...timeline, loop: loopAllFrames }
      const nextFrameId = nextAnimationFrameId(playbackTimeline, timeline.activeFrameId)
      if (!nextFrameId || (!loopAllFrames && nextFrameId === timeline.activeFrameId)) get().setAnimationPlaying(false, true)
      else if (playbackMode === 'tag' && session.animationPlaybackTagCycleSectionId) {
        const cycleSection = (timeline.loopSections ?? []).find((section) => section.id === session.animationPlaybackTagCycleSectionId) ?? null
        if (!cycleSection) {
          get().setAnimationPlaying(false)
          return
        }
        get().mutateActive((current) => {
          if (animationLoopSectionContainsFrame(timeline, cycleSection, nextFrameId)) {
            setAnimationLoopPlaybackSection(current, cycleSection)
            const cycleStartFrameId = animationLoopSectionStartFrameId(timeline, cycleSection)
            if (cycleStartFrameId) activateAnimationPlaybackFrame(current, cycleStartFrameId)
          } else {
            const nextSection = animationLoopSectionAtFrame(timeline, nextFrameId)
            if (nextSection && nextSection.repeatCount !== null) {
              setAnimationLoopPlaybackSection(current, nextSection)
              const nextSectionStartFrameId = animationLoopSectionStartFrameId(timeline, nextSection)
              if (nextSectionStartFrameId) activateAnimationPlaybackFrame(current, nextSectionStartFrameId)
            } else {
              current.animationPlaybackLoopSectionId = null
              current.animationPlaybackLoopIteration = 0
              current.animationPlaybackLoopPosition = undefined
              current.animationPlaybackLoopSectionRepeatIndefinitely = false
              activateAnimationPlaybackFrame(current, nextFrameId)
            }
          }
        }, false)
      } else get().setActiveAnimationFrame(nextFrameId)
    },
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
    playAnimationLoopSection(id) {
      get().commitFloatingPaste()
      get().mutateActive((session) => {
        const preserveMaskContext = (session.selectedAnimationMaskRowKeys?.length ?? 0) > 0 || (session.selectedAnimationMaskCellKeys?.length ?? 0) > 0 || session.activeLayerMaskId !== null
        const timeline = ensureAnimationDocument(session.document)
        const section = (timeline.loopSections ?? []).find((candidate) => candidate.id === id)
        const firstFrameId = section ? animationLoopSectionStartFrameId(timeline, section) : null
        if (!section || !firstFrameId) {
          session.animationPlaying = false
          session.animationPlaybackStartFrameId = null
          clearAnimationLoopPlayback(session)
          return
        }
        session.animationPlaybackStartFrameId = timeline.activeFrameId
        session.animationPlaybackLoopSectionId = id
        session.animationPlaybackLoopIteration = 0
        session.animationPlaybackLoopPosition = undefined
        session.animationPlaybackLoopSectionRepeatIndefinitely = section.repeatCount === null
        session.animationPlaybackLoopStack = []
        session.animationPlaybackTagCycleSectionId = session.animationPlaybackMode === 'tag' && section.repeatCount !== null ? id : null
        session.animationPlaying = true
        if (firstFrameId !== timeline.activeFrameId && activateAnimationFrame(session.document, firstFrameId)) {
          if (!preserveMaskContext) {
            session.activeLayerMaskId = null
            session.layerMaskIsolatedView = false
          }
          session.lastPencilPoint = null
          session.lastEraserPoint = null
          session.revision += 1
        }
      }, false)
    }
  }
}
