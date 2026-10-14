import { beforeEach, describe, expect, it } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, ensureAnimationDocument } from '@/core/animation'
import { compositeDocument, createDocument, createLayer, expandLayerStyleInvalidationRect, layerContentBounds, writeLayerColor } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('layer visibility invalidation', () => {
  it('keeps the composite revision for a known-empty layer through toggles and undo/redo', () => {
    const document = createDocument('empty visibility', 64, 64, 'rgba')
    const layer = document.layers[0]
    useWorkspace.getState().addSession(document)
    expect(layerContentBounds(document, layer)).toBeNull()
    const session = useWorkspace.getState().sessions[0]
    const revision = session.contentRevision
    useWorkspace.getState().toggleLayerVisibility(layer.id)
    expect(layer.visible).toBe(false)
    expect(session.document.dirty).toBe(true)
    expect(session.contentRevision).toBe(revision)
    useWorkspace.getState().undo()
    expect(layer.visible).toBe(true)
    expect(session.contentRevision).toBe(revision)
    useWorkspace.getState().redo()
    expect(layer.visible).toBe(false)
    expect(session.contentRevision).toBe(revision)
  })

  it('still invalidates an empty clipping base', () => {
    const document = createDocument('clipping visibility', 4, 4, 'rgba')
    const layer = document.layers[0]
    layer.clippingMask = true
    useWorkspace.getState().addSession(document)
    layerContentBounds(document, layer)
    const session = useWorkspace.getState().sessions[0]
    const revision = session.contentRevision
    useWorkspace.getState().toggleLayerVisibility(layer.id)
    expect(session.contentRevision).toBeGreaterThan(revision)
  })

  it('re-evaluates a formerly empty layer when undo happens on a populated frame', () => {
    const document = createDocument('empty frame visibility', 4, 4, 'rgba')
    const layer = document.layers[0]
    const first = ensureAnimationDocument(document).activeFrameId
    const second = addBlankAnimationFrame(document)
    writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    activateAnimationFrame(document, first)
    useWorkspace.getState().addSession(document)
    layerContentBounds(document, layer)
    useWorkspace.getState().toggleLayerVisibility(layer.id)
    useWorkspace.getState().setActiveAnimationFrame(second)
    layerContentBounds(document, layer)
    const session = useWorkspace.getState().sessions[0]
    const revision = session.contentRevision
    useWorkspace.getState().undo()
    expect(layer.visible).toBe(true)
    expect(session.contentRevision).toBeGreaterThan(revision)
  })
  it('refreshes only styled content bounds through commit, undo, and redo', () => {
    const document = createDocument('bounded visibility', 100, 80, 'rgba')
    const layer = document.layers[0]
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, size: 2 }
    layer.layerStyles = styles
    useWorkspace.getState().addSession(document)
    writeLayerColor(document, layer, 31 * layer.width + 21, { r: 41, g: 121, b: 255, a: 255 })

    const sourceBounds = layerContentBounds(document, layer)!
    const expectedRect = expandLayerStyleInvalidationRect(document, sourceBounds, [layer.id])
    useWorkspace.getState().toggleLayerVisibility(layer.id)

    expect(layer.visible).toBe(false)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect, compositeOnly: true })

    useWorkspace.getState().undo()
    expect(layer.visible).toBe(true)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect, compositeOnly: true })

    useWorkspace.getState().redo()
    expect(layer.visible).toBe(false)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect, compositeOnly: true })
  })

  it('refreshes only cached member bounds when toggling a simple group', () => {
    const document = createDocument('bounded group visibility', 120, 90, 'rgba')
    const layer = document.layers[0]
    const group = { id: 'group-visible', name: 'Visible group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups = [group]
    layer.groupId = group.id
    writeLayerColor(document, layer, 35 * layer.width + 27, { r: 41, g: 121, b: 255, a: 255 })
    const expectedRect = layerContentBounds(document, layer)!
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().toggleGroupVisibility(group.id)
    expect(group.visible).toBe(false)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().undo()
    expect(group.visible).toBe(true)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().redo()
    expect(group.visible).toBe(false)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })
  })

  it('keeps disjoint group member regions separate through toggle, undo, and redo', () => {
    const document = createDocument('sparse group visibility', 64, 64, 'rgba')
    const group = { id: 'sparse-group', name: 'Sparse', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups = [group]
    const first = document.layers[0]
    first.groupId = group.id
    const second = createLayer('Second', 1, 1, 'rgba')
    second.groupId = group.id
    second.offsetX = 60
    second.offsetY = 60
    document.layers.push(second)
    writeLayerColor(document, first, 2 * first.width + 2, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(document, second, 0, { r: 0, g: 0, b: 255, a: 255 })
    layerContentBounds(document, first)
    layerContentBounds(document, second)
    useWorkspace.getState().addSession(document)
    const visiblePixels = compositeDocument(document)
    const expectRegions = () => expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({
      kind: 'region',
      rect: { x: 2, y: 2, width: 59, height: 59 },
      rects: [{ x: 2, y: 2, width: 1, height: 1 }, { x: 60, y: 60, width: 1, height: 1 }]
    })

    useWorkspace.getState().toggleGroupVisibility(group.id)
    expectRegions()
    expect(compositeDocument(document).every((channel) => channel === 0)).toBe(true)
    useWorkspace.getState().undo()
    expectRegions()
    expect(compositeDocument(document)).toEqual(visiblePixels)
    useWorkspace.getState().redo()
    expectRegions()
    expect(compositeDocument(document).every((channel) => channel === 0)).toBe(true)
  })

  it('invalidates the full output without discarding sources or scanning unknown bounds on click', () => {
    const document = createDocument('unknown visibility bounds', 64, 64, 'rgba')
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().toggleLayerVisibility(document.activeLayerId)

    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: { x: 0, y: 0, width: 64, height: 64 }, compositeOnly: true })
  })

  it('recomputes visibility history bounds for the active animation frame', () => {
    const document = createDocument('frame visibility bounds', 40, 24, 'rgba')
    const layer = document.layers[0]
    const firstFrameId = ensureAnimationDocument(document).activeFrameId
    writeLayerColor(document, layer, 3 * layer.width + 4, { r: 255, g: 80, b: 60, a: 255 })
    const firstRect = layerContentBounds(document, layer)!
    const secondFrameId = addBlankAnimationFrame(document)
    layer.offsetX = 33
    layer.offsetY = 18
    writeLayerColor(document, layer, 0, { r: 41, g: 121, b: 255, a: 255 })
    const secondRect = layerContentBounds(document, layer)!
    activateAnimationFrame(document, firstFrameId)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().toggleLayerVisibility(layer.id)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: firstRect })

    useWorkspace.getState().setActiveAnimationFrame(secondFrameId)
    useWorkspace.getState().undo()

    expect(layer.visible).toBe(true)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: secondRect })
  })
})
