import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { RgbaColor } from '@shared/types-color'
import { ColorValueControl } from './ColorValueControl'
import { registerColorPickerSampler } from './color-picker-sampling'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import { eyedropperMagnifierPosition } from '@/core/eyedropper-magnifier'

afterEach(() => {
  cleanup(); localStorage.clear(); vi.restoreAllMocks()
  for (const key of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture']) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
})

it('moves the magnifier while capture is pending, refreshes during motion, and cannot resurrect after release', async () => {
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, eyedropperMagnifierEnabled: true, eyedropperMagnifierSize: 1 })
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  const flush = async (): Promise<void> => { await act(async () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)) }) }
  for (const key of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture']) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: () => true })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20 } as DOMRect)
  const draw = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: () => {}, createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: draw } as unknown as CanvasRenderingContext2D)
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
  const pending: Array<(colors: RgbaColor[]) => void> = []
  const region = vi.fn(() => new Promise<RgbaColor[]>(resolve => pending.push(resolve)))
  const finalColor = { r: 7, g: 8, b: 9, a: 255 }
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: { sampleWindowColorRegion: region, sampleWindowColor: vi.fn(async () => finalColor) } as unknown as MoonSpriteApi })
  const changed = vi.fn()
  const view = render(<ColorValueControl color={{ r: 1, g: 2, b: 3, a: 255 }} onChange={changed} label="lens" />)
  const button = view.getByRole('button', { name: 'lens' })
  const move = async (x: number): Promise<void> => { fireEvent.pointerMove(button, { pointerId: 1, clientX: x, clientY: 300 }); await flush() }
  const position = (x: number) => eyedropperMagnifierPosition({ x, y: 300 }, { width: window.innerWidth, height: window.innerHeight }, 256)
  const resolve = async (value: number): Promise<void> => { await act(async () => { pending.shift()!(Array.from({ length: 121 }, () => ({ r: value, g: 0, b: 0, a: 255 }))) }) }
  fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  await move(300)
  await move(400)
  expect(region).toHaveBeenCalledTimes(1)
  await resolve(40)
  let lens = document.querySelector<HTMLElement>('.global-eyedropper-magnifier')!
  expect(lens.style.left).toBe(`${position(400).left}px`)
  const draws = draw.mock.calls.length
  await move(500)
  // Neither a sample response nor repainting lens pixels is needed to move it.
  expect(lens.style.left).toBe(`${position(500).left}px`)
  expect(draw).toHaveBeenCalledTimes(draws)
  await resolve(50)
  lens = document.querySelector<HTMLElement>('.global-eyedropper-magnifier')!
  expect(lens.style.left).toBe(`${position(500).left}px`)
  expect(draw).toHaveBeenCalledTimes(draws + 1)
  fireEvent.pointerUp(button, { pointerId: 1, clientX: 550, clientY: 300 })
  await act(async () => {})
  expect(changed).toHaveBeenLastCalledWith(finalColor)
  expect(document.querySelector('.global-eyedropper-magnifier')).toBeNull()
  await resolve(99)
  expect(document.querySelector('.global-eyedropper-magnifier')).toBeNull()
  expect(changed).toHaveBeenLastCalledWith(finalColor)
})

it('samples the latest picker position once per frame and rejects a late screen result', async () => {
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, eyedropperMagnifierEnabled: false })
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  const flush = async (): Promise<void> => { await act(async () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)) }) }
  for (const key of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture']) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: () => true })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20 } as DOMRect)
  let resolveScreen!: (color: RgbaColor) => void
  const screen = vi.fn(() => new Promise<RgbaColor>(resolve => { resolveScreen = resolve }))
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: { sampleWindowColor: screen } as unknown as MoonSpriteApi })
  const onChange = vi.fn()
  const view = render(<ColorValueControl color={{ r: 1, g: 2, b: 3, a: 255 }} onChange={onChange} label="sample" />)
  const picker = document.createElement('div'), field = document.createElement('span')
  field.className = 'color-field-interaction'; picker.append(field); document.body.append(picker)
  let inside = false
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => inside ? [field] : [] })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => inside ? field : null })
  const sample = vi.fn((x: number) => ({ r: x, g: 40, b: 50, a: 255 }))
  const finish = vi.fn()
  const unregister = registerColorPickerSampler(picker, { sample, finish })
  try {
    const button = view.getByRole('button', { name: 'sample' })
    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 30, clientY: 30 })
    await flush()
    expect(screen).toHaveBeenCalledTimes(1)
    inside = true
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 60, clientY: 30 })
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 80, clientY: 30 })
    await flush()
    expect(sample).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ r: 80, g: 40, b: 50, a: 255 })
    await act(async () => { resolveScreen({ r: 255, g: 0, b: 0, a: 255 }) })
    expect(onChange).toHaveBeenCalledTimes(1)
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 80, clientY: 30 })
    await flush()
    expect(onChange).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(button, { pointerId: 1, clientX: 90, clientY: 30 })
    await act(async () => {})
    expect(onChange).toHaveBeenLastCalledWith({ r: 90, g: 40, b: 50, a: 255 })
    expect(screen).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalled()
  } finally { unregister(); picker.remove() }
})
