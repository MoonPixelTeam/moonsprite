import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePaletteGridColumns } from './use-palette-grid-columns'
import { beginWorkspaceResize, endWorkspaceResize } from './workspace-resize'
import { fitPaletteSlotsToGrid, repositionPaletteSlots, paletteRangeIdsBySlots } from '@/core/palette-layout'

afterEach(() => { endWorkspaceResize(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each(['manual', 'auto'] as const)('keeps %s resize frames out of React and commits the final column count', mode => {
  const grid = document.createElement('div')
  let width = 265, notify = (): void => {}
  Object.defineProperty(grid, 'clientWidth', { get: () => width })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { notify = () => callback([{ target: grid, contentRect: { width: width - 16, left: 8 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver) }
    observe() {}
    disconnect() {}
  })
  const ref = { current: grid }
  let renders = 0
  const hook = renderHook(() => { renders++; return usePaletteGridColumns(ref, 30, 1, mode) })
  const before = renders
  act(() => beginWorkspaceResize())
  for (let i = 0; i < 240; i++) act(() => { width = 300 + i % 150; notify() })
  expect(renders).toBe(before)
  expect(hook.result.current).toBe(8)
  const previewColumns = 12 // 389px viewport, 30px cells, 1px gaps, 16px padding
  act(() => endWorkspaceResize())
  expect(hook.result.current).toBe(previewColumns)
  expect(renders).toBe(before + 1)
  expect(grid.classList.contains('palette-grid-resizing-manual')).toBe(false)
  // A round trip back to the committed width must clear preview state too.
  act(() => beginWorkspaceResize())
  act(() => { width = 550; notify() })
  act(() => { width = 389; notify() })
  act(() => endWorkspaceResize())
  expect(grid.classList.contains('palette-grid-resizing-manual')).toBe(false)
  hook.unmount()
})

it('does not rerender for height-only resizes or widths below occupied manual columns', () => {
  const grid = document.createElement('div')
  let width = 230, notify = (): void => {}
  Object.defineProperty(grid, 'clientWidth', { get: () => width })
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { notify = () => callback([{ target: grid, contentRect: { width: width - 16, left: 8 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver) }
    observe() {}
    disconnect = disconnect
  })
  const ref = { current: grid }
  let renders = 0
  const hook = renderHook(({ size, minimum }) => { renders++; return usePaletteGridColumns(ref, size, minimum) }, { initialProps: { size: 30, minimum: 8 } })
  const initialRenders = renders
  for (let i = 0; i < 200; i++) act(() => { width = 100 + i % 130; notify() })
  expect(renders).toBe(initialRenders)
  expect(hook.result.current).toBe(8)
  act(() => { width = 330; notify() })
  expect(hook.result.current).toBe(10)
  hook.rerender({ size: 40, minimum: 1 })
  expect(hook.result.current).toBe(7)
  hook.unmount()
  const calls = disconnect.mock.calls.length
  act(() => window.dispatchEvent(new Event('resize')))
  expect(disconnect.mock.calls.length).toBe(calls)
})

it('uses observer widths without layout reads, and measures the final sample on release', () => {
  const grid = document.createElement('div')
  const surface = document.createElement('span')
  surface.className = 'palette-swatch-grid-surface'
  grid.append(surface)
  for (let index = 0; index < 16; index++) {
    const button = document.createElement('button')
    button.dataset.paletteSlot = String(index)
    surface.append(button)
  }
  let width = 265, callback: ResizeObserverCallback = () => {}
  const readWidth = vi.fn(() => width)
  Object.defineProperty(grid, 'clientWidth', { get: readWidth })
  vi.stubGlobal('ResizeObserver', class {
    constructor(notify: ResizeObserverCallback) { callback = notify }
    observe() {}
    disconnect() {}
  })
  const ref = { current: grid }
  const hook = renderHook(() => usePaletteGridColumns(ref, 30, 1, 'auto'))
  const reads = readWidth.mock.calls.length
  act(() => beginWorkspaceResize())
  // Fractional content box, symmetric 12px padding; equivalent to clientWidth 295.
  // Scrollbars have already been excluded from the delivered content width.
  act(() => callback([{ target: grid, contentRect: { width: 271.4, left: 12 } } as unknown as ResizeObserverEntry], {} as ResizeObserver))
  act(() => window.dispatchEvent(new Event('resize')))
  expect(readWidth).toHaveBeenCalledTimes(reads)
  expect(surface.style.getPropertyValue('--palette-layout-columns')).toBe('9')
  // Release can arrive before the observer reports the last width.
  width = 389
  act(() => endWorkspaceResize())
  expect(hook.result.current).toBe(12)
  hook.unmount()
})

it('preserves visible slots, box selection and drag destinations when unused rows are omitted', () => {
  const slots = [1, null, 2, null, null, 3, null, 4]
  const trim = (items: Array<number | null>): Array<number | null> => {
    let end = items.length
    while (end > 0 && items[end - 1] === null) end--
    return items.slice(0, end)
  }
  for (const columns of [2, 4, 8, 16]) {
    const compact = fitPaletteSlotsToGrid(slots, 4, columns, 1)
    for (const rows of [1, 2, 10, 50]) {
      const previous = fitPaletteSlotsToGrid(slots, 4, columns, rows)
      expect(trim(compact.slots)).toEqual(trim(previous.slots))
      expect(compact.columns).toBe(previous.columns)
      const lastSlot = trim(previous.slots).length - 1
      expect(paletteRangeIdsBySlots(compact.slots, compact.columns, 0, lastSlot)).toEqual(paletteRangeIdsBySlots(previous.slots, previous.columns, 0, lastSlot))
      for (const destination of [1, compact.columns + 1, lastSlot]) {
        expect(trim(repositionPaletteSlots(compact.slots, [1, 2], destination, 1, compact.columns)))
          .toEqual(trim(repositionPaletteSlots(previous.slots, [1, 2], destination, 1, previous.columns)))
      }
    }
  }
})
