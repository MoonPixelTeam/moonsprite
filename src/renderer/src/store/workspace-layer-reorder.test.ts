import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createLayer, layerContentBounds, writeLayerColor } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import type { SelectionRect } from '@shared/types'
import { useWorkspace } from './workspace'

const unionRects = (left: SelectionRect, right: SelectionRect): SelectionRect => {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  const toX = Math.max(left.x + left.width, right.x + right.width)
  const toY = Math.max(left.y + left.height, right.y + right.height)
  return { x, y, width: toX - x, height: toY - y }
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('layer reorder invalidation', () => {
  it('refreshes only the reordered visible layer bounds through commit, undo, and redo', () => {
    const document = createDocument('bounded reorder', 80, 64, 'rgba')
    const middle = createLayer('Middle', 12, 10, 'rgba')
    const top = createLayer('Top', 16, 14, 'rgba')
    middle.offsetX = 9
    middle.offsetY = 7
    top.offsetX = 28
    top.offsetY = 20
    document.layers.push(middle, top)
    document.activeLayerId = top.id
    writeLayerColor(document, middle, 4 * middle.width + 3, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(document, top, 8 * top.width + 10, { r: 0, g: 120, b: 255, a: 255 })
    const expectedRect = unionRects(layerContentBounds(document, middle)!, layerContentBounds(document, top)!)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().reorderLayers([top.id], middle.id, false)
    expect(document.layers.map((layer) => layer.id)).toEqual([document.layers[0].id, top.id, middle.id])
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().undo()
    expect(document.layers.at(-1)?.id).toBe(top.id)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().redo()
    expect(document.layers.at(-1)?.id).toBe(middle.id)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })
  })

  it('falls back to full invalidation for styled composition', () => {
    const document = createDocument('styled reorder', 48, 48, 'rgba')
    const target = createLayer('Target', 12, 12, 'rgba')
    const moving = createLayer('Moving', 12, 12, 'rgba')
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 2 }
    moving.layerStyles = styles
    document.layers.push(target, moving)
    document.activeLayerId = moving.id
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().reorderLayers([moving.id], target.id, false)

    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'full' })
  })
})
