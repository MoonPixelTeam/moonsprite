import { expect, it, vi } from 'vitest'
import { refreshPenCursor, type CanvasPenCursorPorts, type CanvasPenCursorRefs } from './canvas-pen-cursor-state'
import { DEFAULT_EDITOR_PREFERENCES } from '@/core/file-preferences'
vi.mock('@/platform/cursor-theme', () => ({ cursorOverlayDescriptor: vi.fn(() => null), setNativeCursorVisible: vi.fn(async () => {}) }))
it.each(['simple', 'sprite'] as const)('positions the dot independently using %s alignment for mouse and pen', alignment => {
  for (const pressure of [false, true]) {
    const canvas = document.createElement('canvas')
    canvas.style.cursor = 'var(--cursor-pencil-black)'
    const overlay = document.createElement('span')
    const image = document.createElement('img')
    refreshPenCursor({ canvasRef: { current: canvas }, interfaceScale: 1, stageBounds: () => canvas.getBoundingClientRect(), paintingPoint: () => ({ x: 20, y: 30 }) }, {
      penCursorRef: { current: image }, adaptiveCursorRef: { current: overlay },
      penCursorStateRef: { current: { active: true, pressure, x: 19, y: 29 } },
      cursorPreferencesRef: { current: { ...DEFAULT_EDITOR_PREFERENCES, paintingCursorShape: 'dot', paintingCursorType: alignment } }
    })
    expect(canvas.dataset.adaptiveCursor).toBe('true')
    expect(overlay.hidden).toBe(false)
    expect(overlay.style.width).toBe('3px')
    expect(overlay.style.transform).toBe(alignment === 'simple' ? 'translate3d(17.5px, 27.5px, 0)' : 'translate3d(18.5px, 28.5px, 0)')
    expect(image.hidden).toBe(true)
  }
})

it('hides only the dot below 800% zoom', () => {
  const canvas = document.createElement('canvas')
  canvas.style.cursor = 'var(--cursor-pencil-black)'
  const overlay = document.createElement('span')
  const image = document.createElement('img')
  let zoom = 7.99
  const ports: CanvasPenCursorPorts = { canvasRef: { current: canvas }, interfaceScale: 1, get zoom() { return zoom }, stageBounds: () => canvas.getBoundingClientRect() }
  const refs: CanvasPenCursorRefs = {
    penCursorRef: { current: image }, adaptiveCursorRef: { current: overlay },
    penCursorStateRef: { current: { active: true, pressure: false, x: 19, y: 29 } },
    cursorPreferencesRef: { current: { ...DEFAULT_EDITOR_PREFERENCES, paintingCursorShape: 'dot' as const } }
  }
  refreshPenCursor(ports, refs)
  expect(overlay.hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBe('true')
  zoom = 8
  refreshPenCursor(ports, refs)
  expect(overlay.hidden).toBe(false)
  refs.cursorPreferencesRef.current!.paintingCursorShape = 'cross'
  zoom = 7.99
  refreshPenCursor(ports, refs)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
})
