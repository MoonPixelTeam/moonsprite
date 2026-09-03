import { beforeEach, describe, expect, it } from 'vitest'
import { addBlankAnimationFrame, animationCelAt, animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { animationMaskAt, createDocument, createLayer, createLayerMask, getActiveLayer } from '@/core/document'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, saveProgress: null, dialog: null })
})

const createMaskedTwoFrameDocument = () => {
  const document = createDocument('independent masks', 1, 1, 'rgba')
  const layer = getActiveLayer(document)
  layer.pixels.set([255, 0, 0, 255])
  const timeline = ensureAnimationDocument(document)
  const firstFrame = timeline.frames[0]
  const secondFrameId = addBlankAnimationFrame(document)
  const secondFrame = timeline.frames.find((frame) => frame.id === secondFrameId)!
  const firstCel = animationCelAt(timeline, layer.id, firstFrame.id)!
  const secondCel = animationCelAt(timeline, layer.id, secondFrame.id)!
  firstCel.surface!.pixels.set([255, 0, 0, 255])
  secondCel.surface!.pixels.set([0, 0, 255, 255])
  const firstMask = createLayerMask(layer.id, 1, 1)
  const secondMask = createLayerMask(layer.id, 1, 1)
  firstMask.pixels.set([32, 32, 32, 255])
  secondMask.pixels.set([224, 224, 224, 255])
  timeline.layerMasks = [
    { layerId: layer.id, frameId: firstFrame.id, mask: firstMask },
    { layerId: layer.id, frameId: secondFrame.id, mask: secondMask }
  ]
  useWorkspace.getState().addSession(document)
  return { document, layer, timeline, firstFrame, secondFrame, firstMask, secondMask }
}

const expectMasksUnchanged = (fixture: ReturnType<typeof createMaskedTwoFrameDocument>) => {
  const { timeline, layer, firstFrame, secondFrame, firstMask, secondMask } = fixture
  expect(animationMaskAt(timeline, layer.id, firstFrame.id)?.id).toBe(firstMask.id)
  expect(animationMaskAt(timeline, layer.id, secondFrame.id)?.id).toBe(secondMask.id)
  expect(Array.from(animationMaskAt(timeline, layer.id, firstFrame.id)!.pixels)).toEqual([32, 32, 32, 255])
  expect(Array.from(animationMaskAt(timeline, layer.id, secondFrame.id)!.pixels)).toEqual([224, 224, 224, 255])
}

describe('independent animation layer masks', () => {
  it('links selected mask cells and preserves the link through undo and redo', () => {
    const fixture = createMaskedTwoFrameDocument()
    const firstKey = animationCelKey(fixture.layer.id, fixture.firstFrame.id)
    const secondKey = animationCelKey(fixture.layer.id, fixture.secondFrame.id)
    useWorkspace.getState().selectAnimationMaskCell(firstKey)
    useWorkspace.getState().selectAnimationMaskCell(secondKey, 'toggle')

    useWorkspace.getState().connectSelectedAnimationMasks()

    expect(fixture.secondMask.linkedMaskId).toBe(fixture.firstMask.id)
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)?.id).toBe(fixture.firstMask.id)

    useWorkspace.getState().undo()
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)?.id).toBe(fixture.secondMask.id)

    useWorkspace.getState().redo()
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)?.id).toBe(fixture.firstMask.id)
  })

  it('does not move or overwrite masks when ordinary cels move, undo, or redo', () => {
    const fixture = createMaskedTwoFrameDocument()
    const sourceKey = animationCelKey(fixture.layer.id, fixture.firstFrame.id)
    useWorkspace.getState().selectAnimationCell(sourceKey)
    useWorkspace.getState().moveSelectedAnimationCels(fixture.layer.id, fixture.secondFrame.id, sourceKey)
    expectMasksUnchanged(fixture)

    useWorkspace.getState().undo()
    expectMasksUnchanged(fixture)
    useWorkspace.getState().redo()
    expectMasksUnchanged(fixture)
  })

  it('does not overwrite a destination mask when ordinary cel content is pasted', () => {
    const fixture = createMaskedTwoFrameDocument()
    const sourceKey = animationCelKey(fixture.layer.id, fixture.firstFrame.id)
    const targetKey = animationCelKey(fixture.layer.id, fixture.secondFrame.id)
    useWorkspace.getState().selectAnimationCell(sourceKey)
    useWorkspace.getState().copySelectedAnimationCels()
    useWorkspace.getState().selectAnimationCell(targetKey)
    useWorkspace.getState().pasteAnimationCels()
    expectMasksUnchanged(fixture)
  })

  it('keeps the mask when ordinary cel content is deleted', () => {
    const fixture = createMaskedTwoFrameDocument()
    useWorkspace.getState().selectAnimationCell(animationCelKey(fixture.layer.id, fixture.firstFrame.id))
    useWorkspace.getState().deleteSelectedAnimationItems()
    expectMasksUnchanged(fixture)
    useWorkspace.getState().undo()
    expectMasksUnchanged(fixture)
  })

  it('restores every layer mask when a masked layer deletion is undone', () => {
    const fixture = createMaskedTwoFrameDocument()
    fixture.document.layers.push(createLayer('Surviving layer', 1, 1, 'rgba'))
    useWorkspace.getState().selectLayer(fixture.layer.id)

    useWorkspace.getState().deleteSelectedLayers()
    expect(fixture.document.layers.some((layer) => layer.id === fixture.layer.id)).toBe(false)
    expect(fixture.timeline.layerMasks?.some((entry) => entry.layerId === fixture.layer.id)).toBe(false)

    useWorkspace.getState().undo()
    expect(fixture.document.layers.some((layer) => layer.id === fixture.layer.id)).toBe(true)
    expectMasksUnchanged(fixture)

    useWorkspace.getState().redo()
    expect(fixture.document.layers.some((layer) => layer.id === fixture.layer.id)).toBe(false)
    expect(fixture.timeline.layerMasks?.some((entry) => entry.layerId === fixture.layer.id)).toBe(false)
  })

  it('restores the deleted frame layer mask on undo', () => {
    const fixture = createMaskedTwoFrameDocument()
    useWorkspace.getState().selectAnimationFrame(fixture.secondFrame.id)

    useWorkspace.getState().deleteAnimationFrame()
    expect(fixture.timeline.frames.some((frame) => frame.id === fixture.secondFrame.id)).toBe(false)
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)).toBeNull()

    useWorkspace.getState().undo()
    expect(fixture.timeline.frames.some((frame) => frame.id === fixture.secondFrame.id)).toBe(true)
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)?.id).toBe(fixture.secondMask.id)
    expect(Array.from(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)!.pixels)).toEqual([224, 224, 224, 255])
  })
})
