import { beginPixelEdit, commitPixelEdit, revertPixelEdit } from '@/core/history'
import { deriveCanvasEditTargets } from '@/components/deriveCanvasEditTargets'
import { isToolAvailableForSession } from './workspace-session'
import { selectionTransformLayerForState } from '@/core/selection-transform-targets'
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

  it('deletes only the selected mask cell and restores it on undo', () => {
    const fixture = createMaskedTwoFrameDocument()
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(fixture.layer.id, fixture.firstFrame.id))

    useWorkspace.getState().deleteSelectedAnimationItems()

    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.firstFrame.id)).toBeNull()
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)?.id).toBe(fixture.secondMask.id)
    useWorkspace.getState().undo()
    expectMasksUnchanged(fixture)
  })

  it('deletes every mask cell when the mask row is selected and restores them on undo', () => {
    const fixture = createMaskedTwoFrameDocument()
    useWorkspace.getState().selectAnimationMaskRow('layer', fixture.layer.id)

    useWorkspace.getState().deleteSelectedAnimationItems()

    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.firstFrame.id)).toBeNull()
    expect(animationMaskAt(fixture.timeline, fixture.layer.id, fixture.secondFrame.id)).toBeNull()
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


describe('mask selection and adjustment editing', () => {
  it('keeps the mask selected through marquee commit, foreground fill and undo', () => {
    const fixture = createMaskedTwoFrameDocument()
    const state = useWorkspace.getState()
    state.selectLayerMask(animationCelAt(fixture.timeline, fixture.layer.id, fixture.firstFrame.id)!.id)
    state.commitSelectionChange(null, { x: 0, y: 0, width: 1, height: 1 }, 'selection', { resetTimelineSelection: true })
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBe(fixture.firstMask.id)
    state.setPrimaryColor({ r: 128, g: 128, b: 128, a: 255 })
    state.fillForeground()
    expect(Array.from(fixture.firstMask.pixels)).toEqual([128, 128, 128, 255])
    expect(Array.from(fixture.layer.pixels)).toEqual([255, 0, 0, 255])
    state.undo()
    expect(Array.from(fixture.firstMask.pixels)).toEqual([32, 32, 32, 255])
    state.redo()
    expect(Array.from(fixture.firstMask.pixels)).toEqual([128, 128, 128, 255])
  })

  it('captures, previews, commits and undoes adjustment on the mask only', () => {
    const fixture = createMaskedTwoFrameDocument()
    const state = useWorkspace.getState()
    state.selectLayerMask(animationCelAt(fixture.timeline, fixture.layer.id, fixture.firstFrame.id)!.id)
    const baseline = state.captureActiveLayerAdjustmentSnapshot()!
    expect(baseline.layers.map(layer => layer.layerId)).toEqual([fixture.firstMask.id])
    const adjustment = { kind: 'brightness-contrast' as const, brightness: 30, contrast: 0 }
    state.previewActiveLayerAdjustment(adjustment, baseline)
    expect(fixture.firstMask.pixels[0]).toBeGreaterThan(32)
    state.applyActiveLayerAdjustmentFromSnapshot(adjustment, baseline)
    const adjusted = Array.from(fixture.firstMask.pixels)
    state.undo()
    expect(Array.from(fixture.firstMask.pixels)).toEqual([32, 32, 32, 255])
    state.redo()
    expect(Array.from(fixture.firstMask.pixels)).toEqual(adjusted)
    expect(Array.from(fixture.layer.pixels)).toEqual([255, 0, 0, 255])
    expect(Array.from(fixture.secondMask.pixels)).toEqual([224, 224, 224, 255])
  })
})


it('resolves mask selection transforms and allows mask tools despite owner/timeline selection', () => {
  const fixture = createMaskedTwoFrameDocument()
  useWorkspace.getState().selectLayerMask(animationCelAt(fixture.timeline, fixture.layer.id, fixture.firstFrame.id)!.id)
  const session = useWorkspace.getState().sessions[0]
  session.selectedGroupIds = ['owner-group']
  session.selectedAnimationFrameIds = [fixture.firstFrame.id]
  expect(isToolAvailableForSession(session, 'selection')).toBe(true)
  expect(isToolAvailableForSession(session, 'fill')).toBe(true)
  const targets = deriveCanvasEditTargets({ session, selectedFreeTileSelectionTarget: () => null })
  expect(targets.selectionLayersEditable).toBe(true)
  expect(targets.activeLayer).toBe(fixture.firstMask)
  expect(selectionTransformLayerForState(fixture.document, { layerId: fixture.firstMask.id, frameId: fixture.firstFrame.id })).toBe(fixture.firstMask)
})


it('restores mask offsets on cancel, undo and redo without moving its owner', () => {
  const fixture = createMaskedTwoFrameDocument()
  const edit = beginPixelEdit(fixture.firstMask.id)
  edit.frameId = fixture.firstFrame.id
  edit.layerOffset = { beforeX: 0, beforeY: 0, afterX: 2, afterY: 3 }
  fixture.firstMask.offsetX = 2
  fixture.firstMask.offsetY = 3
  const entry = commitPixelEdit(fixture.document, edit, 'move mask')!
  expect(entry).not.toBeNull()
  entry.undo()
  expect([fixture.firstMask.offsetX, fixture.firstMask.offsetY]).toEqual([0, 0])
  entry.redo()
  expect([fixture.firstMask.offsetX, fixture.firstMask.offsetY]).toEqual([2, 3])
  revertPixelEdit(fixture.document, edit)
  expect([fixture.firstMask.offsetX, fixture.firstMask.offsetY]).toEqual([0, 0])
  expect([fixture.layer.offsetX, fixture.layer.offsetY]).toEqual([0, 0])
})
