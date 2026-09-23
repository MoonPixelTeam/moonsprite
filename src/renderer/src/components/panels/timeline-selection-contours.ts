export type TimelineSelectionBox = {row: number; column: number; rowSpan: number; columnSpan: number}
export type TimelineSelectionEdge = [number, number, number, number]
export type TimelineSelectionContour = TimelineSelectionBox & {edges?: TimelineSelectionEdge[]}
type Run = {row: number; start: number; end: number; id: number}

/** Union row intervals, retaining separate components and removing shared edges. */
export function timelineSelectionContours(boxes: readonly TimelineSelectionBox[]): TimelineSelectionContour[] {
  const rows = new Map<number, Run[]>()
  for (const box of boxes) {
    if (box.rowSpan <= 0 || box.columnSpan <= 0) continue
    for (let row = box.row; row < box.row + box.rowSpan; row++) {
      const runs = rows.get(row) ?? []
      runs.push({row, start: box.column, end: box.column + box.columnSpan, id: -1})
      rows.set(row, runs)
    }
  }
  const parents: number[] = []
  const root = (id: number): number => {
    while (parents[id] !== id) { parents[id] = parents[parents[id]]; id = parents[id] }
    return id
  }
  for (const [row, runs] of rows) {
    const merged: Run[] = []
    for (const run of runs.sort((a, b) => a.start - b.start)) {
      const previous = merged.at(-1)
      if (previous && previous.end >= run.start) previous.end = Math.max(previous.end, run.end)
      else merged.push({...run})
    }
    for (const run of merged) { run.id = parents.length; parents.push(run.id) }
    rows.set(row, merged)
  }
  for (const [row, runs] of rows) {
    const above = rows.get(row - 1) ?? []
    let start = 0
    for (const run of runs) {
      while (start < above.length && above[start].end <= run.start) start++
      for (let i = start; i < above.length && above[i].start < run.end; i++) parents[root(run.id)] = root(above[i].id)
    }
  }
  const groups = new Map<number, Run[]>()
  for (const runs of rows.values()) for (const run of runs) {
    const id = root(run.id), group = groups.get(id) ?? []
    group.push(run); groups.set(id, group)
  }
  return [...groups.values()].map(runs => {
    let row = Infinity, bottom = -Infinity, column = Infinity, right = -Infinity, area = 0
    for (const run of runs) {
      row = Math.min(row, run.row); bottom = Math.max(bottom, run.row + 1)
      column = Math.min(column, run.start); right = Math.max(right, run.end); area += run.end - run.start
    }
    const box = {row, column, rowSpan: bottom - row, columnSpan: right - column}
    if (area === box.rowSpan * box.columnSpan) return box
    const edges: TimelineSelectionEdge[] = []
    const horizontal = (run: Run, neighbors: readonly Run[], y: number): void => {
      let cursor = run.start
      for (const neighbor of neighbors) {
        if (neighbor.end <= cursor) continue
        if (neighbor.start >= run.end) break
        if (neighbor.start > cursor) edges.push([cursor - column, y - row, neighbor.start - column, y - row])
        cursor = Math.max(cursor, neighbor.end)
        if (cursor >= run.end) return
      }
      if (cursor < run.end) edges.push([cursor - column, y - row, run.end - column, y - row])
    }
    for (const run of runs) {
      horizontal(run, rows.get(run.row - 1) ?? [], run.row)
      horizontal(run, rows.get(run.row + 1) ?? [], run.row + 1)
      edges.push([run.start - column, run.row - row, run.start - column, run.row + 1 - row],
        [run.end - column, run.row - row, run.end - column, run.row + 1 - row])
    }
    return {...box, edges}
  }).sort((a, b) => a.row - b.row || a.column - b.column)
}
