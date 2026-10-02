import { describe, expect, it } from 'vitest'
import { measureTimelineCellWindow } from './layer-timeline-cell-window'
import type { LayerTimelineCellsProps } from './layer-timeline-cell-types'

const fixturePanel = (rows: number, frames: number): LayerTimelineCellsProps => ({
  displayRows: Array.from({ length: rows }, () => ({})) as LayerTimelineCellsProps['displayRows'],
  timeline: { frames: Array.from({ length: frames }, (_, index) => ({ id: `f${index}`, duration: 100 })), cels: [], layerMasks: [], groupMasks: [], loopSections: [], activeFrameId: 'f0', loop: true },
} as unknown as LayerTimelineCellsProps)

describe('timeline cell window', () => {
  it('keeps the full scroll geometry while limiting mounted rows and columns', () => {
    const viewport = document.createElement('div')
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 420 },
      clientHeight: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, value: 0 },
      scrollTop: { configurable: true, value: 0 }
    })
    viewport.style.setProperty('--layer-frame-width', '34px')
    viewport.style.setProperty('--layer-row-height', '42px')
    viewport.style.setProperty('--animation-header-height', '34px')
    viewport.style.setProperty('--layer-effective-label-width', '190px')

    const panel = fixturePanel(55, 297)
    const first = measureTimelineCellWindow(panel, viewport)
    expect(first.rowEnd - first.rowStart).toBeLessThan(55)
    expect(first.frameEnd - first.frameStart).toBeLessThan(297)

    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, value: 34 * 180 })
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, value: 34 * 10 })
    const scrolled = measureTimelineCellWindow(panel, viewport)
    expect(scrolled.frameStart).toBeGreaterThan(0)
    expect(scrolled.rowStart).toBeGreaterThan(0)
    expect(scrolled.frameEnd).toBeLessThanOrEqual(297)
    expect(scrolled.rowEnd).toBeLessThanOrEqual(55)
  })
})
