import { expect, it } from 'vitest'
import { paintingCursorPixelCenter } from './painting-cursor'
import { viewportPointFromDocumentPointContinuous } from './view-geometry'
import { DEFAULT_EDITOR_PREFERENCES, loadEditorPreferences, saveEditorPreferences, PAINTING_CURSOR_TYPE_KEY } from './file-preferences'

it('anchors to the same pixel center through zoom, mirror, rotation and UI scale', () => {
  const size = { width: 800, height: 600 }, document = { width: 32, height: 32 }
  for (const scale of [0.75, 1, 1.5, 2]) {
    const view = { zoom: 8, panX: 13, panY: -17, rotation: 37, mirrored: true, mirroredVertical: true }
    const point = viewportPointFromDocumentPointContinuous({ x: 3.1, y: 9.9 }, size.width, size.height, document.width, document.height, view, 'canvas')
    const expected = viewportPointFromDocumentPointContinuous({ x: 3.5, y: 9.5 }, size.width, size.height, document.width, document.height, view, 'canvas')
    const actual = paintingCursorPixelCenter({ x: point.x / scale, y: point.y / scale }, size, document, view, 'canvas', scale)
    expect(actual.x).toBeCloseTo(expected.x / scale)
    expect(actual.y).toBeCloseTo(expected.y / scale)
  }
})
it('persists independent painting cursor settings and defaults unknown settings to sprite', () => {
  localStorage.clear()
  expect(loadEditorPreferences().paintingCursorType).toBe('sprite')
  saveEditorPreferences({ ...DEFAULT_EDITOR_PREFERENCES, useLocalCursors: true, paintingCursorType: 'sprite-unscaled', cursorScale: 3 })
  expect(loadEditorPreferences()).toMatchObject({ useLocalCursors: true, paintingCursorType: 'sprite-unscaled', cursorScale: 3 })
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'invalid')
  expect(loadEditorPreferences().paintingCursorType).toBe('sprite')
  localStorage.clear()
})
