import type { RgbaColor } from '@shared/types-color'

export const CANVAS_COLOR_SAMPLED_EVENT = 'moonsprite:canvas-color-sampled'
export const CANVAS_COLOR_SAMPLING_COMPLETED_EVENT = 'moonsprite:canvas-color-sampling-completed'

export interface CanvasColorSampledDetail {
  color: RgbaColor
  secondary: boolean
}

export function publishCanvasColorSample(color: RgbaColor, secondary: boolean): void {
  window.dispatchEvent(new CustomEvent<CanvasColorSampledDetail>(CANVAS_COLOR_SAMPLED_EVENT, {
    detail: { color: { ...color }, secondary }
  }))
}

export function publishCanvasColorSamplingCompleted(): void {
  window.dispatchEvent(new Event(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT))
}
