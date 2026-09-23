import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import * as rows from './LayerTreeRows'
import * as singleRow from './LayerTreeRow'
import { LayersPanel } from './LayersPanel'
import { revealLayerInPanel } from '@/components/layer-panel-reveal'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useWorkspace.setState({ sessions: [], activeId: null }) })

it('updates only the old and new raster rows on canvas auto-selection and keeps cached actions live', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('many layer controls', 4, 4, 'rgba')
  for (let i = 0; i < 40; i++) document.layers.push(createLayer(`Layer ${i}`, 4, 4, 'rgba'))
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().activateLayerForCanvas(document.layers[0].id)
  const rowRender = vi.spyOn(singleRow, 'LayerTreeRow')
  const { container, rerender } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const previous = document.layers[0], next = document.layers[1], untouched = document.layers[20]
  rowRender.mockClear()
  act(() => useWorkspace.getState().activateLayerForCanvas(next.id))
  const renderedIds = rowRender.mock.calls.flatMap(([{ displayRow }]) =>
    displayRow.kind !== 'mask' && displayRow.node.kind === 'layer' ? [displayRow.node.layer.id] : [])
  expect(new Set(renderedIds)).toEqual(new Set([previous.id, next.id]))
  expect(container.querySelector(`[data-layer-id="${next.id}"]`)).toHaveClass('active-layer')
  expect(container.querySelector(`[data-layer-id="${previous.id}"]`)).not.toHaveClass('active-layer')
  // This row retained its markup from before the active target changed.
  const cached = container.querySelector<HTMLElement>(`[data-layer-id="${untouched.id}"]`)!
  fireEvent.pointerDown(cached, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
  expect(document.activeLayerId).toBe(untouched.id)
  act(() => useWorkspace.getState().setLayerLocked(untouched.id, true))
  // InspectorPanels supplies the metadata revision update in the full app.
  rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  expect(cached.querySelector('.layer-lock-toggle')).toHaveAttribute('aria-pressed', 'true')
})

it('reveals an existing layer on repeated canvas clicks without rendering rows or forcing layout', () => {
  localStorage.clear()
  const observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = []
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor() { observers.push(this) }
  })
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('move click feedback', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  const tree = vi.spyOn(rows, 'LayerTreeRows')
  const { container, unmount } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
  const row = container.querySelector<HTMLElement>(`[data-layer-id="${document.activeLayerId}"]`)!
  const list = container.querySelector<HTMLElement>('.layer-animation-list')!
  const rowBounds = vi.spyOn(row, 'getBoundingClientRect')
  const listBounds = vi.spyOn(list, 'getBoundingClientRect')
  tree.mockClear()
  for (let i = 0; i < 3; i++) act(() => revealLayerInPanel(document.id, document.activeLayerId))
  expect(tree).not.toHaveBeenCalled()
  expect(rowBounds).not.toHaveBeenCalled()
  expect(listBounds).not.toHaveBeenCalled()
  expect(observers).toHaveLength(3)
  expect(observers[0].disconnect).toHaveBeenCalled()
  expect(observers[1].disconnect).toHaveBeenCalled()
  expect(observers[2].observe).toHaveBeenCalledWith(row)
  unmount()
  expect(observers[2].disconnect).toHaveBeenCalled()
})

it('ignores global pointer releases when no layer row is being dragged', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('canvas release', 4, 4, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  const tree = vi.spyOn(rows, 'LayerTreeRows')
  render(<LayersPanel session={session} docked />)
  tree.mockClear()
  const historyPosition = session.history.position
  // Stroke completion, pan completion and cancellation all bubble to window.
  for (let i = 0; i < 3; i++) fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
  fireEvent.pointerCancel(window)
  expect(tree).not.toHaveBeenCalled()
  expect(session.history.position).toBe(historyPosition)
})

it('keeps the layer rows stable across pixel-only replacement but updates live auto-link controls', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('pixel undo', 4, 4, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  const tree = vi.spyOn(rows, 'LayerTreeRows')
  render(<LayersPanel session={session} docked />)
  tree.mockClear()
  act(() => {
    const layer = session.document.layers[0]
    if (layer.format !== 'rgba') throw new Error('Expected an RGBA fixture')
    // Pixel history restores layer buffers/objects without changing row controls.
    session.document.layers = [{ ...layer, pixels: layer.pixels.slice() }]
    const focus = session.timelineActiveContext
    session.timelineActiveContext = { ...focus, row: focus.row ? { ...focus.row } : null }
    useWorkspace.setState({ sessions: [session] })
  })
  expect(tree).not.toHaveBeenCalled()
  act(() => {
    session.document.layers[0].autoLinkAnimationCels = !session.document.layers[0].autoLinkAnimationCels
    useWorkspace.setState({ sessions: [session] })
  })
  expect(tree).toHaveBeenCalled()
})

it('updates selection guides on content changes without requiring unrelated pointer releases', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('selection guides', 4, 4, 'rgba')
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectLayer(document.activeLayerId)
  const session = useWorkspace.getState().sessions[0]
  const tree = vi.spyOn(rows, 'LayerTreeRows')
  const { container } = render(<LayersPanel session={session} docked />)
  expect(container.querySelector('.has-layer-selection-outline')).not.toBeNull()
  const commitContent = (): void => {
    act(() => {
      session.contentRevision += 1
      useWorkspace.setState({ sessions: [session] })
    })
  }
  commitContent()
  expect(container.querySelector('.has-layer-selection-outline')).toBeNull()
  tree.mockClear()
  commitContent()
  fireEvent.pointerUp(window)
  expect(tree).not.toHaveBeenCalled()
})
