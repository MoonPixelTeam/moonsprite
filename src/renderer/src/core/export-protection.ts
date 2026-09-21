export type ExportProtection = 'off' | 'blur' | 'blur-noise'

/** Export-only, alpha-aware softening; never mutates source pixels. */
export function protectExportPixels<T extends { pixels: Uint8ClampedArray; width: number; height: number }>(image: T, scalePercent: number, mode: ExportProtection = 'off'): T {
  if (mode === 'off' || scalePercent <= 100) return image
  const { width, height } = image
  // A narrow output-pixel transition, not a blur proportional to sprite scale.
  // Preserve enlarged pixel interiors and the staircase silhouette.
  const weights = scalePercent < 400 ? [1, 6, 1] : [1, 6, 18, 6, 1]
  const divisor = weights.reduce((sum, weight) => sum + weight, 0)
  const radius = Math.floor(weights.length / 2)
  const pass = (input: Uint8ClampedArray, horizontal: boolean): Uint8ClampedArray => {
    const output = new Uint8ClampedArray(input.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0
      for (let tap = 0; tap < weights.length; tap++) {
        const sx = horizontal ? Math.max(0, Math.min(width - 1, x + tap - radius)) : x
        const sy = horizontal ? y : Math.max(0, Math.min(height - 1, y + tap - radius))
        const source = (sy * width + sx) * 4
        const weightedAlpha = input[source + 3] * weights[tap]
        red += input[source] * weightedAlpha
        green += input[source + 1] * weightedAlpha
        blue += input[source + 2] * weightedAlpha
        alpha += weightedAlpha
      }
      const offset = (y * width + x) * 4
      output[offset] = alpha ? red / alpha : 0
      output[offset + 1] = alpha ? green / alpha : 0
      output[offset + 2] = alpha ? blue / alpha : 0
      output[offset + 3] = alpha / divisor
    }
    return output
  }
  const softened = pass(pass(image.pixels, true), false)
  for (let offset = 0; offset < softened.length; offset += 4) {
    // Stable spatial noise avoids flicker between identical animation frames.
    const noise = mode === 'blur-noise' ? ((Math.imul((offset / 4) ^ 0x45d9f3b, 0x45d9f3b) >>> 16) % 3) - 1 : 0
    for (let c = 0; c < 3; c++) softened[offset + c] = softened[offset + 3] ? softened[offset + c] + noise : 0
  }
  return { ...image, pixels: softened }
}
