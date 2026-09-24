import { describe, expect, it } from 'vitest'
import { createDocument, writeLayerColor, readLayerColor, createLayer, createLayerMask, expandLayerToRect, readLayerColorAt } from './document-model'
import { addBlankAnimationFrame, animationCelAt, syncActiveAnimationFrame, activateAnimationFrame, linkAnimationFrameCels } from './animation'
import { DEFAULT_ANIMATION_TWEEN, animationBetweenFrame, animationTweenPreviewBounds, animationTweenSource, animationTweenSourceFrameId, prepareAnimationTween, tweenTranslation, validateAnimationTween, tweenProgress, tweenSurface } from './animation-tween'
import { crossfadeTweenSurface } from './animation-crossfade'
import { decodeProject, encodeProject } from './project-format'
import { useWorkspace } from '@/store/workspace'

function fixture(mode: 'rgba' | 'indexed' = 'rgba') {
  const document = createDocument('tween', 8, 8, mode, false)
  const layer = document.layers[0]
  writeLayerColor(document, layer, 9, { r: 255, g: 0, b: 0, a: 255 })
  writeLayerColor(document, layer, 10, { r: 0, g: 0, b: 255, a: 255 })
  syncActiveAnimationFrame(document)
  return { document, layer, frameId: document.animation!.activeFrameId }
}

function loopFixture(mode: 'rgba' | 'indexed' = 'rgba') {
  const result = fixture(mode)
  const { document, layer, frameId } = result
  const timeline = document.animation!
  const original = animationCelAt(timeline, layer.id, frameId)!
  const surface = mode === 'rgba'
    ? { format: 'rgba' as const, width: 2, height: 1, offsetX: 5, offsetY: 1, pixels: new Uint8ClampedArray([0, 255, 0, 255, 0, 255, 0, 255]) }
    : { format: 'indexed' as const, width: 2, height: 1, offsetX: 5, offsetY: 1, pixels: new Uint32Array([Number((original.surface!.pixels as Uint32Array)[9]), Number((original.surface!.pixels as Uint32Array)[9])]) }
  timeline.frames.push({ id: 'pose-two', duration: 250 }, { id: 'disabled', duration: 100, disabled: true }, { id: 'later', duration: 100 })
  timeline.cels.push({ id: 'pose-two-cel', layerId: layer.id, frameId: 'pose-two', surface, opacity: 0.8 })
  timeline.loopSections = [{ id: 'walk', name: 'Walk', startFrameId: frameId, endFrameId: 'disabled', direction: 'forward', repeatCount: 2 }]
  return result
}

