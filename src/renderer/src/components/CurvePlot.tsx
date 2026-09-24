import { useLayoutEffect, useRef, type SVGProps } from 'react'
import './tween-easing-editor.css'

/** Shared plot coordinates: 0–100, with room for labels and edge handles. */
export function curvePlotPoint(clientX: number, clientY: number, bounds: DOMRect) {
  return {
    x: Math.max(0, Math.min(1, ((clientX - bounds.left) / Math.max(1, bounds.width) * 124 - 12) / 100)),
    y: Math.max(0, Math.min(1, 1 - ((clientY - bounds.top) / Math.max(1, bounds.height) * 124 - 10) / 100))
  }
}

export function CurvePlot({ label, xLabel, yLabel, xStartLabel, xEndLabel, children, className = '', ...props }: SVGProps<SVGSVGElement> & {
  label: string; xLabel?: string; yLabel?: string; xStartLabel?: string; xEndLabel?: string
}) {
  const plotRef = useRef<SVGSVGElement>(null)
  useLayoutEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      // Handles occupy five plot units before compensation; render them at 8 CSS px.
      plot.style.setProperty('--curve-handle-scale-x', String(8 * 124 / (5 * width)))
      plot.style.setProperty('--curve-handle-scale-y', String(8 * 124 / (5 * height)))
      plot.style.setProperty('--curve-text-scale-x', String(124 / width))
      plot.style.setProperty('--curve-text-scale-y', String(124 / height))
    }
    const bounds = plot.getBoundingClientRect()
    update(bounds.width, bounds.height)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(plot)
    return () => observer.disconnect()
  }, [])
  return <svg {...props} ref={plotRef} className={`tween-easing-plot ${className}`.trim()} viewBox="-12 -10 124 124" preserveAspectRatio="none" aria-label={label} role={props.role ?? 'img'}>
    {[0, 25, 50, 75, 100].map(value => <path className="tween-easing-grid" key={value} d={`M${value} 0V100 M0 ${value}H100`} />)}
    {children}
    {xLabel && <g transform="translate(50 112)"><g className="curve-axis-text"><text textAnchor="middle">{xLabel}</text></g></g>}
    {yLabel && <g transform="translate(-5 50)"><g className="curve-axis-text"><text transform="rotate(-90)" textAnchor="middle">{yLabel}</text></g></g>}
    {xStartLabel && <g transform="translate(0 112)"><g className="curve-axis-text"><text>{xStartLabel}</text></g></g>}
    {xEndLabel && <g transform="translate(100 112)"><g className="curve-axis-text"><text textAnchor="end">{xEndLabel}</text></g></g>}
  </svg>
}
