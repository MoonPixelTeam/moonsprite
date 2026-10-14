import { describe, expect, it } from 'vitest'
import { retainsCanvasCursorOverlayOnLeave } from './useCanvasDeviceRouter'

describe('canvas cursor leave retention', () => {
  it('clears a hover cursor for normal tools outside the canvas', () => {
    expect(retainsCanvasCursorOverlayOnLeave(null, 'off')).toBe(false)
  })

  it('retains only captured selection and tile-repeat gestures', () => {
    expect(retainsCanvasCursorOverlayOnLeave({ kind: 'lasso' } as never, 'off')).toBe(true)
    expect(retainsCanvasCursorOverlayOnLeave({ kind: 'draw' } as never, 'both')).toBe(true)
    expect(retainsCanvasCursorOverlayOnLeave({ kind: 'draw' } as never, 'off')).toBe(false)
  })
})
