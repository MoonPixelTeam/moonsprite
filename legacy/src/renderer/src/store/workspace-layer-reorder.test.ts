import { beforeEach, describe, expect, it } from 'vitest'
import { compositeDocument, createDocument, createLayer, layerContentBounds, writeLayerColor } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('layer reorder invalidation', () => {
  it('restores the layer and timeline selection context when undoing a reorder', () => {
    const document = createDocument('selection reorder', 8, 8, 'rgba')
    const target = createLayer('Target', 4, 4, 'rgba')
    const moving = createLayer('Moving', 4, 4, 'rgba')
    document.layers.push(target, moving)
    document.activeLayerId = target.id
    useWorkspace.getState().addSession(document)
    const commands = useWorkspace.getState()
    commands.selectLayer(target.id)
    const session = useWorkspace.getState().sessions[0]
    const before = [...session.selectedLayerIds]
    commands.reorderLayers([moving.id], target.id, false)
    expect(session.selectedLayerIds).toEqual([moving.id])
    commands.undo()
    expect(session.selectedLayerIds).toEqual(before)
    expect(session.document.activeLayerId).toBe(target.id)
  })

  it('avoids redrawing disjoint layers through commit, undo, and redo', () => {
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
    layerContentBounds(document, middle)
    layerContentBounds(document, top)
    useWorkspace.getState().addSession(document)
    const beforePixels = compositeDocument(document)

    useWorkspace.getState().reorderLayers([top.id], middle.id, false)
    expect(document.layers.map((layer) => layer.id)).toEqual([document.layers[0].id, top.id, middle.id])
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 0, y: 0, width: 0, height: 0 } })
    expect(compositeDocument(document)).toEqual(beforePixels)

    useWorkspace.getState().undo()
    expect(document.layers.at(-1)?.id).toBe(top.id)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 0, y: 0, width: 0, height: 0 } })
    expect(compositeDocument(document)).toEqual(beforePixels)

    useWorkspace.getState().redo()
    expect(document.layers.at(-1)?.id).toBe(middle.id)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 0, y: 0, width: 0, height: 0 } })
    expect(compositeDocument(document)).toEqual(beforePixels)
  })

  it('redraws only the overlap where reordered layers change the composite', () => {
    const document = createDocument('overlapping reorder', 16, 16, 'rgba')
    const lower = createLayer('Lower', 4, 4, 'rgba')
    const upper = createLayer('Upper', 4, 4, 'rgba')
    lower.offsetX = 4
    lower.offsetY = 4
    upper.offsetX = 6
    upper.offsetY = 5
    document.layers.push(lower, upper)
    document.activeLayerId = upper.id
    writeLayerColor(document, lower, 1 * lower.width + 2, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(document, upper, 0, { r: 0, g: 120, b: 255, a: 255 })
    layerContentBounds(document, lower)
    layerContentBounds(document, upper)
    useWorkspace.getState().addSession(document)
    const colorAtOverlap = () => [...compositeDocument(document).slice((5 * document.width + 6) * 4, (5 * document.width + 6) * 4 + 4)]
    expect(colorAtOverlap()).toEqual([0, 120, 255, 255])

    useWorkspace.getState().reorderLayers([upper.id], lower.id, false)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 6, y: 5, width: 1, height: 1 } })
    expect(colorAtOverlap()).toEqual([255, 0, 0, 255])

    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 6, y: 5, width: 1, height: 1 } })
    expect(colorAtOverlap()).toEqual([0, 120, 255, 255])

    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 6, y: 5, width: 1, height: 1 } })
    expect(colorAtOverlap()).toEqual([255, 0, 0, 255])
  })

  it('covers every changed pixel when reordering normal layer groups', () => {
    const document = createDocument('group reorder', 20, 20, 'rgba')
    document.groups.push(
      { id: 'first-group', name: 'First', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
      { id: 'second-group', name: 'Second', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    )
    const layers = Array.from({ length: 4 }, (_, index) => {
      const layer = createLayer(`Layer ${index}`, 8, 8, 'rgba')
      layer.offsetX = 4 + index % 2
      layer.offsetY = 5 + Math.floor(index / 2)
      layer.groupId = index % 2 === 0 ? 'first-group' : 'second-group'
      for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++)
        writeLayerColor(document, layer, y * layer.width + x, { r: 40 + index * 45, g: 80, b: 130, a: 192 })
      document.layers.push(layer)
      layerContentBounds(document, layer)
      return layer
    })
    document.activeLayerId = layers[2].id
    useWorkspace.getState().addSession(document)
    const before = compositeDocument(document)
    useWorkspace.getState().reorderLayers([layers[2].id], layers[3].id, true)
    const after = compositeDocument(document)
    const rect = useWorkspace.getState().sessions[0].contentInvalidation
    expect(rect?.kind).toBe('region')
    if (rect?.kind !== 'region') return
    let changed = 0
    for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
      const offset = (y * document.width + x) * 4
      if (before.slice(offset, offset + 4).every((value, channel) => value === after[offset + channel])) continue
      changed++
      expect(x).toBeGreaterThanOrEqual(rect.rect.x)
      expect(x).toBeLessThan(rect.rect.x + rect.rect.width)
      expect(y).toBeGreaterThanOrEqual(rect.rect.y)
      expect(y).toBeLessThan(rect.rect.y + rect.rect.height)
    }
    expect(changed).toBeGreaterThan(0)
    useWorkspace.getState().undo()
    expect(compositeDocument(document)).toEqual(before)
    useWorkspace.getState().redo()
    expect(compositeDocument(document)).toEqual(after)
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
