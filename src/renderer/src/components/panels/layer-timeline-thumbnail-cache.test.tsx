import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { cachedCelHasContent, celContentCache, celThumbnailCache, CelThumbnail } from './layer-timeline-thumbnails'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

it('bounds palette variants retained for a live indexed cel and recalculates evicted content', () => {
  const document = createDocument('palette cache', 1, 1, 'indexed')
  const cel = document.animation!.cels[0]
  cel.surface!.pixels[0] = 1
  for (let alpha = 0; alpha < 100; alpha++) {
    const palette = [{ id: 1, name: 'color', color: { r: 10, g: 20, b: 30, a: alpha } }]
    expect(cachedCelHasContent(cel, palette)).toBe(alpha !== 0)
  }
  expect(celContentCache.get(rasterStorageIdentity(cel.surface!))!.size).toBeLessThanOrEqual(8)
  expect(cachedCelHasContent(cel, [{ id: 1, name: 'clear', color: { r: 10, g: 20, b: 30, a: 0 } }])).toBe(false)
})

it('bounds thumbnail variants during committed opacity changes and renders evicted values correctly', () => {
  vi.useFakeTimers()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('thumbnail-test')
  const putImageData = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData,
  } as unknown as CanvasRenderingContext2D)
  const document = createDocument('thumbnail cache', 1, 1, 'rgba')
  const cel = document.animation!.cels[0]
  cel.surface!.pixels.set([10, 20, 30, 255])
  const view = render(<CelThumbnail documentId={document.id} layerId={cel.layerId} celSource={() => cel} palette={document.palette} revision={1} documentWidth={1} documentHeight={1} thumbnailSize={8} sharedCheckerboard />)
  const draw = (opacity: number, revision: number) => {
    cel.opacity = opacity
    view.rerender(<CelThumbnail documentId={document.id} layerId={cel.layerId} celSource={() => cel} palette={document.palette} revision={revision} documentWidth={1} documentHeight={1} thumbnailSize={8} sharedCheckerboard />)
    act(() => vi.runAllTimers())
    return Array.from(putImageData.mock.calls.at(-1)![0].data as Uint8ClampedArray)
  }
  const initial = draw(0.5, 2)
  for (let index = 1; index <= 100; index++) draw(index / 100, index + 2)
  expect(celThumbnailCache.get(rasterStorageIdentity(cel.surface!))!.size).toBeLessThanOrEqual(8)
  expect(draw(0.5, 103)).toEqual(initial)
  expect(putImageData).toHaveBeenCalledTimes(102)
})
