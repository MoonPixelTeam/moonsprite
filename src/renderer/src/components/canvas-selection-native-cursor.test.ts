import { describe, expect, it, vi } from 'vitest'
import { canvasCursors } from '@/core/canvas-visuals'
import { createCanvasSelectionPaths } from './canvas-render-selection-paths'

describe('selection cursor corner rendering', () => {
  it.each([true, false])('draws pixel corners only with software cursors (native=%s)', (useLocalCursors) => {
    const fillRect = vi.fn()
    const previewPixelRect = vi.fn(() => ({ x: 10, y: 10, width: 8, height: 8 }))
    const ports = {
      useLocalCursors,
      selectionPreviewColorMode: 'custom',
      selectionPreviewColor: { r: 0, g: 0, b: 0, a: 255 },
      deviceScale: { x: 1, y: 1 },
      previewPixelRect,
      context: { save: vi.fn(), restore: vi.fn(), fillRect }
    } as unknown as Parameters<typeof createCanvasSelectionPaths>[0]
    createCanvasSelectionPaths(ports).drawSelectionCursorCorners(2, 3, '#000')
    if (useLocalCursors) {
      expect(previewPixelRect).not.toHaveBeenCalled()
      expect(fillRect).not.toHaveBeenCalled()
    } else {
      expect(previewPixelRect).toHaveBeenCalledWith(2, 3)
      expect(fillRect).toHaveBeenCalled()
    }
  })
})

it.each([...Object.entries(canvasCursors), ['native', 'crosshair'], ['default', 'default']])('retires selection corners while %s owns the pointer', (_name, cursor) => {
  const canvas = document.createElement('canvas')
  const fillRect = vi.fn()
  const paths = createCanvasSelectionPaths({
    cursorCanvas: canvas, selectionPreviewColorMode: 'custom',
    selectionPreviewColor: { r: 0, g: 0, b: 0, a: 255 }, deviceScale: { x: 1, y: 1 },
    previewPixelRect: () => ({ x: 10, y: 10, width: 8, height: 8 }),
    context: { save: vi.fn(), restore: vi.fn(), fillRect }
  } as unknown as Parameters<typeof createCanvasSelectionPaths>[0])
  canvas.style.cursor = 'none'
  paths.drawSelectionCursorCorners(2, 3, '#000')
  expect(fillRect).toHaveBeenCalled()
  fillRect.mockClear()
  canvas.style.cursor = cursor
  // Reuse the already-created renderer, just as a queued frame does.
  paths.drawSelectionCursorCorners(2, 3, '#000')
  expect(fillRect).not.toHaveBeenCalled()
  canvas.style.cursor = 'none'
  paths.drawSelectionCursorCorners(2, 3, '#000')
  expect(fillRect).toHaveBeenCalled()
})
