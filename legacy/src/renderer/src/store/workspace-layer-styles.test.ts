import { DocumentCompositeCache } from '@/core/document-composite-cache'
import { beforeEach, describe, expect, it } from 'vitest'
import type { LayerGroup } from '@shared/types-layer'
import { animationMaskAt, createDocument, createLayer, getActiveLayer, writeLayerColor } from '@/core/document'
import { addBlankAnimationFrame, syncActiveAnimationFrame, ensureAnimationDocument } from '@/core/animation'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { compositeRegion } from '@/core/document-composite'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, saveProgress: null, dialog: null })
})

describe('layer style workspace history', () => {
  it.each(['normal', 'text', 'tilemap', 'free-tile', 'background'] as const)('commits and composites styles for %s layers', (kind) => {
    const document = createDocument(`style composite ${kind}`, 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    if (kind === 'background') layer.background = { mode: 'canvas' }
    else if (kind !== 'normal') layer.kind = kind
    layer.pixels[5 * 4 + 3] = 255
    useWorkspace.getState().addSession(document)
    expect(useWorkspace.getState().sessions[0].document.layers.some((candidate) => candidate.id === layer.id)).toBe(true)
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.size = 1
    useWorkspace.getState().setLayerStyles('layer', layer.id, styles)
    expect(useWorkspace.getState().sessions[0].document.layers[0].layerStyles?.stroke.enabled).toBe(true)
    expect(compositeRegion(document, 0, 0, 4, 4).some((value) => value !== 0)).toBe(true)
  })

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
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(timeline, layer.id, cel.frameId)
    if (!mask) throw new Error('missing canonical test mask')
    writeLayerColor(document, mask, 2 * document.width + 2, { r: 128, g: 128, b: 128, a: 255 })
    const before = compositeRegion(document, 0, 0, document.width, document.height)
    const visiblePixelOffset = (2 * document.width + 2) * 4
    const beforeVisiblePixel = Array.from(before.slice(visiblePixelOffset, visiblePixelOffset + 4))
    const maskPixels = Array.from(mask.pixels)

    useWorkspace.getState().rasterizeLayer(layer.id)
    expect(layer.layerStyles).toBeUndefined()
    const rasterizedMask = animationMaskAt(ensureAnimationDocument(document), layer.id, cel.frameId)
    expect(rasterizedMask).toBeNull()
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      activeLayerMaskId: null,
      layerMaskIsolatedView: false,
      selectedAnimationMaskCellKeys: []
    })
    const after = compositeRegion(document, 0, 0, document.width, document.height)
    expect(Array.from(after)).toEqual(Array.from(before))
    expect(Array.from(after.slice(visiblePixelOffset, visiblePixelOffset + 4))).toEqual(beforeVisiblePixel)

    useWorkspace.getState().undo()
    expect(getActiveLayer(document).layerStyles?.stroke.enabled).toBe(true)
    const restoredMask = animationMaskAt(ensureAnimationDocument(document), layer.id, cel.frameId)
    expect(restoredMask?.id).toBe(mask.id)
    expect(Array.from(restoredMask?.pixels ?? [])).toEqual(maskPixels)
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBe(mask.id)
    const restored = compositeRegion(document, 0, 0, document.width, document.height)
    expect(Array.from(restored)).toEqual(Array.from(before))
    expect(Array.from(restored.slice(visiblePixelOffset, visiblePixelOffset + 4))).toEqual(beforeVisiblePixel)

    useWorkspace.getState().redo()
    expect(getActiveLayer(document).layerStyles).toBeUndefined()
    expect(animationMaskAt(ensureAnimationDocument(document), layer.id, cel.frameId)).toBeNull()
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      activeLayerMaskId: null,
      layerMaskIsolatedView: false,
      selectedAnimationMaskCellKeys: []
    })
    expect(Array.from(compositeRegion(document, 0, 0, document.width, document.height))).toEqual(Array.from(before))
  })


})


