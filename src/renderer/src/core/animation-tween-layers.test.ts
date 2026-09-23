import { describe, expect, it } from 'vitest'
import { createDocument, createLayer, createLayerMask, writeLayerColor } from './document-model'
import { syncActiveAnimationFrame, layerFromAnimationCel } from './animation'
import { animationTweenSource, animationTweenLayerIds, animationTweenCompositePreview, DEFAULT_ANIMATION_TWEEN, prepareAnimationTween } from './animation-tween'
import { compositeRegion } from './document-composite'
import { useWorkspace } from '@/store/workspace'

const red = { r: 255, g: 0, b: 0, a: 255 }, green = { r: 0, g: 255, b: 0, a: 255 }
function fixture() {
  const document = createDocument('layers tween', 12, 4, 'rgba', false)
  const first = document.layers[0], second = createLayer('second', 12, 4, 'rgba')
  document.layers.push(second)
  writeLayerColor(document, first, 0, red)
  writeLayerColor(document, second, 2, green)
  syncActiveAnimationFrame(document)
  const frameId = document.animation!.activeFrameId
  const endId = 'end'
  document.animation!.frames.push({ id: endId, duration: 100 })
  for (const [layer, offsetX, color] of [[first, 8, red], [second, 10, green]] as const) document.animation!.cels.push({
    id: `end-${layer.id}`, opacity: 1, layerId: layer.id, frameId: endId,
    surface: { format: 'rgba', offsetX, offsetY: 0, width: 1, height: 1, pixels: new Uint8ClampedArray([color.r, color.g, color.b, 255]) }
  })
  return { document, first, second, frameId, endId }
}
const between = { ...DEFAULT_ANIMATION_TWEEN, layerScope: 'all' as const, scope: 'between' as const, frameCount: 1 }

