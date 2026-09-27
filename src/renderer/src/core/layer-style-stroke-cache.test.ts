import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { applyLayerStylesAt, createDefaultLayerStyles } from './layer-styles'
import { OUTLINE_DIRECTIONS, outlineDirectionsForKernel } from './outline-settings'
import { TRANSPARENT } from './raster'

it('preserves directed stroke pixels, alpha and smart colors across in-place setting changes', () => {
  const styles = createDefaultLayerStyles()
  styles.stroke.enabled = true
  styles.stroke.color = { r: 21, g: 80, b: 201, a: 173 }
  const geometry = { x: 0, y: 0, width: 9, height: 9 }
  const source = Array.from({ length: 81 }, (_, i) => ({
    r: i * 37 % 256, g: i * 53 % 256, b: i * 91 % 256,
    a: [0, 0, 35, 128, 255][i * 17 % 5]
  }))
  const read = (x: number, y: number) => x >= 0 && x < 9 && y >= 0 && y < 9 ? source[y * 9 + x] : TRANSPARENT
  const hash = createHash('sha256')
  // This checksum records the original directed sampler, including traversal
  // order and ties between partially transparent nearest source pixels.
  for (const kernel of ['round', 'square', 'horizontal', 'vertical'] as const) {
    styles.stroke.kernel = kernel
    for (const size of [1, 3]) for (const position of ['inside', 'outside', 'both'] as const) {
      styles.stroke.size = size
      styles.stroke.position = position
      for (const smartHue of [false, true]) for (const followOpacity of [false, true]) {
        styles.stroke.smartHue = smartHue
        styles.stroke.followOpacity = followOpacity
        for (let directionSet = 0; directionSet < 3; directionSet += 1) {
          for (const direction of OUTLINE_DIRECTIONS) styles.stroke.directions[direction] = directionSet === 0
            ? outlineDirectionsForKernel(kernel)[direction]
            : directionSet === 1 ? ['nw', 'e', 's'].includes(direction) : false
          for (let y = -3; y < 12; y += 1) for (let x = -3; x < 12; x += 1) {
            const pixel = applyLayerStylesAt(geometry, styles, x, y, read(x, y), read)
            hash.update(new Uint8Array([pixel.r, pixel.g, pixel.b, pixel.a]))
          }
        }
      }
    }
  }
  expect(hash.digest('hex')).toMatchInlineSnapshot(`"49d4cf36dfbaf3fd01b65cef5f2770760284b934221750b2f1839721ebb2693a"`)
})
