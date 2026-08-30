import { beforeEach, describe, expect, it } from 'vitest'
import type { LayerGroup } from '@shared/types'
import { compositeRegion, createDocument, createLayer, createLayerMask, getActiveLayer, writeLayerColor } from '@/core/document'
import { ensureAnimationDocument } from '@/core/animation'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, saveProgress: null, dialog: null })
})

describe('layer style workspace history', () => {
  it('commits one undoable content change and restores it through history', () => {
    const document = createDocument('layer styles', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    document.dirty = false
    const beforeRevision = useWorkspace.getState().sessions[0].contentRevision
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.size = 3

    useWorkspace.getState().setLayerStyles('layer', layer.id, styles)
    let session = useWorkspace.getState().sessions[0]
    expect(layer.layerStyles?.stroke).toMatchObject({ enabled: true, size: 3 })
    expect(session.contentRevision).toBe(beforeRevision + 1)
    expect(session.history.canUndo).toBe(true)
    expect(document.dirty).toBe(true)

    useWorkspace.getState().undo()
    expect(layer.layerStyles).toBeUndefined()
    useWorkspace.getState().redo()
    expect(layer.layerStyles?.stroke).toMatchObject({ enabled: true, size: 3 })
  })

  it('previews without dirtying the document or adding history', () => {
    const document = createDocument('layer style preview', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    document.dirty = false
    const beforeRevision = useWorkspace.getState().sessions[0].contentRevision
    const styles = createDefaultLayerStyles()
    styles.shadow.enabled = true

    useWorkspace.getState().previewLayerStyles('layer', layer.id, styles)
    const session = useWorkspace.getState().sessions[0]
    expect(layer.layerStyles?.shadow.enabled).toBe(true)
    expect(session.contentRevision).toBe(beforeRevision + 1)
    expect(session.history.canUndo).toBe(false)
    expect(document.dirty).toBe(false)
  })

  it('commits and restores styles on a layer group', () => {
    const document = createDocument('group styles', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    layer.groupId = 'group'
    const group: LayerGroup = { id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    document.groups.push(group)
    useWorkspace.getState().addSession(document)
    const styles = createDefaultLayerStyles()
    styles.innerGlow.enabled = true

    useWorkspace.getState().setLayerStyles('group', group.id, styles)
    expect(document.groups[0].layerStyles?.innerGlow.enabled).toBe(true)
    useWorkspace.getState().undo()
    expect(document.groups[0].layerStyles).toBeUndefined()
    useWorkspace.getState().redo()
    expect(document.groups[0].layerStyles?.innerGlow.enabled).toBe(true)
  })

  it('deep-copies, pastes, and clears styles across multiple targets as single undo steps', () => {
    const document = createDocument('batch layer styles', 4, 4, 'rgba')
    const source = getActiveLayer(document)
    const target = createLayer('Target', 4, 4, 'rgba')
    const group: LayerGroup = { id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    document.layers.push(target)
    document.groups.push(group)
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.size = 3
    source.layerStyles = styles
    useWorkspace.getState().addSession(document)

    expect(useWorkspace.getState().copyLayerStyles('layer', source.id)).toBe(true)
    source.layerStyles.stroke.size = 9
    expect(useWorkspace.getState().layerStyleClipboard?.stroke.size).toBe(3)

    const targets = [{ kind: 'layer' as const, id: target.id }, { kind: 'group' as const, id: group.id }]
    expect(useWorkspace.getState().pasteLayerStyles(targets)).toBe(true)
    expect(target.layerStyles?.stroke).toMatchObject({ enabled: true, size: 3 })
    expect(group.layerStyles?.stroke).toMatchObject({ enabled: true, size: 3 })
    expect(useWorkspace.getState().sessions[0].history.latestUndoEntry?.label).toBe('粘贴图层样式')

    useWorkspace.getState().undo()
    expect(target.layerStyles).toBeUndefined()
    expect(group.layerStyles).toBeUndefined()
    useWorkspace.getState().redo()
    expect(target.layerStyles?.stroke.size).toBe(3)
    expect(group.layerStyles?.stroke.size).toBe(3)

    expect(useWorkspace.getState().clearLayerStyles(targets)).toBe(true)
    expect(target.layerStyles).toBeUndefined()
    expect(group.layerStyles).toBeUndefined()
    expect(useWorkspace.getState().sessions[0].history.latestUndoEntry?.label).toBe('清除图层样式')
    useWorkspace.getState().undo()
    expect(target.layerStyles?.stroke.size).toBe(3)
    expect(group.layerStyles?.stroke.size).toBe(3)
  })



  it('rasterizes enabled styles across the layer surface and keeps the visible result undoable', () => {
    const document = createDocument('rasterize styles', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 2 * document.width + 2, { r: 41, g: 121, b: 255, a: 255 })
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    layer.layerStyles = styles
    const cel = ensureAnimationDocument(document).cels[0]
    cel.mask = createLayerMask(cel.id, document.width, document.height)
    writeLayerColor(document, cel.mask, 2 * document.width + 2, { r: 128, g: 128, b: 128, a: 255 })
    useWorkspace.getState().addSession(document)
    const before = compositeRegion(document, 0, 0, document.width, document.height)

    useWorkspace.getState().rasterizeLayer(layer.id)
    expect(layer.layerStyles).toBeUndefined()
    expect(ensureAnimationDocument(document).cels[0].mask).toBeUndefined()
    expect(Array.from(compositeRegion(document, 0, 0, document.width, document.height))).toEqual(Array.from(before))

    useWorkspace.getState().undo()
    expect(getActiveLayer(document).layerStyles?.stroke.enabled).toBe(true)
    expect(ensureAnimationDocument(document).cels[0].mask).toBeDefined()
    expect(Array.from(compositeRegion(document, 0, 0, document.width, document.height))).toEqual(Array.from(before))
  })


})
