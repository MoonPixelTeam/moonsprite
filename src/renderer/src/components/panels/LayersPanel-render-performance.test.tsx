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

it('refreshes only the active cel after a pixel edit in a large timeline', () => {
  localStorage.clear()
  const doc = createDocument('targeted content refresh', 1, 1, 'rgba')
  for (let i = 1; i < 24; i++) doc.layers.push(createLayer(`L${i}`, 1, 1, 'rgba'))
  const timeline = ensureAnimationDocument(doc)
  timeline.frames = Array.from({ length: 48 }, (_, i) => ({ id: `f${i}`, duration: 100 }))
  timeline.activeFrameId = timeline.frames[0].id
  timeline.cels = doc.layers.flatMap(layer => timeline.frames.map(frame => ({
    id: `${layer.id}-${frame.id}`,
    layerId: layer.id,
    frameId: frame.id,
    surface: { format: 'rgba' as const, width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8ClampedArray([255, 0, 0, 255]) }
  })))
  useWorkspace.getState().addSession(doc)
  const session = useWorkspace.getState().sessions[0]
  const stateChecks = vi.spyOn(cellCache, 'timelineCellRenderState')
  render(<LayersPanel session={session} docked />)
  const initialStates = stateChecks.mock.results.map(result => result.value)
  stateChecks.mockClear()

  act(() => useWorkspace.getState().mutateActive(current => {
    const layer = current.document.layers[0]
    if (layer.format !== 'rgba') throw new Error('Expected an RGBA fixture')
    writeLayerColor(current.document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
  }, 'content', true, false, { kind: 'region', rect: { x: 0, y: 0, width: 1, height: 1 } }))
  const updatedStates = stateChecks.mock.results.map(result => result.value)
  const changedStates = updatedStates.reduce((count, state, index) => count + (!cellCache.sameTimelineCellState(initialStates[index] ?? [], state ?? []) ? 1 : 0), 0)

  // A content revision must not invalidate every layer×frame cell. Only the
  // active cel carries the new revision and needs a fresh element.
  expect(updatedStates).toHaveLength(24 * 48)
  expect(changedStates).toBe(1)
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

it('reuses off-column group cells while playing two frames in a 297-frame project', () => {
  vi.useFakeTimers()
  localStorage.clear()
  const doc = createDocument('large grouped timeline', 1, 1, 'rgba')
  for (let i = 1; i < 42; i++) doc.layers.push(createLayer(`L${i}`, 1, 1, 'rgba'))
  doc.groups = Array.from({ length: 13 }, (_, i) => ({
    id: `g${i}`, name: `G${i}`, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const
  }))
  doc.layers.forEach((layer, i) => { layer.groupId = `g${i % 13}` })
  const timeline = ensureAnimationDocument(doc)
  timeline.frames = Array.from({ length: 297 }, (_, i) => ({ id: `f${i}`, duration: 100 }))
  timeline.activeFrameId = 'f271'
  timeline.cels = doc.layers.flatMap(layer => timeline.frames.map(frame => ({
    id: `${layer.id}-${frame.id}`, layerId: layer.id, frameId: frame.id
  })))
  timeline.loopSections = [{ id: 'short', name: 'Short', startFrameId: 'f271', endFrameId: 'f272', direction: 'forward', repeatCount: null }]
  useWorkspace.getState().addSession(doc)
  const store = useWorkspace.getState()
  store.playAnimationLoopSection('short')
  function Panel() {
    useWorkspace(state => layersPanelRenderKey(state.sessions[0]))
    return <LayersPanel session={useWorkspace.getState().sessions[0]} docked />
  }
  const checks = vi.spyOn(cellCache, 'timelineCellRenderState')
  const { container } = render(<Panel />)
  const groupStates = () => checks.mock.calls.flatMap((args, i) =>
    args[1].kind === 'node' && args[1].node.kind === 'group' ? [checks.mock.results[i].value] : []).slice(-13 * 297)
  const before = groupStates()
  expect(before).toHaveLength(13 * 297)
  expect(before.every(state => state !== null)).toBe(true)
  checks.mockClear()
  act(() => store.advanceAnimationFrame())
  const after = groupStates()
  expect(after).toHaveLength(before.length)
  expect(after.filter((state, i) => !cellCache.sameTimelineCellState(before[i]!, state!))).toHaveLength(13 * 2)
  expect(timeline.activeFrameId).toBe('f272')
  expect(container.querySelectorAll('[data-animation-group-cel-key]')).toHaveLength(13 * 297)
  checks.mockClear()
  act(() => store.setView({ zoom: 4 }))
  expect(checks).not.toHaveBeenCalled()
})
