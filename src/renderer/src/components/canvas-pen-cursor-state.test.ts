import { expect, it, vi } from 'vitest'
import { refreshPenCursor, type CanvasPenCursorPorts, type CanvasPenCursorRefs } from './canvas-pen-cursor-state'
import { DEFAULT_EDITOR_PREFERENCES } from '@/core/file-preferences'
import { cursorOverlayDescriptor, setNativeCursorVisible } from '@/platform/cursor-theme'
import { selectionCreationCursor } from '@/core/canvas-visuals'
vi.mock('@/platform/cursor-theme', () => ({ cursorOverlayDescriptor: vi.fn(() => null), setNativeCursorVisible: vi.fn(async () => {}) }))

it('keeps stalled native notifications and stationary cursor DOM mutations bounded during sustained pointer input', () => {
  const pending = new Promise<void>(() => {})
  const onFailure = vi.spyOn(pending, 'catch')
  vi.mocked(setNativeCursorVisible).mockReturnValue(pending)
  const canvas = document.createElement('canvas')
  canvas.style.cursor = 'var(--cursor-pencil-black)'
  const overlay = document.createElement('span'), image = document.createElement('img')
  const ports: CanvasPenCursorPorts = { canvasRef: { current: canvas }, interfaceScale: 1, stageBounds: () => canvas.getBoundingClientRect() }
  const refs: CanvasPenCursorRefs = {
    penCursorRef: { current: image }, adaptiveCursorRef: { current: overlay },
    penCursorStateRef: { current: { active: true, pressure: true, x: 19, y: 29 } },
    cursorPreferencesRef: { current: { ...DEFAULT_EDITOR_PREFERENCES, paintingCursorShape: 'dot' } }
  }
  const observer = new MutationObserver(() => {})
  try {
    refreshPenCursor(ports, refs)
    for (const target of [canvas, overlay, image, document.documentElement]) observer.observe(target, { attributes: true })
    for (let i = 0; i < 1000; i++) refreshPenCursor(ports, refs)
    expect(observer.takeRecords()).toHaveLength(0)
    expect(onFailure).toHaveBeenCalledTimes(1)
    refs.penCursorStateRef.current.x += 10
    refreshPenCursor(ports, refs)
    const changes = observer.takeRecords()
    expect(changes).toHaveLength(1)
    expect(changes[0].target).toBe(overlay)
    expect(changes[0].attributeName).toBe('style')
    expect(overlay.style.transform).toBe('translate3d(27.5px, 27.5px, 0)')
  } finally {
    observer.disconnect()
    onFailure.mockRestore()
    vi.mocked(setNativeCursorVisible).mockResolvedValue(undefined)
    delete document.documentElement.dataset.penInput
  }
})

it.each(['simple', 'sprite'] as const)('positions the dot independently using %s alignment for mouse and pen', alignment => {
  for (const pressure of [false, true]) {
    const canvas = document.createElement('canvas')
    canvas.style.cursor = 'var(--cursor-pencil-black)'
    const overlay = document.createElement('span')
    const image = document.createElement('img')
    refreshPenCursor({ canvasRef: { current: canvas }, interfaceScale: 1, stageBounds: () => canvas.getBoundingClientRect(), paintingPoint: () => ({ x: 20, y: 30 }) }, {
      penCursorRef: { current: image }, adaptiveCursorRef: { current: overlay },
      penCursorStateRef: { current: { active: true, pressure, x: 19, y: 29 } },
      cursorPreferencesRef: { current: { ...DEFAULT_EDITOR_PREFERENCES, paintingCursorShape: 'dot', paintingCursorAlignToPixel: alignment !== 'simple' } }
    })
    expect(canvas.dataset.adaptiveCursor).toBe('true')
    expect(overlay.hidden).toBe(false)
    expect(overlay.style.width).toBe('3px')
    expect(overlay.style.transform).toBe(alignment === 'simple' ? 'translate3d(17.5px, 27.5px, 0)' : 'translate3d(18.5px, 28.5px, 0)')
    expect(image.hidden).toBe(true)
  }
})

it('keeps the dot visible below 800% zoom', () => {
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
  expect(overlay.hidden).toBe(false)
  expect(canvas.dataset.adaptiveCursor).toBe('true')
  zoom = 8
  refreshPenCursor(ports, refs)
  expect(overlay.hidden).toBe(false)
  refs.cursorPreferencesRef.current!.paintingCursorShape = 'cross'
  zoom = 7.99
  refreshPenCursor(ports, refs)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
})

