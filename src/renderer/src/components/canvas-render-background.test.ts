import { afterEach, expect, it, vi } from 'vitest'
import { createCanvasBackground } from './canvas-render-background'

afterEach(() => vi.unstubAllGlobals())

it('uses one fixed checker texture across fractional zoom and pan on the large project', () => {
  const tiles: { width: number; height: number }[] = []
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) { tiles.push(this) }
    getContext() { return { fillRect: vi.fn(), fillStyle: '' } }
  })
  vi.stubGlobal('DOMMatrix', class { constructor(public values: number[]) {} })
  const transform = vi.fn()
  const context = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), createPattern: vi.fn(() => ({ setTransform: transform })), fillStyle: '', imageSmoothingEnabled: true }
  const tileRef = { current: null }
  const checkerboard = { size: 16, lightColor: { r: 200, g: 200, b: 200, a: 255 }, darkColor: { r: 150, g: 150, b: 150, a: 255 } }
  for (const zoom of [0.13257905425007252, 0.17, 1, 4.125, 64]) {
    context.fillRect.mockClear()
    createCanvasBackground({ checkerboard, view: { zoom }, repeatCopies: [{ x: 0, y: 0, originX: -13, originY: 7 }],
      canvasBoundaryFor: () => ({ left: -13, top: 7, width: 4596 * zoom, height: 1767 * zoom }),
      context, clipCanvasCopy: vi.fn(), checkerboardTileRef: tileRef, renderCanvasWidth: 4596 * zoom,
      renderCanvasHeight: 1767 * zoom, viewport: { left: 0, top: 0, right: 1024, bottom: 768 },
      document: { width: 4596, height: 1767 }, deviceScale: { x: 1.25, y: 1.5 }, isoViewPreferences: {}, isoGuideTileRef: { current: null }
    } as never)
    expect(context.fillRect).toHaveBeenCalledTimes(2)
    expect(transform.mock.lastCall?.[0].values).toEqual([16 * zoom, 0, 0, 16 * zoom, -13, 7])
  }
  expect(tiles).toHaveLength(1)
  expect([tiles[0].width, tiles[0].height]).toEqual([2, 2])
})
