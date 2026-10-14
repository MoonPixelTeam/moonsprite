import { describe, expect, it } from 'vitest'
import { rangeValueWithShiftStep } from './range-step'

describe('range Shift stepping', () => {
  it('uses ten-point steps for percentages and five-point steps for numbers', () => {
    expect(rangeValueWithShiftStep(46, 0, 100, 1, 'percentage', true)).toBe(50)
    expect(rangeValueWithShiftStep(46, 0, 128, 1, 'number', true)).toBe(45)
    expect(rangeValueWithShiftStep(-43, -180, 180, 1, 'number', true)).toBe(-45)
  })

  it('keeps exact bounds reachable and never reduces an existing larger step', () => {
    expect(rangeValueWithShiftStep(1, 1, 100, 1, 'percentage', true)).toBe(1)
    expect(rangeValueWithShiftStep(100, 1, 100, 1, 'percentage', true)).toBe(100)
    expect(rangeValueWithShiftStep(46, 0, 4000, 10, 'number', true)).toBe(50)
  })

  it('preserves the native value without Shift', () => {
    expect(rangeValueWithShiftStep(46.5, 0, 100, 0.1, 'percentage', false)).toBe(46.5)
  })
})
