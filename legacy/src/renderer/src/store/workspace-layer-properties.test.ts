import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as animation from '@/core/animation'
import { createDocument, expandLayerStyleInvalidationRect, layerContentBounds, writeLayerColor } from '@/core/document'
import { useWorkspace, type LayerPropertyValues } from './workspace'
import { DocumentCompositeCache } from '@/core/document-composite-cache'
import { LayerPropertyCompositeCache } from '@/core/layer-property-composite-cache'
import { compositeRegion } from '@/core/document-composite'
import * as rasterStorage from '@/core/runtime-raster'

const values = (overrides: Partial<LayerPropertyValues> = {}): LayerPropertyValues => ({
  name: 'Layer preview',
  opacity: 0.5,
  blendMode: 'multiply',
  cumulativeBlend: false,
  locked: false,
  displayColor: { r: 10, g: 20, b: 30, a: 255 },
  description: 'Preview description',
  ...overrides
})

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('layer property document transactions', () => {
  it.each(['cancel', 'commit', 'original', 'metadata'] as const)('ends the display preview on %s', finish => {
    const document = createDocument('preview lifetime', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0], store = useWorkspace.getState()
    const original = values({ name: layer.name, opacity: layer.opacity, blendMode: layer.blendMode, displayColor: null, description: '' })
    const id = store.beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
    store.previewLayerPropertiesTransaction(id, { ...original, opacity: 0.5 }, ['opacity'])
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ propertyPreview: true })
    if (finish === 'cancel') store.cancelLayerPropertiesTransaction(id)
    else if (finish === 'commit') store.commitLayerPropertiesTransaction(id, { ...original, opacity: 0.5 }, ['opacity'])
    else {
      const final = { ...original, name: finish === 'metadata' ? 'renamed' : original.name }
      store.previewLayerPropertiesTransaction(id, final, ['opacity', 'name'])
      store.commitLayerPropertiesTransaction(id, final, ['opacity', 'name'])
    }
    expect(useWorkspace.getState().sessions[0].contentInvalidation).not.toHaveProperty('propertyPreview', true)
  })
  it('reuses sources when rendering skips slider events, but not an intervening pixel edit', () => {
    const document = createDocument('batched slider events', 8, 8, 'rgba')
    const layer = document.layers[0]
    layer.clippingMask = true
    writeLayerColor(document, layer, 0, { r: 200, g: 50, b: 20, a: 255 })
    useWorkspace.getState().addSession(document)
    const cache = new LayerPropertyCompositeCache(), sources = new DocumentCompositeCache()
    const session = () => useWorkspace.getState().sessions[0]
    const rect = { x: 0, y: 0, width: 8, height: 8 }
    const render = () => cache.render(document, rect, session().contentRevision, session().contentInvalidation, sources)
    const id = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
    const preview = (opacity: number) => useWorkspace.getState().previewLayerPropertiesTransaction(id, values({ opacity }), ['opacity'])
    preview(0.9)
    render()
    const reads = vi.spyOn(rasterStorage, 'readSurfacePackedLocal')
    try {
      preview(0.8); preview(0.7); preview(0.6)
      const pixels = render()
      expect(reads).not.toHaveBeenCalled()
      expect(pixels).toEqual(compositeRegion(document, 0, 0, 8, 8))
      useWorkspace.getState().mutateActive(current => {
        writeLayerColor(current.document, layer, 0, { r: 0, g: 255, b: 0, a: 255 })
      })
      reads.mockClear()
      preview(0.5); preview(0.4)
      const edited = render()
      expect(reads).toHaveBeenCalled()
      expect(edited).toEqual(compositeRegion(document, 0, 0, 8, 8))
    } finally { reads.mockRestore() }
    useWorkspace.getState().cancelLayerPropertiesTransaction(id)
  })
  it('does not recompose repeated values or metadata after an opacity preview', () => {
    const document = createDocument('unchanged preview', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    const id = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
    useWorkspace.getState().previewLayerPropertiesTransaction(id, values(), ['opacity'])
    const revision = useWorkspace.getState().sessions[0].contentRevision
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', compositeOnly: true })
    useWorkspace.getState().previewLayerPropertiesTransaction(id, values(), ['opacity'])
    useWorkspace.getState().previewLayerPropertiesTransaction(id, values({ name: 'renamed' }), ['name'])
    expect(useWorkspace.getState().sessions[0].contentRevision).toBe(revision)
    useWorkspace.getState().cancelLayerPropertiesTransaction(id)
    expect(layer.opacity).toBe(1)
    expect(useWorkspace.getState().sessions[0].contentRevision).toBeGreaterThan(revision)
  })

  it('syncs only edited animation layers when committing properties', () => {
    const document = createDocument('property sync', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    const fullSync = vi.spyOn(animation, 'syncActiveAnimationFrame')
    try {
      const id = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
      useWorkspace.getState().commitLayerPropertiesTransaction(id, values(), ['opacity', 'blendMode'])
      expect(fullSync).not.toHaveBeenCalled()
      expect(animation.animationCelAt(document.animation!, layer.id, document.animation!.activeFrameId)?.opacity).toBe(0.5)
    } finally { fullSync.mockRestore() }
  })

  it('preserves composition-only invalidation through batch property history', () => {
    const document = createDocument('batch properties', 8, 8, 'rgba')
    document.groups.push({ id: 'g', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    const id = useWorkspace.getState().beginLayerPropertiesTransaction([{ kind: 'layer', id: document.layers[0].id }, { kind: 'group', id: 'g' }])!
    useWorkspace.getState().commitLayerPropertiesTransaction(id, values(), ['opacity'])
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ compositeOnly: true })
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ compositeOnly: true })
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ compositeOnly: true })
  })
  it('previews without dirtying and restores the exact baseline on cancel', () => {
    const document = createDocument('transaction preview', 8, 8, 'rgba')
    const originalUpdatedAt = document.updatedAt
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    const originalName = layer.name
    const transactionId = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])

    expect(transactionId).not.toBeNull()
    useWorkspace.getState().previewLayerPropertiesTransaction(transactionId!, values(), ['name', 'opacity', 'blendMode', 'displayColor', 'description'])

    expect(layer.name).toBe('Layer preview')
    expect(layer.opacity).toBe(0.5)
    expect(layer.blendMode).toBe('multiply')
    expect(document.dirty).toBe(false)
    expect(document.updatedAt).toBe(originalUpdatedAt)
    expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)

    useWorkspace.getState().cancelLayerPropertiesTransaction(transactionId!)

    expect(layer.name).toBe(originalName)
    expect(layer.opacity).toBe(1)
    expect(layer.blendMode).toBe('normal')
    expect(layer.displayColor).toBeUndefined()
    expect(document.dirty).toBe(false)
  })

  it('commits one undoable document operation after restoring the preview baseline', () => {
    const document = createDocument('transaction commit', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    const originalName = layer.name
    const transactionId = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!

    useWorkspace.getState().previewLayerPropertiesTransaction(transactionId, values(), ['name', 'opacity', 'blendMode', 'displayColor', 'description'])
    useWorkspace.getState().commitLayerPropertiesTransaction(transactionId, values(), ['name', 'opacity', 'blendMode', 'displayColor', 'description'])

    expect(document.dirty).toBe(true)
    expect(layer.name).toBe('Layer preview')
    expect(layer.opacity).toBe(0.5)
    expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(true)

    useWorkspace.getState().undo()
    expect(layer.name).toBe(originalName)
    expect(layer.opacity).toBe(1)
    expect(layer.blendMode).toBe('normal')

    useWorkspace.getState().redo()
    expect(layer.name).toBe('Layer preview')
    expect(layer.opacity).toBe(0.5)
    expect(layer.blendMode).toBe('multiply')
  })

  it('keeps a single layer opacity preview bounded through commit, cancel, undo, and redo', () => {
    const document = createDocument('bounded opacity', 32, 24, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    writeLayerColor(document, layer, 8 * layer.width + 12, { r: 41, g: 121, b: 255, a: 255 })
    const bounds = layerContentBounds(document, layer)!
    const expectedRect = expandLayerStyleInvalidationRect(document, bounds, [layer.id])
    const transactionId = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!

    useWorkspace.getState().previewLayerPropertiesTransaction(transactionId, values({ opacity: 0.5, blendMode: 'normal' }), ['opacity'])
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().commitLayerPropertiesTransaction(transactionId, values({ opacity: 0.5, blendMode: 'normal' }), ['opacity'])
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().undo()
    expect(layer.opacity).toBe(1)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })

    useWorkspace.getState().redo()
    expect(layer.opacity).toBe(0.5)
    expect(useWorkspace.getState().sessions[0].contentInvalidation).toMatchObject({ kind: 'region', rect: expectedRect })
  })

  it('cancels an active preview when switching documents', () => {
    const first = createDocument('first', 8, 8, 'rgba')
    const second = createDocument('second', 8, 8, 'rgba')
    useWorkspace.getState().addSession(first)
    useWorkspace.getState().addSession(second)
    useWorkspace.getState().setActive(first.id)
    const layer = first.layers[0]
    const originalName = layer.name
    const transactionId = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: layer.id, kind: 'layer' }])!
    useWorkspace.getState().previewLayerPropertiesTransaction(transactionId, values({ name: 'Temporary' }), ['name'])

    useWorkspace.getState().setActive(second.id)

    expect(layer.name).toBe(originalName)
    expect(first.dirty).toBe(false)
  })
})