describe('baked animation tween', () => {
  it.each([[16, 12], [-16, -12]])('auto-fits all generated frames with offset %s,%s and restores canvas and pixels in one undo', (offsetX, offsetY) => {
    const { document, layer, frameId } = fixture()
    useWorkspace.setState({ sessions: [], activeId: null })
    useWorkspace.getState().addSession(document)
    const content = (bytes: Uint8Array) => {
      const restored = decodeProject(bytes)
      return { width: restored.width, height: restored.height, layers: restored.layers, animation: restored.animation, groups: restored.groups, slices: restored.slices }
    }
    const original = encodeProject(document)
    const options = { ...DEFAULT_ANIMATION_TWEEN, frameCount: 3, offsetX, offsetY, autoCropCanvas: true }
    const expected = prepareAnimationTween(document, frameId, layer.id, options).canvasBounds!
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, options)).toBe(true)
    expect(document.width).toBe(expected.width)
    expect(document.height).toBe(expected.height)
    for (const cel of document.animation!.cels) {
      const surface = cel.surface
      if (!surface) continue
      expect(surface.offsetX).toBeGreaterThanOrEqual(0)
      expect(surface.offsetY).toBeGreaterThanOrEqual(0)
      expect(surface.offsetX + surface.width).toBeLessThanOrEqual(document.width)
      expect(surface.offsetY + surface.height).toBeLessThanOrEqual(document.height)
    }
    const generated = encodeProject(document)
    useWorkspace.getState().undo()
    expect(content(encodeProject(document))).toEqual(content(original))
    useWorkspace.getState().redo()
    expect(content(encodeProject(document))).toEqual(content(generated))
  })

  it('keeps the canvas unchanged when auto-fit is off and rejects oversized auto-fit before insertion', () => {
    const { document, layer, frameId } = fixture()
    useWorkspace.setState({ sessions: [], activeId: null })
    useWorkspace.getState().addSession(document)
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, { ...DEFAULT_ANIMATION_TWEEN, frameCount: 2 })).toBe(true)
    expect([document.width, document.height]).toEqual([8, 8])
    const before = encodeProject(document)
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, { ...DEFAULT_ANIMATION_TWEEN, frameCount: 2, autoCropCanvas: true, offsetX: 16000, offsetY: 16000 })).toBe(false)
    expect(encodeProject(document)).toEqual(before)
  })
  it('crossfades different content between existing frames, matches preview and preserves endpoints through undo and save', () => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
    const { document, layer, frameId } = fixture()
    const next = addBlankAnimationFrame(document)
    expandLayerToRect(document.layers[0], 1, 1, 2, 2)
    writeLayerColor(document, document.layers[0], 0, { r: 0, g: 255, b: 0, a: 255 })
    syncActiveAnimationFrame(document)
    const endpoints = JSON.stringify(document.animation!.cels)
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'between' as const, betweenMode: 'crossfade' as const, frameCount: 1 }
    const plan = animationTweenSource(document, frameId, layer.id, options)
    const preview = animationBetweenFrame(document, layer.id, plan, options, 0.5)
    const prepared = prepareAnimationTween(document, frameId, layer.id, options)
    expect(prepared.cels[0].surface).toEqual(preview.surface)
    expect(Array.from(preview.surface.pixels)).toEqual([128, 128, 0, 255, 0, 0, 255, 128])
    expect(animationTweenPreviewBounds(document, layer.id, plan, options)).toEqual({ x: 1, y: 1, width: 2, height: 1 })
    useWorkspace.getState().addSession(document)
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, options)).toBe(true)
    const timeline = document.animation!
    expect(timeline.frames.map((frame) => frame.id)).toEqual([frameId, expect.any(String), next])
    expect(JSON.stringify(timeline.cels.filter((cel) => cel.frameId === frameId || cel.frameId === next))).toBe(endpoints)
    expect(timeline.loopSections![0]).toMatchObject({ startFrameId: frameId, endFrameId: next })
    const saved = decodeProject(encodeProject(document))
    expect(saved.animation!.frames).toEqual(timeline.frames)
    expect(readLayerColorAt(saved, saved.layers[0], 1, 1)).toEqual({ r: 128, g: 128, b: 0, a: 255 })
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    useWorkspace.getState().undo()
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual([frameId, next])
    expect(JSON.stringify(document.animation!.cels)).toBe(endpoints)
    useWorkspace.getState().redo()
    expect(document.animation!.frames).toHaveLength(3)
    expect(readLayerColorAt(document, document.layers[0], 1, 1)).toEqual({ r: 128, g: 128, b: 0, a: 255 })
  })

  it('fades in from a missing cel and rejects a missing next frame without changes', () => {
    const { document, layer, frameId } = fixture()
    const next = addBlankAnimationFrame(document)
    document.animation!.cels = document.animation!.cels.filter((cel) => cel.frameId !== frameId)
    writeLayerColor(document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
    syncActiveAnimationFrame(document)
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'between' as const, betweenMode: 'crossfade' as const, frameCount: 1 }
    const result = prepareAnimationTween(document, frameId, layer.id, options)
    expect(Array.from(result.cels[0].surface!.pixels)).toEqual([0, 255, 0, 128])
    expect(() => prepareAnimationTween(document, next, layer.id, options)).toThrow()
    expect(document.animation!.frames).toHaveLength(2)
  })

  it('blends alpha and cel opacity without dark fringes, respects offsets and limits allocation', () => {
    const a = { format: 'rgba' as const, width: 1, height: 1, offsetX: -2, offsetY: 3, pixels: new Uint8ClampedArray([255, 0, 0, 255]) }
    const b = { ...a, pixels: new Uint8ClampedArray([0, 0, 255, 255]) }
    const bounds = { x: -2, y: 3, width: 1, height: 1 }
    const result = crossfadeTweenSurface(a, b, bounds, 'rgba', 0.5, 0.25, 0.75, 1)
    expect(result.opacity).toBe(0.5)
    expect(Array.from(result.surface.pixels)).toEqual([64, 0, 191, 255])
    expect(crossfadeTweenSurface(a, b, bounds, 'rgba', 0, 1, 1, 1).surface.pixels).toEqual(a.pixels)
    expect(crossfadeTweenSurface(a, b, bounds, 'rgba', 1, 1, 1, 1).surface.pixels).toEqual(b.pixels)
    expect(() => crossfadeTweenSurface(a, b, bounds, 'rgba', 0.5, 1, 1, 0)).toThrow()
  })

  it('dissolves indexed pixels using original palette IDs and independent surfaces', () => {
    const a = { format: 'indexed' as const, width: 4, height: 4, offsetX: 0, offsetY: 0, pixels: new Uint32Array(16).fill(3) }
    const b = { ...a, pixels: new Uint32Array(16).fill(7) }
    const result = crossfadeTweenSurface(a, b, { x: 0, y: 0, width: 4, height: 4 }, 'indexed', 0.5, 1, 1, 16)
    expect(Array.from(result.surface.pixels).filter((id) => id === 3)).toHaveLength(8)
    expect(Array.from(result.surface.pixels).filter((id) => id === 7)).toHaveLength(8)
    expect(result.surface.pixels).not.toBe(a.pixels)
    expect(result.surface.pixels).not.toBe(b.pixels)
  })

  it.each(['rgba', 'indexed'] as const)('cycles %s poses with a shared pivot and matches the preview source sequence', (mode) => {
    const { document, layer, frameId } = loopFixture(mode)
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'loop' as const, loopSectionId: 'walk', frameCount: 4, offsetX: 8, opacity: 50 }
    const source = animationTweenSource(document, frameId, layer.id, options)
    expect(source.pivot).toEqual({ x: 1, y: 1, width: 6, height: 1 })
    expect([1, 2, 3, 4].map((step) => animationTweenSourceFrameId(source, options, step))).toEqual([frameId, 'pose-two', frameId, 'pose-two'])
    const generated = prepareAnimationTween(document, frameId, layer.id, options)
    expect(generated.insertionFrameId).toBe('disabled')
    expect(generated.cels.map((cel) => cel.surface!.offsetX)).toEqual([3, 9, 7, 13])
    generated.cels.forEach((cel, index) => expect(cel.opacity).toBeCloseTo([0.875, 0.6, 0.625, 0.4][index]))
    expect(generated.frames.map((frame) => frame.duration)).toEqual([100, 100, 100, 100])
    expect(generated.cels[0].surface!.pixels).not.toBe(generated.cels[2].surface!.pixels)
    const scaled = prepareAnimationTween(document, frameId, layer.id, { ...options, frameCount: 2, offsetX: 0, scale: 200 })
    expect(scaled.cels[1].surface).toMatchObject({ offsetX: 6, width: 4 })
  })

  it('honors reverse order, preserves blank poses and copies each pose’s linked layers and masks', () => {
    const { document, layer, frameId } = loopFixture()
    const timeline = document.animation!
    timeline.frames.splice(1, 0, { id: 'blank', duration: 100 })
    timeline.loopSections![0].direction = 'reverse'
    const other = createLayer('other', 8, 8, 'rgba')
    document.layers.push(other)
    const original = animationCelAt(timeline, layer.id, frameId)!
    timeline.cels.push({ ...original, id: 'other-source', layerId: other.id })
    timeline.cels.push({ id: 'other-link', layerId: other.id, frameId: 'pose-two', linkedCelId: 'other-source' })
    const mask = createLayerMask(layer.id, 2, 1)
    mask.offsetX = 5
    mask.offsetY = 1
    timeline.layerMasks = [{ layerId: layer.id, frameId: 'pose-two', mask }]
    const generated = prepareAnimationTween(document, frameId, layer.id, { ...DEFAULT_ANIMATION_TWEEN, scope: 'loop', loopSectionId: 'walk', frameCount: 3, offsetX: 6 })
    const targetCels = generated.cels.filter((cel) => cel.layerId === layer.id)
    expect(targetCels.map((cel) => cel.surface!.offsetX)).toEqual([7, 7])
    expect(generated.cels.some((cel) => cel.frameId === generated.frames[1].id)).toBe(false)
    expect(generated.layerMasks[0].mask.offsetX).toBe(7)
    expect(generated.layerMasks[0].mask.pixels).not.toBe(mask.pixels)
    const otherCopy = generated.cels.find((cel) => cel.layerId === other.id)!
    expect(otherCopy.linkedCelId).toBeNull()
    expect(otherCopy.surface!.pixels).toEqual(original.surface!.pixels)
    expect(otherCopy.surface!.pixels).not.toBe(original.surface!.pixels)
  })

  it('inserts after a loop without changing its bounds and restores everything in one undo/redo', () => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
    const { document, layer, frameId } = loopFixture()
    useWorkspace.getState().addSession(document)
    const beforeFrames = document.animation!.frames.map((frame) => frame.id)
    const beforeSections = structuredClone(document.animation!.loopSections)
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, { ...DEFAULT_ANIMATION_TWEEN, scope: 'loop', loopSectionId: 'walk', frameCount: 4 })).toBe(true)
    const afterFrames = document.animation!.frames.map((frame) => frame.id)
    expect(afterFrames.slice(0, 3)).toEqual(beforeFrames.slice(0, 3))
    expect(afterFrames.at(-1)).toBe('later')
    expect(afterFrames).toHaveLength(8)
    const afterSections = structuredClone(document.animation!.loopSections)
    expect(afterSections).toHaveLength(2)
    expect(afterSections![0]).toEqual(beforeSections![0])
    expect(afterSections![1]).toMatchObject({ startFrameId: afterFrames[3], endFrameId: afterFrames[6], direction: 'forward', repeatCount: null })
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    const reopened = decodeProject(encodeProject(document))
    expect(reopened.animation!.frames.map((frame) => frame.id)).toEqual(afterFrames)
    expect(reopened.animation!.loopSections).toEqual(afterSections)
    useWorkspace.getState().undo()
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual(beforeFrames)
    expect(document.animation!.loopSections).toEqual(beforeSections)
    useWorkspace.getState().redo()
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual(afterFrames)
    expect(document.animation!.loopSections).toEqual(afterSections)
  })

  it('rejects missing or unplayable loops without writing document history', () => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
    const { document, layer, frameId } = loopFixture()
    useWorkspace.getState().addSession(document)
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'loop' as const, loopSectionId: 'missing' }
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, options)).toBe(false)
    document.animation!.frames.forEach((frame) => { frame.disabled = true })
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, { ...options, loopSectionId: 'walk' })).toBe(false)
    expect(document.animation!.frames).toHaveLength(4)
    expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
  })

  it.each(['rgba', 'indexed'] as const)('creates independent %s cels with position and opacity endpoints', (mode) => {
    const { document, layer, frameId } = fixture(mode)
    const before = document.animation!.frames.length
    const generated = prepareAnimationTween(document, frameId, layer.id, { ...DEFAULT_ANIMATION_TWEEN, frameCount: 2, offsetX: 8, opacity: 0 })
    expect(document.animation!.frames).toHaveLength(before)
    expect(generated.cels.map((cel) => cel.surface!.offsetX)).toEqual([5, 9])
    expect(generated.cels.map((cel) => cel.opacity)).toEqual([0.5, 0])
    expect(generated.cels.every((cel) => cel.linkedCelId === null && cel.surface!.format === mode)).toBe(true)
    const first = generated.cels[0].surface!, second = generated.cels[1].surface!
    expect(first.pixels).not.toBe(second.pixels)
    expect(first.pixels).toEqual(second.pixels)
  })

  it('rotates exact quarter turns and scales from the original pixels', () => {
    const source = { format: 'indexed' as const, width: 2, height: 2, offsetX: 0, offsetY: 0, pixels: new Uint32Array([1, 2, 3, 4]) }
    const pivot = { x: 0, y: 0, width: 2, height: 2 }
    const rotated = tweenSurface(source, pivot, { ...DEFAULT_ANIMATION_TWEEN, offsetX: 0, rotation: 90 }, 1)
    expect(Array.from(rotated.pixels)).toEqual([3, 1, 4, 2])
    const scaled = tweenSurface(source, pivot, { ...DEFAULT_ANIMATION_TWEEN, offsetX: 0, scale: 200 }, 1)
    expect(scaled).toMatchObject({ width: 4, height: 4, offsetX: -1, offsetY: -1 })
    expect(Array.from(scaled.pixels)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4])
    expect(Array.from(source.pixels)).toEqual([1, 2, 3, 4])
  })

  it('provides monotonic easing with exact endpoints', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      expect(tweenProgress(0, easing)).toBe(0)
      expect(tweenProgress(1, easing)).toBe(1)
      for (let index = 1; index <= 20; index++) expect(tweenProgress(index / 20, easing)).toBeGreaterThan(tweenProgress((index - 1) / 20, easing))
    }
    expect(tweenProgress(0.5, 'ease-in')).toBe(0.25)
    expect(tweenProgress(0.5, 'ease-out')).toBe(0.75)
  })

  it('resolves linked sources and gives generated masks independent transformed pixels', () => {
    const { document, layer, frameId } = fixture()
    const linkedFrame = addBlankAnimationFrame(document)
    linkAnimationFrameCels(document, frameId, linkedFrame, [layer.id])
    const mask = createLayerMask(layer.id, 2, 1)
    mask.offsetX = 1
    mask.offsetY = 1
    document.animation!.layerMasks = [{ layerId: layer.id, frameId: linkedFrame, mask }]
    const result = prepareAnimationTween(document, linkedFrame, layer.id, { ...DEFAULT_ANIMATION_TWEEN, frameCount: 2, offsetX: 4 })
    expect(result.cels[1].surface).toMatchObject({ width: 2, height: 1, offsetX: 5, offsetY: 1 })
    expect(result.layerMasks.map((entry) => entry.mask.offsetX)).toEqual([3, 5])
    expect(result.layerMasks[0].mask.pixels).not.toBe(mask.pixels)
    expect(result.layerMasks[0].mask.pixels).not.toBe(result.layerMasks[1].mask.pixels)
    expect(result.layerMasks.every((entry) => !entry.mask.linkedMaskId)).toBe(true)
    expect(mask.offsetX).toBe(1)
  })

  it('rejects invalid input before inserting frames', () => {
    const { document, layer, frameId } = fixture()
    for (const options of [{ frameCount: 0 }, { frameCount: 121 }, { scale: NaN }, { duration: Infinity }]) {
      expect(() => prepareAnimationTween(document, frameId, layer.id, { ...DEFAULT_ANIMATION_TWEEN, ...options })).toThrow()
      expect(document.animation!.frames).toHaveLength(1)
    }
    layer.locked = true
    expect(() => prepareAnimationTween(document, frameId, layer.id, DEFAULT_ANIMATION_TWEEN)).toThrow()
  })

  it('inserts without overwriting later frames, preserves other layers, and supports undo/redo and project round trips', () => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
    const { document, layer, frameId } = fixture()
    const other = createLayer('stationary', 8, 8, 'rgba')
    document.layers.push(other)
    writeLayerColor(document, other, 0, { r: 0, g: 255, b: 0, a: 255 })
    const later = addBlankAnimationFrame(document)
    activateAnimationFrame(document, frameId)
    useWorkspace.getState().addSession(document)
    const options = { ...DEFAULT_ANIMATION_TWEEN, frameCount: 3, offsetX: 6, rotation: 0, opacity: 50 }
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, layer.id, options)).toBe(true)
    const frames = document.animation!.frames.map((frame) => frame.id)
    expect(frames).toHaveLength(5)
    expect(frames[0]).toBe(frameId)
    expect(frames.at(-1)).toBe(later)
    const generatedLoop = structuredClone(document.animation!.loopSections![0])
    expect(generatedLoop).toMatchObject({ startFrameId: frames[1], endFrameId: frames[3], direction: 'forward', repeatCount: null })
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    const last = frames[3]
    expect(animationCelAt(document.animation!, layer.id, last)).toMatchObject({ opacity: 0.5, surface: { offsetX: 7 } })
    expect(animationCelAt(document.animation!, other.id, last)!.surface!.pixels.slice(0, 4)).toEqual(new Uint8ClampedArray([0, 255, 0, 255]))
    const reopened = decodeProject(encodeProject(document))
    expect(reopened.animation!.frames.map((frame) => frame.id)).toEqual(frames)
    expect(animationCelAt(reopened.animation!, layer.id, last)!.opacity).toBe(0.5)
    useWorkspace.getState().undo()
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual([frameId, later])
    expect(document.animation!.loopSections ?? []).toEqual([])
    expect(readLayerColor(document, layer, 9)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    useWorkspace.getState().redo()
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual(frames)
    expect(document.animation!.loopSections).toEqual([generatedLoop])
  })
})

