import type { SelectionRect } from '@shared/types-selection'
import { unionSelectionRects } from './document-composite-plan'
import { STYLED_LAYER_BLOCK_SIZE, type StyledLayerBlockCache } from './document-composite-style-types'

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
  const affected = rect
  const fromX = Math.floor(affected.x / STYLED_LAYER_BLOCK_SIZE)
  const fromY = Math.floor(affected.y / STYLED_LAYER_BLOCK_SIZE)
  const toX = Math.floor((affected.x + affected.width - 1) / STYLED_LAYER_BLOCK_SIZE)
  const toY = Math.floor((affected.y + affected.height - 1) / STYLED_LAYER_BLOCK_SIZE)
  for (let blockY = fromY; blockY <= toY; blockY += 1) for (let blockX = fromX; blockX <= toX; blockX += 1) {
    cache.blocks.delete(`${blockX}:${blockY}`)
  }
}

