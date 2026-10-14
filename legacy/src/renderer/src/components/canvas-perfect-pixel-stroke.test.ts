import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document-model'
import { beginPixelEdit, mergePixelEdits } from '@/core/history'
import { loadEditorPreferences } from '@/core/file-preferences'
import { paintBrush } from '@/core/tools-brush'
import { blendOver, packColor, unpackColor } from '@/core/raster'
import { revertCancelledCanvasDragPixelChanges } from '@/core/canvas-input-preview'
import type { CanvasDragState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { processRasterStrokeMove } from './canvas-raster-stroke'

afterEach(() => useWorkspace.setState({ sessions: [], activeId: null }))

// Fine samples are essential: the reversible tail, rather than the stable
// prefix, must be able to trigger the cropped layer's next expansion.
const waypoints = [{ x: 177, y: 74 }, { x: 178, y: 80 }, { x: 170, y: 75 }, { x: 150, y: 53 },
  { x: 88, y: 60 }, { x: 12, y: 86 }, { x: 38, y: 134 }, { x: 129, y: 136 }]
const videoPath = [waypoints[0]]
for (let i = 1; i < waypoints.length; i++) {
  const a = waypoints[i - 1], b = waypoints[i]
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  for (let step = 1; step <= steps; step++) videoPath.push({
    x: Math.round(a.x + (b.x - a.x) * step / steps),
    y: Math.round(a.y + (b.y - a.y) * step / steps)
  })
}
const geometry = { documentPointsAt: (x: number, y: number) => ({ local: { x, y }, repeated: { x, y }, offset: { x: 0, y: 0 } }) }

function strokeFixture({ cropped = true, size = 128, opacity = 50, tool = 'eraser', start = videoPath[0], mode = 'rgba' }: {
  cropped?: boolean; size?: number; opacity?: number; tool?: 'pencil' | 'eraser'; start?: { x: number; y: number }; mode?: 'rgba' | 'indexed'
} = {}) {
  const document = createDocument('perfect pixel regression', 176, 176, mode)
  const layer = document.layers[0]
  if (cropped) {
    layer.width = 160; layer.height = 160; layer.offsetX = 8; layer.offsetY = 8
    layer.pixels = mode === 'rgba' ? new Uint8ClampedArray(160 * 160 * 4) : new Uint32Array(160 * 160)
  }
  for (let i = 0; i < layer.width * layer.height; i++) {
    const x = i % layer.width + layer.offsetX, y = Math.floor(i / layer.width) + layer.offsetY
    if ((x - 87.5) ** 2 + (y - 87.5) ** 2 <= 80 ** 2) writeLayerColor(document, layer, i, { r: 61, g: 64, b: 23, a: 255 })
  }
  const snapshot = () => Uint32Array.from({ length: 176 * 176 }, (_, i) => packColor(readLayerColorAt(document, layer, i % 176, Math.floor(i / 176))))
  const before = snapshot()
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions.find((entry) => entry.document === document)!
  session.tool = tool; session.brushSize = size; session.brushOpacity = opacity
  session.brushShape = size === 1 ? 'square' : 'round'; session.perfectPixels = true
  session.brushTexture = 'solid'; session.brushImage = null
  session.view.tileRepeatMode = 'off'; session.view.showGrid = false
  const color = tool === 'eraser' ? { r: 0, g: 0, b: 0, a: 0 } : { r: 20, g: 200, b: 90, a: 255 }
  const edit = beginPixelEdit(layer.id)
  const drag: CanvasDragState = { kind: 'draw', start: { ...start }, last: { ...start }, edit, color,
    lastBrushSize: size, lastOpacityScale: opacity / 100, path: [{ ...start, size, opacityScale: opacity / 100, color }] }
  paintBrush(document, layer, edit, start.x, start.y, size, color, session.brushShape, null, 'solid', 1, null,
    undefined, 0, 'paint', undefined, undefined, undefined, undefined, opacity / 100)
  const invalidation = { strokeSegment: vi.fn(), rect: vi.fn(), all: vi.fn(), requestDraw: vi.fn() }
  const preferences = loadEditorPreferences()
  const move = (points: readonly { x: number; y: number }[]) => processRasterStrokeMove({
    session, drag, previousPoint: { ...drag.last }, pointerType: 'mouse', preferences,
    pointerSamples: points.map(({ x, y }) => ({ clientX: x, clientY: y }))
  }, geometry, invalidation)
  const assertHistory = () => {
    const painted = snapshot()
    const merged = drag.perfectPixelCommittedEdit ? mergePixelEdits(drag.perfectPixelCommittedEdit, drag.edit!) : drag.edit!
    useWorkspace.getState().commitPixelEdit(merged, tool)
    useWorkspace.getState().undo()
    expect(snapshot(), 'undo restores all original pixels').toEqual(before)
    useWorkspace.getState().redo()
    expect(snapshot(), 'redo restores the exact final stroke').toEqual(painted)
  }
  return { document, layer, session, color, drag, before, snapshot, move, assertHistory, invalidation }
}

for (const tool of ['pencil', 'eraser'] as const) for (const cropped of [false, true]) for (const opacity of [50, 100]) {
  it(`keeps a ${opacity}% 128px ${tool} uniform with exact undo/redo (cropped=${cropped})`, () => {
    const stroke = strokeFixture({ tool, cropped, opacity })
    for (const point of videoPath.slice(1)) stroke.move([point])
    const painted = stroke.snapshot()
    const coverage = Math.round(255 * opacity / 100)
    let changed = 0, invalidPixels = 0
    for (let i = 0; i < painted.length; i++) {
      if (painted[i] === stroke.before[i]) continue
      changed++
      const original = unpackColor(stroke.before[i])
      const expected = tool === 'eraser'
        ? coverage === 255 ? 0 : packColor({ ...original, a: Math.round(original.a * (1 - coverage / 255)) })
        : packColor(blendOver(original, { ...stroke.color, a: coverage }))
      if (painted[i] !== expected) invalidPixels++
    }
    expect(changed).toBeGreaterThan(10000)
    expect(invalidPixels, 'one stroke must never blend/erase a pixel twice').toBe(0)
    expect(stroke.layer.width).toBe(176)
    expect(stroke.layer.offsetX).toBe(0)
    stroke.assertHistory()
    expect(stroke.invalidation.all).not.toHaveBeenCalled()
  })
}

for (const tool of ['pencil', 'eraser'] as const) {
  it(`rebases a 1px ${tool} history when its tail expands the layer`, () => {
    const stroke = strokeFixture({ tool, size: 1, opacity: 100, start: { x: 150, y: 80 } })
    for (const x of [158, 162, 168, 170]) stroke.move([{ x, y: 80 }])
    expect(stroke.layer.width).toBeGreaterThan(160)
    stroke.assertHistory()
  })
}

it('cancels both stroke segments exactly after multiple storage expansions', () => {
  const stroke = strokeFixture()
  for (const point of videoPath.slice(1)) stroke.move([point])
  expect(revertCancelledCanvasDragPixelChanges(stroke.document, stroke.drag)).toBe(true)
  expect(stroke.snapshot()).toEqual(stroke.before)
})

it('preserves the 1px perfect-pixel corner correction', () => {
  const stroke = strokeFixture({ tool: 'pencil', size: 1, opacity: 100, start: { x: 2, y: 2 } })
  stroke.move([{ x: 3, y: 2 }])
  stroke.move([{ x: 3, y: 3 }])
  expect(readLayerColorAt(stroke.document, stroke.layer, 2, 2)).toEqual(stroke.color)
  expect(readLayerColorAt(stroke.document, stroke.layer, 3, 2).a).toBe(0)
  expect(readLayerColorAt(stroke.document, stroke.layer, 3, 3)).toEqual(stroke.color)
  stroke.assertHistory()
})

it('produces the same stroke for coalesced and individual pointer samples', () => {
  const individual = strokeFixture()
  for (const point of videoPath.slice(1)) individual.move([point])
  const expected = individual.snapshot()
  const coalesced = strokeFixture()
  coalesced.move(videoPath.slice(1))
  expect(coalesced.snapshot()).toEqual(expected)
  coalesced.assertHistory()
})

for (const tool of ['pencil', 'eraser'] as const) {
  it(`keeps the maximum ${tool} coverage when opacity changes across the stable prefix and tail`, () => {
    const stroke = strokeFixture({ tool, opacity: 50, start: { x: 85, y: 80 } })
    for (const [x, opacity] of [[86, 100], [87, 100], [88, 50], [89, 50], [90, 25]]) {
      stroke.session.brushOpacity = opacity
      stroke.move([{ x, y: 80 }])
    }
    const center = readLayerColorAt(stroke.document, stroke.layer, 85, 80)
    if (tool === 'eraser') expect(center.a).toBe(0)
    else expect(center).toEqual(stroke.color)
    stroke.assertHistory()
  })
}

it('rebases indexed pixel history and coverage through the same expansions', () => {
  const stroke = strokeFixture({ mode: 'indexed' })
  for (const point of videoPath.slice(1)) stroke.move([point])
  stroke.assertHistory()
})

it('uses fully transparent pixels when fractional eraser pressure rounds to full byte coverage', () => {
  const stroke = strokeFixture({ opacity: 99.9, start: { x: 85, y: 80 } })
  stroke.move([{ x: 86, y: 80 }, { x: 87, y: 80 }, { x: 88, y: 80 }])
  expect(readLayerColorAt(stroke.document, stroke.layer, 85, 80)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  stroke.assertHistory()
})
