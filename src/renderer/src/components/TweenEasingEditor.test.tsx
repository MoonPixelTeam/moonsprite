import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TweenEasingEditor } from './TweenEasingEditor'
vi.mock('./I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

it('shows editable preset handles and supports precise editing in custom mode', () => {
  const onChange = vi.fn()
  const view = render(<TweenEasingEditor easing="linear" frameCount={8} onChange={onChange} />)
  expect(view.container.querySelectorAll('.tween-easing-handle')).toHaveLength(2)
  view.rerender(<TweenEasingEditor easing="custom" frameCount={8} onChange={onChange} />)
  expect(view.container.querySelectorAll('.tween-easing-handle')).toHaveLength(2)
  const svg = view.getByRole('img') as unknown as SVGSVGElement
  svg.setPointerCapture = vi.fn(); svg.releasePointerCapture = vi.fn()
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 124, height: 124 } as DOMRect)
  fireEvent.pointerDown(view.container.querySelector('.tween-easing-handle')!, { pointerId: 1, button: 0 })
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 37, clientY: 35 })
  expect(onChange).toHaveBeenLastCalledWith([0.25, 0.75, 0.58, 1])
  expect(svg).toHaveAttribute('preserveAspectRatio', 'none')
  vi.mocked(svg.getBoundingClientRect).mockReturnValue({ left: 20, top: 30, width: 496, height: 248 } as DOMRect)
  fireEvent.pointerMove(svg, { pointerId: 1, clientX: 168, clientY: 100 })
  expect(onChange).toHaveBeenLastCalledWith([0.25, 0.75, 0.58, 1])
  fireEvent.pointerCancel(svg, { pointerId: 1 })
  expect(onChange).toHaveBeenLastCalledWith([0.42, 0, 0.58, 1])
  fireEvent.click(view.getByText('timeline.tween.curveReset'))
  expect(onChange).toHaveBeenLastCalledWith([0.42, 0, 0.58, 1])
})
