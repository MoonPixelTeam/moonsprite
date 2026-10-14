export const MAX_LARGE_PROJECT_PIXEL_BYTES = 192 * 1024 * 1024

export interface LargeProjectPlan {
  localLayers: number
  localSize: number
  groups: number
  uniquePixelBytes: number
}

export function largeProjectPlan(size: number): LargeProjectPlan {
  const profile = size >= 4000
    ? { localLayers: 64, localSize: 384, groups: 8 }
    : size >= 2048
      ? { localLayers: 48, localSize: 384, groups: 8 }
      : { localLayers: 24, localSize: 256, groups: 6 }
  return {
    ...profile,
    uniquePixelBytes: (2 * size * size + profile.localLayers * profile.localSize * profile.localSize) * 4
  }
}
