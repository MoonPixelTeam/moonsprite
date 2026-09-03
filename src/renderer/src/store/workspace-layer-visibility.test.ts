import { beforeEach, describe, expect, it } from 'vitest'
import { activateAnimationFrame, addBlankAnimationFrame, ensureAnimationDocument } from '@/core/animation'
import { createDocument, expandLayerStyleInvalidationRect, layerContentBounds, writeLayerColor } from '@/core/document'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('layer visibility invalidation', () => {
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
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().undo()
    expect(layer.visible).toBe(true)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().redo()
    expect(layer.visible).toBe(false)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })
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

  it('falls back to full invalidation instead of scanning unknown large bounds on click', () => {
    const document = createDocument('unknown visibility bounds', 64, 64, 'rgba')
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().toggleLayerVisibility(document.activeLayerId)

    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'full' })
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
