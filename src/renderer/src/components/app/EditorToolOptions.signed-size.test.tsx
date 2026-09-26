import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { EditorToolOptions } from './EditorToolOptions'
vi.mock('@/components/useQuickToolShortcut', () => ({ currentHeldShortcutKeyParts: () => new Set(), useQuickToolShortcut: () => null }))
afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }); vi.restoreAllMocks() })
it('accepts negative width with aspect lock while keeping the other axis orientation', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const store = useWorkspace.getState(); store.addSession(createDocument('signed UI', 8, 8, 'rgba'))
  store.setTool('selection'); store.setSelection({ x: 1, y: 1, width: 2, height: 2 }); store.setSelectionPropertiesActive(true); store.setSelectionAspectRatio(1)
  render(<EditorToolOptions onOpenColorReplacement={() => {}} />)
  const width = screen.getByLabelText('宽')
  fireEvent.change(width, { target: { value: '-3' } }); fireEvent.blur(width)
  const pending = useWorkspace.getState().sessions[0].pendingPaste
  expect(pending?.transformTarget).toMatchObject({ width: 3, height: 3 })
  expect(pending?.transformTarget?.flipHorizontal).toBe(true)
  expect(Boolean(pending?.transformTarget?.flipVertical)).toBe(false)
  expect(width).toHaveValue('-3')
  act(() => store.updateSelectionProperties({ width: 3 }))
  expect(width).toHaveValue('3')
})
