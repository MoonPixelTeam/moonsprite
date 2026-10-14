export type PixelSource<T extends object> = () => T

const sources = new WeakMap<object, PixelSource<object>>()

// Keep pixel buffers out of React props (including development render logs).
// Stable identity preserves effect invalidation when the source is replaced;
// reads still see in-place edits without copying or changing the source object.
export const pixelSource = <T extends object>(value: T): PixelSource<T> => {
  let source = sources.get(value)
  if (!source) {
    source = () => value
    sources.set(value, source)
  }
  return source as PixelSource<T>
}
