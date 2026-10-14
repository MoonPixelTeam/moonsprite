import { useState } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CurveEditor } from './AdjustmentDialog'
vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

it.each(['red', 'green', 'blue', 'rgb'] as const)('clears selection and dragging when switching to %s with fewer points', channel => {
  const changes = vi.fn()
  const points = [{ x: 0, y: 0 }, { x: 128, y: 128 }, { x: 255, y: 255 }]
  const view = render(<CurveEditor channel={channel === 'rgb' ? 'red' : 'rgb'} points={points} onChange={changes} onReset={vi.fn()} />)
  const svg = view.getByRole('application') as unknown as SVGSVGElement
  svg.setPointerCapture = vi.fn()
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 124, height: 124 } as DOMRect)
  fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 112, clientY: 10 })
  expect(view.getByLabelText('Y')).toHaveValue('255')
  view.rerender(<CurveEditor channel={channel} points={[points[0], points[2]]} onChange={changes} onReset={vi.fn()} />)
  expect(view.getByLabelText('Y')).toHaveValue('0')
  expect(view.getByLabelText('adjustment.curve.deletePoint')).toBeDisabled()
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 80, clientY: 40 })
  expect(changes).not.toHaveBeenCalled()
})

it('handles a shorter replacement curve before effects clear the selected endpoint', () => {
  const changes = vi.fn()
  const points = [{ x: 0, y: 0 }, { x: 128, y: 128 }, { x: 255, y: 255 }]
  const view = render(<CurveEditor points={points} onChange={changes} onReset={vi.fn()} />)
  const svg = view.getByRole('application') as unknown as SVGSVGElement
  svg.setPointerCapture = vi.fn()
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 124, height: 124 } as DOMRect)
  fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 112, clientY: 10 })
  view.rerender(<CurveEditor points={[points[0], points[2]]} onChange={changes} onReset={vi.fn()} />)
  expect(view.getByLabelText('Y')).toHaveValue('0')
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 80, clientY: 40 })
  expect(changes).not.toHaveBeenCalled()
})

it('uses the shared plot and component inputs while preserving color point editing', () => {
  const changes = vi.fn()
  function Harness() {
    const [points, setPoints] = useState([{ x: 0, y: 0 }, { x: 255, y: 255 }])
    return <CurveEditor points={points} onChange={next => { changes(next); setPoints(next) }} onReset={() => setPoints([{ x: 0, y: 0 }, { x: 255, y: 255 }])} />
  }
  const view = render(<Harness />)
  const svg = view.getByRole('application') as unknown as SVGSVGElement
  expect(svg).toHaveClass('tween-easing-plot')
  svg.setPointerCapture = vi.fn(); svg.hasPointerCapture = vi.fn(() => true); svg.releasePointerCapture = vi.fn()
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 124, height: 124, bottom: 124 } as DOMRect)
  fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 62, clientY: 60 })
  fireEvent.pointerUp(svg, { pointerId: 1 })
  expect(changes).toHaveBeenLastCalledWith([{ x: 0, y: 0 }, { x: 128, y: 128 }, { x: 255, y: 255 }])
  expect(view.getByLabelText('Y').closest('.number-input')).toBeTruthy()
  fireEvent.change(view.getByLabelText('Y'), { target: { value: '200' } })
  fireEvent.blur(view.getByLabelText('Y'))
  expect(changes.mock.calls.at(-1)![0][1]).toEqual({ x: 128, y: 200 })
  fireEvent.click(view.getByLabelText('adjustment.curve.deletePoint'))
  expect(changes).toHaveBeenLastCalledWith([{ x: 0, y: 0 }, { x: 255, y: 255 }])
})
