import type { SelectionMask } from '@shared/types-selection'

const preparedBoundaries = new WeakMap<Uint8Array, { width: number; height: number; segments: Int32Array }>()

/** Worker masks are immutable once published, including shallow history snapshots. */
export const prepareSelectionBoundary = (selection: SelectionMask, segments: Int32Array): void => {
  if (selection.mask) preparedBoundaries.set(selection.mask, { width: selection.width, height: selection.height, segments })
}

/** Returns merged local-space boundary segments as x1, y1, x2, y2 tuples. */
export const selectionBoundarySegments = (selection: SelectionMask): Int32Array => {
  const { width, height, mask } = selection
  const prepared = mask && preparedBoundaries.get(mask)
  if (prepared && prepared.width === width && prepared.height === height) return prepared.segments
  if (!mask) return Int32Array.from([0, 0, width, 0, width, 0, width, height, width, height, 0, height, 0, height, 0, 0])
  if (!mask.includes(0)) return Int32Array.from([0, 0, width, 0, width, 0, width, height, width, height, 0, height, 0, 0])
  const maxCoordinates = Math.max(16, width * height * 8 + (width + height) * 8)
  let segments = new Int32Array(Math.min(maxCoordinates, Math.max(256, (width + height) * 16)))
  let length = 0
  const append = (x1: number, y1: number, x2: number, y2: number): void => {
    if (length + 4 > segments.length) {
      const expanded = new Int32Array(Math.min(maxCoordinates, segments.length * 2))
      expanded.set(segments)
      segments = expanded
    }
    segments[length++] = x1
    segments[length++] = y1
    segments[length++] = x2
    segments[length++] = y2
  }

  for (let y = 0; y <= height; y += 1) {
    let start = -1
    for (let x = 0; x <= width; x += 1) {
      const above = x < width && y > 0 && mask[(y - 1) * width + x] === 1
      const below = x < width && y < height && mask[y * width + x] === 1
      const boundary = x < width && above !== below
      if (boundary && start < 0) start = x
      else if (!boundary && start >= 0) {
        append(start, y, x, y)
        start = -1
      }
    }
  }

  for (let x = 0; x <= width; x += 1) {
    let start = -1
    for (let y = 0; y <= height; y += 1) {
      const left = y < height && x > 0 && mask[y * width + x - 1] === 1
      const right = y < height && x < width && mask[y * width + x] === 1
      const boundary = y < height && left !== right
      if (boundary && start < 0) start = y
      else if (!boundary && start >= 0) {
        append(x, start, x, y)
        start = -1
      }
    }
  }

  return segments.slice(0, length)
}

/** Fast boundary path for a selection that is the whole canvas with a small
 * unselected hole (the common transparent-exterior magic-wand result). */
export const selectionBoundarySegmentsForExterior = (
  selection: SelectionMask,
  hole: { x: number; y: number; width: number; height: number }
): Int32Array => {
  const { width, height } = selection
  const left = Math.max(0, Math.min(width, hole.x))
  const top = Math.max(0, Math.min(height, hole.y))
  const right = Math.max(left, Math.min(width, hole.x + hole.width))
  const bottom = Math.max(top, Math.min(height, hole.y + hole.height))
  const segments: number[] = [0, 0, width, 0, width, 0, width, height, width, height, 0, height, 0, height, 0, 0]
  const appendRuns = (horizontal: boolean): void => {
    const outerStart = horizontal ? Math.max(0, top - 1) : Math.max(0, left - 1)
    const outerEnd = horizontal ? Math.min(height, bottom + 1) : Math.min(width, right + 1)
    for (let line = outerStart; line <= outerEnd; line += 1) {
      let start = -1
      const runStart = horizontal ? left : top
      const runEnd = horizontal ? right : bottom
      for (let cursor = runStart; cursor <= runEnd; cursor += 1) {
        const x = horizontal ? cursor : line
        const y = horizontal ? line : cursor
        const previous = horizontal ? (y > 0 && selection.mask?.[(y - 1) * width + x] === 1) : (x > 0 && selection.mask?.[y * width + x - 1] === 1)
        const next = horizontal ? (y < height && selection.mask?.[y * width + x] === 1) : (x < width && selection.mask?.[y * width + x] === 1)
        const boundary = previous !== next
        if (boundary && start < 0) start = cursor
        else if (!boundary && start >= 0) {
          if (horizontal) segments.push(start, line, cursor, line)
          else segments.push(line, start, line, cursor)
          start = -1
        }
      }
    }
  }
  appendRuns(true)
  appendRuns(false)
  return Int32Array.from(segments)
}

/** Compresses selected pixels into vertically merged x/y/width/height tuples. */
export const selectionPreviewRectangles = (selection: SelectionMask, maxRectangles = Infinity): Int32Array => {
  const { width, height, mask } = selection
  if (!mask) return Int32Array.from([0, 0, width, height])
  const rectangles: number[] = []
  let active = new Map<string, number>()
  for (let y = 0; y < height; y += 1) {
    const next = new Map<string, number>()
    let x = 0
    while (x < width) {
      while (x < width && mask[y * width + x] !== 1) x += 1
      const left = x
      while (x < width && mask[y * width + x] === 1) x += 1
      if (left === x) continue
      const key = `${left}:${x}`
      const existing = active.get(key)
      if (existing === undefined) {
        if (rectangles.length / 4 >= maxRectangles) return new Int32Array(0)
        const index = rectangles.length
        rectangles.push(left, y, x - left, 1)
        next.set(key, index)
      } else {
        rectangles[existing + 3] += 1
        next.set(key, existing)
      }
    }
    active = next
  }
  return Int32Array.from(rectangles)
}

/** Outside the content bounds every pixel belongs to a verified exterior
 * selection. Only compress the small content rectangle, not the whole canvas. */
export const selectionPreviewRectanglesForExterior = (selection: SelectionMask, hole: { x: number; y: number; width: number; height: number }, maxRectangles = 2048): Int32Array => {
  if (!selection.mask) return selectionPreviewRectangles(selection)
  const left = Math.max(0, hole.x), top = Math.max(0, hole.y)
  const right = Math.min(selection.width, hole.x + hole.width), bottom = Math.min(selection.height, hole.y + hole.height)
  if (right <= left || bottom <= top) return selectionPreviewRectangles(selection, maxRectangles)
  const width = right - left, height = bottom - top
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) mask.set(selection.mask.subarray((top + y) * selection.width + left, (top + y) * selection.width + right), y * width)
  const local = selectionPreviewRectangles({ x: 0, y: 0, width, height, mask }, maxRectangles - 4)
  if (local.length === 0 && mask.includes(1)) return local
  const result: number[] = []
  const append = (x: number, y: number, w: number, h: number) => { if (w > 0 && h > 0) result.push(x, y, w, h) }
  append(0, 0, selection.width, top)
  append(0, bottom, selection.width, selection.height - bottom)
  append(0, top, left, height)
  append(right, top, selection.width - right, height)
  for (let i = 0; i < local.length; i += 4) append(left + local[i], top + local[i + 1], local[i + 2], local[i + 3])
  return Int32Array.from(result)
}
