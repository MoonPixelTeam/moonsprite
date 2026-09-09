import { describe, expect, it } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, animationCelContentSelection, animationCelHasContent, animationCelKey, animationCelOffsetsForKeys, connectAnimationCels, createAnimationCelLookup, createDefaultAnimationTimeline, deleteAnimationFrame, disconnectAnimationCels, duplicateAnimationFrame, ensureAnimationDocument, firstPlayableAnimationFrameId, inheritAnimationFrameCelLinks, linkAnimationFrameCels, nextAnimationFrameId, normalizeAnimationTimeline, resizeAnimationCelsAt, resolveAnimationCel, setAnimationCelOffsets, setAnimationCelOffsetsForKeys, stepAnimationFrameId, syncActiveAnimationFrame, syncActiveAnimationLayer, syncActiveAnimationLayers } from './animation'
import { animationMaskAt, animationMaskSlotAt, compositeDocument, createDocument, createLayer, createLayerMask, ensureLayerCoversCanvas, getActiveLayer, resizeDocumentAt, writeLayerColor } from './document'
import { beginPixelEdit, commitPixelEdit, HistoryStack, recordPixel } from './history'

describe('animation timeline boundary', () => {
  it('creates the first layer cel together with a new document', () => {
    const document = createDocument('initial cel', 2, 2, 'rgba')
    const timeline = document.animation!
    const cel = timeline.cels.find((candidate) => candidate.layerId === document.activeLayerId && candidate.frameId === timeline.activeFrameId)

    expect(cel).toBeDefined()
    expect(cel?.surface?.pixels).toBe(getActiveLayer(document).pixels)
    expect(cel?.surface).toMatchObject({ width: 2, height: 2, offsetX: 0, offsetY: 0 })
  })

  it('distinguishes transparent cels from cels with visible pixels', () => {
    const document = createDocument('cel content', 2, 2, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === document.activeLayerId && candidate.frameId === timeline.activeFrameId)!
    expect(animationCelHasContent(cel)).toBe(false)
    cel.surface!.pixels[3] = 255
    expect(animationCelHasContent(cel)).toBe(true)
  })

  it('shares z coordinates across linked cels and retains them when unlinked', () => {
    const document = createDocument('linked cel z', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    writeLayerColor(document, document.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
    const secondFrameId = addBlankAnimationFrame(document)
    const first = animationCelAt(timeline, document.activeLayerId, firstFrameId)!
    const second = animationCelAt(timeline, document.activeLayerId, secondFrameId)!
    first.zIndex = 12

    expect(connectAnimationCels(document, [first.id, second.id])).toBe(true)
    expect(second.zIndex).toBe(12)
    expect(disconnectAnimationCels(document, [second.id])).toBe(true)
    expect(second.linkedCelId).toBeNull()
    expect(second.zIndex).toBe(12)
  })





  it('leaves a new target frame unlinked when the source cel is transparent', () => {
    const document = createDocument('linked empty cel', 1, 1, 'rgba')
    const firstFrame = ensureAnimationDocument(document).activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    const first = animationCelAt(timeline, document.activeLayerId, firstFrame)!
    const second = animationCelAt(timeline, document.activeLayerId, secondFrame)!

    expect(linkAnimationFrameCels(document, firstFrame, secondFrame, [document.activeLayerId])).toBe(false)
    expect(second.linkedCelId).toBeUndefined()
    expect(resolveAnimationCel(timeline, second)).toBe(second)
    expect(second.surface).not.toBe(first.surface)
  })

  it('inherits links only for opted-in layers when adding and duplicating frames', () => {
    const document = createDocument('automatic frame links', 1, 1, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 1, 1, 'rgba')
    document.layers.push(secondLayer)
    firstLayer.autoLinkAnimationCels = true
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const firstCel = animationCelAt(timeline, firstLayer.id, firstFrame)!
    firstCel.surface!.pixels[3] = 255
    linkAnimationFrameCels(document, firstFrame, secondFrame, [firstLayer.id])

    const thirdFrame = addBlankAnimationFrame(document)
    const thirdFirst = animationCelAt(timeline, firstLayer.id, thirdFrame)!
    const thirdSecond = animationCelAt(timeline, secondLayer.id, thirdFrame)!
    expect(thirdFirst.linkedCelId).toBe(firstCel.id)
    expect(thirdFirst.surface).toBe(firstCel.surface)
    expect(thirdSecond.linkedCelId).toBeUndefined()

    const fourthFrame = duplicateAnimationFrame(document)
    const fourthFirst = animationCelAt(timeline, firstLayer.id, fourthFrame)!
    expect(fourthFirst.linkedCelId).toBe(firstCel.id)
    expect(fourthFirst.surface).toBe(firstCel.surface)
  })

  it('inherits a visible independent previous cel for opted-in layers', () => {
    const document = createDocument('automatic frame link opt in', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.autoLinkAnimationCels = true
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const first = animationCelAt(timeline, layer.id, firstFrame)!
    first.surface!.pixels[3] = 255
    const secondFrame = addBlankAnimationFrame(document)
    const second = animationCelAt(timeline, layer.id, secondFrame)!
    expect(second.linkedCelId).toBe(first.id)
    expect(second.surface).toBe(first.surface)
  })

  it('keeps the canonical source through consecutive additions and duplication', () => {
    const document = createDocument('automatic consecutive frame links', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.autoLinkAnimationCels = true
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const first = animationCelAt(timeline, layer.id, firstFrame)!
    first.surface!.pixels[3] = 255

    const secondFrame = addBlankAnimationFrame(document)
    const second = animationCelAt(timeline, layer.id, secondFrame)!
    expect(second.linkedCelId).toBe(first.id)

    const thirdFrame = addBlankAnimationFrame(document)
    const third = animationCelAt(timeline, layer.id, thirdFrame)!
    expect(third.linkedCelId).toBe(first.id)

    const fourthFrame = duplicateAnimationFrame(document)
    const fourth = animationCelAt(timeline, layer.id, fourthFrame)!
    expect(fourth.linkedCelId).toBe(first.id)
  })

  it('keeps an empty independent previous cel unlinked', () => {
    const document = createDocument('automatic empty frame link opt in', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.autoLinkAnimationCels = true
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const second = animationCelAt(timeline, layer.id, secondFrame)!
    expect(inheritAnimationFrameCelLinks(document, firstFrame, secondFrame, [layer.id])).toBe(false)
    expect(second.linkedCelId).toBeUndefined()
  })

  it('inherits an existing link even when the resolved source is transparent', () => {
    const document = createDocument('automatic transparent link', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.autoLinkAnimationCels = true
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const second = animationCelAt(timeline, layer.id, secondFrame)!
    second.linkedCelId = animationCelAt(timeline, layer.id, firstFrame)!.id
    const thirdFrame = addBlankAnimationFrame(document)
    const third = animationCelAt(timeline, layer.id, thirdFrame)!
    expect(third.linkedCelId).toBe(second.linkedCelId)
  })


  it('inherits opted-in layer-mask links across consecutive blank frame additions', () => {
    const document = createDocument('automatic mask links', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const sourceFrame = timeline.activeFrameId
    const sourceMask = createLayerMask(layer.id, 1, 1)
    sourceMask.autoLinkAnimationCels = true
    timeline.layerMasks!.push({ layerId: layer.id, frameId: sourceFrame, mask: sourceMask })

    const linkedFrame = addBlankAnimationFrame(document)
    const linkedMask = animationMaskSlotAt(timeline, layer.id, linkedFrame)
    expect(linkedMask?.linkedMaskId).toBe(sourceMask.id)
    expect(linkedMask?.autoLinkAnimationCels).toBe(true)

    const nextLinkedFrame = addBlankAnimationFrame(document)
    const nextLinkedMask = animationMaskSlotAt(timeline, layer.id, nextLinkedFrame)
    expect(nextLinkedMask?.linkedMaskId).toBe(sourceMask.id)
    expect(nextLinkedMask?.autoLinkAnimationCels).toBe(true)

    const optedOutDocument = createDocument('manual mask links', 1, 1, 'rgba')
    const optedOutLayer = getActiveLayer(optedOutDocument)
    const optedOutTimeline = ensureAnimationDocument(optedOutDocument)
    const optedOutMask = createLayerMask(optedOutLayer.id, 1, 1)
    optedOutTimeline.layerMasks!.push({ layerId: optedOutLayer.id, frameId: optedOutTimeline.activeFrameId, mask: optedOutMask })
    const independentFrame = addBlankAnimationFrame(optedOutDocument)
    expect(animationMaskSlotAt(optedOutTimeline, optedOutLayer.id, independentFrame)).toBeNull()
  })

  it('keeps cel opacity independent per frame when activating frames', () => {
    const document = createDocument('cel opacity', 1, 1, 'rgba')
    const first = ensureAnimationDocument(document)
    const firstCel = first.cels.find((cel) => cel.frameId === first.activeFrameId && cel.layerId === document.activeLayerId)!
    firstCel.opacity = 0.25
    document.layers[0].opacity = 0.25
    const secondId = addBlankAnimationFrame(document)
    const secondCel = ensureAnimationDocument(document).cels.find((cel) => cel.frameId === secondId && cel.layerId === document.activeLayerId)!
    secondCel.opacity = 0.8
    document.layers[0].opacity = 0.8
    activateAnimationFrame(document, 'frame-1')
    expect(document.layers[0].opacity).toBeCloseTo(0.25)
    activateAnimationFrame(document, secondId)
    expect(document.layers[0].opacity).toBeCloseTo(0.8)
  })
  it('creates an independent cel for every layer and frame', () => {
    const document = createDocument('animation', 2, 2, 'rgba')
    getActiveLayer(document).pixels[3] = 255
    ensureAnimationDocument(document)
    const secondFrame = addBlankAnimationFrame(document)
    expect(getActiveLayer(document).pixels[3]).toBe(0)
    ensureLayerCoversCanvas(document, getActiveLayer(document))
    getActiveLayer(document).pixels[7] = 255
    syncActiveAnimationFrame(document)
    expect(activateAnimationFrame(document, 'frame-1')).toBe(true)
    expect(getActiveLayer(document).pixels[3]).toBe(255)
    expect(getActiveLayer(document).pixels[7]).toBe(0)
    expect(activateAnimationFrame(document, secondFrame)).toBe(true)
    expect(getActiveLayer(document).pixels[3]).toBe(0)
    expect(getActiveLayer(document).pixels[7]).toBe(255)
  })

  it('clears the displayed layer when switching to a sparse empty frame without materializing a cel', () => {
    const document = createDocument('sparse empty frame display', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    layer.pixels.set([20, 40, 60, 255])
    syncActiveAnimationFrame(document)

    const secondFrame = addBlankAnimationFrame(document)
    const celsBefore = timeline.cels.length
    timeline.cels = timeline.cels.filter((cel) => cel.frameId !== secondFrame)

    expect(activateAnimationFrame(document, firstFrame, false)).toBe(true)
    expect(Array.from(compositeDocument(document))).toEqual([20, 40, 60, 255])
    expect(activateAnimationFrame(document, secondFrame, false)).toBe(true)
    expect(timeline.cels).toHaveLength(celsBefore - 1)
    expect(Array.from(layer.pixels)).toEqual([0, 0, 0, 0])
    expect(Array.from(compositeDocument(document))).toEqual([0, 0, 0, 0])
  })



  it('links selected cels per layer and shares the foremost non-empty surface', () => {
    const document = createDocument('linked cels', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    const firstFrame = ensureAnimationDocument(document).activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const thirdFrame = addBlankAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    const first = animationCelAt(timeline, layer.id, firstFrame)!
    const second = animationCelAt(timeline, layer.id, secondFrame)!
    const third = animationCelAt(timeline, layer.id, thirdFrame)!
    first.surface!.pixels[3] = 255

    expect(connectAnimationCels(document, [third.id, second.id, first.id])).toBe(true)
    expect(second.linkedCelId).toBe(first.id)
    expect(third.linkedCelId).toBe(first.id)
    expect(second.surface).toBe(first.surface)
    expect(third.surface).toBe(first.surface)

    activateAnimationFrame(document, thirdFrame)
    getActiveLayer(document).pixels[0] = 73
    syncActiveAnimationFrame(document)
    activateAnimationFrame(document, firstFrame)
    expect(getActiveLayer(document).pixels[0]).toBe(73)
  })



  it('disconnects selected linked cels into independent surfaces', () => {
    const document = createDocument('disconnect linked cels', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const firstFrame = ensureAnimationDocument(document).activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    const first = animationCelAt(timeline, layer.id, firstFrame)!
    const second = animationCelAt(timeline, layer.id, secondFrame)!
    first.surface!.pixels.set([20, 40, 60, 255])
    connectAnimationCels(document, [first.id, second.id])

    expect(disconnectAnimationCels(document, [second.id])).toBe(true)
    expect(second.linkedCelId).toBeNull()
    expect(second.surface).not.toBe(first.surface)
    second.surface!.pixels[0] = 200
    expect(first.surface!.pixels[0]).toBe(20)
  })

  it('keeps at least one frame and advances according to loop mode', () => {
    const document = createDocument('animation', 1, 1, 'rgba')
    const second = addBlankAnimationFrame(document)
    const timeline = ensureAnimationDocument(document)
    expect(nextAnimationFrameId(timeline, second)).toBe('frame-1')
    timeline.loop = false
    expect(nextAnimationFrameId(timeline, second)).toBe(second)
    expect(deleteAnimationFrame(document, second)).toBe(true)
    expect(deleteAnimationFrame(document, 'frame-1')).toBe(false)
    expect(timeline.frames).toHaveLength(1)
  })

  it('normalizes disabled frames and skips them during playback', () => {
    const timeline = normalizeAnimationTimeline({
      frames: [
        { id: 'first', duration: 100 },
        { id: 'second', duration: 100, disabled: true },
        { id: 'third', duration: 100 }
      ],
      cels: [],
      activeFrameId: 'first',
      loop: true
    })

    expect(timeline.frames[1]?.disabled).toBe(true)
    expect(nextAnimationFrameId(timeline, 'first')).toBe('third')
    expect(nextAnimationFrameId(timeline, 'third')).toBe('first')
    timeline.frames[0]!.disabled = true
    timeline.frames[2]!.disabled = true
    expect(firstPlayableAnimationFrameId(timeline)).toBeNull()
    expect(nextAnimationFrameId(timeline, 'second')).toBeNull()
  })

  it('skips disabled frames when stepping in either direction', () => {
    const timeline = normalizeAnimationTimeline({
      frames: [
        { id: 'first', duration: 100 },
        { id: 'second', duration: 100, disabled: true },
        { id: 'third', duration: 100 },
        { id: 'fourth', duration: 100, disabled: true }
      ],
      cels: [],
      activeFrameId: 'first',
      loop: true
    })

    expect(stepAnimationFrameId(timeline, 'first', 1)).toBe('third')
    expect(stepAnimationFrameId(timeline, 'third', -1)).toBe('first')
    expect(stepAnimationFrameId(timeline, 'second', 1)).toBe('third')
    timeline.frames[0]!.disabled = true
    timeline.frames[2]!.disabled = true
    expect(stepAnimationFrameId(timeline, 'first', 1)).toBeNull()
  })

  it('undoes a pixel edit in its original frame after switching frames', () => {
    const document = createDocument('animation', 1, 1, 'rgba')
    ensureAnimationDocument(document)
    const edit = beginPixelEdit(document.activeLayerId)
    recordPixel(document, getActiveLayer(document), edit, 0, 0xff)
    const history = new HistoryStack()
    history.push(commitPixelEdit(document, edit, 'draw')!)
    const second = addBlankAnimationFrame(document)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second)
    history.undo()
    expect(getActiveLayer(document).pixels[0]).toBe(0)
    activateAnimationFrame(document, 'frame-1')
    expect(getActiveLayer(document).pixels[0]).toBe(0)
  })

  it('updates cel offsets in the operation frame without moving the active frame', () => {
    const document = createDocument('frame-scoped offsets', 2, 2, 'rgba')
    const firstFrame = ensureAnimationDocument(document).activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const layerId = document.activeLayerId

    getActiveLayer(document).offsetX = 7
    getActiveLayer(document).offsetY = 9
    syncActiveAnimationFrame(document)
    setAnimationCelOffsets(document, firstFrame, { [layerId]: { x: 3, y: 4 } })

    expect(ensureAnimationDocument(document).activeFrameId).toBe(secondFrame)
    expect(getActiveLayer(document)).toMatchObject({ offsetX: 7, offsetY: 9 })
    activateAnimationFrame(document, firstFrame)
    expect(getActiveLayer(document)).toMatchObject({ offsetX: 3, offsetY: 4 })
  })

  it('moves selected cel surfaces across different layers and frames as one offset set', () => {
    const document = createDocument('multi cel offsets', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(secondLayer)
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const keys = [animationCelKey(firstLayer.id, firstFrame), animationCelKey(secondLayer.id, secondFrame)]
    const before = animationCelOffsetsForKeys(document, keys)

    setAnimationCelOffsetsForKeys(document, Object.fromEntries(keys.map((key) => [key, { x: before[key].x + 5, y: before[key].y - 3 }])))

    expect(animationCelAt(timeline, firstLayer.id, firstFrame)?.surface).toMatchObject({ offsetX: 5, offsetY: -3 })
    expect(animationCelAt(timeline, secondLayer.id, secondFrame)?.surface).toMatchObject({ offsetX: 5, offsetY: -3 })
    expect(animationCelAt(timeline, secondLayer.id, firstFrame)?.surface).toMatchObject({ offsetX: 0, offsetY: 0 })
    expect(animationCelAt(timeline, firstLayer.id, secondFrame)?.surface).toMatchObject({ offsetX: 0, offsetY: 0 })
  })



  it('tiles background pixels on active and inactive animation frames when the canvas expands', () => {
    const document = createDocument('animated background resize', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.background = { mode: 'canvas' }
    const firstFrame = ensureAnimationDocument(document).activeFrameId
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(document, layer, 1, { r: 0, g: 0, b: 255, a: 255 })
    syncActiveAnimationFrame(document)
    const secondFrame = addBlankAnimationFrame(document)
    ensureLayerCoversCanvas(document, layer)
    writeLayerColor(document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
    writeLayerColor(document, layer, 1, { r: 255, g: 255, b: 0, a: 255 })
    syncActiveAnimationFrame(document)
    activateAnimationFrame(document, firstFrame)

    const resized = resizeDocumentAt(document, 5, 1, 1, 0)
    resizeAnimationCelsAt(document, resized.offsetX, resized.offsetY, false, 2, 1)

    expect(Array.from(getActiveLayer(document).pixels.filter((_, index) => index % 4 === 0))).toEqual([0, 255, 0, 255, 0])
    activateAnimationFrame(document, secondFrame)
    expect(Array.from(getActiveLayer(document).pixels.filter((_, index) => index % 4 === 0))).toEqual([255, 0, 255, 0, 255])
    expect(Array.from(getActiveLayer(document).pixels.filter((_, index) => index % 4 === 1))).toEqual([255, 255, 255, 255, 255])
  })
})
