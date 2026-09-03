import { beforeEach, describe, expect, it } from 'vitest'
import { addBlankAnimationFrame, animationCelAt, animationCelHasContent, animationCelKey, ensureAnimationDocument, linkAnimationFrameCels, resolveAnimationCel } from '@/core/animation'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { useWorkspace } from './workspace'

describe('animation cel deletion', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
  })

  it('deletes only selected linked cels and preserves the surviving link group', () => {
    const document = createDocument('delete one linked cel', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    expect(linkAnimationFrameCels(document, firstFrameId, secondFrameId, [layer.id])).toBe(true)
    expect(linkAnimationFrameCels(document, firstFrameId, thirdFrameId, [layer.id])).toBe(true)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().deleteSelectedAnimationItems()

    let first = animationCelAt(timeline, layer.id, firstFrameId)!
    let second = animationCelAt(timeline, layer.id, secondFrameId)!
    let third = animationCelAt(timeline, layer.id, thirdFrameId)!
    expect(animationCelHasContent(first, document.palette)).toBe(false)
    expect(second.linkedCelId).toBeNull()
    expect(third.linkedCelId).toBe(second.id)
    expect(animationCelHasContent(resolveAnimationCel(timeline, second), document.palette)).toBe(true)
    expect(animationCelHasContent(resolveAnimationCel(timeline, third), document.palette)).toBe(true)

    useWorkspace.getState().undo()
    first = animationCelAt(timeline, layer.id, firstFrameId)!
    second = animationCelAt(timeline, layer.id, secondFrameId)!
    third = animationCelAt(timeline, layer.id, thirdFrameId)!
    expect(animationCelHasContent(first, document.palette)).toBe(true)
    expect(second.linkedCelId).toBe(first.id)
    expect(third.linkedCelId).toBe(first.id)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId))
    useWorkspace.getState().deleteSelectedAnimationItems()
    first = animationCelAt(timeline, layer.id, firstFrameId)!
    second = animationCelAt(timeline, layer.id, secondFrameId)!
    third = animationCelAt(timeline, layer.id, thirdFrameId)!
    expect(animationCelHasContent(second, document.palette)).toBe(false)
    expect(animationCelHasContent(first, document.palette)).toBe(true)
    expect(third.linkedCelId).toBe(first.id)
  })
})
