import { afterEach, describe, expect, it } from 'vitest'
import type { RgbaColor } from '@shared/types'
import { beginCanvasColorSampling, endCanvasColorSampling, registerCanvasColorSamplingSurface, routeCanvasColorSampling, routeCanvasColorSamplingIntent, sampleCanvasColorAtClientPoint, setCanvasColorSamplingIntent } from './canvas-color-sampling'

const color: RgbaColor = { r: 12, g: 34, b: 56, a: 255 }

describe('canvas color sampling routing', () => {
    afterEach(() => {
      endCanvasColorSampling()
      setCanvasColorSamplingIntent(null)
    })

  it('samples the canvas under a captured pointer without changing the source', () => {
    const source = document.createElement('canvas')
    source.className = 'stage-canvas'
    const target = document.createElement('canvas')
    target.className = 'stage-canvas'
    document.body.append(source, target)
    const sourceCursor: boolean[] = []
    const targetCursor: boolean[] = []
    const received: RgbaColor[] = []
    const cleanSource = registerCanvasColorSamplingSurface({ canvas: source, sampleAtClientPoint: () => null, setSamplingCursor: (active) => sourceCursor.push(active) })
    const cleanTarget = registerCanvasColorSamplingSurface({ canvas: target, sampleAtClientPoint: () => color, setSamplingCursor: (active) => targetCursor.push(active) })
    const originalElementsFromPoint = document.elementsFromPoint
    document.elementsFromPoint = () => [target]
    beginCanvasColorSampling({ sourceCanvas: source, pointerId: 1, onSample: (sampled) => received.push(sampled) })

    expect(routeCanvasColorSampling(10, 10)).toBe(true)
    expect(received).toEqual([color])
    expect(sourceCursor).toEqual([true])
    expect(targetCursor).toEqual([true])

    endCanvasColorSampling(1)
    expect(targetCursor).toEqual([true, false])
    expect(sourceCursor).toEqual([true, false])
    document.elementsFromPoint = originalElementsFromPoint
    cleanSource()
    cleanTarget()
    source.remove()
    target.remove()
  })

  it('routes a click to another canvas while the eyedropper tool is active', () => {
    const source = document.createElement('canvas')
    source.className = 'stage-canvas'
    const target = document.createElement('canvas')
    target.className = 'stage-canvas'
    document.body.append(source, target)
    const received: Array<{ color: RgbaColor; secondary: boolean }> = []
    const cleanSource = registerCanvasColorSamplingSurface({ canvas: source, sampleAtClientPoint: () => null, setSamplingCursor: () => {} })
    const cleanTarget = registerCanvasColorSamplingSurface({ canvas: target, sampleAtClientPoint: () => color, setSamplingCursor: () => {} })
    const originalElementsFromPoint = document.elementsFromPoint
    document.elementsFromPoint = () => [target]
    setCanvasColorSamplingIntent({ sourceCanvas: source, onSample: (sampled, _x, _y, secondary) => received.push({ color: sampled, secondary }) })

    expect(routeCanvasColorSamplingIntent(10, 10, true)).toBe(true)
    expect(received).toEqual([{ color, secondary: true }])

    document.elementsFromPoint = originalElementsFromPoint
    cleanSource()
    cleanTarget()
    source.remove()
    target.remove()
  })

  it('samples a registered canvas without changing the active sampling state', () => {
    const canvas = document.createElement('canvas')
    canvas.className = 'stage-canvas'
    document.body.append(canvas)
    const clean = registerCanvasColorSamplingSurface({ canvas, sampleAtClientPoint: () => color, setSamplingCursor: () => {} })
    const originalElementsFromPoint = document.elementsFromPoint
    document.elementsFromPoint = () => [canvas]

    expect(sampleCanvasColorAtClientPoint(10, 10)).toEqual(color)

    document.elementsFromPoint = originalElementsFromPoint
    clean()
    canvas.remove()
  })
})
