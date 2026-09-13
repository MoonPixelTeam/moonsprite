/** Bound each synchronous copy slice. Large source snapshots yield to input
 * instead of hiding a whole-layer slice() in a Promise executor. */
export const cooperativeCopy = async <T extends Uint8Array | Uint8ClampedArray | Uint32Array | Int32Array>(source: T, valid: () => boolean = () => true): Promise<T> => {
  const Constructor = source.constructor as { new(length: number): T }
  const result = new Constructor(source.length)
  const step = 262144 / source.BYTES_PER_ELEMENT
  let deadline = performance.now() + 3
  for (let from = 0; from < source.length; from += step) {
    if (!valid()) throw new Error('Magic wand source snapshot cancelled')
    result.set(source.subarray(from, Math.min(source.length, from + step)), from)
    if (performance.now() >= deadline && from + step < source.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      deadline = performance.now() + 3
    }
  }
  return result
}
