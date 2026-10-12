import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { createDefaultAnimationTimeline } from '@/core/animation'
import { LayerTimelineFrameHeaders } from './LayerTimelineFrameHeaders'
import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('bounds 297 headers, preserves grid placement and mounts the last frame after scrolling without rerendering the parent', () => {
  vi.useFakeTimers()
  const timeline = createDefaultAnimationTimeline()
  timeline.frames = Array.from({ length: 297 }, (_, i) => ({ id: `f${i}`, duration: 100 }))
  let parentRenders = 0
  function Panel() {
    parentRenders++
    const ref = useRef<HTMLDivElement>(null)
    return <div ref={ref} data-testid="viewport"><LayerTimelineFrameHeaders timeline={timeline}
      displayRows={[] as LayerTimelineCellsProps['displayRows']} timelineViewportRef={ref}
      renderHeader={(frame, index) => <button key={frame.id} style={{ gridColumn: index + 1, gridRow: 1 }}>{frame.id}</button>} /></div>
  }
  const view = render(<Panel />), viewport = view.getByTestId('viewport')
  expect(view.getAllByRole('button').length).toBeLessThan(40)
  const count = parentRenders
  act(() => { viewport.scrollLeft = 296 * 34; fireEvent.scroll(viewport); vi.advanceTimersByTime(17) })
  expect(view.getByRole('button', { name: 'f296' }).style.gridColumn).toBe('297')
  expect(view.getAllByRole('button').length).toBeLessThan(40)
  expect(parentRenders).toBe(count)
})
