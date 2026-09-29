import { expect, it, vi } from 'vitest'
import type { SelectionMask } from '@shared/types-selection'
import { createDocument, getActiveLayer } from '@/core/document'
import { sessionFromDocument } from '@/store/workspace-session'
import { createCanvasBrushPath } from './canvas-render-brush-path'

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
