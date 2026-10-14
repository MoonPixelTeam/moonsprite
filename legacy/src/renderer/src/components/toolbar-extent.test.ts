import { afterEach, expect, it, vi } from 'vitest'
import { observeToolbarExtent } from './toolbar-extent'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps the timeline aligned as its toolbar changes, without redundant style writes', () => {
  const panel = document.createElement('section')
  const header = document.createElement('header')
  const toolbar = document.createElement('div')
  let left = 100, right = 250.2
  vi.spyOn(header, 'getBoundingClientRect').mockImplementation(() => ({ left }) as DOMRect)
  vi.spyOn(toolbar, 'getBoundingClientRect').mockImplementation(() => ({ right }) as DOMRect)
  let notify = (_entries: ResizeObserverEntry[]): void => {}
  const observe = vi.fn(), disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: typeof notify) { notify = callback }
    observe = observe; disconnect = disconnect
  })
  const write = vi.spyOn(panel.style, 'setProperty')
  const stop = observeToolbarExtent(panel, header, toolbar)
  expect(observe.mock.calls.map(call => call[0])).toEqual([toolbar, header])
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('151px')
  const headerEntry = (padding: number): ResizeObserverEntry => ({ target: header, contentRect: { left: padding } }) as unknown as ResizeObserverEntry
  const toolbarEntry = (width: number, height = 26): ResizeObserverEntry => ({ target: toolbar, borderBoxSize: [{ inlineSize: width, blockSize: height }] }) as unknown as ResizeObserverEntry
  // Any later geometry read would synchronously flush layout after other ROs.
  vi.mocked(header.getBoundingClientRect).mockImplementation(() => { throw new Error('Unexpected layout read') })
  vi.mocked(toolbar.getBoundingClientRect).mockImplementation(() => { throw new Error('Unexpected layout read') })
  // Moving the entire dock must not change the relative extent.
  left += 50; right += 50
  for (let i = 0; i < 200; i++) notify([headerEntry(8), toolbarEntry(142.2)])
  expect(write).toHaveBeenCalledOnce()
  right += 40
  notify([toolbarEntry(182.2)])
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('191px')
  right = left - 1
  notify([toolbarEntry(0, 0)])
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('0px')
  notify([toolbarEntry(182.2), headerEntry(12)])
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('195px')
  expect(write).toHaveBeenCalledTimes(4)
  stop()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('')
})

it('provides an initial measurement and cleanup without ResizeObserver', () => {
  vi.stubGlobal('ResizeObserver', undefined)
  const panel = document.createElement('section')
  const header = document.createElement('header')
  const toolbar = document.createElement('div')
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ left: 10 } as DOMRect)
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({ right: 110 } as DOMRect)
  const stop = observeToolbarExtent(panel, header, toolbar)
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('100px')
  stop()
  expect(panel.style.getPropertyValue('--animation-toolbar-extent')).toBe('')
})
