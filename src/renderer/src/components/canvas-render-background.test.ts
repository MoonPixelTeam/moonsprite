import { afterEach, expect, it, vi } from 'vitest'
import { createCanvasBackground } from './canvas-render-background'
import { prepareCanvasGuideOverlay } from './canvas-guide-overlay'
import { renderCanvasTransformGuides } from './canvas-render-guides'
import { createDocument } from '@/core/document-model'
import type { ViewState } from '@shared/types-view'

afterEach(() => vi.unstubAllGlobals())

it.each([0, 45])('keeps grids, isometric guides and symmetry axes on the guide surface at rotation %s', rotation => {
  const makeContext = () => ({ save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(),
    fillRect: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn() })
  const paint = makeContext(), guides = makeContext()
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue(guides as unknown as CanvasRenderingContext2D)
  const view = { zoom: 4, rotation, panX: 0, panY: 0, mirrored: false, mirroredVertical: false } as ViewState
  const applyViewRotation = vi.fn()
  expect(prepareCanvasGuideOverlay(canvas, { width: 100, height: 80 }, { width: 100, height: 80 }, 1.25, false, view, applyViewRotation)).toBe(guides)
  expect(guides.clearRect).toHaveBeenCalledWith(0, 0, 125, 100)
  expect(applyViewRotation).toHaveBeenCalledWith(guides, 100, 80, view)
  const sprite = createDocument('guide layering', 8, 8, 'rgba', false)
  const copy = { x: 0, y: 0, originX: 12, originY: 8, fromX: 0, fromY: 0, toX: 8, toY: 8 }
  const clipCanvasCopy = vi.fn((context: typeof guides) => { context.beginPath(); context.rect(12, 8, 32, 32); context.clip() })
  const background = createCanvasBackground({ checkerboard: { size: 32, lightColor: { r: 200, g: 200, b: 200, a: 255 }, darkColor: { r: 150, g: 150, b: 150, a: 255 } },
    view, repeatCopies: [copy], canvasBoundaryFor: () => ({ left: 12, top: 8, width: 32, height: 32 }),
    context: paint, guideContext: guides, clipCanvasCopy, checkerboardTileRef: { current: null },
    renderCanvasWidth: 32, renderCanvasHeight: 32, viewport: { left: 0, top: 0, right: 100, bottom: 80 }, document: sprite,
    deviceScale: { x: 1.25, y: 1.25 }, isoViewPreferences: { guideUnitSize: 2, stairStep: 2, guideOriginX: 0, guideOriginY: 0, guideLineStyle: 'solid', guideColors: { solid: { r: 255, g: 0, b: 0, a: 255 } } }, isoGuideTileRef: { current: null }
  } as never)
  paint.fillRect.mockClear()
  background.drawGrid(0, 0, 1, 1, { r: 255, g: 0, b: 0, a: 255 }, copy)
  expect(guides.fillRect).toHaveBeenCalled()
  expect(paint.fillRect).not.toHaveBeenCalled()
  background.drawIsoGuides(copy)
  expect(guides.stroke).toHaveBeenCalled()
  expect(paint.stroke).not.toHaveBeenCalled()
  guides.stroke.mockClear()
  renderCanvasTransformGuides({ session: { symmetryAxes: { horizontal: true } }, context: guides, clipBaseCanvas: (context: typeof guides) => clipCanvasCopy(context),
    symmetryAxisPreferences: { color: { r: 255, g: 0, b: 0, a: 255 }, thickness: 1 }, document: sprite, symmetryCenter: { x: 4, y: 4 },
    originX: 12, originY: 8, view, canvasResizePreviewRef: { current: null }
  } as never)
  expect(guides.stroke).toHaveBeenCalledOnce()
  expect(guides.moveTo).toHaveBeenLastCalledWith(12, 24)
  expect(paint.stroke).not.toHaveBeenCalled()
  // A later opaque paint preview writes only to its surface, leaving guides intact.
  paint.fillRect(12, 8, 32, 32)
  expect(guides.clearRect).toHaveBeenCalledOnce()
})

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
