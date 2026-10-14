/**
 * Rebuild canvas-backed surfaces after WebView2 resumes a backgrounded window.
 * The browser can keep the document alive while dropping GPU surfaces, so a
 * normal dirty notification is not guaranteed to arrive on focus.
 */
export function installCanvasResumeRedraw(invalidate: () => void, request: () => void): () => void {
  let firstFrame: number | null = null
  let secondFrame: number | null = null

  const resumeRendering = (): void => {
    if (document.visibilityState === 'hidden') return
    invalidate()
    if (firstFrame !== null) window.cancelAnimationFrame(firstFrame)
    if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
    firstFrame = window.requestAnimationFrame(() => {
      firstFrame = null
      request()
      secondFrame = window.requestAnimationFrame(() => {
        secondFrame = null
        request()
      })
    })
  }

  document.addEventListener('visibilitychange', resumeRendering)
  window.addEventListener('focus', resumeRendering)
  window.addEventListener('pageshow', resumeRendering)
  return () => {
    document.removeEventListener('visibilitychange', resumeRendering)
    window.removeEventListener('focus', resumeRendering)
    window.removeEventListener('pageshow', resumeRendering)
    if (firstFrame !== null) window.cancelAnimationFrame(firstFrame)
    if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
  }
}
