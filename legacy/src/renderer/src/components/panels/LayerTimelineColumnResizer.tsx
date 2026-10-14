import type { PointerEventHandler } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { layerLabelWidthLimits } from './useLayerPanelPreferences'

export function LayerTimelineColumnResizer({layerLabelWidth, beginLayerLabelResize, setStoredLayerLabelWidth}: {
  layerLabelWidth: number
  beginLayerLabelResize: PointerEventHandler<HTMLSpanElement>
  setStoredLayerLabelWidth(width: number): void
}) {
  const {t} = useI18n()
  return (
    <span
      className="layer-animation-column-resizer"
      role="separator"
      aria-label={t('timeline.resizeLayerArea')}
      aria-orientation="vertical"
      aria-valuemin={layerLabelWidthLimits.min}
      aria-valuemax={layerLabelWidthLimits.max}
      aria-valuenow={layerLabelWidth}
      tabIndex={0}
      onPointerDown={beginLayerLabelResize}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setStoredLayerLabelWidth(layerLabelWidth - 12)
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          setStoredLayerLabelWidth(layerLabelWidth + 12)
        }
      }}
    />
  )
}