it('keeps 4K / 100-layer style previews and commits local and preserves warm style caches', () => {
  const document = createDocument('large sparse styles', 4096, 4096, 'rgba')
  const layers = Array.from({ length: 100 }, (_, i) => {
    const layer = createLayer(`layer ${i}`, i === 99 ? 300 : 8, i === 99 ? 300 : 8, 'rgba')
    layer.offsetX = 1000; layer.offsetY = 1000
    layer.pixels.fill(255)
    return layer
  })
  document.layers = layers
  document.activeLayerId = layers[99].id
  document.animation = undefined
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0], layer = layers[99]
  document.dirty = false
  const target = { kind: 'layer' as const, id: layer.id }
  const originals = [{ target, styles: undefined }]
  const styles = createDefaultLayerStyles()
  styles.stroke.enabled = true; styles.stroke.size = 2
  styles.shadow.enabled = true; styles.shadow.blur = 3
  const start = performance.now()
  useWorkspace.getState().previewLayerStyleEntries([{ target, styles }])
  const previewMs = performance.now() - start
  const hint = session.contentInvalidation
  expect(hint).toMatchObject({ kind: 'region', compositeOnly: true, propertyOwnerIds: [layer.id] })
  if (hint?.kind !== 'region') throw Error('expected local invalidation')
  expect(hint.rect.width).toBeLessThan(340)
  expect(hint.rect.height).toBeLessThan(340)
  expect(session.history.canUndo).toBe(false)
  expect(document.dirty).toBe(false)
  const cache = new DocumentCompositeCache()
  const proxy = cache.renderLayersFor(document, session.contentRevision)?.find(candidate => candidate.id === layer.id)
  expect(proxy).toBeDefined()
  const beforeRevision = session.contentRevision
  const commitStart = performance.now()
  useWorkspace.getState().setLayerStylesForTargets([target], styles, 'edit', originals)
  const commitMs = performance.now() - commitStart
  expect(session.contentRevision).toBe(beforeRevision + 1)
  expect(session.contentInvalidation).toMatchObject({ kind: 'region', compositeOnly: true, fromRevision: hint.fromRevision })
  expect(cache.renderLayersFor(document, session.contentRevision)?.find(candidate => candidate.id === layer.id)).toBe(proxy)
  expect(document.dirty).toBe(true)
  useWorkspace.getState().undo()
  expect(layer.layerStyles).toBeUndefined()
  expect(session.history.canUndo).toBe(false)
  expect(session.contentInvalidation).toMatchObject({ kind: 'region', compositeOnly: true })
  useWorkspace.getState().redo()
  expect(layer.layerStyles?.shadow.enabled).toBe(true)
  console.info(`4K/100 layers style mutation: preview=${previewMs.toFixed(2)}ms, commit=${commitMs.toFixed(2)}ms; region=${hint.rect.width}x${hint.rect.height}`)
})


it('recomputes style undo damage for the frame currently being displayed', () => {
  const document = createDocument('animated style undo', 128, 128, 'rgba')
  const layer = getActiveLayer(document)
  writeLayerColor(document, layer, 5 * 128 + 5, { r: 255, g: 0, b: 0, a: 255 })
  const timeline = ensureAnimationDocument(document)
  const first = timeline.activeFrameId
  syncActiveAnimationFrame(document)
  addBlankAnimationFrame(document)
  const second = timeline.frames.at(-1)!.id
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setActiveAnimationFrame(second)
  writeLayerColor(document, layer, 100 * 128 + 100, { r: 255, g: 0, b: 0, a: 255 })
  syncActiveAnimationFrame(document)
  useWorkspace.getState().setActiveAnimationFrame(first)
  const styles = createDefaultLayerStyles(); styles.stroke.enabled = true
  useWorkspace.getState().setLayerStyles('layer', layer.id, styles)
  useWorkspace.getState().setActiveAnimationFrame(second)
  useWorkspace.getState().undo()
  const hint = useWorkspace.getState().sessions[0].contentInvalidation
  expect(hint?.kind).toBe('region')
  if (hint?.kind !== 'region') throw Error('missing damage')
  expect(hint.rect.x + hint.rect.width).toBeGreaterThan(100)
  expect(hint.rect.y + hint.rect.height).toBeGreaterThan(100)
})
