import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { createDocumentPaneLayout, insertDocumentPane } from '@/core/document-pane-layout'
import { viewCanvasOrigin } from '@/core/view-geometry'
import { clipboardService } from '@/store/clipboard-service'
import { useWorkspace } from '@/store/workspace'
import { CanvasStage } from '../CanvasStage'
import { EditorCanvasHost } from './EditorCanvasHost'
import { FloatingDocumentWindow } from './FloatingDocumentWindow'
import { clearCanvasToolGestures } from '@/core/canvas-tool-gesture-lock'

const originalSetActive = useWorkspace.getState().setActive
const originalSyncTools = useWorkspace.getState().syncCanvasToolSettings

// Exercise the real split activation, clipboard commands and canvas gestures.
// Only raster presentation and unrelated toolbar UI are stubbed.
vi.mock('../canvas-render-frame', () => ({ renderCanvasFrame: vi.fn() }))
vi.mock('./QuickCommandBar', () => ({ QuickCommandBar: () => null }))
vi.mock('./document-canvas', () => ({ DocumentCanvas: ({ documentId }: { documentId: string }) => {
  const sessions = useWorkspace(state => state.sessions)
  return <CanvasStage session={sessions.find(session => session.document.id === documentId)!} />
} }))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  clipboardService.clearSelection()
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number
    readonly pointerType = 'mouse'
    readonly pressure = 0.5
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  })
  vi.stubGlobal('ResizeObserver', class { observe() {}; disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 240))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true })
  vi.stubGlobal('moonSprite', { readClipboardImage: vi.fn().mockResolvedValue(null), writeClipboardImage: vi.fn().mockResolvedValue(undefined) })
})

afterEach(() => {
  cleanup(); clearCanvasToolGestures(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
  useWorkspace.setState({ setActive: originalSetActive, syncCanvasToolSettings: originalSyncTools })
})

it.each(['split', 'standalone', 'floating'] as const)('starts middle-button pan immediately on an inactive %s canvas without activating its document', async mode => {
  const a = createDocument('a', 32, 24, 'rgba')
  const b = createDocument('b', 32, 24, 'rgba')
  useWorkspace.getState().addSession(a)
  useWorkspace.getState().addSession(b)
  useWorkspace.getState().setActive(a.id)
  useWorkspace.getState().setViewForDocument(b.id, { zoom: 2, panX: 0, panY: 0 })
  const [sessionA, sessionB] = useWorkspace.getState().sessions
  const beforeA = { ...sessionA.view }
  const beforeB = { ...sessionB.view }
  const historyRevision = sessionB.history.revision
  const activate = vi.spyOn(useWorkspace.getState(), 'setActive')
  const syncTools = vi.spyOn(useWorkspace.getState(), 'syncCanvasToolSettings')
  await act(async () => {
    if (mode === 'split') render(<EditorCanvasHost documentPaneLayout={insertDocumentPane(createDocumentPaneLayout(a.id), a.id, b.id, 'right')}
      workspaceDocumentId={a.id} paneOnlyDocumentIds={[b.id]} onDocumentPaneLayoutChange={vi.fn()} onDocumentPaneMove={vi.fn()}
      onDocumentPaneReturnToTabs={vi.fn()} shortcutFor={() => ''} onToggleMirror={vi.fn()} onOpenAntiAlias={vi.fn()} onOpenPreferences={vi.fn()} />)
    else if (mode === 'floating') render(<FloatingDocumentWindow session={sessionB} initialPosition={{ x: 10, y: 10, width: 320, height: 240 }}
      pinned={false} stackIndex={0} onActivate={activate} onPinnedChange={vi.fn()} onReturnToTabs={vi.fn()}
      onCloseDocument={vi.fn()} shortcutFor={() => ''} onToggleMirror={vi.fn()} onOpenAntiAlias={vi.fn()} onOpenPreferences={vi.fn()} />)
    else render(<CanvasStage session={sessionB} />)
  })
  act(() => vi.advanceTimersToNextFrame())
  const canvas = document.querySelector<HTMLCanvasElement>(`canvas.stage-canvas[data-document-id="${b.id}"]`)!
  expect(canvas).not.toBeNull()
  fireEvent.pointerEnter(canvas, { pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 1, buttons: 4, clientX: 100, clientY: 100 })
  expect(activate).not.toHaveBeenCalled()
  expect(syncTools).not.toHaveBeenCalled()
  fireEvent.pointerMove(canvas, { pointerId: 1, button: -1, buttons: 4, clientX: 135, clientY: 120 })
  act(() => vi.advanceTimersToNextFrame())
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 1, buttons: 0, clientX: 135, clientY: 120 })
  expect(sessionB.view.panX).toBeCloseTo(beforeB.panX + 35)
  expect(sessionB.view.panY).toBeCloseTo(beforeB.panY + 20)
  expect(sessionA.view).toEqual(beforeA)
  expect(sessionB.history.revision).toBe(historyRevision)
  expect(useWorkspace.getState().activeId).toBe(a.id)
})

