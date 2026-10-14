/** Bound catch-up work so a slow spray cannot build an ever-growing time debt. */
export function advanceAirbrushClock(
  nextAt: number | undefined,
  frameAt: number,
  interval: number,
  spray: () => void,
  now: () => number = () => performance.now()
): number {
  const step = Math.max(16, interval)
  let deadline = nextAt ?? frameAt
  const startedAt = now()
  let batches = 0
  while (frameAt >= deadline && batches < 4) {
    spray()
    deadline += step
    batches += 1
    if (now() - startedAt >= 4) break
  }
  // Only discard overdue catch-up slots; never schedule extra work for the
  // missed time on the following frame. Ordinary cadence remains unchanged.
  if (batches > 0 && deadline <= now()) deadline = now() + step
  return deadline
}
