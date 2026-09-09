import { describe, expect, it } from 'vitest'
import { normalizeTextBoxBounds, normalizeTextCelData } from './text-cel-data'

describe('text layout data', () => {
  it('keeps legacy fixed boxes as box layout and defaults their alignment left', () => {
    const data = normalizeTextCelData({ text: 'Text', boxWidth: 40, boxHeight: 16 })
    expect(data).toMatchObject({ layoutMode: 'box', textAlign: 'left', boxWidth: 40, boxHeight: 16 })
  })

  it('keeps free text free even when stale box dimensions are present', () => {
    const data = normalizeTextCelData({ text: 'Text', layoutMode: 'free', boxWidth: 40, boxHeight: 16, textAlign: 'center' })
    expect(data).toMatchObject({ layoutMode: 'free', textAlign: 'center' })
    expect(data.boxWidth).toBeUndefined()
    expect(data.boxHeight).toBeUndefined()
  })

  it('creates a valid box when switching to box layout without prior dimensions', () => {
    const data = normalizeTextCelData({ text: 'Text', layoutMode: 'box', textAlign: 'right' })
    expect(data).toMatchObject({ layoutMode: 'box', textAlign: 'right' })
    expect(data.boxWidth).toBeGreaterThan(0)
    expect(data.boxHeight).toBeGreaterThan(0)
  })

  it('keeps text box positions outside the canvas while normalizing its size', () => {
    expect(normalizeTextBoxBounds({ x: -12.8, y: 91.2, width: 0, height: 32.7 })).toEqual({ x: -12, y: 91, width: 1, height: 33 })
  })
})
