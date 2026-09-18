import { describe, expect, it } from 'vitest'
import { addBlankAnimationFrame, ensureAnimationDocument } from './animation'
import { createDocument } from './document'
import { advanceAnimationLoopSectionPlayback, animationLoopFrameIdsForExport, normalizeAnimationLoopSections, animationLoopSectionAtFrame, stepAnimationLoopSectionFrameId } from './animation-loop-sections'

describe('animation loop section navigation', () => {
  it('wraps manual stepping inside the active loop section', () => {
    const document = createDocument('loop navigation', 1, 1, 'rgba')
    addBlankAnimationFrame(document)
    addBlankAnimationFrame(document)
    addBlankAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    const section = {
      id: 'section',
      name: 'Section',
      startFrameId: timeline.frames[1].id,
      endFrameId: timeline.frames[2].id,
      direction: 'forward' as const,
      repeatCount: null
    }
    timeline.loopSections = [section]

    expect(animationLoopSectionAtFrame(timeline, timeline.frames[1].id)?.id).toBe('section')
    expect(stepAnimationLoopSectionFrameId(timeline, section, timeline.frames[1].id, -1)).toBe(timeline.frames[2].id)
    expect(stepAnimationLoopSectionFrameId(timeline, section, timeline.frames[2].id, 1)).toBe(timeline.frames[1].id)
  })
})

describe('ping-pong loop playback', () => {
  it.each(['ping-pong', 'ping-pong-reverse'] as const)('plays and exports %s without duplicating turning endpoints', (direction) => {
    const frames = ['a', 'b', 'c'].map((id) => ({ id, duration: 100 }))
    const section = { id: 'loop', name: 'Loop', startFrameId: 'a', endFrameId: 'c', direction, repeatCount: 2 }
    const timeline = { frames, loopSections: [section] }
    const pass = direction === 'ping-pong' ? ['a', 'b', 'c', 'b'] : ['c', 'b', 'a', 'b']
    expect(normalizeAnimationLoopSections([section], frames)[0].direction).toBe(direction)
    expect(animationLoopFrameIdsForExport(timeline, 0, 2, 'loop')).toEqual([...pass, ...pass])
    let frameId = pass[0]
    let iterations = 0
    let position: number | undefined
    const visited = [frameId]
    for (let i = 0; i < 8; i += 1) {
      const step = advanceAnimationLoopSectionPlayback(timeline, section, frameId, iterations, position)!
      if (step.completed) { expect(step.completedIterations).toBe(2); break }
      frameId = step.frameId; iterations = step.completedIterations; position = step.position
      visited.push(frameId)
    }
    expect(visited).toEqual([...pass, ...pass])
  })
  it('handles a single playable frame in a ping-pong section', () => {
    const frames = [{ id: 'a', duration: 100 }, { id: 'b', duration: 100, disabled: true }]
    const section = { id: 'loop', name: 'Loop', startFrameId: 'a', endFrameId: 'b', direction: 'ping-pong' as const, repeatCount: 1 }
    expect(advanceAnimationLoopSectionPlayback({ frames }, section, 'a', 0)?.completed).toBe(true)
  })
})
