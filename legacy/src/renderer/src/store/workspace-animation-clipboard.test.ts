import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { addBlankAnimationFrame, animationCelAt, animationCelHasContent, animationCelKey, connectAnimationCels, ensureAnimationDocument } from '@/core/animation'
import { createDocument, getActiveLayer, writeLayerColor } from '@/core/document'
import { cutWorkspaceItems } from './workspace-cut'
import { clipboardService } from './clipboard-service'
import { useWorkspace } from './workspace'
import { refreshActiveAnimationFrame } from '@/core/animation'

describe('animation clipboard shortcuts', () => {
  it.each([
    { cut: false, subset: false, cross: false, clip: false },
    { cut: false, subset: true, cross: false, clip: false },
    { cut: true, subset: false, cross: false, clip: false },
    { cut: false, subset: true, cross: true, clip: false },
    { cut: true, subset: true, cross: true, clip: true }
  ])('preserves clipboard links and history: %j', ({ cut, subset, cross, clip }) => {
    const document = createDocument('linked clipboard', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const layer = document.layers[0]
    const frames = [timeline.activeFrameId, addBlankAnimationFrame(document), addBlankAnimationFrame(document), addBlankAnimationFrame(document)]
    const originals = frames.slice(0, 3).map(frame => animationCelAt(timeline, layer.id, frame)!)
    originals[0].surface!.pixels.set([255, 0, 0, 255])
    refreshActiveAnimationFrame(document)
    connectAnimationCels(document, originals.map(cel => cel.id))
    useWorkspace.getState().addSession(document)
    const copied = subset ? frames.slice(1, 3) : frames.slice(0, 3)
    const keys = copied.map(frame => animationCelKey(layer.id, frame))
    useWorkspace.getState().selectAnimationCell(keys[0], 'replace', keys)
    if (clip) useWorkspace.getState().setSelection({x: 0, y: 0, width: 1, height: 1})
    if (cut) cutWorkspaceItems('cels')
    else useWorkspace.getState().copySelectedAnimationCels()
    const target = cross ? createDocument('paste target', 1, 1, 'rgba') : document
    if (cross) useWorkspace.getState().addSession(target)
    else useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, frames[3]))
    useWorkspace.getState().pasteAnimationCels()
    const pastedTimeline = ensureAnimationDocument(target)
    const pastedFrames = pastedTimeline.frames.slice(cross ? 0 : 3)
    const checkLinks = () => {
      const pasted = pastedFrames.map(frame => animationCelAt(pastedTimeline, target.activeLayerId, frame.id)!)
      expect(pasted).toHaveLength(copied.length)
      expect(pasted[0].linkedCelId ?? null).toBeNull()
      for (const cel of pasted) expect(Array.from(cel.surface!.pixels)).toEqual([255, 0, 0, 255])
      for (const cel of pasted.slice(1)) expect(cel.linkedCelId ?? null).toBe(clip ? null : pasted[0].id)
      expect(originals.map(cel => cel.id)).not.toContain(pasted[0].id)
    }
    checkLinks()
    if (clip) useWorkspace.getState().commitFloatingPaste()
    useWorkspace.getState().undo()
    expect(pastedTimeline.frames).toHaveLength(cross ? 1 : 4)
    useWorkspace.getState().redo()
    checkLinks()
  })

  it('copies the canvas selection across multiple cels into another document', async () => {
    const source = createDocument('selected source', 4, 1, 'rgba')
    const layer = getActiveLayer(source)
    const timeline = ensureAnimationDocument(source)
    const first = timeline.activeFrameId
    const second = addBlankAnimationFrame(source)
    for (const frame of [first, second]) {
      animationCelAt(timeline, layer.id, frame)!.surface = { format: 'rgba', width: 4, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 0, 255]) }
    }
    refreshActiveAnimationFrame(source)
    useWorkspace.getState().addSession(source)
    useWorkspace.getState().setSelection({ x: 1, y: 0, width: 2, height: 1 })
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, first))
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, second), 'toggle')
    useWorkspace.getState().copySelectedAnimationCels()
    const target = createDocument('selected target', 4, 1, 'rgba')
    useWorkspace.getState().addSession(target)
    useWorkspace.getState().pasteAnimationCels()
    const pasted = ensureAnimationDocument(target)
    expect(pasted.frames).toHaveLength(2)
    for (const frame of pasted.frames) {
      const surface = animationCelAt(pasted, target.activeLayerId, frame.id)!.surface!
      expect(surface).toMatchObject({ width: 4, height: 1, offsetX: 0, offsetY: 0 })
      expect(Array.from(surface.pixels)).toEqual([0, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 0, 0, 0, 0])
    }
    expect(animationCelAt(timeline, layer.id, first)!.surface!.width).toBe(4)
  })
  beforeEach(() => {
    localStorage.clear()
    clipboardService.clearLayer()
    clipboardService.clearSelection()
    useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
    Object.defineProperty(window, 'moonSprite', {
      configurable: true,
      value: { readClipboardImage: vi.fn().mockResolvedValue(null) } as unknown as MoonSpriteApi
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'moonSprite')
  })

  it('pastes a copied cel into the selected cel target through the unified paste command', async () => {
    const document = createDocument('copy and paste cel', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().copySelectedAnimationCels()
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId))
    await useWorkspace.getState().pasteClipboard()

    expect(animationCelHasContent(animationCelAt(timeline, layer.id, secondFrameId), document.palette)).toBe(true)
  })

  it('pastes copied frames after the selected frame through the unified paste command', async () => {
    const document = createDocument('copy and paste frame', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().copySelectedAnimationFrames()
    useWorkspace.getState().selectAnimationFrame(secondFrameId)
    await useWorkspace.getState().pasteClipboard()

    expect(timeline.frames).toHaveLength(3)
    const pastedFrameId = timeline.activeFrameId
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationFrameIds).toEqual([])
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationCellKeys).toEqual([animationCelKey(layer.id, pastedFrameId)])
    expect(animationCelHasContent(animationCelAt(timeline, layer.id, pastedFrameId), document.palette)).toBe(true)
  })

  it('pastes every selected cel, appends missing frames, and keeps the pasted cells selected', async () => {
    const document = createDocument('copy and paste multiple cels', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    animationCelAt(timeline, layer.id, firstFrameId)!.surface!.pixels.set([255, 0, 0, 255])
    animationCelAt(timeline, layer.id, secondFrameId)!.surface!.pixels.set([0, 0, 255, 255])
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId), 'toggle')
    useWorkspace.getState().copySelectedAnimationCels()
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, thirdFrameId))
    await useWorkspace.getState().pasteClipboard()

    expect(timeline.frames).toHaveLength(4)
    const appendedFrameId = timeline.frames[3]!.id
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationCellKeys).toEqual([
      animationCelKey(layer.id, thirdFrameId),
      animationCelKey(layer.id, appendedFrameId)
    ])
    expect(animationCelHasContent(animationCelAt(timeline, layer.id, thirdFrameId), document.palette)).toBe(true)
    expect(animationCelHasContent(animationCelAt(timeline, layer.id, appendedFrameId), document.palette)).toBe(true)
    expect(Array.from(animationCelAt(timeline, layer.id, thirdFrameId)!.surface!.pixels)).toEqual([255, 0, 0, 255])
    expect(Array.from(animationCelAt(timeline, layer.id, appendedFrameId)!.surface!.pixels)).toEqual([0, 0, 255, 255])
  })

  it('pastes every selected frame and keeps all inserted frames selected', async () => {
    const document = createDocument('copy and paste multiple frames', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    animationCelAt(timeline, layer.id, firstFrameId)!.surface!.pixels.set([255, 0, 0, 255])
    animationCelAt(timeline, layer.id, secondFrameId)!.surface!.pixels.set([0, 0, 255, 255])
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().selectAnimationFrame(secondFrameId, 'range')
    useWorkspace.getState().copySelectedAnimationFrames()
    useWorkspace.getState().selectAnimationFrame(thirdFrameId)
    await useWorkspace.getState().pasteClipboard()

    expect(timeline.frames).toHaveLength(5)
    const insertedFrameIds = timeline.frames.slice(3).map((frame) => frame.id)
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationFrameIds).toEqual(insertedFrameIds)
    expect(insertedFrameIds).toHaveLength(2)
    expect(animationCelHasContent(animationCelAt(timeline, layer.id, insertedFrameIds[0]!), document.palette)).toBe(true)
    expect(animationCelHasContent(animationCelAt(timeline, layer.id, insertedFrameIds[1]!), document.palette)).toBe(true)
  })

  it('disables selected frames through history and preserves that state when pasted', () => {
    const document = createDocument('disabled frame clipboard', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().selectAnimationFrame(secondFrameId, 'range')

    useWorkspace.getState().setSelectedAnimationFramesDisabled(true)
    expect(timeline.frames.every((frame) => frame.disabled === true)).toBe(true)
    useWorkspace.getState().undo()
    expect(timeline.frames.every((frame) => frame.disabled !== true)).toBe(true)
    useWorkspace.getState().redo()
    useWorkspace.getState().copySelectedAnimationFrames()
    useWorkspace.getState().pasteAnimationFrames()

    expect(timeline.frames.slice(-2).every((frame) => frame.disabled === true)).toBe(true)
    useWorkspace.getState().setAnimationPlaying(true)
    expect(useWorkspace.getState().sessions[0]!.animationPlaying).toBe(false)
  })

  it('toggles each selected frame enabled state independently', () => {
    const document = createDocument('toggle disabled frames', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    timeline.frames[0]!.disabled = true
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().selectAnimationFrame(secondFrameId, 'range')

    useWorkspace.getState().toggleSelectedAnimationFramesDisabled()

    expect(timeline.frames.map((frame) => frame.disabled === true)).toEqual([false, true])
    useWorkspace.getState().undo()
    expect(timeline.frames.map((frame) => frame.disabled === true)).toEqual([true, false])
  })

  it('overwrites existing destination cels instead of changing their linked source', async () => {
    const document = createDocument('overwrite multiple cels', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    const fourthFrameId = addBlankAnimationFrame(document)
    const firstCel = animationCelAt(timeline, layer.id, firstFrameId)!
    const secondCel = animationCelAt(timeline, layer.id, secondFrameId)!
    const thirdCel = animationCelAt(timeline, layer.id, thirdFrameId)!
    const fourthCel = animationCelAt(timeline, layer.id, fourthFrameId)!
    firstCel.surface!.pixels.set([255, 0, 0, 255])
    secondCel.surface!.pixels.set([0, 0, 255, 255])
    thirdCel.surface!.pixels.set([0, 255, 0, 255])
    fourthCel.surface!.pixels.set([0, 255, 0, 255])
    connectAnimationCels(document, [thirdCel.id, fourthCel.id])
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId), 'toggle')
    useWorkspace.getState().copySelectedAnimationCels()
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, thirdFrameId))
    await useWorkspace.getState().pasteClipboard()

    expect(Array.from(thirdCel.surface!.pixels)).toEqual([255, 0, 0, 255])
    expect(Array.from(fourthCel.surface!.pixels)).toEqual([0, 0, 255, 255])
    expect(thirdCel.linkedCelId).toBeNull()
    expect(fourthCel.linkedCelId).toBeNull()
    useWorkspace.getState().undo()
    expect(animationCelAt(timeline, layer.id, fourthFrameId)!.linkedCelId).toBe(thirdCel.id)
    expect(Array.from(animationCelAt(timeline, layer.id, thirdFrameId)!.surface!.pixels)).toEqual([0, 255, 0, 255])
    useWorkspace.getState().redo()
    expect(animationCelAt(timeline, layer.id, fourthFrameId)!.linkedCelId).toBeNull()
  })
})
