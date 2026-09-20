import type { CompositeSurface } from './canvas-composite-cache-surfaces'

export const rememberCompositeSurface = <T extends CompositeSurface>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxCacheBytes: number,
  maxCachedFrames: number
): void => {
  const previous = cache.get(key)
  if (previous && previous !== value) {
    previous.bitmap?.close()
    previous.bitmapGeneration = (previous.bitmapGeneration ?? 0) + 1
  }
  cache.delete(key)
  cache.set(key, value)
  let cacheBytes = [...cache.values()].reduce((total, entry) => total + entry.canvas.width * entry.canvas.height * 4, 0)
  while (cache.size > 1 && (cache.size > maxCachedFrames || cacheBytes > maxCacheBytes)) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    const oldest = cache.get(oldestKey)
    if (oldest) {
      cacheBytes -= oldest.canvas.width * oldest.canvas.height * 4
      oldest.bitmap?.close()
      oldest.bitmapGeneration = (oldest.bitmapGeneration ?? 0) + 1
    }
    cache.delete(oldestKey)
  }
}
