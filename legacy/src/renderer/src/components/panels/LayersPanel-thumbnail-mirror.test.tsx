import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { createDocument, createLayer, getActiveLayer } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each(['detailed', 'expanded', 'large', 'huge'])('refreshes batch mirror thumbnails and undo/redo at %s density', async density => {
  localStorage.setItem('moonsprite.layers.display-density', density)
  const rendered = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>()
  const counts = new WeakMap<HTMLCanvasElement, number>()
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MoonSpriteTest')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, _kind, options) {
    expect(options).toEqual({ willReadFrequently: true })
    const canvas = this
    return {
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (image: ImageData) => {
        rendered.set(canvas, image.data.slice())
        counts.set(canvas, (counts.get(canvas) ?? 0) + 1)
      }
    } as unknown as CanvasRenderingContext2D
  })
  const document = createDocument('mirror thumbnail', 3, 2, 'rgba')
  const layer = getActiveLayer(document)
  layer.pixels.set([255, 20, 80, 160, 10, 200].flatMap(value => [value, 0, 0, 255]))
  const second = createLayer('Second', 3, 2, 'rgba')
  second.pixels.set(layer.pixels)
  document.layers.push(second)
  const commands = useWorkspace.getState()
  commands.addSession(document)
  commands.duplicateAnimationFrame()
  commands.duplicateAnimationFrame()
  const timeline = ensureAnimationDocument(document)
  commands.selectAnimationFrame(timeline.frames[0].id)
  commands.selectAnimationFrame(timeline.frames[1].id, 'toggle')
  // Keep the panel mounted without manually rerendering it: content edits do
  // not change its parent render key, so each preview must observe its content.
  const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const canvases = document.layers.flatMap(item => timeline.frames.map(frame =>
    container.querySelector<HTMLCanvasElement>(`[data-animation-cel-key="${animationCelKey(item.id, frame.id)}"] canvas`)!))
  await waitFor(() => { for (const canvas of canvases) expect(rendered.has(canvas)).toBe(true) })
  const before = canvases.map(canvas => rendered.get(canvas)!.slice())
  const matchesPixels = (canvas: HTMLCanvasElement, expected: Uint8ClampedArray): boolean => {
    const actual = rendered.get(canvas)
    return actual?.length === expected.length && actual.every((value, index) => value === expected[index])
  }
  const untouchedCounts = [counts.get(canvases[2]), counts.get(canvases[5])]
  for (const axis of ['horizontal', 'vertical'] as const) {
    act(() => { commands.flipActiveSelection(axis) })
    await waitFor(() => canvases.forEach((canvas, index) => {
      expect(matchesPixels(canvas, before[index])).toBe(index % 3 === 2)
    }))
    const after = canvases.map(canvas => rendered.get(canvas)!.slice())
    act(() => { commands.undo() })
    await waitFor(() => canvases.forEach((canvas, index) => expect(matchesPixels(canvas, before[index])).toBe(true)))
    act(() => { commands.redo() })
    await waitFor(() => canvases.forEach((canvas, index) => expect(matchesPixels(canvas, after[index])).toBe(true)))
    act(() => { commands.undo() })
    await waitFor(() => canvases.forEach((canvas, index) => expect(matchesPixels(canvas, before[index])).toBe(true)))
  }
  expect([counts.get(canvases[2]), counts.get(canvases[5])]).toEqual(untouchedCounts)
})
