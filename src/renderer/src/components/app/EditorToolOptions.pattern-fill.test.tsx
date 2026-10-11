import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { EditorToolOptions } from './EditorToolOptions'

vi.mock('@/components/useQuickToolShortcut', () => ({ currentHeldShortcutKeyParts: () => new Set(), useQuickToolShortcut: () => null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }); localStorage.clear() })

it('opens one editable regular fill dialog, preserves its draft across tools, saves and closes', () => {
  vi.useFakeTimers()
  const store = useWorkspace.getState()
  store.addSession(createDocument('fill settings', 16, 16, 'rgba'))
  store.setTool('fill')
  store.setFillKind('bucket')
  store.setBrushImage({ id: 'pattern', name: 'Pattern', width: 2, height: 1, intrinsicSize: true, coverage: new Uint8Array([255, 255]) })
  store.setFillPatternMode('regular')
  render(<EditorToolOptions onOpenColorReplacement={() => {}} />)
  fireEvent.click(document.querySelector('.fill-pattern-controls .icon-button')!)
  expect(document.querySelectorAll('.fill-pattern-settings-modal')).toHaveLength(1)
  const dialog = document.querySelector<HTMLElement>('.fill-pattern-settings-modal')!
  const angle = dialog.querySelector<HTMLInputElement>('input[type="range"][min="-180"]')!
  fireEvent.change(angle, { target: { value: '45' } })
  expect(angle.value).toBe('45')
  act(() => store.setTool('selection'))
  expect(document.querySelector('.fill-pattern-settings-modal')).toBe(dialog)
  expect(angle.value).toBe('45')
  fireEvent.submit(dialog)
  act(() => vi.advanceTimersByTime(120))
  expect(document.querySelectorAll('.fill-pattern-settings-modal')).toHaveLength(0)
  expect(useWorkspace.getState().sessions[0].fillPatternSettings.regularAngle).toBe(45)
  act(() => { store.setTool('fill'); store.setBrushImage({ id: 'pattern', name: 'Pattern', width: 2, height: 1, intrinsicSize: true, coverage: new Uint8Array([255, 255]) }) })
  fireEvent.click(document.querySelector('.fill-pattern-controls .icon-button')!)
  const reopened = document.querySelector<HTMLElement>('.fill-pattern-settings-modal')!
  expect(reopened.querySelector<HTMLInputElement>('input[type="range"][min="-180"]')!.value).toBe('45')
  fireEvent.click(reopened.querySelector('header button')!)
  expect(document.querySelectorAll('.fill-pattern-settings-modal')).toHaveLength(0)
})






