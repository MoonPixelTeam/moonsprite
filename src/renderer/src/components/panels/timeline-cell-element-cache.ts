import type { ReactElement } from 'react'
import { sameTimelineCellState } from './layer-timeline-cell-cache'

type Entry = { state: readonly unknown[] | null; element: ReactElement }
export type TimelineCellElementCache = Map<string, Entry>

/** Use the cell renderer's existing invalidation contract before allocating JSX.
 * Reusing the element also lets React skip reconciling unchanged memo cells. */
export function timelineCellElement(previous: TimelineCellElementCache, next: TimelineCellElementCache,
  key: string, state: readonly unknown[] | null, create: () => ReactElement): ReactElement {
  const old = previous.get(key)
  const entry = old && old.state !== null && state !== null && sameTimelineCellState(old.state, state)
    ? old : { state, element: create() }
  next.set(key, entry)
  return entry.element
}
