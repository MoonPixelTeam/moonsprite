import { describe, expect, it } from 'vitest'
import type { AnimationCelSurface } from '@shared/types-animation'
import { morphTweenSurface, prepareMorphTween } from './animation-morph'
import { packColor } from './raster'
import { createDocument, expandLayerToRect, readLayerColorAt, writeLayerColor } from './document-model'
import { addBlankAnimationFrame, syncActiveAnimationFrame } from './animation'
import { animationBetweenFrame, animationTweenSource, DEFAULT_ANIMATION_TWEEN } from './animation-tween'
import { useWorkspace } from '@/store/workspace'

const red = { r: 255, g: 0, b: 0, a: 255 }, blue = { r: 0, g: 0, b: 255, a: 255 }
function surface(rows: string[], color = red, offsetX = 0, offsetY = 0): AnimationCelSurface {
  const pixels = new Uint32Array(rows.join('').split('').map((pixel) => pixel === '#' ? packColor(color) : 0))
  return { format: 'rgba', width: rows[0].length, height: rows.length, offsetX, offsetY, pixels: new Uint8ClampedArray(pixels.buffer) }
}
const render = (plan: ReturnType<typeof prepareMorphTween>, t: number) => morphTweenSurface(plan, t, 1024 * 1024, () => 0)
const alphas = (image: AnimationCelSurface) => Array.from(image.pixels).filter((_, index) => index % 4 === 3)

describe('outline morph tween', () => {
  it('moves and resizes one solid shape while interpolating color, without endpoint ghosts', () => {
    const from = surface(['##', '##'], red, -6, 2)
    const to = surface(['####', '####', '####', '####'], blue, 10, 10)
    const plan = prepareMorphTween(from, to, [])
    const middle = render(plan, 0.5)
    expect(middle).toMatchObject({ offsetX: 2, offsetY: 6, width: 3, height: 3 })
    expect(Array.from(middle.pixels)).toEqual(Array.from({ length: 9 }, () => [128, 0, 128, 255]).flat())
    expect(render(plan, 0)).toEqual(from)
    expect(render(plan, 1)).toEqual(to)
    expect(middle.pixels).not.toBe(from.pixels)
    expect(render(plan, 0.25)).toMatchObject({ offsetX: -2, offsetY: 4, width: 3, height: 3 })
  })

  it('changes a diamond outline into a square through solid intermediate contours', () => {
    const from = surface(['..#..', '.###.', '#####', '.###.', '..#..'])
    const to = surface(['#####', '#####', '#####', '#####', '#####'])
    const plan = prepareMorphTween(from, to, [])
    const images = [0, 0.25, 0.5, 0.75, 1].map((t) => render(plan, t))
    const areas = images.map((image) => alphas(image).filter((alpha) => alpha > 0).length)
    expect(areas[0]).toBe(13)
    expect(areas[2]).toBeGreaterThan(13)
    expect(areas[2]).toBeLessThan(25)
    expect(areas.at(-1)).toBe(25)
    expect(areas).toEqual([...areas].sort((a, b) => a - b))
    for (const image of images) expect(alphas(image).every((alpha) => alpha === 0 || alpha === 255)).toBe(true)
  })

  it('shrinks an internal hole without making the filled shape translucent', () => {
    const from = surface(['#####', '#...#', '#...#', '#...#', '#####'])
    const to = surface(['#####', '#####', '#####', '#####', '#####'])
    const plan = prepareMorphTween(from, to, [])
    expect(alphas(render(plan, 0.25))[12]).toBe(0)
    expect(alphas(render(plan, 0.75))[12]).toBe(255)
  })

  it('preserves indexed endpoints and uses palette colors for the moving intermediate shape', () => {
    const from: AnimationCelSurface = { format: 'indexed', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array([3]) }
    const to = { ...from, offsetX: 8, pixels: new Uint32Array([7]) }
    const palette = [{ id: 3, name: 'Red', color: red }, { id: 7, name: 'Blue', color: blue }]
    const original = JSON.stringify(palette)
    const plan = prepareMorphTween(from, to, palette)
    const middle = morphTweenSurface(plan, 0.5, 1, (color) => {
      expect(color).toEqual({ r: 128, g: 0, b: 128, a: 255 })
      return 3
    })
    expect(middle).toMatchObject({ format: 'indexed', offsetX: 4, width: 1 })
    expect(Array.from(middle.pixels)).toEqual([3])
    expect(render(plan, 0).pixels).toEqual(from.pixels)
    expect(render(plan, 1).pixels).toEqual(to.pixels)
    expect(JSON.stringify(palette)).toBe(original)
  })

  it('rejects empty endpoints and excessive allocation before generating output', () => {
    const from = surface(['#'])
    expect(() => prepareMorphTween(from, undefined, [])).toThrow()
    expect(() => prepareMorphTween(surface(['.']), from, [])).toThrow()
    expect(() => morphTweenSurface(prepareMorphTween(from, from, []), 0.5, 0, () => 0)).toThrow()
    const wide = surface(['#'.repeat(1100)]), tall = surface(Array.from({ length: 1100 }, () => '#'))
    expect(() => prepareMorphTween(wide, tall, [])).toThrow()
  })

  it('generates the same eased morph as the preview and restores original frames with one undo', () => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null })
    const document = createDocument('morph', 12, 12, 'rgba', false)
    const layerId = document.activeLayerId, first = document.animation!.activeFrameId
    writeLayerColor(document, document.layers[0], 0, red)
    const last = addBlankAnimationFrame(document)
    expandLayerToRect(document.layers[0], 8, 0, 9, 1)
    writeLayerColor(document, document.layers[0], 0, blue)
    syncActiveAnimationFrame(document)
    const endpoints = JSON.stringify(document.animation!.cels)
    const options = { ...DEFAULT_ANIMATION_TWEEN, scope: 'between' as const, frameCount: 1, easing: 'ease-in' as const }
    const plan = animationTweenSource(document, first, layerId, options)
    const preview = animationBetweenFrame(document, layerId, plan, options, 0.5)
    expect(preview.surface).toMatchObject({ offsetX: 2, width: 1 })
    expect(Array.from(preview.surface.pixels)).toEqual([191, 0, 64, 255])
    useWorkspace.getState().addSession(document)
    expect(useWorkspace.getState().generateAnimationTween(document.id, first, layerId, options)).toBe(true)
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual([first, expect.any(String), last])
    expect(readLayerColorAt(document, document.layers[0], 2, 0)).toEqual({ r: 191, g: 0, b: 64, a: 255 })
    expect(readLayerColorAt(document, document.layers[0], 0, 0).a).toBe(0)
    expect(readLayerColorAt(document, document.layers[0], 8, 0).a).toBe(0)
    expect(useWorkspace.getState().sessions[0].history.position).toBe(1)
    useWorkspace.getState().undo()
    expect(document.animation!.frames.map((frame) => frame.id)).toEqual([first, last])
    expect(JSON.stringify(document.animation!.cels)).toBe(endpoints)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, document.layers[0], 2, 0)).toEqual({ r: 191, g: 0, b: 64, a: 255 })
  })
})
