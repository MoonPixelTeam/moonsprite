import { afterEach, expect, it, vi } from 'vitest'
import { observeLayerPanelReveal } from './layer-panel-reveal-scroll'

afterEach(() => vi.unstubAllGlobals())

it.each([
  [152, 30, 100], // Already centered below the sticky header.
  [120, 30, 68], // Obscured by the sticky header; center it in the usable area.
  [190, 30, 138] // Below the viewport; preserve the existing centering behavior.
])('reveals a row at %i using completed layout and preserves horizontal scroll', (top, height, expected) => {
  let callback!: IntersectionObserverCallback
  let options: IntersectionObserverInit | undefined
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: IntersectionObserverCallback, opts: IntersectionObserverInit) { callback = cb; options = opts }
    observe = vi.fn()
    disconnect = disconnect
  })
  const list = document.createElement('div'), row = document.createElement('div')
  list.append(row)
  list.scrollTop = 100
  list.scrollLeft = 137
  list.style.setProperty('--animation-header-height', '34px')
  const cancel = observeLayerPanelReveal(list, row)
  expect(options?.root).toBe(list)
  const entries = [{ target: row, rootBounds: { top: 100, height: 100 }, boundingClientRect: { top, height } }] as unknown as IntersectionObserverEntry[]
  callback(entries, {} as IntersectionObserver)
  expect(list.scrollTop).toBe(expected)
  expect(list.scrollLeft).toBe(137)
  expect(disconnect).toHaveBeenCalledOnce()
  cancel()
  list.scrollTop = 100
  callback(entries, {} as IntersectionObserver)
  expect(list.scrollTop).toBe(100) // Ignore a queued callback from a previous click.
})
