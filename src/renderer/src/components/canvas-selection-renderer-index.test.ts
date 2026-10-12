import { afterEach, describe, expect, it, vi } from 'vitest'
import { drawSelectionOutline } from './canvas-selection-renderer'
import { selectionBoundarySegments } from '@/core/selection-boundary'

class RecordedPath {
  commands: number[][] = []
  moveTo(x: number, y: number) { this.commands.push([0, x, y]) }
  lineTo(x: number, y: number) { this.commands.push([1, x, y]) }
}
const view = { zoom: 1, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: false }
afterEach(() => vi.unstubAllGlobals())
describe('packed selection boundary viewport index', () => {
  it('indexes crossing segments once in original bucket traversal order', () => {
    vi.stubGlobal('Path2D', RecordedPath)
    const mask = new Uint8Array(193 * 129)
    for (let y = 0; y < 129; y++) for (let x = 0; x < 193; x++) mask[y * 193 + x] = y % 9 < 4 && x % 17 < 11 ? 1 : 0
    const selection = { x: 0, y: 0, width: 193, height: 129, mask }
    const options = { context: {} as CanvasRenderingContext2D, selection, box: { x: -60, y: -62, width: 193, height: 129 }, view, viewportWidth: 73, viewportHeight: 39, rotationIndicatorPosition: 'canvas' as const, cache: null, outlineDark: '#000', outlineLight: '#fff', showOutline: false, showHandles: false }
    const cache = drawSelectionOutline(options)
    const segments = selectionBoundarySegments(selection)
    expect(cache.segments).toEqual(segments)
    const expected = new Set<number>()
    for (let by = 0; by <= 1; by++) for (let bx = 0; bx <= 2; bx++) {
      for (let i = 0; i < segments.length; i += 4) {
        if (Math.floor(Math.min(segments[i], segments[i + 2]) / 64) <= bx && Math.floor(Math.max(segments[i], segments[i + 2]) / 64) >= bx && Math.floor(Math.min(segments[i + 1], segments[i + 3]) / 64) <= by && Math.floor(Math.max(segments[i + 1], segments[i + 3]) / 64) >= by) expected.add(i)
      }
    }
    const commands: number[][] = []
    for (const i of expected) {
      const [x1,y1,x2,y2] = segments.subarray(i, i + 4)
      if (Math.max(x1,x2) < 59 || Math.min(x1,x2) > 134 || Math.max(y1,y2) < 61 || Math.min(y1,y2) > 102) continue
      const a = Math.max(59, Math.min(134,x1)), b = Math.max(61, Math.min(102,y1)), c = Math.max(59, Math.min(134,x2)), d = Math.max(61, Math.min(102,y2))
      if (a === c && b === d) continue
      commands.push([0,a,b],[1,c,d])
    }
    expect((cache.screenPaths.values().next().value!.outline as unknown as RecordedPath).commands).toEqual(commands)
    expect(drawSelectionOutline({ ...options, cache })).toBe(cache)
    cache.bucketIndex!.generation = 0xffffffff
    cache.screenPaths.clear()
    drawSelectionOutline({ ...options, cache })
    expect(cache.bucketIndex!.generation).toBe(1)
    expect((cache.screenPaths.values().next().value!.outline as unknown as RecordedPath).commands).toEqual(commands)
  })
  it('handles an empty mask, offscreen viewport, long edges and identity invalidation', () => {
    vi.stubGlobal('Path2D', RecordedPath)
    const options = { context: {} as CanvasRenderingContext2D, selection: { x: 0, y: 0, width: 4096, height: 4096 }, box: { x: 10000, y: 10000, width: 4096, height: 4096 }, view, viewportWidth: 512, viewportHeight: 512, rotationIndicatorPosition: 'canvas' as const, cache: null, outlineDark: '#000', outlineLight: '#fff', showOutline: false, showHandles: false }
    const cache = drawSelectionOutline(options)
    expect((cache.screenPaths.values().next().value!.outline as unknown as RecordedPath).commands).toEqual([])
    const empty = drawSelectionOutline({ ...options, selection: { ...options.selection, mask: new Uint8Array(4096 * 4096) }, cache })
    expect(empty).not.toBe(cache)
    expect(empty.segments.length).toBe(0)
    for (let i = 0; i < 20; i++) drawSelectionOutline({ ...options, cache, box: { ...options.box, x: -i - 1 } })
    expect(cache.screenPaths.size).toBe(16)
  })
})
