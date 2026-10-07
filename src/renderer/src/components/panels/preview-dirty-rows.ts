import type { SelectionRect } from '@shared/types-selection'

/** Exact output-pixel coverage, stored as row intervals instead of pixel ids. */
export class PreviewDirtyRows {
  private rows = new Map<number, number[]>()

  get size(): number { return this.rows.size }

  clear(): void { this.rows.clear() }

  add(rect: SelectionRect): void {
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      const spans = this.rows.get(y) ?? []
      let left = rect.x, right = rect.x + rect.width, start = 0
      while (start < spans.length && spans[start + 1] < left) start += 2
      let end = start
      while (end < spans.length && spans[end] <= right) {
        left = Math.min(left, spans[end])
        right = Math.max(right, spans[end + 1])
        end += 2
      }
      spans.splice(start, end - start, left, right)
      this.rows.set(y, spans)
    }
  }

  rectangles(): SelectionRect[] {
    const result: SelectionRect[] = []
    const open = new Map<string, SelectionRect>()
    for (const y of [...this.rows.keys()].sort((a, b) => a - b)) {
      const spans = this.rows.get(y)!
      for (let index = 0; index < spans.length; index += 2) {
        const left = spans[index], right = spans[index + 1]
        const key = `${left}:${right}`, previous = open.get(key)
        if (previous && previous.y + previous.height === y) previous.height++
        else {
          const rect = { x: left, y, width: right - left, height: 1 }
          result.push(rect)
          open.set(key, rect)
        }
      }
    }
    return result
  }
}
