import { expect, it } from 'vitest'
import { renderAnimationCelThumbnailPixels } from './animation-thumbnail'
import type { AnimationCelSurface } from '@shared/types-animation'

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
