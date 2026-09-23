import { performance } from 'node:perf_hooks'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer } from '@/core/document-model'
import { ensureAnimationDocument, animationCelKey } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'
import * as thumbnails from './layer-timeline-thumbnails'
import * as cellCache from './layer-timeline-cell-cache'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); useWorkspace.setState({sessions: [], activeId: null}) })

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
