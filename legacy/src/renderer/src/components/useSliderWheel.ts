import { createElement, useEffect, useRef, type InputHTMLAttributes } from 'react'

export function WheelRangeInput({ onWheelValue, percentage = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { onWheelValue(value: number): void; percentage?: boolean }) {
  const ref = useSliderWheel<HTMLInputElement>(event => {
    if (props.disabled) return
    event.preventDefault()
    event.stopPropagation()
    const input = ref.current!
    const next = sliderWheelValue(Number(input.value), event.deltaY, Number(input.min || 0), Number(input.max || 100), Number(input.step || 1), event.shiftKey, percentage)
    if (next !== Number(input.value)) onWheelValue(next)
  })
  return createElement('input', { ...props, ref })
}

export function sliderWheelValue(value: number, deltaY: number, min: number, max: number, step = 1, shiftKey = false, percentage = false): number {
  const increment = Number.isFinite(step) && step > 0 ? step : 1
  const stride = shiftKey ? Math.max(increment, percentage ? 10 : 5) : increment
  return Math.max(min, Math.min(max, Number((value - Math.sign(deltaY) * stride).toFixed(10))))
}

/** Native non-passive listener prevents a slider gesture also scrolling its panel. */
export function useSliderWheel<T extends HTMLElement>(onWheel: (event: WheelEvent) => void) {
  const ref = useRef<T>(null)
  const handler = useRef(onWheel)
  handler.current = onWheel
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const wheel = (event: WheelEvent) => { if (event.deltaY && !event.defaultPrevented) handler.current(event) }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  return ref
}
