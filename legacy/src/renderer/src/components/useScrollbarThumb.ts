import { useLayoutEffect, useRef, type RefObject } from 'react'

export function scrollbarThumbGeometry(trackLength: number, ratio: number, value: number, minimum = 20) {
  const length = Math.min(trackLength, Math.max(minimum, trackLength * ratio))
  return { length, offset: value * (trackLength - length) }
}

/** A fixed, tiny surface avoids rebuilding WebView2's page layer tree on every pan. */
export function useScrollbarThumb(trackRef: RefObject<HTMLDivElement | null>, horizontal: boolean, ratio: number, value: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ horizontal, ratio, value })
  latest.current = { horizontal, ratio, value }
  const size = useRef({ width: 0, height: 0 })
  const colors = useRef({ normal: '', hover: '' })
  const hovered = useRef(false)

  const thumbAt = (trackLength: number) => {
    const logicalLength = latest.current.horizontal ? size.current.width : size.current.height
    return scrollbarThumbGeometry(trackLength, latest.current.ratio, latest.current.value, logicalLength > 0 ? 20 * trackLength / logicalLength : 20)
  }
  const draw = (): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const { offset, length } = thumbAt(latest.current.horizontal ? canvas.width : canvas.height)
    const start = Math.round(offset)
    const end = Math.round(offset + length)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = hovered.current ? colors.current.hover : colors.current.normal
    if (latest.current.horizontal) context.fillRect(start, 0, end - start, canvas.height)
    else context.fillRect(0, start, canvas.width, end - start)
  }

  useLayoutEffect(() => {
    const track = trackRef.current
    const canvas = canvasRef.current
    if (!track || !canvas) return
    const refreshColors = () => {
      const style = getComputedStyle(track)
      colors.current = { normal: style.getPropertyValue('--theme-scrollbar-thumb'), hover: style.getPropertyValue('--theme-text-muted') }
      draw()
    }
    const resize = (width = track.clientWidth, height = track.clientHeight) => {
      size.current = { width, height }
      const bounds = track.getBoundingClientRect()
      const backingWidth = Math.max(1, Math.round(bounds.width * window.devicePixelRatio))
      const backingHeight = Math.max(1, Math.round(bounds.height * window.devicePixelRatio))
      if (canvas.width !== backingWidth) canvas.width = backingWidth
      if (canvas.height !== backingHeight) canvas.height = backingHeight
      draw()
    }
    resize()
    refreshColors()
    const observer = new ResizeObserver(([entry]) => { if (entry) resize(entry.contentRect.width, entry.contentRect.height) })
    observer.observe(track)
    // Interface zoom changes physical size without changing the CSS content box.
    const theme = new MutationObserver(() => { refreshColors(); resize(size.current.width, size.current.height) })
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme-id'] })
    const windowResize = () => resize()
    window.addEventListener('resize', windowResize)
    return () => { observer.disconnect(); theme.disconnect(); window.removeEventListener('resize', windowResize) }
    // Mutable refs supply the latest value without resubscribing during navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackRef])

  useLayoutEffect(draw, [horizontal, ratio, value])
  return { canvasRef, thumbAt, setHovered: (next: boolean) => { hovered.current = next; draw() } }
}
