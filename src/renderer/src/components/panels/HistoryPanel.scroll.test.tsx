import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { HistoryPanel } from './HistoryPanel'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); useWorkspace.setState({ sessions: [], activeId: null }) })

it('keeps a visible history entry still and scrolls only its list after layout', () => {
  let callback: IntersectionObserverCallback
  let options: IntersectionObserverInit | undefined
  const observe = vi.fn(), disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) { callback = cb; options = opts }
    observe = observe
    disconnect = disconnect
  })
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('history', 4, 4, 'rgba'))
  const view = render(<HistoryPanel session={useWorkspace.getState().sessions[0]} docked />)
  const list = view.getByRole('listbox')
  expect(options?.root).toBe(list)
  expect(observe).toHaveBeenCalledWith(view.getByRole('option', { selected: true }))
  const report = (top: number, bottom: number, intersectionRatio: number) => act(() => callback([
    { boundingClientRect: { top, bottom }, rootBounds: { top: 100, bottom: 200 }, intersectionRatio } as IntersectionObserverEntry
  ], {} as IntersectionObserver))
  report(110, 140, 1)
  expect(list.scrollTop).toBe(0)
  report(190, 220, 1 / 3)
  expect(list.scrollTop).toBe(20)
  report(90, 120, 2 / 3)
  expect(list.scrollTop).toBe(10)
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
