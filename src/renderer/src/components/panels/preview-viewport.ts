/** Measure the clipped viewport, independently of the canvas's spare backing. */
export function measurePreviewViewport(canvas: HTMLCanvasElement) {
  const frame = canvas.parentElement
  const rect = frame?.getBoundingClientRect()
  const fallback = canvas.getBoundingClientRect()
  const screenScale = frame && rect && rect.width > 0 && frame.offsetWidth > 0 ? rect.width / frame.offsetWidth : 1
  return {
    width: frame?.clientWidth ?? fallback.width,
    height: frame?.clientHeight ?? fallback.height,
    left: rect && rect.width > 0 ? rect.left + (frame?.clientLeft ?? 0) * screenScale : fallback.left,
    top: rect && rect.height > 0 ? rect.top + (frame?.clientTop ?? 0) * screenScale : fallback.top,
    screenScale,
    dpr: Math.max(1, window.devicePixelRatio || 1) * screenScale
  }
}
