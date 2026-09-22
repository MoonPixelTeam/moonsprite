import { animationCelKey, parseAnimationCelKey } from '@/core/animation'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import type { DocumentSession } from '@/store/workspace'
import type { AnimationPointerDrag } from './animation-gesture-types'

type CelDrag = Extract<AnimationPointerDrag, {kind: 'cel'}>
const visibleRows = (session: Readonly<DocumentSession>) => buildLayerPanelTree({
  layers: session.document.layers, groups: session.document.groups, collapsedGroupIds: session.collapsedGroupIds
})

/** A blank group row supplies the grab point, never the document move anchor. */
export function mixedCelMoveAnchor(session: Readonly<DocumentSession>, pointerKey: string) {
  const pointer = parseAnimationCelKey(pointerKey)
  if (!pointer) return null
  const rows = visibleRows(session)
  const index = new Map(rows.map((row, i) => [row.id, i]))
  const pointerRow = index.get(pointer.layerId)
  if (pointerRow === undefined) return null
  let nearest: ReturnType<typeof parseAnimationCelKey> = null, distance = Infinity
  for (const key of session.selectedAnimationCellKeys) {
    const cell = parseAnimationCelKey(key), row = cell ? index.get(cell.layerId) : undefined
    if (!cell || row === undefined || cell.frameId !== pointer.frameId) continue
    if (Math.abs(row - pointerRow) < distance) { nearest = cell; distance = Math.abs(row - pointerRow) }
  }
  return nearest
}

/** Translate visual pointer rows to the real anchor before normal move clamping. */
export function createMixedCelPointerTarget(session: Readonly<DocumentSession>, drag: CelDrag) {
  if (!drag.groupCellKeys?.length || !drag.pointerAnchorKey) return (key: string) => key
  const rows = visibleRows(session), index = new Map(rows.map((row, i) => [row.id, i]))
  const source = parseAnimationCelKey(drag.sourceAnchorKey), pointer = parseAnimationCelKey(drag.pointerAnchorKey)
  const sourceRow = source ? index.get(source.layerId) : undefined, pointerRow = pointer ? index.get(pointer.layerId) : undefined
  return (key: string): string | null => {
    const target = parseAnimationCelKey(key), targetRow = target ? index.get(target.layerId) : undefined
    if (!target || targetRow === undefined || sourceRow === undefined || pointerRow === undefined) return null
    const desiredRow = sourceRow + targetRow - pointerRow
    let nearest: string | null = null, distance = Infinity
    for (let i = 0; i < rows.length; i++) if (rows[i].kind === 'layer' && Math.abs(i - desiredRow) < distance) {
      nearest = rows[i].id; distance = Math.abs(i - desiredRow)
    }
    return nearest ? animationCelKey(nearest, target.frameId) : null
  }
}

/** Preserve blank group decoration at its translated position after a drop. */
export function movedGroupCellKeys(session: Readonly<DocumentSession>, drag: CelDrag, targetKey: string): string[] {
  if (!drag.groupCellKeys?.length) return []
  const rows = visibleRows(session), frames = session.document.animation?.frames ?? []
  const rowIndex = new Map(rows.map((row, i) => [row.id, i])), frameIndex = new Map(frames.map((frame, i) => [frame.id, i]))
  const source = parseAnimationCelKey(drag.sourceAnchorKey), target = parseAnimationCelKey(targetKey)
  if (!source || !target) return []
  const fromRow = rowIndex.get(source.layerId), toRow = rowIndex.get(target.layerId)
  const fromFrame = frameIndex.get(source.frameId), toFrame = frameIndex.get(target.frameId)
  if (fromRow === undefined || toRow === undefined || fromFrame === undefined || toFrame === undefined) return []
  return drag.groupCellKeys.flatMap(key => {
    const parsed = parseAnimationCelKey(key), row = parsed ? rowIndex.get(parsed.layerId) : undefined, column = parsed ? frameIndex.get(parsed.frameId) : undefined
    if (row === undefined || column === undefined) return []
    const destination = rows[row + toRow - fromRow], frame = frames[column + toFrame - fromFrame]
    return destination?.kind === 'group' && frame ? [animationCelKey(destination.id, frame.id)] : []
  })
}
