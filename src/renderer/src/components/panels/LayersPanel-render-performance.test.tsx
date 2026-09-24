import { performance } from 'node:perf_hooks'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from '@/core/document-model'
import { ensureAnimationDocument, animationCelKey } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'
import * as thumbnails from './layer-timeline-thumbnails'
import * as cellCache from './layer-timeline-cell-cache'
import { registerAnimationCelThumbnailPreviewListener } from '@/core/canvas-preview-lifecycle'
import { writeLayerColor } from '@/core/document'
import { layersPanelRenderKey } from '@/core/panel-render-keys'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null}) })

it('updates the edited row without rebuilding the layer panel during opacity previews', () => {
  localStorage.clear()
  const document = createDocument('isolated property row', 8, 8, 'rgba')
  document.layers.push(createLayer('other', 8, 8, 'rgba'))
  useWorkspace.getState().addSession(document)
  let panelRenders = 0
  function ConnectedPanel() {
    useWorkspace(state => layersPanelRenderKey(state.sessions[0]))
    panelRenders++
    return <LayersPanel session={useWorkspace.getState().sessions[0]} docked />
  }
  const view = render(<ConnectedPanel />), store = useWorkspace.getState(), layer = document.layers[0]
  const id = store.beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
  const initialRenders = panelRenders
  const values = { name: layer.name, opacity: 1, blendMode: layer.blendMode, cumulativeBlend: false, locked: false, displayColor: null, description: '' }
  for (const opacity of [0.9, 0.7, 0.4]) act(() => store.previewLayerPropertiesTransaction(id, { ...values, opacity }, ['opacity']))
  expect(panelRenders).toBe(initialRenders)
  expect(view.getByText(/· 40%/)).toBeInTheDocument()
  act(() => store.cancelLayerPropertiesTransaction(id))
  expect(view.queryByText(/· 40%/)).not.toBeInTheDocument()
  expect(layer.opacity).toBe(1)
})

it('does not request live raster thumbnails during opacity previews, but still refreshes painted pixels', () => {
  const document = createDocument('opacity thumbnails', 8, 8, 'rgba')
  useWorkspace.getState().addSession(document)
  const layer = document.layers[0]
  function Sync() { thumbnails.useTimelineThumbnailContentSync(document.id); return null }
  render(<Sync />)
  const notify = vi.fn()
  const unregister = registerAnimationCelThumbnailPreviewListener(document.id, notify)
  try {
    const store = useWorkspace.getState()
    const id = store.beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
    const values = { name: layer.name, opacity: 1, blendMode: layer.blendMode, cumulativeBlend: false, locked: false, displayColor: null, description: '' }
    for (const opacity of [0.9, 0.8, 0.7, 0.6]) act(() => store.previewLayerPropertiesTransaction(id, { ...values, opacity }, ['opacity']))
    expect(notify).not.toHaveBeenCalled()
    act(() => store.commitLayerPropertiesTransaction(id, { ...values, opacity: 0.6 }, ['opacity']))
    expect(notify).not.toHaveBeenCalled()
    act(() => store.mutateActive(session => { writeLayerColor(session.document, layer, 0, { r: 255, g: 0, b: 0, a: 255 }) }))
    expect(notify).toHaveBeenCalled()
  } finally { unregister() }
})

it.each(['frame', 'cel'] as const)('measures complete %s range/move React updates', kind => {
  vi.useFakeTimers()
  localStorage.clear()
  const doc = createDocument('render cost', 1, 1, 'rgba')
  for (let i = 1; i < 12; i++) doc.layers.push(createLayer(`L${i}`, 1, 1, 'rgba'))
  const timeline = ensureAnimationDocument(doc)
  timeline.frames = Array.from({length: 80}, (_, i) => ({id: `f${i}`, duration: 100}))
  timeline.activeFrameId = 'f0'
  timeline.cels = doc.layers.flatMap(layer => timeline.frames.map(frame => ({id: `${layer.id}-${frame.id}`, layerId: layer.id, frameId: frame.id,
    surface: {format: 'rgba' as const, width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([255, 0, 0, 255])}})))
  useWorkspace.getState().addSession(doc)
  const session = useWorkspace.getState().sessions[0]
  const {container} = render(<LayersPanel session={session} docked />)
  const target = (i: number) => container.querySelector(kind === 'frame' ? `[data-animation-frame-id="f${i}"]` : `[data-animation-cel-key="${animationCelKey(doc.layers[0].id, `f${i}`)}"]`)!
  const contentChecks = vi.spyOn(thumbnails, 'cachedCelHasContent')
  const gridChecks = vi.spyOn(cellCache, 'timelineCellRenderState')
  fireEvent.pointerDown(target(0), {button: 0, clientX: 10, clientY: 10})
  contentChecks.mockClear()
  const rangeStart = performance.now()
  for (let i = 10; i < 15; i++) {
    fireEvent.pointerMove(target(i), {buttons: 1, clientX: 10 + i * 28, clientY: 10})
    act(() => { vi.advanceTimersByTime(17) })
  }
  const rangeMs = performance.now() - rangeStart
  const rangeChecks = contentChecks.mock.calls.length
  fireEvent.pointerUp(target(14), {button: 0})
  fireEvent.pointerDown(target(0), {button: 2, clientX: 10, clientY: 10})
  fireEvent.pointerMove(target(20), {buttons: 2, clientX: 570, clientY: 10})
  // Entering a content move is frame-coalesced. Commit that first frame
  // before measuring subsequent move-only updates (which must reuse cells).
  act(() => { vi.advanceTimersByTime(17) })
  const frameBefore = timeline.activeFrameId
  const historyBefore = session.history.position
  contentChecks.mockClear()
  gridChecks.mockClear()
  const moveStart = performance.now()
  for (let i = 21; i < 26; i++) {
    fireEvent.pointerMove(target(i), {buttons: 2, clientX: 10 + i * 28, clientY: 10})
    act(() => { vi.advanceTimersByTime(17) })
  }
  const moveMs = performance.now() - moveStart
  const moveChecks = contentChecks.mock.calls.length
  expect(rangeChecks).toBeLessThan(1920)
  expect(moveChecks).toBeLessThan(60)
  expect(gridChecks).not.toHaveBeenCalled()
  expect(timeline.activeFrameId).toBe(frameBefore)
  expect(session.history.position).toBe(historyBefore)
  fireEvent.pointerCancel(window)
  process.stdout.write(`Full panel ${kind}, 960 cells / 5 updates: range ${rangeMs.toFixed(1)} ms (${rangeChecks} cell checks), move ${moveMs.toFixed(1)} ms (${moveChecks} cell checks)\n`)
})
