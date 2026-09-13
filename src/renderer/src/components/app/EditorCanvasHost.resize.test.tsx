import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { createDocumentPaneLayout, insertDocumentPane } from '@/core/document-pane-layout'
import { useWorkspace } from '@/store/workspace'
import { isWorkspaceResizing } from '../workspace-resize'
import { EditorCanvasHost } from './EditorCanvasHost'

vi.mock('./document-canvas', () => ({ DocumentCanvas: () => <div className="stage-surface" style={{ width: 300, height: 200 }}><canvas /></div> }))
vi.mock('./QuickCommandBar', () => ({ QuickCommandBar: () => null }))

beforeEach(() => {
  vi.useFakeTimers()
  useWorkspace.setState({ sessions: [], activeId: null })
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('document-pane-resizer') ? new DOMRect(0, 0, 6, 6) : new DOMRect(0, 0, 606, 606)
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

function mountSplit(direction: 'right' | 'bottom' = 'right') {
  useWorkspace.getState().addSession(createDocument('first', 8, 8, 'rgba'))
  useWorkspace.getState().addSession(createDocument('second', 8, 8, 'rgba'))
  const [first, second] = useWorkspace.getState().sessions
  const layout = insertDocumentPane(createDocumentPaneLayout(first.document.id), first.document.id, second.document.id, direction)
  const changed = vi.fn()
  const view = render(<EditorCanvasHost documentPaneLayout={layout} workspaceDocumentId={first.document.id} paneOnlyDocumentIds={[second.document.id]}
    onDocumentPaneLayoutChange={changed} onDocumentPaneMove={vi.fn()} onDocumentPaneReturnToTabs={vi.fn()} shortcutFor={() => ''}
    onToggleMirror={vi.fn()} onOpenAntiAlias={vi.fn()} onOpenPreferences={vi.fn()} />)
  const separator = view.getByRole('separator')
  fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
  return { ...view, changed, separator, layout }
}

it.each(['right', 'bottom'] as const)('previews a %s split without publishing layout and commits the final release point once', direction => {
  const { changed, layout } = mountSplit(direction)
  for (let i = 0; i < 50; i++) fireEvent.pointerMove(window, { pointerId: 1, clientX: 150, clientY: 150 })
  act(() => vi.advanceTimersToNextFrame())
  expect(changed).not.toHaveBeenCalled()
  expect(isWorkspaceResizing()).toBe(true)
  fireEvent.pointerUp(window, { pointerId: 1, clientX: 190, clientY: 190 })
  expect(changed).toHaveBeenCalledTimes(1)
  expect(changed.mock.calls[0][0].ratio).toBeCloseTo((layout.kind === 'split' ? layout.ratio : 0) + 90 / 600)
  expect(isWorkspaceResizing()).toBe(false)
})

it.each(['pointercancel', 'lostpointercapture', 'blur', 'unmount'])('cleans up a resize on %s without publishing its preview', event => {
  const { changed, separator, unmount, container } = mountSplit()
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 150, clientY: 150 })
  act(() => vi.advanceTimersToNextFrame())
  if (event === 'unmount') unmount()
  else if (event === 'blur') fireEvent(window, new Event('blur'))
  else fireEvent(separator, new PointerEvent(event, { pointerId: 1, bubbles: true }))
  act(() => vi.advanceTimersToNextFrame())
  expect(changed).not.toHaveBeenCalled()
  expect(isWorkspaceResizing()).toBe(false)
  expect(container.querySelector('[data-canvas-resize-frozen]')).toBeNull()
})
