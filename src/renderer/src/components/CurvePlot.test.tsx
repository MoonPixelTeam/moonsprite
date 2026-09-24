import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CurvePlot } from './CurvePlot'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps eight-pixel square anchors and unscaled labels across plot sizes', () => {
  let resize: (entries: { contentRect: { width: number; height: number } }[]) => void = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: typeof resize) { resize = callback }
    observe = vi.fn()
    disconnect = disconnect
  })
  const view = render(<CurvePlot label="curve" xLabel="Time" yLabel="Progress" xStartLabel="Shadows" xEndLabel="Highlights"><rect className="tween-easing-handle" x="47.5" y="47.5" width="5" height="5" /></CurvePlot>)
  const svg = view.getByRole('img') as unknown as SVGSVGElement
  for (const [width, height] of [[480, 240], [240, 480], [320, 320], [640, 640]]) {
    resize([{ contentRect: { width, height } }])
    const scaleX = Number(svg.style.getPropertyValue('--curve-handle-scale-x'))
    const scaleY = Number(svg.style.getPropertyValue('--curve-handle-scale-y'))
    expect(5 * width / 124 * scaleX).toBeCloseTo(8)
    expect(5 * height / 124 * scaleY).toBeCloseTo(8)
    expect(width / 124 * Number(svg.style.getPropertyValue('--curve-text-scale-x'))).toBeCloseTo(1)
    expect(height / 124 * Number(svg.style.getPropertyValue('--curve-text-scale-y'))).toBeCloseTo(1)
    expect(svg.querySelector('rect')).toHaveAttribute('x', '47.5')
    expect(svg.querySelector('rect')).toHaveAttribute('y', '47.5')
  }
  for (const label of ['Time', 'Progress', 'Shadows', 'Highlights']) {
    expect(view.getByText(label).closest('svg')).toBe(svg)
    expect(view.getByText(label).parentElement).toHaveClass('curve-axis-text')
  }
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})
