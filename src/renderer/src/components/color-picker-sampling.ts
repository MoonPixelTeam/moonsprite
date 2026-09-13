import type { RgbaColor } from '@shared/types'

interface PickerSampler {
  sample: (x: number, y: number, target: Element) => RgbaColor | null
  finish: () => void
}
const samplers = new Map<HTMLElement, PickerSampler>()
let active: PickerSampler | null = null

export function finishColorPickerSampling(): void {
  active?.finish()
  active = null
}

export function registerColorPickerSampler(element: HTMLElement, sampler: PickerSampler): () => void {
  samplers.set(element, sampler)
  return () => {
    if (active === sampler) finishColorPickerSampling()
    samplers.delete(element)
  }
}

/** A handled empty region must not fall through to sampling cursor/border pixels. */
export function sampleColorPickerAtClientPoint(x: number, y: number): { color: RgbaColor | null } | null {
  const target = document.elementsFromPoint?.(x, y).find(element =>
    element.matches('.color-field-interaction, .hue-strip-input, .value-strip-input, .alpha-strip-input'))
  if (target) for (const [element, sampler] of samplers) {
    if (!element.contains(target)) continue
    if (active !== sampler) { finishColorPickerSampling(); active = sampler }
    return { color: sampler.sample(x, y, target) }
  }
  finishColorPickerSampling()
  return null
}
