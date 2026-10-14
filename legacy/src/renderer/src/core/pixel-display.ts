export type PixelSamplingMode = 'hard' | 'smooth'

/**
 * A source pixel can be shown intact once it occupies at least one CSS pixel.
 * Below that threshold nearest-neighbour sampling necessarily drops pixels, so
 * the display switches to smooth downsampling.
 */
export const pixelSamplingMode = (displayScale: number): PixelSamplingMode =>
  Number.isFinite(displayScale) && displayScale >= 1 ? 'hard' : 'smooth'
