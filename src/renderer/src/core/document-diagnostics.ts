import type { SpriteDocument } from '@shared/types-document'
import { lazyRuntimeRasterForSurface } from './runtime-raster'
import type { RuntimeDiagnosticDetail } from './runtime-diagnostics'

/** Scalar metadata only: no layer names, pixel reads, bounds scans or recording copies. */
export const documentDiagnosticDetail = (document: SpriteDocument): RuntimeDiagnosticDetail => {
  const layer = document.layers.find((candidate) => candidate.id === document.activeLayerId)
  const styles = layer?.layerStyles
  const effects = styles?.enabled
    ? (['stroke', 'shadow', 'innerGlow', 'colorOverlay', 'gradientOverlay'] as const).filter((key) => styles[key]?.enabled).join(',')
    : ''
  return {
    documentId: document.id,
    frameId: document.animation?.activeFrameId ?? null,
    layerId: layer?.id ?? null,
    layerKind: layer?.kind ?? 'raster',
    layerSize: layer ? `${layer.width}x${layer.height}` : null,
    layerFormat: layer?.format ?? null,
    layerStorage: layer ? (lazyRuntimeRasterForSurface(layer) ? 'sparse' : 'dense') : null,
    layerEffects: effects || 'none',
    layerBlend: layer?.blendMode ?? null,
    layerGroupId: layer?.groupId ?? null,
    layerClipped: layer?.clippingMask === true,
    timelapseEnabled: document.timelapse?.enabled === true,
    timelapseFrames: document.timelapse?.snapshots.length ?? 0
  }
}
