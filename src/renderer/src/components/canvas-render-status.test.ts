import { describe, expect, it } from 'vitest'
import { canvasStatusTextBaselineY } from './canvas-render-status'

describe('canvas status layout', () => {
  it('reserves exactly the visible horizontal scrollbar height at the bottom of the canvas', () => {
    expect(canvasStatusTextBaselineY(100, 0)).toBe(88)
    expect(canvasStatusTextBaselineY(100, 10)).toBe(78)
  })

  it('does not let an invalid safe-area value push the status text downward', () => {
    expect(canvasStatusTextBaselineY(100, -10)).toBe(88)
  })
})
