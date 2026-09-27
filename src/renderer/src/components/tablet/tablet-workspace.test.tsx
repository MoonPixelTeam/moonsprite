import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { beginCanvasToolGesture, clearCanvasToolGestures } from '@/core/canvas-tool-gesture-lock'
import { resetTabletInteraction, tabletTemporaryTool } from '@/core/tablet-interaction'
import { useWorkspace } from '@/store/workspace'
import { TabletPressButton } from './TabletPressButton'
import { TabletAssistBar } from './TabletAssistBar'

beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); resetTabletInteraction(); clearCanvasToolGestures()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => { cleanup(); document.querySelectorAll('.tablet-test-panel').forEach(node => node.remove()); vi.useRealTimers(); vi.restoreAllMocks(); resetTabletInteraction(); clearCanvasToolGestures() })

it.each(['pointerUp', 'pointerCancel', 'lostPointerCapture', 'blur'] as const)('releases a held shared button on %s', release => {
  const change = vi.fn()
  const view = render(<TabletPressButton label="hold" active={false} onActive={change} />)
  const button = view.getByRole('button')
  button.setPointerCapture = vi.fn()
  fireEvent.pointerDown(button, { pointerId: 2, pointerType: 'touch', button: 0 })
  expect(change).toHaveBeenLastCalledWith(true)
  if (release === 'blur') fireEvent.blur(window)
  else fireEvent[release](button, { pointerId: 2, pointerType: 'touch' })
  expect(change.mock.calls).toEqual([[true], [false]])
  expect(button.classList.contains('quiet-button')).toBe(true)
})

it('latches only on click and releases keyboard holds on unmount', () => {
  const change = vi.fn()
  const view = render(<TabletPressButton label="hold" active={false} locked onActive={change} />)
  const button = view.getByRole('button')
  fireEvent.pointerDown(button, { button: 0, pointerId: 2 }); fireEvent.pointerUp(button)
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(button); expect(change).toHaveBeenLastCalledWith(true)
  view.rerender(<TabletPressButton label="hold" active={false} onActive={change} />)
  fireEvent.keyDown(button, { key: ' ' }); view.unmount()
  expect(change).toHaveBeenLastCalledWith(false)
})

it('uses shared fields, nudges once per tap, stops repeat on cancel, and guards history during a stroke', async () => {
  const doc = createDocument('tablet', 32, 32, 'rgba')
  useWorkspace.getState().addSession(doc)
  await useWorkspace.getState().addLayer()
  useWorkspace.getState().setSelection({ x: 2, y: 2, width: 4, height: 4 })
  const nudge = vi.spyOn(useWorkspace.getState(), 'moveActiveSelection').mockImplementation(() => {})
  const undo = vi.spyOn(useWorkspace.getState(), 'undo').mockImplementation(() => {})
  const view = render(<TabletAssistBar docked onClose={vi.fn()} />)
  view.getAllByRole('button').forEach(button => { button.setPointerCapture = vi.fn() })
  expect(view.container.querySelector('.number-input-touch')).not.toBeNull()
  expect(view.container.querySelector('.range-field')).not.toBeNull()
  expect(view.container.querySelector('input[type="number"]')).toBeNull()
  const left = view.getByRole('button', { name: '向左移动 1 像素' })
  fireEvent.pointerDown(left, { pointerId: 1, button: 0, pointerType: 'touch' }); fireEvent.pointerUp(left); fireEvent.click(left, { detail: 0 })
  expect(nudge).toHaveBeenCalledExactlyOnceWith(-1, 0)
  fireEvent.pointerDown(left, { pointerId: 1, button: 0 }); act(() => vi.advanceTimersByTime(400)); fireEvent.pointerCancel(left)
  const calls = nudge.mock.calls.length; act(() => vi.advanceTimersByTime(1000)); expect(nudge).toHaveBeenCalledTimes(calls)
  const undoButton = view.getByRole('button', { name: '撤销' }) as HTMLButtonElement
  expect(undoButton.disabled).toBe(false)
  beginCanvasToolGesture(8); fireEvent.click(undoButton); expect(undo).not.toHaveBeenCalled()
  fireEvent.pointerDown(view.getByRole('button', { name: '按住取色' }), { pointerId: 3, button: 0 })
  expect(tabletTemporaryTool(doc.id)).toBe('eyedropper')
  fireEvent.blur(window); expect(tabletTemporaryTool(doc.id)).toBeNull()
})
