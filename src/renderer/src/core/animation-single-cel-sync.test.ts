import {afterEach, expect, it, vi} from 'vitest'
import {createDocument, createLayer} from './document-model'
import {activateAnimationFrame, animationCelAt, createAnimationCelLookup, ensureAnimationDocument, resolveAnimationCel, syncActiveAnimationLayer} from './animation'
import {beginPixelEdit, recordPixel} from './history'
import {useWorkspace} from '@/store/workspace'
import {readSurfacePackedLocal} from './runtime-raster'

afterEach(() => {vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null})})

function fixture(layers = 42, frames = 297) {
  const document = createDocument('single cel sync', 2, 2, 'rgba')
  document.layers.push(...Array.from({length: layers - 1}, () => createLayer('layer', 2, 2, 'rgba')))
  document.animation!.frames = Array.from({length: frames}, (_, i) => ({id: `f${i}`, duration: 100}))
  ensureAnimationDocument(document)
  const timeline = document.animation!, layer = document.layers[0]
  const source = animationCelAt(timeline, layer.id, 'f0')!
  const target = animationCelAt(timeline, layer.id, 'f50')!
  target.linkedCelId = source.id
  activateAnimationFrame(document, 'f50', false, false)
  resolveAnimationCel(timeline, target)
  return {document, timeline, layer, source, target}
}

it.each([[42, 297], [100, 1000]])('does not rebuild full cel maps for repeated linked pixel sync (%i layers, %i frames)', (layers, frames) => {
  const {document, timeline, layer, source, target} = fixture(layers, frames)
  const map = vi.spyOn(timeline.cels, 'map')
  // The old single-layer path rebuilt a slot map and an ID map each time.
  for (let i = 0; i < 20; i++) expect(createAnimationCelLookup(timeline).resolve(target)).toBe(source)
  const before = map.mock.calls.length
  map.mockClear()
  for (let i = 0; i < 20; i++) {
    recordPixel(document, layer, beginPixelEdit(layer.id), 0, 0xff000040 + i)
    syncActiveAnimationLayer(document, layer.id)
    expect(readSurfacePackedLocal(source.surface!, 0, 0)).toBe(0xff000040 + i)
    expect(target.surface).toBe(source.surface)
  }
  expect(before).toBe(40)
  expect(map).not.toHaveBeenCalled()
  process.stdout.write(JSON.stringify({layers,frames,cels:timeline.cels.length,updates:20,fullMapBuilds:{before,after:map.mock.calls.length}})+'\n')
})

it('follows current links and preserves cyclic, missing and cross-layer fallback semantics', () => {
  const {document, timeline, layer, source, target} = fixture()
  const replacement = animationCelAt(timeline, layer.id, 'f1')!
  target.linkedCelId = replacement.id
  recordPixel(document, layer, beginPixelEdit(layer.id), 0, 0xff123456)
  syncActiveAnimationLayer(document, layer.id)
  expect(readSurfacePackedLocal(replacement.surface!, 0, 0)).toBe(0xff123456)
  expect(target.surface).toBe(replacement.surface)
  for (const link of ['missing', animationCelAt(timeline, document.layers[1].id, 'f0')!.id, source.id]) {
    target.linkedCelId = link
    source.linkedCelId = link === source.id ? target.id : null
    syncActiveAnimationLayer(document, layer.id)
    expect(resolveAnimationCel(timeline, target)).toBe(target)
    expect(readSurfacePackedLocal(target.surface!, 0, 0)).toBe(0xff123456)
  }
})

it('keeps linked stroke pixels correct through store commit, undo and redo', () => {
  const {document, layer} = fixture()
  useWorkspace.getState().addSession(document)
  const read = () => readSurfacePackedLocal(resolveAnimationCel(document.animation!, animationCelAt(document.animation!, layer.id, 'f50'))!.surface!, 0, 0)
  const original = read()
  const edit = beginPixelEdit(layer.id)
  recordPixel(document, layer, edit, 0, 0xffabcdef)
  expect(useWorkspace.getState().commitPixelEdit(edit, 'linked stroke')).toBeTruthy()
  expect(read()).toBe(0xffabcdef)
  useWorkspace.getState().undo()
  expect(read()).toBe(original)
  useWorkspace.getState().redo()
  expect(read()).toBe(0xffabcdef)
})
