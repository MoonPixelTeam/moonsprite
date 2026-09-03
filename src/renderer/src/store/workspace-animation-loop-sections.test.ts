import { beforeEach, describe, expect, it } from 'vitest'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { createDocument } from '@/core/document'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

describe('workspace animation loop sections', () => {
  it.each([
    ['blank frame', 'addAnimationFrame'],
    ['duplicated frame', 'duplicateAnimationFrame'],
    ['linked frame', 'addLinkedAnimationFrame']
  ] as const)('keeps a %s created at the loop end inside the loop through undo and redo', (_label, command) => {
    const document = createDocument('loop section frame creation', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [, secondFrame, thirdFrame] = timeline.frames
    const loopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Create inside',
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'forward',
      repeatCount: null
    })!
    const session = useWorkspace.getState().sessions[0]
    session.history.clear()
    useWorkspace.getState().setActiveAnimationFrame(thirdFrame.id)

    useWorkspace.getState()[command]()

    const insertedFrameId = timeline.activeFrameId
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: secondFrame.id,
      endFrameId: insertedFrameId
    })

    useWorkspace.getState().undo()
    expect(timeline.frames.some((frame) => frame.id === insertedFrameId)).toBe(false)
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id
    })

    useWorkspace.getState().redo()
    expect(timeline.frames.some((frame) => frame.id === insertedFrameId)).toBe(true)
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: secondFrame.id,
      endFrameId: insertedFrameId
    })
  })

  it('creates, edits, restores, and independently plays a named loop section', () => {
    const document = createDocument('animation loop section', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const [firstFrame, secondFrame, thirdFrame] = ensureAnimationDocument(document).frames
    document.dirty = false

    const loopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Run',
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'forward',
      repeatCount: 1
    })!

    expect(ensureAnimationDocument(document).loopSections).toEqual([expect.objectContaining({ id: loopId, name: 'Run', direction: 'forward', repeatCount: 1 })])
    expect(document.dirty).toBe(true)
    useWorkspace.getState().undo()
    expect(ensureAnimationDocument(document).loopSections).toEqual([])
    useWorkspace.getState().redo()
    expect(ensureAnimationDocument(document).loopSections).toHaveLength(1)

    useWorkspace.getState().updateAnimationLoopSection(loopId, {
      name: 'Run Backward',
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'reverse',
      repeatCount: 2
    })
    expect(ensureAnimationDocument(document).loopSections?.[0]).toMatchObject({ name: 'Run Backward', direction: 'reverse', repeatCount: 2 })
    useWorkspace.getState().undo()
    expect(ensureAnimationDocument(document).loopSections?.[0]).toMatchObject({ name: 'Run', direction: 'forward', repeatCount: 1 })
    useWorkspace.getState().redo()

    useWorkspace.getState().deleteAnimationLoopSection(loopId)
    expect(ensureAnimationDocument(document).loopSections).toEqual([])
    useWorkspace.getState().undo()
    expect(ensureAnimationDocument(document).loopSections?.[0]).toMatchObject({ name: 'Run Backward', direction: 'reverse', repeatCount: 2 })

    useWorkspace.getState().setActiveAnimationFrame(firstFrame.id)
    document.dirty = false
    useWorkspace.getState().playAnimationLoopSection(loopId)
    expect(document.animation?.activeFrameId).toBe(thirdFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaying: true, animationPlaybackLoopSectionId: loopId, animationPlaybackLoopIteration: 0 })
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(secondFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(secondFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaying: false, animationPlaybackLoopSectionId: null, animationPlaybackLoopIteration: 0 })
    expect(document.animation?.activeFrameId).toBe(secondFrame.id)
    expect(document.dirty).toBe(false)
  })

  it('repeats the innermost tag at the active frame and loops all frames outside tags', () => {
    const document = createDocument('tag repeat playback', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 4; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const [firstFrame, secondFrame, thirdFrame, fourthFrame, fifthFrame] = ensureAnimationDocument(document).frames
    const outerId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Outer',
      startFrameId: secondFrame.id,
      endFrameId: fourthFrame.id,
      direction: 'forward',
      repeatCount: 1
    })!
    const innerId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Inner',
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'forward',
      repeatCount: 1
    })!
    document.dirty = false

    useWorkspace.getState().setActiveAnimationFrame(thirdFrame.id)
    useWorkspace.getState().setAnimationPlaybackMode('tag')
    useWorkspace.getState().setAnimationPlaying(true)
    expect(document.animation?.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaybackLoopSectionId: innerId,
      animationPlaybackLoopSectionRepeatIndefinitely: true
    })
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(true)

    useWorkspace.getState().selectAnimationFrame(fourthFrame.id)
    expect(document.animation?.activeFrameId).toBe(fourthFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaying: true,
      animationPlaybackLoopSectionId: outerId,
      animationPlaybackLoopSectionRepeatIndefinitely: true,
      animationPlaybackLoopIteration: 0
    })
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(true)

    useWorkspace.getState().setAnimationPlaying(false)
    useWorkspace.getState().setActiveAnimationFrame(fifthFrame.id)
    useWorkspace.getState().setAnimationPlaying(true)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopSectionId).toBeNull()
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(firstFrame.id)
    expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(true)
    expect(document.dirty).toBe(false)
  })

  it('retargets tag playback when a different timeline cel is clicked', () => {
    const document = createDocument('tag retarget from cel', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 3; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const [firstFrame, secondFrame, thirdFrame, fourthFrame] = ensureAnimationDocument(document).frames
    const firstLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'First', startFrameId: firstFrame.id, endFrameId: secondFrame.id, direction: 'forward', repeatCount: null
    })!
    const secondLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Second', startFrameId: thirdFrame.id, endFrameId: fourthFrame.id, direction: 'forward', repeatCount: null
    })!

    useWorkspace.getState().setActiveAnimationFrame(firstFrame.id)
    useWorkspace.getState().setAnimationPlaybackMode('tag')
    useWorkspace.getState().setAnimationPlaying(true)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopSectionId).toBe(firstLoopId)

    useWorkspace.getState().selectAnimationCell(animationCelKey(document.layers[0].id, thirdFrame.id))
    expect(document.animation?.activeFrameId).toBe(thirdFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaying: true,
      animationPlaybackLoopSectionId: secondLoopId,
      animationPlaybackLoopSectionRepeatIndefinitely: true,
      animationPlaybackLoopIteration: 0
    })
  })

  it('collapses playback frame selection to the final paused frame', () => {
    const document = createDocument('pause current frame selection', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame, thirdFrame] = timeline.frames
    const session = useWorkspace.getState().sessions[0]
    session.animationPlaybackMode = 'all'
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })
    useWorkspace.getState().selectAnimationFrame(firstFrame.id)
    useWorkspace.getState().setAnimationPlaying(true)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([firstFrame.id])

    useWorkspace.getState().setAnimationPlaying(false)
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([secondFrame.id])
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([])
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).not.toContain(thirdFrame.id)
  })

  it('clears a clicked cel selection when playback is paused on another frame', () => {
    const document = createDocument('pause current cel selection', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame] = timeline.frames
    const layerId = document.layers[0].id
    const session = useWorkspace.getState().sessions[0]
    session.animationPlaybackMode = 'all'
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })
    useWorkspace.getState().selectAnimationCell(animationCelKey(layerId, firstFrame.id))
    useWorkspace.getState().setAnimationPlaying(true)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([animationCelKey(layerId, firstFrame.id)])

    useWorkspace.getState().setAnimationPlaying(false)
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([])
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([secondFrame.id])
  })

  it('skips disabled frames inside forward and reverse loop sections', () => {
    const document = createDocument('disabled loop frames', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const [firstFrame, secondFrame, thirdFrame] = ensureAnimationDocument(document).frames
    secondFrame.disabled = true
    const forwardId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Forward',
      startFrameId: firstFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'forward',
      repeatCount: 1
    })!

    useWorkspace.getState().playAnimationLoopSection(forwardId)
    expect(document.animation?.activeFrameId).toBe(firstFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(false)

    useWorkspace.getState().updateAnimationLoopSection(forwardId, {
      name: 'Reverse',
      startFrameId: firstFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'reverse',
      repeatCount: 1
    })
    useWorkspace.getState().playAnimationLoopSection(forwardId)
    expect(document.animation?.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(document.animation?.activeFrameId).toBe(firstFrame.id)
  })
})
