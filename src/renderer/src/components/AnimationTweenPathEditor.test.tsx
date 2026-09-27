import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AnimationTweenPathEditor } from './AnimationTweenPathEditor'
import { loadTweenPathPresets, saveTweenPathPreset } from '@/core/animation-tween-path-presets'
import { translateCurrent } from '@/core/localization'

vi.mock('./I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  localStorage.clear(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function setup(pivotX = 0) {
  const onApply = vi.fn(), onCancel = vi.fn()
  const view = render(<AnimationTweenPathEditor initialPath={[{ x: 0, y: 0 }]} palette={[]} pivot={{ x: pivotX, y: 0, width: 10, height: 10 }} documentSize={{ width: 100, height: 100 }} onApply={onApply} onCancel={onCancel} />)
  const canvas = view.getByLabelText('timeline.tween.pathDrawn') as HTMLCanvasElement
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 900, height: 520 } as DOMRect)
  canvas.setPointerCapture = vi.fn(); canvas.hasPointerCapture = vi.fn().mockReturnValue(true); canvas.releasePointerCapture = vi.fn()
  const stroke = (x: number, id = 1) => {
    fireEvent.pointerDown(canvas, { button: 0, pointerId: id, clientX: x, clientY: 220 })
    fireEvent.pointerMove(canvas, { pointerId: id, clientX: x + 40, clientY: 250 })
    fireEvent.pointerUp(canvas, { pointerId: id, clientX: x + 80, clientY: 260 })
  }
  const button = (key: string) => view.getByRole('button', { name: key }) as HTMLButtonElement
  return { ...view, canvas, stroke, button, onApply, onCancel }
}
it('saves a drawn path, reuses it after reopening at a new anchor, and undoes the load locally', () => {
  const first = setup()
  first.stroke(300)
  fireEvent.click(first.button('common.apply'))
  const original = first.onApply.mock.calls[0][0]
  fireEvent.change(first.getByRole('textbox', { name: 'timeline.tween.pathName' }), { target: { value: 'Jump' } })
  fireEvent.click(first.button('timeline.tween.pathSave'))
  expect(first.getByText('timeline.tween.pathSaved')).toHaveAttribute('role', 'status')
  expect(loadTweenPathPresets()[0].path).toEqual(original)
  first.unmount()
  const next = setup(40)
  fireEvent.click(next.getByRole('button', { name: 'timeline.tween.pathLibrary' }))
  expect(next.getByRole('listbox', { name: 'timeline.tween.pathLibrary' })).toHaveClass('themed-select-popover')
  fireEvent.click(next.getByRole('option', { name: 'Jump' }))
  fireEvent.click(next.button('timeline.tween.pathLoad'))
  expect(next.onApply).not.toHaveBeenCalled()
  fireEvent.click(next.button('common.apply'))
  expect(next.onApply).toHaveBeenLastCalledWith(original, { x: 45, y: 5 })
  fireEvent.click(next.button('common.undo'))
  expect(next.button('common.apply')).toBeDisabled()
  fireEvent.click(next.button('common.redo'))
  expect(next.button('common.apply')).toBeEnabled()
  expect(loadTweenPathPresets()[0].path).toEqual(original)
})

it('allows native name entry and text undo without editing the path or triggering app shortcuts', () => {
  const view = setup()
  view.stroke(300)
  const input = view.getByRole('textbox', { name: 'timeline.tween.pathName' })
  input.focus()
  expect(fireEvent.keyDown(input, { key: 'b' })).toBe(true)
  expect(fireEvent.keyDown(input, { key: 'z', ctrlKey: true })).toBe(true)
  expect(view.button('common.apply')).toBeEnabled()
  expect(fireEvent.keyDown(input, { key: 's', ctrlKey: true })).toBe(false)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(document.activeElement).toBe(view.canvas)
  expect(view.onCancel).not.toHaveBeenCalled()
})

