import { describe, expect, it } from 'vitest'
import { eyedropperMagnifierContentPoint, eyedropperMagnifierViewTransform } from './eyedropper-magnifier'

describe('eyedropper magnifier view transform', () => {
  it('maps lens coordinates back through the same rotation as the canvas', () => {
    const transform = eyedropperMagnifierViewTransform(90)
    const center = { x: 100, y: 100 }

    // A source pixel to the right is displayed below after a clockwise 90°
    // canvas rotation, so the inverse lookup of that displayed point is right.
    expect(eyedropperMagnifierContentPoint({ x: 100, y: 101 }, center, transform)).toEqual({ x: 101, y: 100 })
  })

  it('keeps mirror flags in the same transform chain', () => {
    const transform = eyedropperMagnifierViewTransform(90, true, false)
    const center = { x: 100, y: 100 }
    expect(eyedropperMagnifierContentPoint({ x: 100, y: 101 }, center, transform)).toEqual({ x: 99, y: 100 })
  })

  it('normalizes invalid rotation input to an identity rotation', () => {
    expect(eyedropperMagnifierViewTransform(Number.NaN)).toEqual({
      rotationRadians: 0,
      cosine: 1,
      sine: 0,
      mirrored: false,
      mirroredVertical: false
    })
  })
})