describe('drawn tween paths', () => {
  const path = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 2 }]
  it('uses distance rather than point count and preserves turns and endpoints', () => {
    const options = { ...DEFAULT_ANIMATION_TWEEN, path }
    expect(tweenTranslation(options, 0)).toEqual({ x: 0, y: 0 })
    expect(tweenTranslation(options, 0.5)).toEqual({ x: 4, y: 0 })
    expect(tweenTranslation(options, 0.875)).toEqual({ x: 6, y: 1 })
    expect(tweenTranslation(options, 1)).toEqual({ x: 6, y: 2 })
    expect(tweenTranslation(options, tweenProgress(0.5, 'ease-in'))).toEqual({ x: 2, y: 0 })
  })
  it.each(['rgba', 'indexed'] as const)('generates %s frames along the path', (mode) => {
    const { document, frameId, layer } = fixture(mode)
    const options = { ...DEFAULT_ANIMATION_TWEEN, path, frameCount: 4 }
    const result = prepareAnimationTween(document, frameId, layer.id, options)
    expect(result.cels.filter(cel => cel.layerId === layer.id).map(cel => [cel.surface!.offsetX, cel.surface!.offsetY])).toEqual([[3, 1], [5, 1], [7, 1], [7, 3]])
  })
  it('rejects missing, stationary, nonfinite and oversized paths', () => {
    for (const invalid of [[], [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 1, y: 0 }, { x: 2, y: 0 }], [{ x: 0, y: 0 }, { x: Infinity, y: 0 }], Array.from({ length: 2049 }, (_, x) => ({ x, y: 0 }))]) {
      expect(() => validateAnimationTween({ ...DEFAULT_ANIMATION_TWEEN, path: invalid })).toThrow()
    }
  })
})

