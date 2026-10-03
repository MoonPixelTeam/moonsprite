import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from '../color-sampling-events'
import { EditorToolOptions } from './EditorToolOptions'

vi.mock('@/components/useQuickToolShortcut', () => ({ currentHeldShortcutKeyParts: () => new Set(), useQuickToolShortcut: () => null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }); localStorage.clear() })

it('keeps the selected gradient stop editor alive through eyedropper sampling and tool restoration', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const store = useWorkspace.getState()
  store.addSession(createDocument('gradient sampling', 4, 4, 'rgba'))
  store.setTool('fill')
  store.setFillKind('gradient')
  render(<EditorToolOptions onOpenColorReplacement={() => {}} />)
  fireEvent.click(document.querySelector('.gradient-freeform-open')!)
  fireEvent.click(document.querySelectorAll('.gradient-editor-stop')[1])
  fireEvent.click(document.querySelector('[data-gradient-selected-color] .color-value-trigger')!)
  const picker = document.querySelector('.color-editor-eyedropper')!
  expect(picker).not.toBeNull()
  fireEvent.click(picker)
  expect(useWorkspace.getState().sessions[0].tool).toBe('eyedropper')
  expect(document.querySelector('.color-editor-eyedropper')).toBe(picker)
  expect(picker).toHaveAttribute('aria-pressed', 'true')
  const color = { r: 12, g: 80, b: 140, a: 128 }
  act(() => { publishCanvasColorSample(color, false); publishCanvasColorSamplingCompleted() })
  const session = useWorkspace.getState().sessions[0]
  expect(session.tool).toBe('fill')
  expect(session.fillKind).toBe('gradient')
  expect(session.gradientStops?.[1].color).toEqual(color)
  expect(document.querySelector('.color-editor-eyedropper')).toBe(picker)
  expect(picker).toHaveAttribute('aria-pressed', 'false')
  expect(document.querySelectorAll('.gradient-editor-stop')[1]).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(picker)
  fireEvent.click(picker)
  expect(useWorkspace.getState().sessions[0].tool).toBe('fill')
})
