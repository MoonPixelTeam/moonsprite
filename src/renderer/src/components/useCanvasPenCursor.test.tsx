import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { PointerPressureAdapter } from '@/core/canvas-input'
import { useCanvasPenCursor } from './useCanvasPenCursor'
import { canvasCursors } from '@/core/canvas-visuals'

vi.mock('@/platform/cursor-theme', () => ({
  setNativeCursorVisible: vi.fn(async () => {}),
  cursorOverlayDescriptor: () => ({ source: '/cursor.png', size: 32, hotspotX: 15, hotspotY: 15 })
}))
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

function Harness() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pressureAdapterRef = useRef(new PointerPressureAdapter())
  const cursor = useCanvasPenCursor({ canvasRef, pressureAdapterRef, interfaceScale: 1, stageBounds: () => ({ left: 10, top: 20 }) as DOMRect })
  return <><canvas ref={canvasRef} style={{ cursor: canvasCursors.pencilBlack }} onPointerMove={cursor.syncPenCursor} onPointerLeave={cursor.hidePenCursor} /><img ref={cursor.penCursorRef} hidden /><span data-testid="adaptive" ref={cursor.adaptiveCursorRef} hidden /></>
}

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
