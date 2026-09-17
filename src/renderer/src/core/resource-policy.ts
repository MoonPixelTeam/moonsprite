import type { ColorMode } from '@shared/types-raster'
import type { ResourceInfo } from '@shared/types-files'
import { translateCurrent as tr } from './localization'

export interface ResourceEstimate {
  pixels: number
  layerBytes: number
  documentBytes: number
  operationBytes: number
  peakBytes: number
}

export interface ResourceCheck {
  allowed: boolean
  estimate: ResourceEstimate
  reason?: string
}

const MAX_TYPED_ARRAY_BYTES = 0x7fffffff

export function estimateDocumentBytes(width: number, height: number, layers: number, colorMode: ColorMode): ResourceEstimate {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || layers < 1) {
    throw new Error(tr('core.resource.invalidDimensions'))
  }
  const pixels = width * height
  if (!Number.isSafeInteger(pixels)) throw new Error(tr('core.resource.unsafePixels'))
  const bytesPerPixel = colorMode === 'rgba' ? 4 : 4
  const layerBytes = pixels * bytesPerPixel
  const documentBytes = layerBytes * layers
  const operationBytes = pixels * 8
  return { pixels, layerBytes, documentBytes, operationBytes, peakBytes: documentBytes + operationBytes }
}

export function checkResourceLimit(
  width: number,
  height: number,
  layers: number,
  colorMode: ColorMode,
  system: ResourceInfo
): ResourceCheck {
  const allocationCheck = checkTypedArrayLimit(width, height, layers, colorMode)
  if (!allocationCheck.allowed) return allocationCheck
  const { estimate } = allocationCheck
  const dynamicBudget = Math.floor(system.freeBytes * 0.4)
  if (estimate.peakBytes > dynamicBudget) {
    return {
      allowed: false,
      estimate,
      reason: tr('core.resource.memoryLimit', { peak: formatBytes(estimate.peakBytes), budget: formatBytes(dynamicBudget) })
    }
  }
  return { allowed: true, estimate }
}

export function checkTypedArrayLimit(
  width: number,
  height: number,
  layers: number,
  colorMode: ColorMode
): ResourceCheck {
  const estimate = estimateDocumentBytes(width, height, layers, colorMode)
  return estimate.layerBytes > MAX_TYPED_ARRAY_BYTES
    ? { allowed: false, estimate, reason: tr('core.resource.typedArrayLimit') }
    : { allowed: true, estimate }
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}
