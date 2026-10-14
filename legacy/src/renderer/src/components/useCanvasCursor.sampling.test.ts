import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useCanvasCursor } from './useCanvasCursor'
import { cursorSamplingFixture } from './canvas-cursor-sampling-fixture'
import { useWorkspace } from '@/store/workspace'
import { canvasToolCursor, transparencyColorAt } from '@/core/canvas-visuals'
import { blendOver } from '@/core/raster'

afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }) })

it.each([0, 255])('keeps the preview-based cursor contrast for luminance %i', channel => {
  const { ports, canvas } = cursorSamplingFixture()
  const replacement = { r: channel, g: channel, b: channel, a: 255 }
  Object.assign(ports, { cursorCompositePointReplacementSamplerFor: () => () => replacement })
  const { result } = renderHook(() => useCanvasCursor(ports))
  result.current.updateCursorAt(100, 100, false, false)
  expect(canvas.style.cursor).toBe(canvasToolCursor('pencil', replacement))
})

it('composites just the preview color for every mouse sample in a 500px ten-layer document', () => {
  const { ports, counts, canvas, session } = cursorSamplingFixture()
  const { result } = renderHook(() => useCanvasCursor(ports))
  for (let x = 0; x < 1000; x++) result.current.updateCursorAt(x, 100, false, false)
  expect(counts).toEqual({ composite: 0, replacement: 1000 })
  expect(canvas.style.cursor).toBeTruthy()
  expect(session.document.layers).toHaveLength(10)
  expect(session.history.length).toBe(0)
})

it.each(['locked', 'outside-selection'] as const)('retains real canvas contrast when preview cannot paint: %s', reason => {
  const { ports, counts, canvas, session, composite } = cursorSamplingFixture()
  if (reason === 'locked') { ports.activeLayer.locked = true; Object.assign(ports, { activeLayerEditable: false }) }
  else session.selection = { x: 0, y: 0, width: 1, height: 1 }
  const { result } = renderHook(() => useCanvasCursor(ports))
  result.current.updateCursorAt(100, 100, false, false)
  expect(counts).toEqual({ composite: 1, replacement: 0 })
  expect(canvas.style.cursor).toBe(canvasToolCursor('pencil', blendOver(transparencyColorAt(100, 100), composite(100, 100)), reason !== 'locked'))
})
