import { createElement } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CanvasAnchor, SelectionMask } from '@shared/types-selection'
import { transformedSelectionPivotPreset } from '@/core/selection'
import { SelectionPivotControls, selectionPivotControlTarget } from './SelectionPivotControls'

afterEach(cleanup)

it('disables drawing-anchor adjustment and closes an open popover when drawing with anchor is turned off', () => {
  const props = { drawingAnchor: true, target: { x: 0, y: 0, width: 32, height: 32 }, angle: 0, pivot: null, visible: true, onPivotChange: vi.fn(), onVisibleChange: vi.fn() }
  const view = render(createElement(SelectionPivotControls, { ...props, disabled: true }))
  const trigger = view.getByRole('button')
  expect(trigger).toBeDisabled()
  fireEvent.click(trigger)
  expect(view.queryByRole('dialog')).toBeNull()
  view.rerender(createElement(SelectionPivotControls, { ...props, disabled: false }))
  fireEvent.click(trigger)
  expect(view.getByRole('dialog')).toBeInTheDocument()
  view.rerender(createElement(SelectionPivotControls, { ...props, disabled: true }))
  expect(view.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  view.rerender(createElement(SelectionPivotControls, { ...props, disabled: false }))
  expect(view.queryByRole('dialog')).toBeNull()
  expect(props.onPivotChange).not.toHaveBeenCalled()
  expect(props.onVisibleChange).not.toHaveBeenCalled()
})

it('keeps ordinary selection-pivot controls available by default', () => {
  const view = render(createElement(SelectionPivotControls, { target: { x: 0, y: 0, width: 32, height: 32 }, angle: 0, pivot: null, visible: true, onPivotChange: vi.fn(), onVisibleChange: vi.fn() }))
  const trigger = view.getByRole('button')
  expect(trigger).toBeEnabled()
  fireEvent.click(trigger)
  expect(view.getByRole('dialog')).toBeInTheDocument()
})

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
