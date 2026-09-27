import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RgbaColor } from '@shared/types-color'
import { loadRecentColors, recentColorKey } from '@/core/recent-colors'
import { loadEditorPreferences } from '@/core/file-preferences'
import { useI18n } from '@/components/I18nProvider'
export function RecentColors({ onPrimary, onSecondary }: { onPrimary: (color: RgbaColor) => void; onSecondary: (color: RgbaColor) => void }) {
  const { t } = useI18n()
  const rowRef = useRef<HTMLDivElement>(null)
  const [capacity, setCapacity] = useState(0)
  const [colors, setColors] = useState(loadRecentColors)
  const [visible, setVisible] = useState(() => loadEditorPreferences().recentColorsVisible)
  useEffect(() => {
    const refresh = () => setColors(loadRecentColors())
    const preferences = () => setVisible(loadEditorPreferences().recentColorsVisible)
    window.addEventListener('moonsprite:recent-colors-changed', refresh)
    window.addEventListener('moonsprite:preferences-changed', preferences)
    return () => {
      window.removeEventListener('moonsprite:recent-colors-changed', refresh)
      window.removeEventListener('moonsprite:preferences-changed', preferences)
    }
  }, [])
  const hasColors = colors.length > 0
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    // Each swatch needs 24px, with a 3px gap between adjacent swatches.
    const measure = (width: number) => setCapacity(Math.max(0, Math.floor((width + 3) / 27)))
    measure(row.clientWidth)
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) measure(entry.contentRect.width)
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [visible, hasColors])
  if (!visible || !hasColors) return null
  return <section className="recent-colors" aria-label={t('color.recentColors')}><div ref={rowRef}>{colors.slice(0, capacity).map(color => <button type="button" key={recentColorKey(color)} title={`RGBA(${recentColorKey(color)})`} aria-label={`RGBA(${recentColorKey(color)})`} onClick={() => onPrimary(color)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onSecondary(color) }}><span style={{ backgroundColor: `rgba(${color.r},${color.g},${color.b},${color.a / 255})` }} /></button>)}</div></section>
}
