import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, expandLayerStyleInvalidationRect, layerContentBounds, writeLayerColor } from '@/core/document'
import { useWorkspace, type LayerPropertyValues } from './workspace'

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