it('shows save failures without claiming success or changing the saved library', () => {
  saveTweenPathPreset('Existing', [{ x: 0, y: 0 }, { x: 8, y: 0 }])
  const view = setup()
  view.stroke(300)
  fireEvent.change(view.getByRole('textbox', { name: 'timeline.tween.pathName' }), { target: { value: 'New' } })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full') })
  fireEvent.click(view.button('timeline.tween.pathSave'))
  expect(view.getByRole('alert')).toHaveTextContent(translateCurrent('timeline.tween.pathSaveFailed'))
  expect(view.queryByText('timeline.tween.pathSaved')).not.toBeInTheDocument()
  expect(loadTweenPathPresets().map((item) => item.name)).toEqual(['Existing'])
})
it('records each stroke once, supports local keyboard undo/redo and undoable clear', () => {
  const view = setup()
  expect(view.button('common.undo').disabled).toBe(true)
  view.stroke(300)
  view.stroke(400, 2)
  expect(view.onApply).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(view.button('common.apply').disabled).toBe(false)
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(view.button('common.apply').disabled).toBe(true)
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  fireEvent.click(view.button('common.apply'))
  const firstPath = view.onApply.mock.calls[0][0]
  fireEvent.click(view.button('timeline.tween.pathClear'))
  expect(view.button('common.apply').disabled).toBe(true)
  fireEvent.click(view.button('common.undo'))
  fireEvent.click(view.button('common.apply'))
  expect(view.onApply.mock.calls[1][0]).toEqual(firstPath)
})
it('does not record view changes or interrupted strokes as path edits', () => {
  const view = setup()
  fireEvent.click(view.button('preview.zoomIn'))
  fireEvent.pointerDown(view.canvas, { button: 1, pointerId: 3, clientX: 200, clientY: 200 })
  fireEvent.pointerMove(view.canvas, { pointerId: 3, clientX: 240, clientY: 220 })
  fireEvent.pointerUp(view.canvas, { pointerId: 3, clientX: 240, clientY: 220 })
  expect(view.button('common.undo').disabled).toBe(true)
  fireEvent.pointerDown(view.canvas, { button: 0, pointerId: 4, clientX: 300, clientY: 200 })
  fireEvent.pointerMove(view.canvas, { pointerId: 4, clientX: 350, clientY: 240 })
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(view.onCancel).not.toHaveBeenCalled()
  expect(view.button('common.undo').disabled).toBe(true)
  expect(view.button('common.apply').disabled).toBe(true)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(view.onCancel).toHaveBeenCalledOnce()
})
it('discards the redo branch after drawing a replacement stroke', () => {
  const view = setup()
  view.stroke(300)
  fireEvent.click(view.button('common.undo'))
  expect(view.button('common.redo').disabled).toBe(false)
  view.stroke(450, 2)
  expect(view.button('common.redo').disabled).toBe(true)
})

it('snaps drawing to canvas pixels and translates the entire path with its anchor', () => {
  const view = setup()
  view.stroke(300)
  fireEvent.click(view.button('common.apply'))
  const [path, anchor] = view.onApply.mock.calls[0]
  expect(path.every((point: { x: number; y: number }) => Number.isInteger(point.x) && Number.isInteger(point.y))).toBe(true)
  fireEvent.click(view.button('timeline.tween.pathAnchor'))
  // Initial fit is 42 CSS pixels per document pixel for the 10x10 content.
  fireEvent.pointerDown(view.canvas, { button: 0, pointerId: 5, clientX: 450, clientY: 260 })
  fireEvent.pointerMove(view.canvas, { pointerId: 5, clientX: 534, clientY: 302 })
  fireEvent.pointerUp(view.canvas, { pointerId: 5, clientX: 534, clientY: 302 })
  fireEvent.click(view.button('common.apply'))
  const [moved, movedAnchor] = view.onApply.mock.calls[1]
  expect(movedAnchor).toEqual({ x: anchor.x + 2, y: anchor.y + 1 })
  expect(moved[0]).toEqual({ x: 0, y: 0 })
  expect(moved).toEqual(path)
  for (let index = 0; index < path.length; index++) {
    expect(moved[index].x + movedAnchor.x).toBe(path[index].x + anchor.x + 2)
    expect(moved[index].y + movedAnchor.y).toBe(path[index].y + anchor.y + 1)
  }
  fireEvent.click(view.button('common.undo'))
  fireEvent.click(view.button('common.apply'))
  expect(view.onApply.mock.calls[2]).toEqual([path, anchor])
  fireEvent.click(view.button('common.redo'))
  fireEvent.click(view.button('common.apply'))
  expect(view.onApply.mock.calls[3]).toEqual([path, movedAnchor])
})
it('isolates every key from background listeners and keeps Tab focus in the editor', () => {
  const outside = vi.fn(), outsideUp = vi.fn()
  window.addEventListener('keydown', outside, true)
  window.addEventListener('keyup', outsideUp, true)
  const view = setup()
  try {
    for (const key of ['s', 'o', 'b', 'Delete', ' ']) {
      fireEvent.keyDown(window, { key, ctrlKey: key === 's' || key === 'o' })
      fireEvent.keyUp(window, { key })
    }
    expect(outside).not.toHaveBeenCalled()
    expect(outsideUp).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement?.closest('.animation-tween-path-editor')).toBeTruthy()
    view.unmount()
    fireEvent.keyDown(window, { key: 'b' })
    expect(outside).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener('keydown', outside, true)
    window.removeEventListener('keyup', outsideUp, true)
  }
})

it('uses Shift to rubber-band one straight connection and undoes it as one stroke', () => {
  const view = setup()
  view.stroke(300)
  fireEvent.click(view.button('common.apply'))
  const original = view.onApply.mock.calls[0][0]
  fireEvent.pointerDown(view.canvas, { button: 0, pointerId: 8, clientX: 492, clientY: 260, shiftKey: true })
  fireEvent.pointerMove(view.canvas, { pointerId: 8, clientX: 534, clientY: 386, shiftKey: true })
  fireEvent.pointerUp(view.canvas, { pointerId: 8, clientX: 576, clientY: 260, shiftKey: true })
  fireEvent.click(view.button('common.apply'))
  const path = view.onApply.mock.calls[1][0]
  expect(path.at(-1)).toEqual({ x: 3, y: 0 })
  expect(path.every((point: { y: number }) => point.y <= 0)).toBe(true)
  fireEvent.click(view.button('common.undo'))
  fireEvent.click(view.button('common.apply'))
  expect(view.onApply.mock.calls[2][0]).toEqual(original)
})