it.each([false, true])('preserves each document background when moving split pastes and returning to the source (same-document first=%s)', async sameFirst => {
  const source = createDocument('copy source', 32, 24, 'rgba')
  const destination = createDocument('paste destination', 32, 24, 'rgba')
  const red = { r: 250, g: 30, b: 20, a: 255 }
  writeLayerColor(source, source.layers[0], 4 * 32 + 4, red)
  for (let i = 0; i < 32 * 24; i++) writeLayerColor(destination, destination.layers[0], i, { r: 20, g: 70, b: 160, a: 255 })
  useWorkspace.getState().addSession(source)
  useWorkspace.getState().addSession(destination)
  useWorkspace.getState().setActive(source.id)
  for (const document of [source, destination]) useWorkspace.getState().setViewForDocument(document.id, { zoom: 10, panX: 0, panY: 0, showSelectionPivot: false })
  useWorkspace.getState().setSelection({ x: 2, y: 2, width: 8, height: 8 })
  useWorkspace.getState().copySelection()
  const layout = insertDocumentPane(createDocumentPaneLayout(source.id), source.id, destination.id, 'right')
  const { container } = render(<EditorCanvasHost documentPaneLayout={layout} workspaceDocumentId={source.id} paneOnlyDocumentIds={[destination.id]}
    onDocumentPaneLayoutChange={vi.fn()} onDocumentPaneMove={vi.fn()} onDocumentPaneReturnToTabs={vi.fn()} shortcutFor={() => ''}
    onToggleMirror={vi.fn()} onOpenAntiAlias={vi.fn()} onOpenPreferences={vi.fn()} />)
  act(() => vi.advanceTimersToNextFrame())
  const targets = sameFirst ? [source, destination, source] : [destination, source]
  for (const [index, document] of targets.entries()) {
    act(() => vi.advanceTimersByTime(500))
    act(() => useWorkspace.getState().setActive(document.id))
    const before = document.layers[0].pixels.slice()
    await act(async () => { await useWorkspace.getState().pasteClipboard() })
    const session = useWorkspace.getState().sessions.find(item => item.document.id === document.id)!
    const floating = session.pendingPaste!
    expect(floating?.source.origin).toBe('clipboard')
    const start = { ...floating.target }
    const canvas = container.querySelector<HTMLCanvasElement>(`canvas.stage-canvas[data-document-id="${document.id}"]`)!
    const origin = viewCanvasOrigin(320, 240, 32, 24, session.view)
    const clientX = origin.x + (start.x + 2.5) * session.view.zoom
    const clientY = origin.y + (start.y + 2.5) * session.view.zoom
    const delta = 10 + index * 2
    const endX = clientX + delta * session.view.zoom
    // Wheel capture and pointer capture both re-activate the current pane.
    fireEvent.wheel(canvas.closest('section')!, { deltaY: 0, clientX, clientY })
    expect(session.pendingPaste).toBe(floating)
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX, clientY })
    expect(session.pendingPaste).toBe(floating)
    fireEvent.pointerMove(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: endX, clientY })
    act(() => vi.advanceTimersToNextFrame())
    fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, buttons: 0, clientX: endX, clientY })
    expect(session.pendingPaste?.source.origin).toBe('clipboard')
    expect(session.pendingPaste?.target.x).toBe(start.x + delta)
    // An actual document switch must still confirm the floating paste.
    act(() => useWorkspace.getState().setActive(document === source ? destination.id : source.id))
    expect(session.pendingPaste).toBeNull()
    act(() => useWorkspace.getState().setActive(document.id))
    const expected = before.slice()
    expected.set([red.r, red.g, red.b, red.a], ((start.y + 2) * 32 + start.x + delta + 2) * 4)
    expect(document.layers[0].pixels).toEqual(expected)
    expect(readLayerColorAt(document, document.layers[0], start.x + delta + 2, start.y + 2)).toEqual(red)
    act(() => useWorkspace.getState().undo())
    expect(document.layers[0].pixels).toEqual(before)
    act(() => useWorkspace.getState().redo())
    expect(document.layers[0].pixels).toEqual(expected)
  }
})
