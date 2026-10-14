import { beforeEach, expect, it } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from '@/core/document'
import { animationCelAt, animationCelKey, ensureAnimationDocument, resolveAnimationCel } from '@/core/animation'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})

it.each([false, true])('reuses the right frame and overwrites its cel (occupied=%s)', occupied => {
  const document = createDocument('linked cel', 2, 2, 'rgba')
  const layer = document.layers[0]
  const other = createLayer('other', 2, 2, 'rgba')
  document.layers.push(other)
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  useWorkspace.getState().addSession(document)
  const timeline = ensureAnimationDocument(document)
  const sourceFrame = timeline.activeFrameId
  useWorkspace.getState().addAnimationFrame()
  const targetFrame = timeline.activeFrameId
  if (occupied) writeLayerColor(document, layer, 0, { r: 0, g: 0, b: 255, a: 255 })
  useWorkspace.getState().setActiveAnimationFrame(sourceFrame)
  const previous = animationCelAt(timeline, layer.id, targetFrame)!.surface!.pixels.slice()
  useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, sourceFrame))
  useWorkspace.getState().addLinkedAnimationFrame()
  expect(timeline.frames.map(frame => frame.id)).toEqual([sourceFrame, targetFrame])
  expect(timeline.activeFrameId).toBe(targetFrame)
  expect(animationCelAt(timeline, layer.id, targetFrame)!.linkedCelId).toBe(animationCelAt(timeline, layer.id, sourceFrame)!.id)
  expect(animationCelAt(timeline, other.id, targetFrame)!.linkedCelId).toBeFalsy()
  useWorkspace.getState().undo()
  expect(animationCelAt(timeline, layer.id, targetFrame)!.surface!.pixels).toEqual(previous)
  expect(timeline.frames).toHaveLength(2)
  useWorkspace.getState().redo()
  expect(resolveAnimationCel(timeline, animationCelAt(timeline, layer.id, targetFrame)!)!.id).toBe(animationCelAt(timeline, layer.id, sourceFrame)!.id)
})

it('appends a frame only at the end and links only the active layer by default', () => {
  const document = createDocument('append linked cel', 2, 2, 'rgba')
  const layer = document.layers[0]
  document.layers.push(createLayer('other', 2, 2, 'rgba'))
  for (const candidate of document.layers) writeLayerColor(document, candidate, 0, { r: 255, g: 0, b: 0, a: 255 })
  useWorkspace.getState().addSession(document)
  const timeline = ensureAnimationDocument(document)
  const source = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
  useWorkspace.getState().addLinkedAnimationFrame()
  expect(timeline.frames).toHaveLength(2)
  expect(animationCelAt(timeline, layer.id, timeline.activeFrameId)!.linkedCelId).toBe(source.id)
  expect(animationCelAt(timeline, document.layers[1].id, timeline.activeFrameId)!.linkedCelId).toBeFalsy()
  useWorkspace.getState().undo()
  expect(timeline.frames).toHaveLength(1)
  useWorkspace.getState().redo()
  expect(timeline.frames).toHaveLength(2)
})