it('fits actual tween content instead of empty document margins', () => {
  const { document, frameId, layer } = fixture()
  document.width = 4096; document.height = 4096
  const options = { ...DEFAULT_ANIMATION_TWEEN, offsetX: 0, offsetY: 0 }
  const source = animationTweenSource(document, frameId, layer.id, options)
  expect(animationTweenPreviewBounds(document, layer.id, source, options)).toEqual({ x: 1, y: 1, width: 2, height: 1 })
})
it('fits every generated loop pose including rotation, scaling and path excursions', () => {
  const { document, frameId, layer } = loopFixture()
  const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'loop' as const, loopSectionId: document.animation!.loopSections![0].id,
    frameCount: 12, rotation: 135, scale: 250, path: [{ x: 0, y: 0 }, { x: -30, y: 20 }, { x: 40, y: -15 }] }
  const source = animationTweenSource(document, frameId, layer.id, options)
  const bounds = animationTweenPreviewBounds(document, layer.id, source, options)
  const generated = prepareAnimationTween(document, frameId, layer.id, options)
  for (const cel of generated.cels.filter(cel => cel.layerId === layer.id && cel.surface)) {
    expect(cel.surface!.offsetX).toBeGreaterThanOrEqual(bounds.x)
    expect(cel.surface!.offsetY).toBeGreaterThanOrEqual(bounds.y)
    expect(cel.surface!.offsetX + cel.surface!.width).toBeLessThanOrEqual(bounds.x + bounds.width)
    expect(cel.surface!.offsetY + cel.surface!.height).toBeLessThanOrEqual(bounds.y + bounds.height)
  }
  expect(bounds.x).toBeLessThanOrEqual(source.pivot.x + source.pivot.width / 2 - 30)
})
