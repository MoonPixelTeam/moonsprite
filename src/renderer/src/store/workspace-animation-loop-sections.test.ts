import { beforeEach, describe, expect, it } from 'vitest'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { createDocument, createLayerMask } from '@/core/document'
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

  it('adds a dragged frame only from the boundary side facing a loop', () => {
    const document = createDocument('reorder loop boundary', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame, thirdFrame] = timeline.frames
    const loopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'First two',
      startFrameId: firstFrame.id,
      endFrameId: secondFrame.id,
      direction: 'forward',
      repeatCount: null
    })!
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const [, , , fourthFrame, fifthFrame] = timeline.frames
    const rightLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Last two',
      startFrameId: fourthFrame.id,
      endFrameId: fifthFrame.id,
      direction: 'forward',
      repeatCount: null
    })!
    const session = useWorkspace.getState().sessions[0]
    useWorkspace.getState().selectAnimationFrame(thirdFrame.id)

    // The UI may report the right boundary as the next frame's left edge.
    useWorkspace.getState().moveSelectedAnimationFrames(fourthFrame.id, false)
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: firstFrame.id,
      endFrameId: secondFrame.id
    })
    expect(timeline.loopSections?.find((section) => section.id === rightLoopId)).toMatchObject({
      startFrameId: thirdFrame.id,
      endFrameId: fifthFrame.id
    })

    useWorkspace.getState().undo()
    // Likewise, the left boundary may be reported as the previous frame's
    // right edge.
    useWorkspace.getState().moveSelectedAnimationFrames(secondFrame.id, true)

    expect(timeline.frames.map((frame) => frame.id)).toEqual([firstFrame.id, secondFrame.id, thirdFrame.id, fourthFrame.id, fifthFrame.id])
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: firstFrame.id,
      endFrameId: thirdFrame.id
    })
    expect(timeline.loopSections?.find((section) => section.id === rightLoopId)).toMatchObject({
      startFrameId: fourthFrame.id,
      endFrameId: fifthFrame.id
    })

    useWorkspace.getState().undo()
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: firstFrame.id,
      endFrameId: secondFrame.id
    })
    expect(timeline.loopSections?.find((section) => section.id === rightLoopId)).toMatchObject({
      startFrameId: fourthFrame.id,
      endFrameId: fifthFrame.id
    })

    useWorkspace.getState().redo()
    expect(timeline.loopSections?.find((section) => section.id === loopId)).toMatchObject({
      startFrameId: firstFrame.id,
      endFrameId: thirdFrame.id
    })
    expect(timeline.loopSections?.find((section) => section.id === rightLoopId)).toMatchObject({
      startFrameId: fourthFrame.id,
      endFrameId: fifthFrame.id
    })
    expect(session.selectedAnimationFrameIds).toEqual([thirdFrame.id])
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
      repeatCount: null
    })!
    const innerId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Inner',
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'forward',
      repeatCount: null
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

  it('resumes a paused loop section from its current playback position', () => {
    const document = createDocument('resume paused loop', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame, thirdFrame] = timeline.frames
    const loopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Bounce',
      startFrameId: firstFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'ping-pong',
      repeatCount: null
    })!

    useWorkspace.getState().playAnimationLoopSection(loopId)
    useWorkspace.getState().advanceAnimationFrame()
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(thirdFrame.id)

    useWorkspace.getState().setAnimationPlaying(false)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaying: false,
      animationPlaybackLoopSectionId: loopId
    })
    useWorkspace.getState().setAnimationPlaying(true)

    expect(timeline.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(secondFrame.id)
  })

  it('repeats a nested loop before resuming and repeating its outer loop', () => {
    const document = createDocument('nested loop playback', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 12; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const frames = timeline.frames
    const outerId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Outer', startFrameId: frames[2].id, endFrameId: frames[12].id, direction: 'forward', repeatCount: null
    })!
    const innerId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Inner', startFrameId: frames[5].id, endFrameId: frames[11].id, direction: 'forward', repeatCount: 2
    })!

    useWorkspace.getState().playAnimationLoopSection(outerId)
    expect(timeline.activeFrameId).toBe(frames[2].id)
    for (const index of [3, 4]) {
      useWorkspace.getState().advanceAnimationFrame()
      expect(timeline.activeFrameId).toBe(frames[index].id)
    }
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[5].id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaybackLoopSectionId: innerId, animationPlaybackLoopStack: [{ sectionId: outerId, iteration: 0 }] })

    for (const index of [6, 7, 8, 9, 10, 11]) {
      useWorkspace.getState().advanceAnimationFrame()
      expect(timeline.activeFrameId).toBe(frames[index].id)
    }
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[5].id)
    for (const index of [6, 7, 8, 9, 10, 11]) {
      useWorkspace.getState().advanceAnimationFrame()
      expect(timeline.activeFrameId).toBe(frames[index].id)
    }
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[11].id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaybackLoopSectionId: outerId, animationPlaybackLoopStack: [] })
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[12].id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[2].id)
  })

  it('treats an infinite child loop as one pass when the parent loop is playing', () => {
    const document = createDocument('multiple nested loops', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 8; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const frames = timeline.frames
    const outerId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Outer', startFrameId: frames[0].id, endFrameId: frames[8].id, direction: 'forward', repeatCount: null
    })!
    const finiteChildId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Finite child', startFrameId: frames[1].id, endFrameId: frames[2].id, direction: 'forward', repeatCount: 3
    })!
    const infiniteChildId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Infinite child', startFrameId: frames[4].id, endFrameId: frames[5].id, direction: 'forward', repeatCount: null
    })!

    useWorkspace.getState().playAnimationLoopSection(outerId)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[1].id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaybackLoopSectionId: finiteChildId, animationPlaybackLoopStack: [{ sectionId: outerId, iteration: 0 }] })
    for (const index of [2, 1, 2, 1, 2, 2]) {
      useWorkspace.getState().advanceAnimationFrame()
      expect(timeline.activeFrameId).toBe(frames[index].id)
    }
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[3].id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[4].id)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopSectionId).toBe(infiniteChildId)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[5].id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[5].id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaybackLoopSectionId: outerId, animationPlaybackLoopStack: [] })
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(frames[6].id)
  })

  it('honors a finite tag repeat before continuing through the timeline', () => {
    const document = createDocument('finite tag repeat playback', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 5; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame, thirdFrame, fourthFrame, fifthFrame, sixthFrame] = timeline.frames
    const finiteLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Finite',
      startFrameId: secondFrame.id,
      endFrameId: thirdFrame.id,
      direction: 'forward',
      repeatCount: 2
    })!
    const laterFiniteLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Later finite',
      startFrameId: fourthFrame.id,
      endFrameId: fifthFrame.id,
      direction: 'forward',
      repeatCount: 2
    })!
    const infiniteLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Later infinite',
      startFrameId: sixthFrame.id,
      endFrameId: sixthFrame.id,
      direction: 'forward',
      repeatCount: null
    })!

    useWorkspace.getState().setActiveAnimationFrame(secondFrame.id)
    useWorkspace.getState().setAnimationPlaybackMode('tag')
    useWorkspace.getState().setAnimationPlaying(true)
    expect(timeline.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaybackLoopSectionId: finiteLoopId,
      animationPlaybackTagCycleSectionId: finiteLoopId,
      animationPlaybackLoopIteration: 0,
      animationPlaybackLoopSectionRepeatIndefinitely: false
    })

    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopIteration).toBe(1)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(thirdFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(fourthFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaying: true, animationPlaybackLoopSectionId: laterFiniteLoopId, animationPlaybackTagCycleSectionId: finiteLoopId })

    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(fifthFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(fourthFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(fifthFrame.id)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(sixthFrame.id)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopSectionId).toBeNull()
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(firstFrame.id)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopSectionId).toBeNull()
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(secondFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaying: true, animationPlaybackLoopSectionId: finiteLoopId, animationPlaybackTagCycleSectionId: finiteLoopId, animationPlaybackLoopIteration: 0 })
    expect(infiniteLoopId).toBeTruthy()
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

  it('retargets tag playback when a mask cell in another loop section is clicked', () => {
    const document = createDocument('tag retarget from mask cell', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 3; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame, thirdFrame, fourthFrame] = timeline.frames
    const layerId = document.layers[0].id
    const firstLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'First', startFrameId: firstFrame.id, endFrameId: secondFrame.id, direction: 'forward', repeatCount: null
    })!
    const secondLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Second', startFrameId: thirdFrame.id, endFrameId: fourthFrame.id, direction: 'forward', repeatCount: null
    })!
    timeline.layerMasks = [firstFrame, thirdFrame].map((frame) => ({
      layerId,
      frameId: frame.id,
      mask: createLayerMask(layerId, document.width, document.height),
    }))

    useWorkspace.getState().setActiveAnimationFrame(firstFrame.id)
    useWorkspace.getState().setAnimationPlaybackMode('tag')
    useWorkspace.getState().setAnimationPlaying(true)
    expect(useWorkspace.getState().sessions[0].animationPlaybackLoopSectionId).toBe(firstLoopId)

    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layerId, thirdFrame.id))

    expect(timeline.activeFrameId).toBe(thirdFrame.id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaying: true,
      animationPlaybackLoopSectionId: secondLoopId,
      animationPlaybackLoopSectionRepeatIndefinitely: true,
      animationPlaybackLoopIteration: 0
    })
  })

  it('preserves the pre-playback frame selection when playback stops', () => {
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
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([firstFrame.id])
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([])
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).not.toContain(thirdFrame.id)
  })

  it('preserves a direct cel selection when playback is paused on another frame', () => {
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
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([animationCelKey(layerId, firstFrame.id)])
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([])
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


describe('workspace ping-pong playback', () => {
  it.each(['ping-pong', 'ping-pong-reverse'] as const)('advances %s and resets its return leg when restarted', (direction) => {
    const document = createDocument('ping-pong', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const ids = timeline.frames.map((frame) => frame.id)
    const sectionId = useWorkspace.getState().createAnimationLoopSection({ name: 'Bounce', startFrameId: ids[0], endFrameId: ids[2], direction, repeatCount: null })!
    useWorkspace.getState().playAnimationLoopSection(sectionId)
    const pass = direction === 'ping-pong' ? [ids[0], ids[1], ids[2], ids[1], ids[0]] : [ids[2], ids[1], ids[0], ids[1], ids[2]]
    const visited = [timeline.activeFrameId]
    for (let i = 0; i < 4; i += 1) { useWorkspace.getState().advanceAnimationFrame(); visited.push(timeline.activeFrameId) }
    expect(visited).toEqual(pass)
    useWorkspace.getState().setAnimationPlaying(false)
    useWorkspace.getState().playAnimationLoopSection(sectionId)
    useWorkspace.getState().advanceAnimationFrame()
    expect(timeline.activeFrameId).toBe(ids[1])
  })
})