describe('multi-layer tween', () => {
  it('inserts one shared batch with independent cels and undoes every layer in one step', () => {
    const { document, first, second, frameId, endId } = fixture()
    localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null, message: null })
    useWorkspace.getState().addSession(document)
    const before = JSON.stringify(document.animation!.cels)
    expect(useWorkspace.getState().generateAnimationTween(document.id, frameId, first.id, between)).toBe(true)
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual([frameId, expect.any(String), endId])
    const generated = document.animation!.cels.filter((cel) => cel.frameId === document.animation!.frames[1].id)
    expect(generated.map((cel) => [cel.layerId, cel.surface!.offsetX])).toEqual([[first.id, 4], [second.id, 6]])
    expect(generated.every((cel) => cel.linkedCelId === null)).toBe(true)
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    useWorkspace.getState().undo()
    expect(JSON.stringify(document.animation!.cels)).toBe(before)
    expect(document.animation!.frames).toHaveLength(2)
    useWorkspace.getState().redo()
    expect(document.animation!.frames).toHaveLength(3)
  })

  it('supports selected groups, skips locked and special layers, and preserves excluded cels', () => {
    const { document, first, second, frameId } = fixture()
    document.groups.push({ id: 'g', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    first.groupId = 'g'; second.groupId = 'g'
    expect(animationTweenLayerIds(document, first.id, { layerScope: 'selected', groupIds: ['g'] })).toEqual([first.id, second.id])
    second.locked = true
    expect(animationTweenLayerIds(document, second.id, between)).toEqual([first.id])
    const output = prepareAnimationTween(document, frameId, first.id, between)
    expect(output.cels.find((cel) => cel.layerId === second.id)!.surface!.offsetX).toBe(0)
    expect(output.cels.find((cel) => cel.layerId === first.id)!.surface!.offsetX).toBe(4)
    second.locked = false; second.kind = 'text'
    expect(animationTweenLayerIds(document, first.id, between)).toEqual([first.id])
    document.groups[0].locked = true
    expect(() => prepareAnimationTween(document, frameId, first.id, between)).toThrow()
  })

  it('rotates all selected layers around one common pivot', () => {
    const { document, first, second, frameId } = fixture()
    const options = { ...DEFAULT_ANIMATION_TWEEN, layerScope: 'all' as const, frameCount: 1, offsetX: 0, rotation: 180 }
    const plan = animationTweenSource(document, frameId, first.id, options)
    expect(plan.pivot).toEqual({ x: 0, y: 0, width: 3, height: 1 })
    const output = prepareAnimationTween(document, frameId, first.id, options)
    const a = output.cels.find((cel) => cel.layerId === first.id)!.surface!
    const b = output.cels.find((cel) => cel.layerId === second.id)!.surface!
    // Raster bounds can include a transparent row due to floating-point rotation.
    const visibleX = (surface: typeof a) => Array.from(surface.pixels).findIndex((value, i) => i % 4 === 3 && value > 0) / 4
    expect(a.offsetX + Math.floor(visibleX(a)) % a.width).toBe(2)
    expect(b.offsetX + Math.floor(visibleX(b)) % b.width).toBe(0)
  })

  it('moves layer masks with morphing content and matches the real masked composite', () => {
    const { document, first, frameId, endId } = fixture()
    const start = createLayerMask(first.id, 1, 1), end = createLayerMask(first.id, 1, 1)
    start.pixels.set([0, 0, 0, 255]); end.pixels.set([0, 0, 0, 255]); end.offsetX = 8
    document.animation!.layerMasks = [{ layerId: first.id, frameId, mask: start }, { layerId: first.id, frameId: endId, mask: end }]
    const generated = prepareAnimationTween(document, frameId, first.id, between)
    expect(generated.layerMasks[0].mask).toMatchObject({ offsetX: 4, width: 1, ownerId: first.id })
    const bounds = { x: 0, y: 0, width: 12, height: 4 }
    const plan = animationTweenSource(document, frameId, first.id, between)
    const before = JSON.stringify(document.animation)
    const preview = animationTweenCompositePreview(document, plan, between, 1, bounds)
    const actual = { ...document, layers: document.layers.map((layer) => layerFromAnimationCel(layer, generated.cels.find((cel) => cel.layerId === layer.id)!)!),
      animation: { ...document.animation!, activeFrameId: generated.frames[0].id, frames: generated.frames, cels: generated.cels, layerMasks: generated.layerMasks, groupMasks: generated.groupMasks } }
    expect(preview.pixels).toEqual(compositeRegion(actual, 0, 0, 12, 4))
    expect(preview.pixels[4 * 4 + 3]).toBe(0)
    expect(Array.from(preview.pixels.slice(6 * 4, 7 * 4))).toEqual([0, 255, 0, 255])
    expect(JSON.stringify(document.animation)).toBe(before)
  })

  it('moves group masks only for whole groups and keeps independent masks stationary', () => {
    const { document, first, second, frameId } = fixture()
    document.groups.push({ id: 'g', name: 'group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    first.groupId = 'g'; second.groupId = 'g'
    const groupMask = createLayerMask('g', 3, 1, 'group')
    const layerMask = createLayerMask(first.id, 1, 1); layerMask.moveWithOwner = false
    document.animation!.groupMasks = [{ groupId: 'g', frameId, mask: groupMask }]
    document.animation!.layerMasks = [{ layerId: first.id, frameId, mask: layerMask }]
    const options = { ...DEFAULT_ANIMATION_TWEEN, layerScope: 'all' as const, frameCount: 1, offsetX: 4 }
    const all = prepareAnimationTween(document, frameId, first.id, options)
    expect(all.groupMasks[0].mask).toMatchObject({ offsetX: 4, ownerKind: 'group', ownerId: 'g' })
    expect(all.layerMasks[0].mask.offsetX).toBe(0)
    const partial = prepareAnimationTween(document, frameId, first.id, { ...options, layerScope: 'current' })
    expect(partial.groupMasks[0].mask.offsetX).toBe(0)
  })

  it('handles blank endpoints within a multi-layer batch without blocking other layers', () => {
    const { document, first, second, frameId, endId } = fixture()
    document.animation!.cels = document.animation!.cels.filter((cel) => cel.layerId !== second.id || cel.frameId !== endId)
    const output = prepareAnimationTween(document, frameId, first.id, between)
    expect(output.frames).toHaveLength(1)
    expect(output.cels).toHaveLength(2)
    expect(output.cels.find((cel) => cel.layerId === first.id)!.surface!.offsetX).toBe(4)
    expect(output.cels.find((cel) => cel.layerId === second.id)!.surface!.pixels[3]).toBe(128)
  })

  it('cycles both layers of a loop into the same generated frames', () => {
    const { document, first, second, frameId, endId } = fixture()
    document.animation!.loopSections = [{ id: 'loop', name: 'loop', startFrameId: frameId, endFrameId: endId, direction: 'forward', repeatCount: null }]
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'loop' as const, layerScope: 'selected' as const, layerIds: [first.id, second.id], loopSectionId: 'loop', frameCount: 2, offsetX: 4 }
    const output = prepareAnimationTween(document, frameId, first.id, options)
    expect(output.frames).toHaveLength(2)
    expect(output.cels.map((cel) => cel.surface!.offsetX)).toEqual([2, 4, 12, 14])
    expect(output.cels.map((cel) => cel.frameId)).toEqual([output.frames[0].id, output.frames[0].id, output.frames[1].id, output.frames[1].id])
  })

  it('composites excluded layers with opacity and respects hidden layers', () => {
    const { document, first, second, frameId } = fixture()
    second.pixels.fill(0); second.opacity = 0.5
    writeLayerColor(document, second, 0, green)
    syncActiveAnimationFrame(document)
    const options = { ...DEFAULT_ANIMATION_TWEEN, layerScope: 'current' as const, frameCount: 1, offsetX: 0 }
    const plan = animationTweenSource(document, frameId, first.id, options)
    const bounds = { x: 0, y: 0, width: 1, height: 1 }
    expect(Array.from(animationTweenCompositePreview(document, plan, options, 1, bounds).pixels)).toEqual([128, 128, 0, 255])
    second.visible = false
    expect(Array.from(animationTweenCompositePreview(document, plan, options, 1, bounds).pixels)).toEqual([255, 0, 0, 255])
  })
})
