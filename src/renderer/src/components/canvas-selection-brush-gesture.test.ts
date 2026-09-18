import { describe, expect, it } from 'vitest'
import { selectionBrushOwnsPointer } from './canvas-selection-brush-gesture'
import type { SelectionHit } from '@/core/canvas-input-state'

describe('selection brush transform routing', () => {
  it.each(['inside', 'outside', 'nw', 'se', 'edge'] as SelectionHit[])('yields %s to active free transform', hit => {
    expect(selectionBrushOwnsPointer(true, hit)).toBe(false)
  })
  it.each(['inside', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w', 'edge'] as SelectionHit[])('leaves %s handles to normal selection transforms', hit => {
    expect(selectionBrushOwnsPointer(false, hit)).toBe(false)
  })
  it('can start a brush selection outside an existing selection', () => {
    expect(selectionBrushOwnsPointer(false, 'outside')).toBe(true)
  })
})
