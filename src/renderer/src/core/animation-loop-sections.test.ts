import { describe, expect, it } from 'vitest'
import { addBlankAnimationFrame, ensureAnimationDocument } from './animation'
import { createDocument } from './document'
import { animationLoopSectionAtFrame, stepAnimationLoopSectionFrameId } from './animation-loop-sections'

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
