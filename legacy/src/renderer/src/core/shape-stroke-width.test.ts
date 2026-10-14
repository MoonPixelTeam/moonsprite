import { afterEach, expect, it } from 'vitest'
import { paintShape, rotatedShapePixelPoints } from './tools-shapes'
import { createDocument, getActiveLayer, readLayerColorAt } from './document-model'
import { beginPixelEdit } from './history'
import { useWorkspace } from '@/store/workspace'

afterEach(() => useWorkspace.setState({ sessions: [], activeId: null }))

it('commits the same thick outline pixels used by the preview', () => {
  const document = createDocument('stroke', 20, 20, 'rgba')
  const layer = getActiveLayer(document)
  const bounds = { x: 3, y: 4, width: 10, height: 10 }
  const color = { r: 255, g: 0, b: 0, a: 255 }
  paintShape(document, layer, beginPixelEdit(layer.id), bounds, 'ellipse-outline', color, null, undefined, undefined, 25, 0, 3)
  const expected = new Set(rotatedShapePixelPoints(bounds, 'ellipse-outline', 20, 20, 25, 0, 3).map(p => `${p.x},${p.y}`))
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    expect(readLayerColorAt(document, layer, x, y).a).toBe(expected.has(`${x},${y}`) ? 255 : 0)
  }
})

it('allows shape width changes even when the previous brush has intrinsic dimensions', () => {
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('shape width', 4, 4, 'rgba'))
  useWorkspace.getState().setTool('shape')
  useWorkspace.getState().mutateActive(session => {
    session.brushImage = { id: 'fixed-size', name: 'Fixed size', coverage: new Uint8Array([255]), width: 1, height: 1, intrinsicSize: true }
  }, false)
  useWorkspace.getState().setBrushSize(7)
  expect(useWorkspace.getState().sessions[0].brushSize).toBe(7)
})

it('draws an inward stroke of the requested width and fills narrow shapes without exceeding their bounds', () => {
  const bounds = { x: 3, y: 4, width: 10, height: 10 }
  const points = rotatedShapePixelPoints(bounds, 'rectangle-outline', 40, 40, 0, 0, 2)
  expect(points).toHaveLength(64)
  expect(points.some(p => p.x === 5 && p.y === 6)).toBe(false)
  expect(points.some(p => p.x === 4 && p.y === 8)).toBe(true)
  expect(rotatedShapePixelPoints(bounds, 'rectangle-outline', 40, 40, 0, 0, 128)).toHaveLength(100)
})

it.each(['rectangle-outline', 'ellipse-outline'] as const)('keeps thick rotated %s inside its filled silhouette', kind => {
  const bounds = { x: 10, y: 10, width: 18, height: 14 }
  const filled = rotatedShapePixelPoints(bounds, kind === 'ellipse-outline' ? 'ellipse' : 'rectangle', 50, 50, 35, 3)
  const stroke = rotatedShapePixelPoints(bounds, kind, 50, 50, 35, 3, 3)
  const pixels = new Set(filled.map(p => `${p.x},${p.y}`))
  expect(stroke.length).toBeGreaterThan(0)
  expect(stroke.length).toBeLessThan(filled.length)
  expect(stroke.every(p => pixels.has(`${p.x},${p.y}`))).toBe(true)
})
