import { useState } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ViewState } from '@shared/types-view'
import { notifyViewPreview } from '@/core/view-preview-lifecycle'
import { CanvasViewScrollbars } from './CanvasViewScrollbars'
import { useCanvasViewScrollbars } from './useCanvasViewScrollbars'

const { setView } = vi.hoisted(() => ({ setView: vi.fn() }))
vi.mock('@/store/workspace', () => ({ useWorkspace: { getState: () => ({ setViewForDocument: setView }) } }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })
const view: ViewState = { zoom: 4, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: false }
const options = { documentId: 'large', documentWidth: 4596, documentHeight: 1767, viewportWidth: 1200, viewportHeight: 800, view, rotationIndicatorPosition: 'canvas' as const }

it('updates the scrollbar for 60 pan frames without rerendering its canvas parent', () => {
  let renders = 0
  function CanvasHost() {
    renders++
    const [visible, setVisible] = useState(false)
    return <div data-inset={visible}><CanvasViewScrollbars {...options} ariaLabel="Canvas" onHorizontalVisibilityChange={setVisible} /></div>
  }
  const mounted = render(<CanvasHost />)
  const initialRenders = renders
  const initialPosition = mounted.getByRole('scrollbar', { name: 'Canvas X' }).getAttribute('aria-valuenow')
  for (let frame = 1; frame <= 60; frame++) act(() => notifyViewPreview('large', { ...view, panX: frame * 30 }))
  expect(renders - initialRenders).toBe(0)
  expect(mounted.getByRole('scrollbar', { name: 'Canvas X' }).getAttribute('aria-valuenow')).not.toBe(initialPosition)
  expect(setView).not.toHaveBeenCalled()
  fireEvent.keyDown(mounted.getByRole('scrollbar', { name: 'Canvas X' }), { key: 'ArrowRight' })
  expect(setView).toHaveBeenCalledWith('large', expect.objectContaining({ panX: expect.any(Number), panY: expect.any(Number) }))
})

it('reproduces the parent renders caused by owning the preview subscription', () => {
  let renders = 0
  function PreviousHost() { renders++; useCanvasViewScrollbars(options); return null }
  render(<PreviousHost />)
  const initialRenders = renders
  for (let frame = 1; frame <= 60; frame++) act(() => notifyViewPreview('large', { ...view, panX: frame * 30 }))
  expect(renders - initialRenders).toBe(60)
})

it('reports visibility changes and drops its subscription on unmount', () => {
  const changed = vi.fn()
  const mounted = render(<CanvasViewScrollbars {...options} ariaLabel="Canvas" onHorizontalVisibilityChange={changed} />)
  expect(changed).toHaveBeenLastCalledWith(true)
  act(() => notifyViewPreview('large', { ...view, zoom: 0.1 }))
  expect(changed).toHaveBeenLastCalledWith(false)
  expect(mounted.queryAllByRole('scrollbar')).toHaveLength(0)
  mounted.unmount()
  changed.mockClear()
  act(() => notifyViewPreview('large', view))
  expect(changed).not.toHaveBeenCalled()
})
