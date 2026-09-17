import { beforeEach, expect, it } from 'vitest'
import { createDocument, createLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, animationLayerAtFrame, ensureAnimationDocument, setAnimationFrameDuration, syncActiveAnimationFrame } from '@/core/animation'
import { exportAnimationGif } from '@/core/gif'
import { decodeGifAnimation } from '@/core/gif-import'
import { relativeLuminanceColor } from '@/core/raster'
import { applySelectionTransform, captureSelectionTransform } from '@/core/tools'
import { useWorkspace } from './workspace'

beforeEach(() => useWorkspace.setState({ sessions: [], activeId: null, message: null }))

function gifSource() {
  const source = createDocument('external', 1, 1, 'rgba')
  writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  setAnimationFrameDuration(source, source.animation!.activeFrameId, 40)
  addBlankAnimationFrame(source)
  writeLayerColor(source, source.layers[0], 0, { r: 0, g: 0, b: 255, a: 255 })
  setAnimationFrameDuration(source, source.animation!.activeFrameId, 120)
  return decodeGifAnimation(exportAnimationGif(source, { scalePercent: 100, direction: 'forward' }).bytes, 'external')
}

it.each([0, 1, 3])('imports GIF at index %s without leaking into existing frames, and undoes/redoes cleanly', (start) => {
  const document = createDocument('multilayer animation', 2, 2, 'rgba')
  document.layers.push(createLayer('second', 2, 2, 'rgba'))
  ensureAnimationDocument(document)
  for (let frame = 0; frame < 3; frame++) {
    if (frame) addBlankAnimationFrame(document)
    for (const [index, layer] of document.layers.entries()) writeLayerColor(document, layer, 0, { r: 30 + frame * 20, g: index * 80, b: 40, a: 255 })
  }
  syncActiveAnimationFrame(document)
  activateAnimationFrame(document, document.animation!.frames[1].id)
  useWorkspace.getState().addSession(document)
  const timeline = document.animation!
  const oldFrames = timeline.frames.map(frame => ({ ...frame }))
  const snapshotCels = (cels: typeof timeline.cels) => JSON.parse(JSON.stringify(cels))
  const oldCels = snapshotCels(timeline.cels)
  const oldLayerIds = document.layers.map(layer => layer.id)
  const source = gifSource()
  expect(useWorkspace.getState().importGifAnimationLayer(source, start)).toBe(true)
  const newLayer = document.layers.at(-1)!
  const inserted = timeline.frames.slice(start, start + 2)
  expect(inserted.map(frame => frame.duration)).toEqual([40, 120])
  expect(timeline.frames.filter(frame => oldFrames.some(old => old.id === frame.id))).toEqual(oldFrames)
  const verify = () => {
    expect(snapshotCels(timeline.cels.filter(cel => oldLayerIds.includes(cel.layerId) && oldFrames.some(frame => frame.id === cel.frameId)))).toEqual(oldCels)
    for (const frame of oldFrames) expect(Array.from(animationCelAt(timeline, newLayer.id, frame.id)!.surface!.pixels).every(value => value === 0)).toBe(true)
    for (let index = 0; index < 2; index++) {
      expect(animationCelAt(timeline, newLayer.id, inserted[index].id)!.surface!.pixels).toEqual(source.animation!.cels[index].surface!.pixels)
      for (const layerId of oldLayerIds) expect(Array.from(animationCelAt(timeline, layerId, inserted[index].id)!.surface!.pixels).every(value => value === 0)).toBe(true)
    }
  }
  verify()
  useWorkspace.getState().undo()
  expect(document.layers.map(layer => layer.id)).toEqual(oldLayerIds)
  expect(document.animation!.frames).toEqual(oldFrames)
  expect(snapshotCels(document.animation!.cels)).toEqual(oldCels)
  useWorkspace.getState().redo()
  verify()
})

it('converts imported GIF colors to the destination grayscale mode', () => {
  const document = createDocument('grayscale', 2, 2, 'grayscale')
  document.layers.push(createLayer('second', 2, 2, 'grayscale'))
  addBlankAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  expect(useWorkspace.getState().importGifAnimationLayer(gifSource(), 1)).toBe(true)
  const timeline = document.animation!
  const imported = animationCelAt(timeline, document.layers.at(-1)!.id, timeline.frames[1].id)!
  const gray = relativeLuminanceColor({ r: 255, g: 0, b: 0, a: 255 })
  expect(Array.from(imported.surface!.pixels)).toEqual([gray.r, gray.g, gray.b, 255])
})

it.each([false, true])('settles a floating selection on its original frame before importing GIF (deferred=%s)', (deferred) => {
  const document = createDocument('floating before GIF', 2, 1, 'rgba')
  const layer = document.layers[0]
  addBlankAnimationFrame(document)
  const originalFrameId = document.animation!.activeFrameId
  const red = { r: 255, g: 0, b: 0, a: 255 }
  writeLayerColor(document, layer, 0, red)
  useWorkspace.getState().addSession(document)
  const before = { x: 0, y: 0, width: 1, height: 1 }
  const target = { ...before, x: 1 }
  const source = captureSelectionTransform(document, before, layer)!
  const edit = deferred ? null : applySelectionTransform(document, source, target)
  useWorkspace.getState().beginFloatingSelectionTransform(source, edit, before, target, false, 'move', null, target, 0, undefined, deferred)
  expect(useWorkspace.getState().importGifAnimationLayer(gifSource(), 1)).toBe(true)
  expect(useWorkspace.getState().sessions[0].pendingPaste).toBeNull()
  const original = animationLayerAtFrame(document, layer.id, originalFrameId)!
  const transparent = { r: 0, g: 0, b: 0, a: 0 }
  expect(readLayerColorAt(document, original, 0, 0)).toEqual(transparent)
  expect(readLayerColorAt(document, original, 1, 0)).toEqual(red)
  useWorkspace.getState().undo()
  expect(document.animation!.activeFrameId).toBe(originalFrameId)
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
  expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
  expect(readLayerColorAt(document, layer, 1, 0)).toEqual(transparent)
})
