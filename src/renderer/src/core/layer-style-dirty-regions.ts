import type { SelectionRect } from '@shared/types-selection'
import { unionSelectionRects } from './document-composite-plan'
import { STYLED_LAYER_BLOCK_SIZE, type StyledLayerBlock, type StyledLayerBlockCache } from './document-composite-style-types'
import { intersectRect } from './document-composite-style-geometry'

/** Keep mirrored strokes separate; bound queues on owners not currently rendered. */
export const appendStyleDirtyRect = (rects: SelectionRect[], rect: SelectionRect): void => {
  const area = (value: SelectionRect): number => value.width * value.height
  let candidate = { ...rect }
  for (let index = rects.length - 1; index >= 0; index--) {
    const union = unionSelectionRects(rects[index], candidate)
    if (area(union) > area(rects[index]) + area(candidate)) continue
    candidate = union
    rects.splice(index, 1)
  }
  rects.push(candidate)
  if (rects.length <= 32) return
  // Merge the least costly pair, rather than bridging distant symmetry copies.
  let first = 0, second = 1, cost = Infinity
  for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
    const extra = area(unionSelectionRects(rects[a], rects[b])) - area(rects[a]) - area(rects[b])
    if (extra < cost) { first = a; second = b; cost = extra }
  }
  rects[first] = unionSelectionRects(rects[first], rects[second])
  rects.splice(second, 1)
}

export function invalidateStyledLayerBlocks(cache: StyledLayerBlockCache, rect: SelectionRect): void {
  const x = Math.floor(rect.x), y = Math.floor(rect.y)
  const affected = { x, y, width: Math.ceil(rect.x + rect.width) - x, height: Math.ceil(rect.y + rect.height) - y }
  const fromX = Math.floor(affected.x / STYLED_LAYER_BLOCK_SIZE)
  const fromY = Math.floor(affected.y / STYLED_LAYER_BLOCK_SIZE)
  const toX = Math.floor((affected.x + affected.width - 1) / STYLED_LAYER_BLOCK_SIZE)
  const toY = Math.floor((affected.y + affected.height - 1) / STYLED_LAYER_BLOCK_SIZE)
  for (let blockY = fromY; blockY <= toY; blockY += 1) for (let blockX = fromX; blockX <= toX; blockX += 1) {
    const block = cache.blocks.get(`${blockX}:${blockY}`)
    if (!block) continue
    const dirty = intersectRect(block, affected)
    if (dirty) appendStyleDirtyRect(block.dirtyRects ??= [], dirty)
  }
}

/** Recompute style pixels locally, retaining the rest of a warm 64px block. */
export function refreshStyledLayerBlock(block: StyledLayerBlock, render: (rect: SelectionRect) => Uint8ClampedArray): StyledLayerBlock {
  if (!block.dirtyRects) return block
  for (const rect of block.dirtyRects) {
    const pixels = render(rect)
    for (let row = 0; row < rect.height; row++) {
      const source = row * rect.width * 4
      const target = ((rect.y - block.y + row) * block.width + rect.x - block.x) * 4
      block.pixels.set(pixels.subarray(source, source + rect.width * 4), target)
    }
  }
  block.dirtyRects = undefined
  return block
}

