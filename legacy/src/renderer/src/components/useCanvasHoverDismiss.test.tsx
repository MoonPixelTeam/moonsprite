import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState } from '@/core/canvas-input'
import { CANVAS_HOVER_DISMISS, useCanvasHoverDismiss } from './useCanvasHoverDismiss'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup() {
  const input = new CanvasInputState()
  const wheel = { current: true }
  input.pointer.visible = true
  input.shiftLinePreview = true
  const hidePenCursor = vi.fn(), hideEyedropperMagnifier = vi.fn()
  const draw = vi.fn(() => expect(input.pointer.visible).toBe(false))
  const canvasPress = vi.fn()
  let hover!: ReturnType<typeof useCanvasHoverDismiss>
  function Harness() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    hover = useCanvasHoverDismiss({ canvasRef, inputRef: { current: input },
      wheelBrushSizePreviewRef: wheel, hidePenCursor, hideEyedropperMagnifier, draw })
    return <><canvas ref={canvasRef} onPointerDown={event => {
      if (hover.acceptsHover(event)) canvasPress()
    }}/><button>Reference options</button></>
  }
  const view = render(<Harness />)
  return { ...view, input, wheel, draw, hidePenCursor, hideEyedropperMagnifier, canvasPress, get hover() { return hover } }
}

it.each(['blur', 'moonsprite:extension-pointer-enter', CANVAS_HOVER_DISMISS, 'focusin', 'pointerdown', 'visibilitychange'])('clears all hover visuals on %s without pointerleave', type => {
  const view = setup()
  if (type === 'focusin' || type === 'pointerdown') fireEvent(view.getByRole('button'), new Event(type, { bubbles: true }))
  else if (type === 'visibilitychange') {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event(type))
  } else fireEvent(window, new CustomEvent(type, { detail: 'doc' }))
  expect(view.input.pointer.visible).toBe(false)
  expect(view.input.shiftLinePreview).toBe(false)
  expect(view.wheel.current).toBe(false)
  expect(view.hidePenCursor).toHaveBeenCalledOnce()
  expect(view.hideEyedropperMagnifier).toHaveBeenCalledOnce()
  expect(view.draw).toHaveBeenCalledOnce()
  fireEvent(window, new Event('focus'))
  expect(view.input.pointer.visible).toBe(false)
  view.unmount()
  fireEvent(window, new Event('blur'))
  expect(view.draw).toHaveBeenCalledOnce()
})

it('preserves canvas input and captured gestures', () => {
  const view = setup()
  fireEvent.pointerDown(view.container.querySelector('canvas')!)
  expect(view.input.pointer.visible).toBe(true)
  const drag = { kind: 'marquee' } as NonNullable<CanvasInputState['drag']>
  view.input.drag = drag
  fireEvent.pointerDown(view.getByRole('button'))
  fireEvent.focusIn(view.getByRole('button'))
  expect(view.input.drag).toBe(drag)
  expect(view.input.pointer.visible).toBe(true)
  expect(view.draw).not.toHaveBeenCalled()
})

it.each(['before', 'after'])('handles the first canvas press when window focus arrives %s it', order => {
  const view = setup()
  fireEvent(window, new Event('moonsprite:extension-pointer-enter'))
  fireEvent(window, new Event('blur'))
  expect(view.hover.acceptsHover({ type: 'pointermove', buttons: 1 })).toBe(false)
  expect(view.hover.acceptsHover({ type: 'pointerup', buttons: 0 })).toBe(false)
  if (order === 'before') fireEvent(window, new Event('focus'))
  fireEvent.pointerDown(view.container.querySelector('canvas')!, { button: 0, buttons: 1 })
  expect(view.canvasPress).toHaveBeenCalledOnce()
  expect(view.hover.acceptsHover({ type: 'pointermove', buttons: 1 })).toBe(true)
  if (order === 'after') fireEvent(window, new Event('focus'))
  expect(view.hover.acceptsHover({ type: 'pointerup', buttons: 0 })).toBe(true)
})

it('does not let a canvas press restore input while the document is hidden', () => {
  const view = setup()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  fireEvent.pointerDown(view.container.querySelector('canvas')!, { button: 0, buttons: 1 })
  expect(view.canvasPress).not.toHaveBeenCalled()
  expect(view.input.pointer.visible).toBe(false)
})

it('dismisses every canvas and only restores hover on returning canvas input', () => {
  const first = setup(), second = setup()
  fireEvent(window, new CustomEvent(CANVAS_HOVER_DISMISS, { detail: 'another-document' }))
  for (const view of [first, second]) {
    expect(view.input.pointer.visible).toBe(false)
    expect(view.hover.acceptsHover({ type: 'pointermove', buttons: 1 })).toBe(false)
    expect(view.hover.acceptsHover({ type: 'pointerup', buttons: 0 })).toBe(false)
    expect(view.hover.acceptsHover({ type: 'wheel', buttons: 0 })).toBe(false)
  }
  expect(first.hover.acceptsHover({ type: 'pointermove', buttons: 0 })).toBe(true)
  expect(second.hover.acceptsHover({ type: 'wheel', buttons: 0 })).toBe(false)
  fireEvent(window, new Event('blur'))
  expect(first.hover.acceptsHover({ type: 'pointermove', buttons: 0 })).toBe(false)
  fireEvent(window, new Event('focus'))
  expect(first.hover.acceptsHover({ type: 'pointerup', buttons: 0 })).toBe(false)
  expect(first.hover.acceptsHover({ type: 'pointerdown', buttons: 1 })).toBe(true)
})
