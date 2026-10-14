import type { SpriteDocument } from '@shared/types-document'
import type { ResourceInfo } from '@shared/types-files'
import { layerMasks } from './document-model'
import { backgroundPatternSize } from './background-patterns'
import { checkTypedArrayLimit, formatBytes, type ResourceCheck } from './resource-policy'
import { translateCurrent as tr } from './localization'

/** Canvas resizing retains ordinary layer storage; only clipped/derived surfaces allocate. */
export function checkCanvasResizeResources(document: SpriteDocument, width: number, height: number,
  offsetX: number, offsetY: number, trimOutside: boolean, system: ResourceInfo): ResourceCheck {
  const check = checkTypedArrayLimit(width, height, 1, document.colorMode)
  if (!check.allowed) return check
  const layers = new Map(document.layers.map(layer => [layer.id, layer]))
  let allocationBytes = 0
  let largestAllocation = check.estimate.layerBytes
  const count = (bytes: number): void => {
    allocationBytes += bytes
    largestAllocation = Math.max(largestAllocation, bytes)
  }
  const surfaces = [
    ...document.layers.map(surface => ({ surface, layer: surface })),
    ...(document.animation?.cels ?? []).flatMap(cel => cel.surface ? [{ surface: cel.surface, layer: layers.get(cel.layerId) }] : []),
    ...layerMasks(document).map(surface => ({ surface, layer: undefined }))
  ]
  for (const { surface, layer } of surfaces) {
    const sourceBytes = surface.width * surface.height * 4
    if (layer?.background) {
      const background = layer.background
      const repeat = background.mode === 'preset' && background.pattern ? backgroundPatternSize(background.pattern)
        : { width: background.repeatWidth ?? document.width, height: background.repeatHeight ?? document.height }
      count((width + repeat.width) * (height + repeat.height) * 4)
      continue
    }
    if (layer?.kind === 'tilemap' || layer?.kind === 'free-tile') {
      count((Math.max(width, surface.width) + Math.abs(offsetX)) * (Math.max(height, surface.height) + Math.abs(offsetY)) * 4)
      continue
    }
    if (!trimOutside) continue
    const x = surface.offsetX + offsetX, y = surface.offsetY + offsetY
    const clippedWidth = Math.max(0, Math.min(width, x + surface.width) - Math.max(0, x))
    const clippedHeight = Math.max(0, Math.min(height, y + surface.height) - Math.max(0, y))
    if (clippedWidth === surface.width && clippedHeight === surface.height) continue
    if (!clippedWidth || !clippedHeight) { count(4); continue }
    // Cropping lazy storage can materialize the source as well as its cropped copy.
    count(sourceBytes)
    count(clippedWidth * clippedHeight * 4)
  }
  const estimate = { ...check.estimate, documentBytes: allocationBytes, peakBytes: allocationBytes + check.estimate.peakBytes }
  if (!Number.isSafeInteger(estimate.peakBytes) || largestAllocation > 0x7fffffff)
    return { allowed: false, estimate, reason: tr('core.resource.typedArrayLimit') }
  const budget = Math.floor(system.freeBytes * 0.4)
  return estimate.peakBytes > budget
    ? { allowed: false, estimate, reason: tr('core.resource.memoryLimit', { peak: formatBytes(estimate.peakBytes), budget: formatBytes(budget) }) }
    : { allowed: true, estimate }
}
