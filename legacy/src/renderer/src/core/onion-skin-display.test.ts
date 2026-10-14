import { describe, expect, it } from 'vitest'
import { createDocument, createLayer } from './document-model'
import { activateAnimationFrame, addBlankAnimationFrame, animationCelAt, ensureAnimationDocument } from './animation'
import { compositeDocument, createCompositePointReplacementSampler, createCompositePointSampler } from './document-composite'
import { createOnionSkinDisplayDocument, onionSkinFrameRefs } from './onion-skin'
import { OnionSkinCompositeCache } from '../components/onion-skin-composite-cache'
import { DEFAULT_ONION_SKIN_PREFERENCES } from './file-preferences'
import { installRuntimeRaster, surfacePixelsMaterialized } from './runtime-raster'

const style = { ...DEFAULT_ONION_SKIN_PREFERENCES, enabled: true,
  previousOpacity: 50, nextOpacity: 50,
  previousColor: { r: 255, g: 0, b: 0, a: 255 }, nextColor: { r: 0, g: 0, b: 255, a: 255 } }
const fixture = () => {
  const document = createDocument('onion over background', 4, 1, 'rgba')
  const background = document.layers[0]
  background.background = { mode: 'canvas', repeatWidth: 4, repeatHeight: 1 }
  const actor = createLayer('actor', 4, 1, 'rgba')
  const foreground = createLayer('fixture foreground', 4, 1, 'rgba')
  document.layers.push(actor, foreground)
  const timeline = ensureAnimationDocument(document)
  addBlankAnimationFrame(document)
  addBlankAnimationFrame(document)
  // Materialize the middle frame first so subsequent writes cannot be overwritten by switching.
  activateAnimationFrame(document, timeline.frames[1].id)
  for (let index = 0; index < 3; index++) {
    const frameId = timeline.frames[index].id
    const backgroundPixels = new Uint8ClampedArray([
      0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255])
    const actorPixels = new Uint8ClampedArray(16)
    actorPixels.set([255, 255, 255, 255], index * 4)
    animationCelAt(timeline, background.id, frameId)!.surface = {
      format: 'rgba', width: 4, height: 1, offsetX: 0, offsetY: 0, pixels: backgroundPixels }
    animationCelAt(timeline, actor.id, frameId)!.surface = {
      format: 'rgba', width: 4, height: 1, offsetX: 0, offsetY: 0, pixels: actorPixels }
    animationCelAt(timeline, foreground.id, frameId)!.surface = {
      format: 'rgba', width: 4, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray(16) }
  }
  Object.assign(background, animationCelAt(timeline, background.id, timeline.activeFrameId)!.surface)
  Object.assign(actor, animationCelAt(timeline, actor.id, timeline.activeFrameId)!.surface)
  const refs = onionSkinFrameRefs(timeline, 1, 1)
  const display = () => createOnionSkinDisplayDocument(document, refs, style, actor.id, 'display')
  return { document, actor, foreground, background, timeline, refs, display }
}

