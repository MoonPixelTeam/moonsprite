import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RgbaColor } from '@shared/types-color'
import { ColorPicker, type ColorPickerConfig } from './ColorPicker'
import { finishColorPickerSampling, sampleColorPickerAtClientPoint } from './color-picker-sampling'
import { rgbToHsv } from '@/core/raster'

vi.mock('./ColorValueControl', () => ({ ColorValueControl: () => null }))
const initial = { r: 151, g: 103, b: 55, a: 180 }
let frames: Map<number, FrameRequestCallback>
let draws: ReturnType<typeof vi.fn>
beforeEach(() => {
  frames = new Map()
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  draws = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: draws
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 256, bottom: 256, width: 256, height: 256 } as DOMRect)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [...document.querySelectorAll('.color-field-interaction')] })
})
afterEach(() => { finishColorPickerSampling(); cleanup(); vi.restoreAllMocks(); delete (HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture })
const flush = (): void => { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }) }

describe('color picker coordinate sampling', () => {
  it('changes hue repeatedly with the wheel, preserves alpha, and wraps snapped hue', () => {
    const changes = vi.fn()
    const view = render(<ColorPicker wheelHue color={{ r: 255, g: 0, b: 0, a: 180 }} onChange={changes} config={{ scheme: 'sv-square', hueSteps: 12, colorSteps: 0 }} />)
    const field = view.container.querySelector('.color-field-interaction')!
    fireEvent.wheel(field, { deltaY: -100 })
    fireEvent.wheel(field, { deltaY: -100 })
    expect(rgbToHsv(changes.mock.lastCall![0]).h).toBeCloseTo(60)
    expect(changes.mock.lastCall![0].a).toBe(180)
    for (let i = 0; i < 3; i++) fireEvent.wheel(field, { deltaY: 100 })
    expect(rgbToHsv(changes.mock.lastCall![0]).h).toBeCloseTo(330, 0)
  })
  it.each<ColorPickerConfig>([
    { scheme: 'sv-square', hueSteps: 0, colorSteps: 0 },
    { scheme: 'hs-square', hueSteps: 12, colorSteps: 9 },
    { scheme: 'wheel', hueSteps: 0, colorSteps: 0 },
    { scheme: 'normal-map', hueSteps: 12, colorSteps: 9 },
    { scheme: 'moon-ring', hueSteps: 0, colorSteps: 0 },
    { scheme: 'moon-ring', moonField: 'hsl-triangle', hueSteps: 12, colorSteps: 9 }
  ])('matches normal pointer selection and remains stable in $scheme $moonField', config => {
    const expected: RgbaColor[] = []
    let update: (next: RgbaColor) => void = () => {}
    function Picker({ native }: { native: boolean }) {
      const [color, setColor] = useState(initial)
      update = setColor
      return <ColorPicker color={color} config={config} onChange={next => { if (native) expected.push(next); setColor(next) }} />
    }
    const normal = render(<Picker native />)
    const field = normal.container.querySelector('.color-field-interaction')!
    fireEvent.pointerDown(field, { button: 0, pointerId: 1, clientX: 135, clientY: 115 })
    flush()
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 145, clientY: 130 })
    flush()
    fireEvent.pointerUp(field, { pointerId: 1 })
    normal.unmount()
    render(<Picker native={false} />)
    let first: RgbaColor | null | undefined, second: RgbaColor | null | undefined
    act(() => { first = sampleColorPickerAtClientPoint(135, 115)?.color; if (first) update(first) })
    act(() => { second = sampleColorPickerAtClientPoint(145, 130)?.color; if (second) update(second) })
    expect(first).toEqual(expected[0])
    expect(second).toEqual(expected[1])
    for (let i = 0; i < 5; i++) act(() => { expect(sampleColorPickerAtClientPoint(145, 130)?.color).toEqual(second) })
    expect(second?.a).toBe(initial.a)
  })

  it('does not redraw the fixed normal map or sample outside its disk', () => {
    render(<ColorPicker color={initial} onChange={() => {}} config={{ scheme: 'normal-map', hueSteps: 0, colorSteps: 0 }} />)
    const before = draws.mock.calls.length
    act(() => { sampleColorPickerAtClientPoint(120, 100) })
    act(() => { sampleColorPickerAtClientPoint(140, 130) })
    expect(draws).toHaveBeenCalledTimes(before)
    expect(sampleColorPickerAtClientPoint(0, 0)).toEqual({ color: null })
    finishColorPickerSampling()
    expect(sampleColorPickerAtClientPoint(140, 130)?.color).not.toBeNull()
  })
})
