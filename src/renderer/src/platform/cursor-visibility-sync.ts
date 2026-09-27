/** Keep one native call in flight and only the latest requested visibility.
 * Pointer motion must not grow a promise chain while the window thread is busy. */
export function createCursorVisibilitySync(apply: (visible: boolean) => Promise<void>) {
  let requested = true
  let applied: boolean | null = null
  let pending: Promise<void> | null = null
  const settled = Promise.resolve()
  return (visible: boolean): Promise<void> => {
    requested = visible
    if (pending) return pending
    if (applied === requested) return settled
    pending = Promise.resolve().then(async () => {
      try {
        while (applied !== requested) {
          const next = requested
          await apply(next)
          applied = next
        }
      } finally { pending = null }
    })
    return pending
  }
}
