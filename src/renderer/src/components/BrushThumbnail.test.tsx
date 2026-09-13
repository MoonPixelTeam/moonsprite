import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageBrush } from '@shared/types'
import { BrushThumbnail } from './BrushThumbnail'
import { pixelSource } from './pixel-source'

describe('brush thumbnail pixel sources', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('keeps buffers opaque to prop enumeration without copying or hiding source fields', () => {
    const brush: ImageBrush = { id: 'one', name: 'brush', width: 1, height: 1, coverage: new Uint8Array([200]) }
    const source = pixelSource(brush)
    expect(pixelSource(brush)).toBe(source)
    expect(Object.entries(source)).toEqual([])
    expect(source()).toBe(brush)
    expect({ ...source() }.coverage).toBe(brush.coverage)
    brush.coverage[0] = 123
    expect(source().coverage[0]).toBe(123)
    expect(pixelSource({ ...brush })).not.toBe(source)
  })

  it('renders coverage, redraws when brushes change, and honors paintColors', () => {
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData
    }) as unknown as CanvasRenderingContext2D)
    const brush: ImageBrush = { id: 'one', name: 'brush', width: 1, height: 1, coverage: new Uint8Array([200]) }
    const view = render(<BrushThumbnail source={pixelSource(brush)} />)
    expect([...putImageData.mock.calls.at(-1)![0].data]).toEqual([255, 255, 255, 200])
    const colored = { ...brush, width: 2, coverage: new Uint8Array([255, 255]), colors: new Uint32Array([0, 0]), paintColors: new Uint32Array([0xffffffff, 0]) }
    view.rerender(<BrushThumbnail source={pixelSource(colored)} />)
    expect([...putImageData.mock.calls.at(-1)![0].data]).toEqual([255, 255, 255, 255, 0, 0, 0, 0])
    expect(view.container.querySelector('canvas')!.width).toBe(2)
    view.rerender(<BrushThumbnail source={pixelSource(brush)} />)
    expect([...putImageData.mock.calls.at(-1)![0].data]).toEqual([255, 255, 255, 200])
    expect(view.container.querySelector('canvas')!.width).toBe(1)
  })
})
