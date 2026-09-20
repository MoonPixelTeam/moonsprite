import { expect, it } from 'vitest'
import { renderAnimationCelThumbnailPixels } from './animation-thumbnail'
import type { AnimationCelSurface } from '@shared/types-animation'

it.each([8, 16])('maps every layer to the same complete non-square canvas at thumbnail size %s', size => {
  const scale = size / 8
  for (const [offsetX, offsetY, width] of [[1, 1, 1], [5, 2, 2]]) {
    const surface: AnimationCelSurface = {
      format: 'rgba', width, height: 1, offsetX, offsetY,
      pixels: new Uint8ClampedArray(Array.from({ length: width }, () => [255, 0, 0, 255]).flat())
    }
    const pixels = renderAnimationCelThumbnailPixels(8, 4, size, surface, [], 1, true, 'canvas')
    const painted: number[][] = []
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3]) painted.push([x, y])
    }
    expect(painted).toHaveLength(width * scale * scale)
    expect(painted[0]).toEqual([offsetX * scale, (offsetY + 2) * scale])
    expect(painted.at(-1)).toEqual([(offsetX + width) * scale - 1, (offsetY + 3) * scale - 1])
  }
})

it('clips content outside the fixed canvas without shifting or enlarging the visible part', () => {
  const surface: AnimationCelSurface = {
    format: 'rgba', width: 3, height: 1, offsetX: -2, offsetY: 0,
    pixels: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255])
  }
  const pixels = renderAnimationCelThumbnailPixels(8, 4, 8, surface, [], 1, true, 'canvas')
  expect(Array.from(pixels.slice(16 * 4, 17 * 4))).toEqual([255, 0, 0, 255])
  expect(Array.from(pixels).filter((value, index) => index % 4 === 3 && value > 0)).toHaveLength(1)
})

it.each([1, 0.5])('keeps source colors and alpha for a shared checkerboard at opacity %s', opacity => {
  const surface: AnimationCelSurface = {
    format: 'rgba', width: 3, height: 1, offsetX: 0, offsetY: 0,
    pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 0])
  }
  const transparent = renderAnimationCelThumbnailPixels(3, 1, 3, surface, [], opacity, true)
  expect(Array.from(transparent.slice(12, 20))).toEqual([255, 0, 0, Math.round(255 * opacity), 0, 255, 0, Math.round(128 * opacity)])
  expect(transparent[3]).toBe(0)
  expect(transparent[23]).toBe(0)
  const checker = renderAnimationCelThumbnailPixels(3, 1, 3, surface, [], opacity)
  expect(checker[3]).toBe(255)
  expect(checker[19]).toBe(255)
})

it('keeps palette alpha when rendering indexed cels over a shared checkerboard', () => {
  const surface: AnimationCelSurface = {
    format: 'indexed', width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint32Array([1])
  }
  const pixels = renderAnimationCelThumbnailPixels(1, 1, 1, surface, [{ id: 1, name: 'Color', color: { r: 24, g: 80, b: 200, a: 128 } }], 0.5, true)
  expect(Array.from(pixels)).toEqual([24, 80, 200, 64])
})
