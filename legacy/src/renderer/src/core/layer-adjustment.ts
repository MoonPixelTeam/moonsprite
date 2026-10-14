import type { LayerAdjustment } from '@shared/types-layer'
import { normalizeGradientMap, gradientMapSignature } from './gradient-map'
export function cloneLayerAdjustment(value: LayerAdjustment | undefined): LayerAdjustment | undefined {
  return value ? { kind: 'gradient-map', enabled: value.enabled !== false, gradientMap: normalizeGradientMap(value.gradientMap) } : undefined
}
export const layerAdjustmentSignature = (value: LayerAdjustment | undefined): string => value ? `${value.enabled}:${gradientMapSignature(value.gradientMap)}` : ''
