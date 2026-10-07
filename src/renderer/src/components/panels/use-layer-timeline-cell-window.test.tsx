import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, type RefObject } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLayerTimelineCellWindow } from './use-layer-timeline-cell-window'
import { measureTimelineCellWindow, retainTimelineCellWindow } from './layer-timeline-cell-window'
import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const panel = {
  timeline: { frames: Array.from({ length: 1000 }, (_, i) => ({ id: `f${i}`, duration: 100 })) },
  displayRows: Array.from({ length: 100 }, () => ({}))
} as Pick<LayerTimelineCellsProps, 'timeline' | 'displayRows'>

it('excludes the hidden strip behind sticky labels and headers from the visible range', () => {
  const viewport = document.createElement('div')
  Object.defineProperties(viewport, {
    clientWidth: { value: 420 }, clientHeight: { value: 300 },
    scrollLeft: { value: 34 * 180 }, scrollTop: { value: 42 * 10 }
  })
  expect(measureTimelineCellWindow(panel, viewport, 0, 0)).toEqual({
    frameStart: 180, frameEnd: 187, rowStart: 10, rowEnd: 17
  })
})

it('publishes the latest coalesced scroll window before its RAF callback returns, with an ancestor scroll ref', () => {
  const frames: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { frames.push(fn); return frames.length })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  function Window({ viewport, id }: { viewport: RefObject<HTMLDivElement | null>; id: string }) {
    const value = useLayerTimelineCellWindow({ ...panel, timelineViewportRef: viewport })
    return <span data-testid={id}>{JSON.stringify(value)}</span>
  }
  function Panel() {
    const ref = useRef<HTMLDivElement>(null)
    return <div ref={ref} data-testid="viewport"><Window viewport={ref} id="range" /><Window viewport={ref} id="headers" /></div>
  }
  const view = render(<Panel />), viewport = view.getByTestId('viewport')
  for (const x of [15000, 20000, 30000]) { viewport.scrollLeft = x; fireEvent.scroll(viewport) }
  expect(frames).toHaveLength(1)
  // Do not use act to flush a deferred React update for the implementation.
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const previous = environment.IS_REACT_ACT_ENVIRONMENT
  environment.IS_REACT_ACT_ENVIRONMENT = false
  try { frames.shift()!(0) } finally { environment.IS_REACT_ACT_ENVIRONMENT = previous }
  const visibleWindow = JSON.parse(view.getByTestId('range').textContent!)
  expect(view.getByTestId('headers').textContent).toBe(view.getByTestId('range').textContent)
  expect(visibleWindow.frameStart).toBeGreaterThan(800)
  expect(visibleWindow.frameEnd).toBeLessThanOrEqual(1000)
  expect(visibleWindow.frameEnd - visibleWindow.frameStart).toBeLessThan(50)
  expect(visibleWindow.rowEnd).toBeLessThan(30)
  const snapshot = view.getByTestId('range').textContent
  viewport.scrollLeft += 1
  fireEvent.scroll(viewport)
  environment.IS_REACT_ACT_ENVIRONMENT = false
  try { frames.shift()!(1) } finally { environment.IS_REACT_ACT_ENVIRONMENT = previous }
  expect(view.getByTestId('range').textContent).toBe(snapshot)
})

it('retains useful overscan, but updates before coverage is exhausted and at both matrix edges', () => {
  const current = { frameStart: 20, frameEnd: 50, rowStart: 5, rowEnd: 20 }
  const nearby = { frameStart: 21, frameEnd: 51, rowStart: 6, rowEnd: 21 }
  expect(retainTimelineCellWindow(current, nearby, panel)).toBe(current)
  const far = { ...nearby, frameEnd: 59 }
  expect(retainTimelineCellWindow(current, far, panel)).toBe(far)
  for (const edge of [{ ...nearby, frameStart: 0 }, { ...nearby, frameEnd: 1000 }, { ...nearby, rowStart: 0 }, { ...nearby, rowEnd: 100 }]) {
    expect(retainTimelineCellWindow(current, edge, panel)).toBe(edge)
  }
  expect(retainTimelineCellWindow(current, nearby, { ...panel, displayRows: panel.displayRows.slice(0, 12) })).toBe(nearby)
})
