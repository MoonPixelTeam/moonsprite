import { expect, it, vi } from 'vitest'
import type { SelectionMask } from '@shared/types-selection'
import { createDocument, getActiveLayer, readLayerColorAt } from '@/core/document'
import { beginPixelEdit } from '@/core/history'
import { paintLine } from '@/core/tools-brush'
import { tileRepeatPreviewPlacements } from '@/core/tilemap'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { sessionFromDocument } from '@/store/workspace-session'
import { createCanvasBrushPath } from './canvas-render-brush-path'
import { renderCanvasConnectedLine } from './canvas-render-shape-preview'

it.each([false, true])('clips connected-line preview to the current pixel mask (erase=%s)', erase => {
  const document = createDocument('preview', 8, 4, 'rgba')
  const session = sessionFromDocument(document)
  Object.assign(session, { brushSize: 1, brushShape: 'square', symmetryAxes: [] })
  session.selection = { x: 2, y: 1, width: 4, height: 1, mask: new Uint8Array([1, 0, 1, 1]) }
  session.view.zoom = 1
  const fills = vi.fn()
  const layer = getActiveLayer(document)
  const { drawStrokePreview } = createCanvasBrushPath({
    session, currentSession: session, document, currentActiveLayer: layer, activeLayer: layer,
    activeBrushImage: null, activeBrushPreviewMode: 'paint', activeBrushTexture: 'solid',
    activeBrushDither: undefined, proceduralAntialiasStrength: 0, optimizedRotationEnabled: false,
    symmetryCenter: { x: 4, y: 2 }, balancedStraightLines: false,
    brushPatternOrigin: point => point, view: session.view, deviceScale: { x: 1, y: 1 },
    previewPixelPlacements: (x, y) => [{ point: { x, y }, copy: { x: 0, y: 0, originX: 0, originY: 0, fromX: 0, fromY: 0, toX: 8, toY: 4 } }],
    repeatCopies: [{ originX: 0, originY: 0, fromX: 0, fromY: 0, toX: 8, toY: 4 }],
    previewColorAt: () => session.primaryColor, previewLayerColorAt: () => session.primaryColor,
    drawTilemapEditPreviewTiles: () => false, queueTilesetTilePreview: () => {},
    fillPreviewPixelRects: fills, drawPreviewPixel: () => []
  })
  const previewPixels = (selection?: SelectionMask | null) => {
    fills.mockClear()
    drawStrokePreview({ x: 0, y: 1 }, { x: 7, y: 1 }, erase, undefined, selection)
    return fills.mock.calls.flatMap(([entries]) => entries.flatMap(({ pixelRect }: { pixelRect: { x: number; width: number } }) =>
      Array.from({ length: pixelRect.width }, (_, index) => pixelRect.x + index)))
  }
  expect(previewPixels()).toEqual([2, 4, 5])
  expect(previewPixels({ x: 3, y: 1, width: 1, height: 1 })).toEqual([3])
  session.selection = null
  expect(previewPixels()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
})

const offscreenLines = [
  { name: 'anchor left of viewport', from: { x: 0, y: 9 }, to: { x: 15, y: 9 }, size: 1 },
  { name: 'anchor right of viewport', from: { x: 31, y: 9 }, to: { x: 15, y: 9 }, size: 1 },
  { name: 'both endpoints outside', from: { x: 0, y: 9 }, to: { x: 31, y: 9 }, size: 1 },
  { name: 'anchor above viewport', from: { x: 15, y: 0 }, to: { x: 15, y: 11 }, size: 1 },
  { name: 'diagonal enters viewport', from: { x: 0, y: 0 }, to: { x: 18, y: 12 }, size: 1 },
  { name: 'wide round brush enters viewport', from: { x: 0, y: 5 }, to: { x: 17, y: 5 }, size: 5 },
  { name: 'selection with a hole', from: { x: 0, y: 9 }, to: { x: 31, y: 9 }, size: 1, selection: true },
  { name: 'entire stroke outside', from: { x: 0, y: 0 }, to: { x: 5, y: 0 }, size: 1 }
]

it.each(offscreenLines)('keeps the visible Shift-line pixels when $name', ({ from, to, size, selection: masked }) => {
  for (const erase of [false, true]) for (const zoom of [1, 2]) {
    const document = createDocument('Shift preview', 32, 24, 'rgba')
    const session = sessionFromDocument(document)
    Object.assign(session, { tool: erase ? 'eraser' : 'pencil', brushSize: size, brushShape: 'round', symmetryAxes: [] })
    session.view.zoom = zoom
    if (masked) session.selection = { x: 10, y: 9, width: 10, height: 1, mask: new Uint8Array([1, 1, 0, 0, 1, 1, 1, 0, 1, 1]) }
    const layer = getActiveLayer(document)
    const copy = { x: 0, y: 0, originX: -10 * zoom, originY: -6 * zoom, fromX: 10, fromY: 6, toX: 20, toY: 14 }
    const rendered = new Set<number>()
    const { drawStrokePreview } = createCanvasBrushPath({
      session, currentSession: session, document, currentActiveLayer: layer, activeLayer: layer,
      activeBrushImage: null, activeBrushPreviewMode: 'paint', activeBrushTexture: 'solid', activeBrushDither: undefined,
      proceduralAntialiasStrength: 0, optimizedRotationEnabled: false, symmetryCenter: { x: 16, y: 12 }, balancedStraightLines: false,
      brushPatternOrigin: point => point, view: session.view, deviceScale: { x: 1, y: 1 }, repeatCopies: [copy],
      previewPixelPlacements: (x, y) => tileRepeatPreviewPlacements({ x, y }, 32, 24, 'off', [copy]),
      previewColorAt: () => session.primaryColor, previewLayerColorAt: () => session.primaryColor,
      drawTilemapEditPreviewTiles: () => false, queueTilesetTilePreview: () => {}, drawPreviewPixel: () => [],
      fillPreviewPixelRects: entries => {
        for (const entry of entries) {
          expect(entry.pixelRect.x).toBeGreaterThanOrEqual(0)
          expect(entry.pixelRect.x + entry.pixelRect.width).toBeLessThanOrEqual(10 * zoom)
          for (let i = 0; i < entry.pixelRect.width / zoom; i++) rendered.add(entry.sampleY * 32 + entry.sampleX + i)
        }
      }
    })
    const input = new CanvasInputState()
    input.shiftHeld = input.shiftLinePreview = input.pointer.visible = true
    input.pointer.point = to
    renderCanvasConnectedLine({
      currentActiveLayer: layer, currentSession: session, shiftLinePreviewEnabled: true, lineConnectionConfigured: true,
      canRenderToolPreview: true, inputRef: { current: input }, session, lineAnchor: from,
      tileRepeatPointAt: () => to, document, view: session.view, resolveStraightLine: (from, to) => ({ from, to }),
      modifierActive: () => false, lineAnchorHistoryRef: { current: null }, activeLayer: layer,
      tilemapEditSelectionAtPoint: () => undefined, drawStrokePreview
    })
    // Compare with the actual committed brush footprint, clipped to the viewport.
    const reference = createDocument('Committed line', 32, 24, 'rgba')
    const referenceLayer = getActiveLayer(reference)
    paintLine(reference, referenceLayer, beginPixelEdit(referenceLayer.id), from.x, from.y, to.x, to.y, size, session.primaryColor, session.selection, 'round')
    const expected = new Set<number>()
    for (let y = 6; y < 14; y++) for (let x = 10; x < 20; x++) {
      if (readLayerColorAt(reference, referenceLayer, x, y).a > 0) expected.add(y * 32 + x)
    }
    expect(rendered).toEqual(expected)
    expect(layer.pixels.every(value => value === 0)).toBe(true)
  }
})
