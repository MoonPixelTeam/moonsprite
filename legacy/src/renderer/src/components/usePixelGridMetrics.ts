import { useSyncExternalStore, type CSSProperties } from 'react'

const currentRatio = (): number => Math.max(0.25, window.devicePixelRatio || 1)
const subscribe = (notify: () => void): (() => void) => {
  let media: MediaQueryList | undefined
  const update = (): void => {
    media?.removeEventListener('change', update)
    media = window.matchMedia?.(`(resolution: ${currentRatio()}dppx)`)
    media?.addEventListener('change', update)
    notify()
  }
  update()
  window.addEventListener('resize', update)
  return () => { media?.removeEventListener('change', update); window.removeEventListener('resize', update) }
}

export const useDisplayPixelRatio = (): number => useSyncExternalStore(subscribe, currentRatio, () => 1)

/** Quantize the complete cell pitch, not just its border, to avoid alternating widths. */
export function pixelGridMetrics(size: number, gap: number, ratio: number) {
  const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1
  const snap = (value: number): number => Math.max(1, Math.round(value * scale)) / scale
  return { size: snap(size), gap: gap > 0 ? snap(gap) : 0, line: snap(1) }
}

export function usePixelGridMetrics(size: number, gap = 1) {
  const ratio = useDisplayPixelRatio()
  const metrics = pixelGridMetrics(size, gap, ratio)
  const style = {
    '--swatch-size': `${metrics.size}px`, '--palette-swatch-gap': `${metrics.gap}px`, '--palette-line-width': `${metrics.line}px`
  } as CSSProperties
  return { ...metrics, style }
}