describe('current-layer onion skin display', () => {
  it('reads a sparse neighboring cel without expanding its full pixel storage', () => {
    const { document, actor, timeline } = fixture()
    const previous = animationCelAt(timeline, actor.id, timeline.frames[0].id)!.surface!
    previous.width = 1024
    previous.height = 1024
    const data = new Uint8Array(64 * 64 * 4)
    data.set([255, 255, 255, 255])
    const tileOffsets = new Int32Array(16 * 16)
    tileOffsets[0] = 1
    installRuntimeRaster(previous, { kind: 'sparse-tiles-v1', format: 'rgba', width: 1024, height: 1024, tileSize: 64, data, tileOffsets })
    const display = createOnionSkinDisplayDocument(document, onionSkinFrameRefs(timeline, 1, 0), style, actor.id, 'sparse')
    expect(createCompositePointSampler(display)(0, 0)).toEqual({ r: 128, g: 127, b: 0, a: 255 })
    expect(surfacePixelsMaterialized(previous)).toBe(false)
    expect(actor.blendMode).toBe('normal')
    expect(previous.runtimeRaster?.data).toBe(data)
  })
  it('drops a disabled display cache instead of retaining its source and ghost rasters', () => {
    const { document, actor } = fixture()
    const cache = new OnionSkinCompositeCache()
    const first = cache.displayDocument(document, actor.id, 0, style)
    expect(first).not.toBe(document)
    expect(cache.displayDocument(document, actor.id, 0, { ...style, enabled: false })).toBe(document)
    expect(cache.displayDocument(document, actor.id, 0, style)).not.toBe(first)
  })
  it('shows both ghosts over an opaque background while leaving the current actor and untouched background intact', () => {
    const { display } = fixture()
    expect([...compositeDocument(display())]).toEqual([
      128, 127, 0, 255, 255, 255, 255, 255, 0, 127, 128, 255, 0, 255, 0, 255])
  })
  it('shows all eligible layers while skipping background ghosts and preserving each layer occlusion', () => {
    const { document, actor, foreground } = fixture()
    const timeline = ensureAnimationDocument(document)
    for (const frame of timeline.frames) animationCelAt(timeline, foreground.id, frame.id)!.surface = { format: 'rgba', width: 4, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 30, 255, 0, 0, 0, 0]) }
    Object.assign(foreground, animationCelAt(timeline, foreground.id, timeline.activeFrameId)!.surface)
    const all = createOnionSkinDisplayDocument(document, onionSkinFrameRefs(timeline, 1, 1), { ...style, scope: 'all-layers' }, actor.id, 'all')
    expect(all.layers.filter(layer => layer.id.startsWith('all:')).map(layer => layer.name)).toHaveLength(4)
    expect(all.layers.some(layer => layer.id.includes(`${document.layers[0].id}:`))).toBe(false)
    const actorIndex = all.layers.findIndex(layer => layer.id === actor.id)
    const foregroundIndex = all.layers.findIndex(layer => layer.id === foreground.id)
    expect(all.layers.slice(actorIndex - 2, actorIndex).every(layer => layer.id.startsWith('all:'))).toBe(true)
    expect(all.layers.slice(foregroundIndex - 2, foregroundIndex).every(layer => layer.id.startsWith('all:'))).toBe(true)
    expect([...compositeDocument(all)].slice(8, 12)).toEqual([10, 20, 30, 255])
  })
  it('never inserts display layers or cels into the source document', () => {
    const { document, display } = fixture()
    const before = JSON.stringify(document)
    display()
    expect(JSON.stringify(document)).toBe(before)
    expect([...compositeDocument(document)].slice(0, 4)).toEqual([0, 255, 0, 255])
  })
  it('keeps higher foreground layers above the ghost', () => {
    const { document, display } = fixture()
    const foreground = createLayer('foreground', 4, 1, 'rgba')
    foreground.pixels.set([10, 20, 30, 255])
    document.layers.push(foreground)
    expect([...compositeDocument(display())].slice(0, 4)).toEqual([10, 20, 30, 255])
  })
  it('composites translucent current pixels and eraser replacements against the same ghost backdrop', () => {
    const { actor, display } = fixture()
    const view = display()
    const sample = createCompositePointReplacementSampler(view, actor.id)
    expect(sample(0, 0, { r: 0, g: 0, b: 0, a: 0 })).toEqual({ r: 128, g: 127, b: 0, a: 255 })
    expect(sample(0, 0, { r: 255, g: 255, b: 255, a: 128 })).toEqual({ r: 192, g: 191, b: 128, a: 255 })
    expect(sample(0, 0, { r: 20, g: 30, b: 40, a: 255 })).toEqual({ r: 20, g: 30, b: 40, a: 255 })
  })
  it('applies parent opacity once and respects hidden groups', () => {
    const { document, actor, display } = fixture()
    actor.groupId = 'actors'
    document.groups.push({ id: 'actors', name: 'actors', visible: true, opacity: 0.5, blendMode: 'normal', locked: false })
    expect(createCompositePointSampler(display())(0, 0)).toEqual({ r: 64, g: 191, b: 0, a: 255 })
    document.groups[0].visible = false
    expect(display()).toBe(document)
  })
  it('keeps the underlay beside its actor when the current cel has a z offset', () => {
    const { timeline, actor, display } = fixture()
    animationCelAt(timeline, actor.id, timeline.activeFrameId)!.zIndex = 5
    expect(createCompositePointSampler(display())(0, 0)).toEqual({ r: 128, g: 127, b: 0, a: 255 })
  })
  it('caches display shells and refreshes on layer, style, revision and invalidation changes', () => {
    const { document, actor, background, timeline } = fixture()
    const cache = new OnionSkinCompositeCache()
    const first = cache.displayDocument(document, actor.id, 0, style)
    expect(cache.displayDocument(document, actor.id, 0, style)).toBe(first)
    expect(cache.displayDocument(document, background.id, 0, style)).not.toBe(first)
    const changed = cache.displayDocument(document, actor.id, 1, { ...style, previousOpacity: 25 })
    expect(createCompositePointSampler(changed)(0, 0)).toEqual({ r: 64, g: 191, b: 0, a: 255 })
    cache.invalidateFrames([timeline.frames[0].id])
    expect(cache.displayDocument(document, actor.id, 1, style)).not.toBe(first)
    expect(cache.displayDocument(document, actor.id, 1, { ...style, enabled: false })).toBe(document)
  })
})
