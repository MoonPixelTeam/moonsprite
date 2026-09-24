import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import * as brushes from '@/core/brushes'
import { useWorkspace } from '@/store/workspace'
import { EditorToolOptions } from './EditorToolOptions'
import { CanvasInputState } from '@/core/canvas-input'
import { flushCanvasBrushSize, queueCanvasBrushSize } from '../canvas-brush-size-update'

vi.mock('@/components/useQuickToolShortcut', () => ({ currentHeldShortcutKeyParts: () => new Set(), useQuickToolShortcut: () => null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); useWorkspace.setState({ sessions: [], activeId: null }); document.querySelectorAll('canvas').forEach(canvas => canvas.remove()) })

it('shows the live size without publishing workspace changes or rerendering the toolbar', () => {
  vi.useFakeTimers()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('live size', 2, 2, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  const input = new CanvasInputState()
  input.modifierBrushSize = { x: 0, y: 0, size: session.brushSize }
  const canvas = document.createElement('canvas')
  document.body.append(canvas)
  const view = render(<EditorToolOptions onOpenColorReplacement={() => {}} />)
  const notified = vi.fn(), unsubscribe = useWorkspace.subscribe(notified)
  act(() => { queueCanvasBrushSize(input, session, 57, canvas, true); vi.advanceTimersToNextFrame() })
  expect(view.container.querySelector('.brush-size-control input')).toHaveValue('57')
  expect(notified).not.toHaveBeenCalled()
  act(() => flushCanvasBrushSize(input))
  expect(session.brushSize).toBe(57)
  expect(notified).toHaveBeenCalledOnce()
  unsubscribe()
})

it('reuses procedural textures while size changes but rebuilds them when their settings change', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const store = useWorkspace.getState()
  store.addSession(createDocument('brush options', 2, 2, 'rgba'))
  const generate = vi.spyOn(brushes, 'createProceduralBrushes')
  const view = render(<EditorToolOptions onOpenColorReplacement={() => {}} />)
  expect(generate).toHaveBeenCalledOnce()
  for (const size of [12, 32, 64, 128]) act(() => store.setBrushSize(size))
  expect(generate).toHaveBeenCalledOnce()
  expect(view.container.querySelector('.brush-size-control input')).toHaveValue('64')
  act(() => store.setBrushImage(brushes.createProceduralBrush('procedural:noise')))
  expect(generate).toHaveBeenCalledOnce()
  act(() => store.setProceduralBrushSettings({ scale: 12 }))
  expect(generate).toHaveBeenCalledTimes(2)
})
