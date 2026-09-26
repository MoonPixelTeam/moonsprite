import { PAINTING_CURSOR_TYPE_KEY, SELECTION_CROSSHAIR_PREFERENCE_KEY, USE_LOCAL_CURSORS_PREFERENCE_KEY } from '@/core/file-preferences'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { useCanvasPenCursor } from './useCanvasPenCursor'
import { canvasCursors } from '@/core/canvas-visuals'

vi.mock('@/platform/cursor-theme', () => ({
  setNativeCursorVisible: vi.fn(async () => {}),
  cursorOverlayDescriptor: (_cursor: string, _native: boolean, scale: number, ui: number) => ({ source: '/cursor.png', size: 32 * scale / ui, hotspotX: 15 * scale / ui, hotspotY: 15 * scale / ui })
}))
beforeEach(() => { localStorage.setItem('moonsprite.preference.painting-cursor-shape', 'cross') })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

function Harness({ cursorValue = canvasCursors.pencilBlack }: { cursorValue?: string } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pressureAdapterRef = useRef(new PointerPressureAdapter())
  const cursor = useCanvasPenCursor({ canvasRef, pressureAdapterRef, interfaceScale: 1, stageBounds: () => ({ left: 10, top: 20 }) as DOMRect })
  return <><canvas ref={canvasRef} style={{ cursor: cursorValue }} onPointerMove={cursor.syncPenCursor} onPointerLeave={cursor.hidePenCursor} /><img ref={cursor.penCursorRef} hidden /><span data-testid="adaptive" ref={cursor.adaptiveCursorRef} hidden /></>
}

it.each(['blur', 'moonsprite:extension-pointer-enter'])('clears the canvas overlay on %s without a canvas leave event', (type) => {
  const view = render(<Harness />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType: 'mouse', pointerId: 1 })
  fireEvent(canvas, move)
  expect(view.getByTestId('adaptive').hidden).toBe(false)
  fireEvent(window, new Event(type))
  expect(view.getByTestId('adaptive').hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
})

it('uses one backdrop mask for a pointer crossing dark and light regions, then clears it on tool change and leave', async () => {
  const view = render(<Harness />)
  const canvas = view.container.querySelector('canvas')!
  const overlay = view.getByTestId('adaptive')
  const move = (x: number, y: number) => {
    const event = new Event('pointermove', { bubbles: true })
    Object.assign(event, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1 })
    fireEvent(canvas, event)
  }
  move(40, 70)
  expect(overlay.hidden).toBe(false)
  expect(overlay.style.transform).toBe('translate3d(15px, 35px, 0)')
  expect(overlay.style.maskImage).toContain('/cursor.png')
  expect(overlay.style.backdropFilter).toContain('invert(1)')
  expect(canvas.dataset.adaptiveCursor).toBe('true')
  expect(view.container.querySelector('img')!.hidden).toBe(true)

  await act(async () => { canvas.style.cursor = canvasCursors.pencilWhite })
  expect(overlay.hidden).toBe(false)
  await act(async () => { canvas.style.cursor = canvasCursors.move })
  expect(overlay.hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
  await act(async () => { canvas.style.cursor = canvasCursors.pencilBlack })
  move(80, 90)
  expect(overlay.style.transform).toBe('translate3d(55px, 55px, 0)')
  fireEvent.pointerLeave(canvas)
  expect(overlay.hidden).toBe(true)
  expect(canvas.dataset.adaptiveCursor).toBeUndefined()
})

it.each(['mouse', 'pen'])('uses a system crosshair for simple native %s input and keeps sprite crosshairs independent', (pointerType) => {
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'simple')
  localStorage.setItem(USE_LOCAL_CURSORS_PREFERENCE_KEY, 'true')
  const view = render(<Harness />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType, pointerId: 1 })
  fireEvent(canvas, move)
  expect(document.documentElement.dataset.penInput).toBeUndefined()
  expect(canvas.dataset.paintingCursor).toBe('system')
  expect(view.getByTestId('adaptive')).not.toBeVisible()
  view.unmount()
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'sprite')
  const sprite = render(<Harness />)
  fireEvent(sprite.container.querySelector('canvas')!, move)
  expect(sprite.getByTestId('adaptive')).toBeVisible()
  expect(sprite.container.querySelector('canvas')!.dataset.paintingCursor).toBeUndefined()
})

it.each([canvasCursors.crosshair, canvasCursors.selectionBlack, canvasCursors.selectionWhite])('uses the native selection cursor %s when the painting overlay is disabled', (cursorValue) => {
  localStorage.setItem(SELECTION_CROSSHAIR_PREFERENCE_KEY, 'false')
  localStorage.setItem(USE_LOCAL_CURSORS_PREFERENCE_KEY, 'true')
  localStorage.setItem(PAINTING_CURSOR_TYPE_KEY, 'sprite')
  const view = render(<Harness cursorValue={cursorValue} />)
  const canvas = view.container.querySelector('canvas')!
  const move = new Event('pointermove', { bubbles: true })
  Object.assign(move, { clientX: 40, clientY: 70, pointerType: 'mouse', pointerId: 1 })
  fireEvent(canvas, move)
  expect(canvas.dataset.paintingCursor).toBe('system')
  expect(view.getByTestId('adaptive')).not.toBeVisible()
})
