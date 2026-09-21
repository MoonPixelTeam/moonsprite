import { useRef } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { useProjectScrollMemory } from './useProjectScrollMemory'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); useWorkspace.setState({ sessions: [], activeId: null }) })

it('restores both axes across project switches and panel remounts without copying another project position', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  const store = useWorkspace.getState()
  store.addSession(createDocument('A', 4, 4, 'rgba'))
  store.addSession(createDocument('B', 4, 4, 'rgba'))
  const [a, b] = useWorkspace.getState().sessions.map(s => s.document.id)
  function Panel({ id }: { id: string }) {
    const ref = useRef<HTMLDivElement>(null)
    useProjectScrollMemory(ref, id, 'test')
    return <div ref={ref} data-testid="scroll" />
  }
  const view = render(<Panel id={a} />)
  const element = view.getByTestId('scroll')
  element.scrollLeft = 420; element.scrollTop = 86; fireEvent.scroll(element)
  view.rerender(<Panel id={b} />)
  expect([element.scrollLeft, element.scrollTop]).toEqual([0, 0])
  element.scrollLeft = 12; element.scrollTop = 60; fireEvent.scroll(element)
  view.rerender(<Panel id={a} />)
  expect([element.scrollLeft, element.scrollTop]).toEqual([420, 86])
  view.unmount()
  const next = render(<Panel id={b} />).getByTestId('scroll')
  expect([next.scrollLeft, next.scrollTop]).toEqual([12, 60])
})

it('does not force layout or synthetic scrolling when a fresh timeline opens', () => {
  const measure = vi.fn(() => 400)
  const scrollWrite = vi.fn()
  const scrollEvent = vi.fn()
  let resize: (() => void) | undefined
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  })
  function Panel() {
    const ref = useRef<HTMLDivElement>(null)
    useProjectScrollMemory(ref, 'fresh-timeline', 'test', true)
    return <div ref={(element) => {
      ref.current = element
      if (!element) return
      Object.defineProperties(element, {
        clientWidth: { get: measure, configurable: true },
        scrollLeft: { get: () => 0, set: scrollWrite, configurable: true },
        scrollTop: { get: () => 0, set: scrollWrite, configurable: true }
      })
      element.addEventListener('scroll', scrollEvent)
      Object.defineProperty(element.firstElementChild, 'offsetWidth', { value: 800, configurable: true })
    }} data-testid="timeline"><div className="layer-animation-grid" /></div>
  }
  const view = render(<Panel />)
  expect(measure).not.toHaveBeenCalled()
  expect(scrollWrite).not.toHaveBeenCalled()
  expect(scrollEvent).not.toHaveBeenCalled()
  resize!()
  expect(view.getByTestId('timeline').style.getPropertyValue('--timeline-tail')).toBe('200px')
})
