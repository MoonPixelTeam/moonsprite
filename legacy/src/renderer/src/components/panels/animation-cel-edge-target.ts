import type { AnimationPointerDrag } from './animation-gesture-types'

type CellDrag = Extract<AnimationPointerDrag, { kind: 'cel' | 'mask' | 'group-cel' }>
type EdgeRow = { center: number; left: number; right: number; firstKey: string; lastKey: string }

/** Geometry belongs to a gesture; scrolling only translates the cached rows. */
export function createAnimationCelEdgeTarget() {
  let cache: {
    drag: CellDrag
    scrollLeft: number
    scrollTop: number
    listBounds: DOMRect
    layoutRevision: number
    collapsedGroupIds: string[]
    rows: EdgeRow[]
  } | null = null
  const at = (list: HTMLDivElement | null, drag: CellDrag, layoutRevision: number,
    collapsedGroupIds: string[], clientX: number, clientY: number): string | null => {
    const selector = drag.kind === 'mask' ? '[data-animation-mask-cel-key]' : drag.kind === 'group-cel' ? '[data-animation-group-cel-key]' : drag.groupCellKeys?.length ? '[data-animation-cel-key], [data-animation-group-cel-key]' : '[data-animation-cel-key]'
    const datasetKey = drag.kind === 'mask' ? 'animationMaskCelKey' : drag.kind === 'group-cel' ? 'animationGroupCelKey' : 'animationCelKey'
    if (!list) return null
    let cached = cache
    const scrollLeft = list.scrollLeft
    const scrollTop = list.scrollTop
    const listBounds = list.getBoundingClientRect()
    if (!cached || cached.drag !== drag || cached.listBounds.width !== listBounds.width || cached.listBounds.height !== listBounds.height
      || cached.layoutRevision !== layoutRevision || cached.collapsedGroupIds !== collapsedGroupIds) {
      const rows = new Map<number, EdgeRow>()
      for (const element of list.querySelectorAll<HTMLElement>(selector)) {
        const key = element.dataset[datasetKey] ?? (drag.kind === 'cel' ? element.dataset.animationGroupCelKey : undefined)
        const bounds = element.getBoundingClientRect()
        if (!key || bounds.width <= 0 || bounds.height <= 0) continue
        const center = bounds.top + bounds.height / 2
        const row = rows.get(center)
        if (!row) rows.set(center, { center, left: bounds.left, right: bounds.right, firstKey: key, lastKey: key })
        else {
          if (bounds.left < row.left) { row.left = bounds.left; row.firstKey = key }
          if (bounds.right > row.right) { row.right = bounds.right; row.lastKey = key }
        }
      }
      cached = { drag, scrollLeft, scrollTop, listBounds, layoutRevision,
        collapsedGroupIds, rows: [...rows.values()] }
      cache = cached
    }
    // Scroll translates the grid uniformly. Reuse row bounds instead of
    // measuring every cell and sorting the nearest row on every edge tick.
    const x = clientX + scrollLeft - cached.scrollLeft - (listBounds.left - cached.listBounds.left)
    const y = clientY + scrollTop - cached.scrollTop - (listBounds.top - cached.listBounds.top)
    let nearest = cached.rows[0]
    if (!nearest) return null
    for (const row of cached.rows) if (Math.abs(row.center - y) < Math.abs(nearest.center - y)) nearest = row
    if (x < nearest.left) return nearest.firstKey
    if (x > nearest.right) return nearest.lastKey
    return null
  }
  return { at, clear: () => { cache = null } }
}
