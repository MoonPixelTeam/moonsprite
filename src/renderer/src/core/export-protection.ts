export type ExportProtection = 'off' | 'blur' | 'blur-noise'

/** Export-only, alpha-aware softening; never mutates source pixels. */
export function protectExportPixels<T extends { pixels: Uint8ClampedArray; width: number; height: number }>(image: T, scalePercent: number, mode: ExportProtection = 'off'): T {
  if (mode === 'off' || scalePercent <= 100) return image
  const { width, height } = image
  const radius = Math.max(1, Math.ceil(Math.min(64, scalePercent / 100) * 0.6))
  const pass = (input: Uint8ClampedArray, horizontal: boolean): Uint8ClampedArray => {
    const output = new Uint8ClampedArray(input.length)
    const length = horizontal ? width : height
    const lines = horizontal ? height : width
    const count = radius * 2 + 1
    for (let line = 0; line < lines; line++) {
      const sums = [0, 0, 0, 0]
      const add = (position: number, sign: number): void => {
        const p = Math.max(0, Math.min(length - 1, position))
        const offset = (horizontal ? line * width + p : p * width + line) * 4
        const alpha = input[offset + 3]
        for (let channel = 0; channel < 3; channel++) sums[channel] += input[offset + channel] * alpha * sign
        sums[3] += alpha * sign
      }
      for (let p = -radius; p <= radius; p++) add(p, 1)
      for (let p = 0; p < length; p++) {
        const offset = (horizontal ? line * width + p : p * width + line) * 4
        for (let channel = 0; channel < 3; channel++) output[offset + channel] = sums[3] ? sums[channel] / sums[3] : 0
        output[offset + 3] = sums[3] / count
        add(p - radius, -1)
        add(p + radius + 1, 1)
      }
    }
    return output
  }
  const softened = pass(pass(image.pixels, true), false)
  for (let offset = 0; offset < softened.length; offset += 4) {
    const originalAlpha = image.pixels[offset + 3] * 0.82
    const blurAlpha = softened[offset + 3] * 0.18
    const alpha = originalAlpha + blurAlpha
    // Stable spatial noise avoids flicker between identical animation frames.
    const noise = mode === 'blur-noise' ? ((Math.imul((offset / 4) ^ 0x45d9f3b, 0x45d9f3b) >>> 16) % 3) - 1 : 0
    for (let c = 0; c < 3; c++) softened[offset + c] = alpha ? (image.pixels[offset + c] * originalAlpha + softened[offset + c] * blurAlpha) / alpha + noise : 0
    softened[offset + 3] = alpha
  }
  return { ...image, pixels: softened }
}