it.each(['dot', 'cross'] as const)('keeps the selection pointer alongside the %s painting overlay', shape => {
  const descriptorMock = vi.mocked(cursorOverlayDescriptor)
  descriptorMock.mockImplementation((cursor, native) => native && cursor === 'var(--cursor-crosshair)' ? null : {
    source: cursor.includes('pencil') ? '/painting.png' : '/selection.png', size: 32, hotspotX: 15, hotspotY: 15
  })
  try {
    for (const useLocalCursors of [false, true]) {
      for (const pressure of [false, true]) {
        const canvas = document.createElement('canvas')
        canvas.style.cursor = selectionCreationCursor(true, true, true, useLocalCursors)
        canvas.dataset.adaptiveCursor = 'true'
        canvas.dataset.paintingCursor = 'system'
        const overlay = document.createElement('span')
        const image = document.createElement('img')
        const ports: CanvasPenCursorPorts = { canvasRef: { current: canvas }, interfaceScale: 1, zoom: 8, stageBounds: () => canvas.getBoundingClientRect() }
        const refs: CanvasPenCursorRefs = {
          penCursorRef: { current: image }, adaptiveCursorRef: { current: overlay },
          penCursorStateRef: { current: { active: true, pressure, x: 19, y: 29 } },
          cursorPreferencesRef: { current: { ...DEFAULT_EDITOR_PREFERENCES, selectionCrosshair: true, useLocalCursors, paintingCursorShape: shape } }
        }
        refreshPenCursor(ports, refs)
        expect(overlay.hidden).toBe(false)
        expect(overlay.style.maskImage).toContain(shape === 'dot' ? 'data:image/svg+xml' : '/painting.png')
        expect(canvas.dataset.adaptiveCursor).toBe('true')
        expect(canvas.dataset.paintingCursor).toBeUndefined()
        expect(image.hidden).toBe(true)
        expect(setNativeCursorVisible).toHaveBeenLastCalledWith(!pressure)

        refreshPenCursor({ ...ports, zoom: 4 }, refs)
        expect(overlay.hidden).toBe(false)
        expect(canvas.dataset.adaptiveCursor).toBe('true')
        expect(image.hidden).toBe(true)

        refs.cursorPreferencesRef.current!.paintingCursorShape = shape === 'dot' ? 'cross' : 'dot'
        refreshPenCursor(ports, refs)
        expect(overlay.style.maskImage).toContain(shape === 'dot' ? '/painting.png' : 'data:image/svg+xml')

        canvas.style.cursor = selectionCreationCursor(false, true, true, useLocalCursors)
        refreshPenCursor(ports, refs)
        expect(overlay.hidden).toBe(true)
      }
    }
  } finally {
    descriptorMock.mockImplementation(() => null)
    delete document.documentElement.dataset.penInput
  }
})

it.each([false, true])('uses the pixel-cross SVG and honors pixel alignment=%s at low zoom', aligned => {
  const canvas = document.createElement('canvas'); canvas.style.cursor = 'var(--cursor-pencil-black)'
  const overlay = document.createElement('span'), image = document.createElement('img')
  for (const pressure of [false, true]) for (const interfaceScale of [1, 1.5, 2] as const) {
    refreshPenCursor({ canvasRef: { current: canvas }, zoom: 0.25, interfaceScale,
      paintingPoint: () => ({ x: 20, y: 30 }), stageBounds: () => canvas.getBoundingClientRect() }, {
      penCursorRef: { current: image }, adaptiveCursorRef: { current: overlay },
      penCursorStateRef: { current: { active: true, pressure, x: 19, y: 29 } },
      cursorPreferencesRef: { current: { ...DEFAULT_EDITOR_PREFERENCES, useLocalCursors: true, paintingCursorShape: 'pixel-cross', paintingCursorAlignToPixel: aligned } }
    })
    expect(overlay.hidden).toBe(false)
    expect(overlay.style.width).toBe(`${32 / interfaceScale}px`)
    expect(decodeURIComponent(overlay.style.backgroundImage)).toContain('M7 2h1v3H7z')
    expect(decodeURIComponent(overlay.style.backgroundImage)).toContain('fill="#101010"')
    expect(overlay.style.maskImage).toBe('none')
    expect(overlay.style.backdropFilter).toBe('none')
    expect(overlay.style.transform).toBe(`translate3d(${(aligned ? 20 : 19) - 15 / interfaceScale}px, ${(aligned ? 30 : 29) - 15 / interfaceScale}px, 0)`)
    expect(canvas.dataset.paintingCursor).toBeUndefined()
  }
})
