/** Prefer the browser's continuation queue; timers are the portable fallback. */
export const yieldTimelapseTask = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: { yield: () => Promise<void> } }).scheduler
  return scheduler?.yield ? scheduler.yield() : new Promise(resolve => globalThis.setTimeout(resolve, 0))
}
