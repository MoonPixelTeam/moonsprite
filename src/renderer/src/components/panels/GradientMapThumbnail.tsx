import type { LayerAdjustment } from '@shared/types-layer'
import { gradientMapCss } from '@/core/gradient-map-presets'
export function GradientMapThumbnail({ adjustment }: { adjustment: LayerAdjustment }) {
  return <span className="gradient-map-layer-thumbnail" style={{ background: gradientMapCss(adjustment.gradientMap), opacity: adjustment.enabled === false ? 0.4 : 1 }} aria-hidden="true" />
}
