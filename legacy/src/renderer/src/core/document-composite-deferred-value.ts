/** A sampler-local value: compute at first use without retaining another document cache. */
export const deferredCompositeValue = <T>(read: () => T): (() => T) => {
  let ready = false
  let value: T
  return () => {
    if (!ready) {
      value = read()
      ready = true
    }
    return value
  }
}
