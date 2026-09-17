import { describe, expect, it } from 'vitest'
import type { CanvasAnchor, SelectionMask } from '@shared/types-selection'
import { transformedSelectionPivotPreset } from '@/core/selection'
import { selectionPivotControlTarget } from './SelectionPivotControls'

describe('selection pivot control props', () => {
  it('never reads or forwards pixel data when a large irregular selection enters React props', () => {
    const selection = { x: 0, y: 0, width: 4000, height: 4000 }
    Object.defineProperty(selection, 'mask', { enumerable: true, get() { throw new Error('Control props must not inspect selection pixels') } })
    const target = selectionPivotControlTarget(selection)
    expect(target).toEqual({ x: 0, y: 0, width: 4000, height: 4000 })
    expect(Object.keys(target!)).toHaveLength(4)
    expect(selectionPivotControlTarget(null)).toBeNull()
  })
  it('preserves all pivot presets with flipped, rotated and sheared targets', () => {
    const target: SelectionMask = { x: -17, y: 33, width: 2000, height: 1000, flipHorizontal: true, flipVertical: true, flipOriginX: -3.5, flipOriginY: 60.25, mask: new Uint8Array(2_000_000) }
    const projected = selectionPivotControlTarget(target)!
    expect(projected).not.toHaveProperty('mask')
    expect(Object.keys(projected)).toHaveLength(8)
    for (const preset of ['nw', 'n', 'ne', 'w', 'center', 'e', 'sw', 's', 'se'] as CanvasAnchor[]) {
      expect(transformedSelectionPivotPreset(projected, preset, 35, { axis: 'x', edge: 'n', amount: 0.3 })).toEqual(transformedSelectionPivotPreset(target, preset, 35, { axis: 'x', edge: 'n', amount: 0.3 }))
    }
    expect(target.mask).toHaveLength(2_000_000)
  })
})
