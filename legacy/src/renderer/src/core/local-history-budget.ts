import { historyDocumentBytes } from './local-history-delta'
import { materializeLocalHistorySnapshot, type LocalHistorySnapshot } from './local-history-archive'

export const LOCAL_HISTORY_SNAPSHOT_BUDGET = 256 * 1024 * 1024
const weights = new WeakMap<LocalHistorySnapshot, number>()
const weight = (snapshot: LocalHistorySnapshot): number => {
  const known = weights.get(snapshot)
  if (known !== undefined) return known
  const bytes = 'base' in snapshot
    ? snapshot.delta.bytes + snapshot.delta.patches.length * 192 + snapshot.delta.origins.before.length * 64 + 512
    : 'archive' in snapshot ? snapshot.archive.byteLength : historyDocumentBytes(snapshot)
  weights.set(snapshot, bytes)
  return bytes
}

/** Conservative retained storage accounting. Prefixes still reachable through
 * delta bases count even after the visible history limit has shifted them out. */
export function localHistoryRetainedBytes(snapshots: readonly LocalHistorySnapshot[]): number {
  const seen = new Set<LocalHistorySnapshot>()
  let bytes = 0
  for (let snapshot of snapshots) for (;;) {
    if (seen.has(snapshot)) break
    seen.add(snapshot); bytes += weight(snapshot)
    if (!('base' in snapshot)) break
    snapshot = snapshot.base
  }
  return bytes
}

interface Timeline { snapshots: LocalHistorySnapshot[]; labels: string[]; position: number }

/** Soft pressure threshold for the additional history store. Release trimmed
 * prefixes without dropping visible steps. Structural checkpoints are compressed
 * asynchronously by persistence; this is not a hard process-memory cap.
 */
export function enforceLocalHistoryBudget(state: Timeline, budget = LOCAL_HISTORY_SNAPSHOT_BUDGET): Map<LocalHistorySnapshot, LocalHistorySnapshot> {
  const replacements = new Map<LocalHistorySnapshot, LocalHistorySnapshot>()
  if (localHistoryRetainedBytes(state.snapshots) <= budget) return replacements
  const retained = state.snapshots
  // Materialize one checkpoint, then retain the original immutable deltas.
  // No live document, ordinary HistoryStack or in-flight generation is mutated.
  const first = retained[0]
  if (!first || !('base' in first)) return replacements
  if ('base' in first) replacements.set(first, materializeLocalHistorySnapshot(first))
  state.snapshots = retained.map(snapshot => {
    const next = replacements.get(snapshot) ?? ('base' in snapshot && replacements.has(snapshot.base)
      ? { base: replacements.get(snapshot.base)!, delta: snapshot.delta } : snapshot)
    replacements.set(snapshot, next)
    return next
  })
  return replacements
}
