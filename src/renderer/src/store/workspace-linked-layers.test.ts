import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { beginPixelEdit, recordPixel } from '@/core/history'
import { rasterStorageIdentity } from '@/core/runtime-raster'
import { LAYER_DISPLAY_COLOR_PRESETS_KEY } from '@/core/file-preferences'
import { useWorkspace } from './workspace'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 80, b: 255, a: 255 }

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'moonSprite', {
    configurable: true,
    writable: true,
    value: { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })) } as unknown as MoonSpriteApi
  })
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('linked layer workspace commands', () => {
  it('assigns one unused display color to the entire linked group', () => {
    const colors = [
      { r: 220, g: 45, b: 70, a: 255 },
      { r: 40, g: 190, b: 120, a: 255 },
      { r: 55, g: 110, b: 230, a: 255 }
    ]
    localStorage.setItem(LAYER_DISPLAY_COLOR_PRESETS_KEY, JSON.stringify(colors))
    const document = createDocument('linked display colors', 2, 1, 'rgba')
    const source = getActiveLayer(document)
    source.displayColor = { ...colors[0] }
    useWorkspace.getState().addSession(document)

    const firstLinkedId = useWorkspace.getState().createLinkedLayer(source.id)
    const secondLinkedId = useWorkspace.getState().createLinkedLayer(source.id)
    const firstLinked = document.layers.find((layer) => layer.id === firstLinkedId)!
    const secondLinked = document.layers.find((layer) => layer.id === secondLinkedId)!

    expect(source.displayColor).toEqual(colors[1])
    expect(firstLinked.displayColor).toEqual(colors[1])
    expect(secondLinked.displayColor).toEqual(colors[1])
    useWorkspace.getState().undo()
    expect(source.displayColor).toEqual(colors[1])
    expect(firstLinked.displayColor).toEqual(colors[1])
    useWorkspace.getState().redo()
    expect(document.layers.find((layer) => layer.id === secondLinked.id)?.displayColor).toEqual(colors[1])
    useWorkspace.getState().undo()
    useWorkspace.getState().undo()
    expect(source.displayColor).toEqual(colors[0])
    expect(source.linkedContentId).toBeUndefined()
    useWorkspace.getState().redo()
    expect(source.displayColor).toEqual(colors[1])
    expect(document.layers.find((layer) => layer.id === firstLinked.id)?.displayColor).toEqual(colors[1])
  })

  it('synchronizes display color previews, commits, undo, and redo across linked members', () => {
    const document = createDocument('linked property colors', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const source = getActiveLayer(document)
    const linkedId = useWorkspace.getState().createLinkedLayer(source.id)!
    const linked = document.layers.find((layer) => layer.id === linkedId)!
    const initialColor = { ...source.displayColor! }
    const nextColor = { r: 130, g: 60, b: 210, a: 255 }
    const propertyValues = {
      name: linked.name,
      opacity: linked.opacity,
      blendMode: linked.blendMode,
      cumulativeBlend: false,
      locked: linked.locked,
      displayColor: nextColor,
      description: linked.description ?? ''
    }

    const canceledId = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: linked.id, kind: 'layer' }])!
    useWorkspace.getState().previewLayerPropertiesTransaction(canceledId, propertyValues, ['displayColor'])
    expect(source.displayColor).toEqual(nextColor)
    expect(linked.displayColor).toEqual(nextColor)
    useWorkspace.getState().cancelLayerPropertiesTransaction(canceledId)
    expect(source.displayColor).toEqual(initialColor)
    expect(linked.displayColor).toEqual(initialColor)

    const committedId = useWorkspace.getState().beginLayerPropertiesTransaction([{ id: linked.id, kind: 'layer' }])!
    useWorkspace.getState().previewLayerPropertiesTransaction(committedId, propertyValues, ['displayColor'])
    useWorkspace.getState().commitLayerPropertiesTransaction(committedId, propertyValues, ['displayColor'])
    expect(source.displayColor).toEqual(nextColor)
    expect(linked.displayColor).toEqual(nextColor)
    useWorkspace.getState().undo()
    expect(source.displayColor).toEqual(initialColor)
    expect(linked.displayColor).toEqual(initialColor)
    useWorkspace.getState().redo()
    expect(source.displayColor).toEqual(nextColor)
    expect(linked.displayColor).toEqual(nextColor)
  })

  it('creates one undoable linked copy and restores the association on redo', () => {
    const document = createDocument('linked command', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const source = getActiveLayer(document)
    source.name = '角色'
    writeLayerColor(document, source, 0, red)

    const linkedId = useWorkspace.getState().createLinkedLayer(source.id)
    const linked = document.layers.find((layer) => layer.id === linkedId)!

    expect(linkedId).toBeTruthy()
    expect(source.linkedContentId).toBeTruthy()
    expect(linked.linkedContentId).toBe(source.linkedContentId)
    expect(source.name).toBe('角色')
    expect(linked.name).toBe('角色 关联1')
    expect(rasterStorageIdentity(linked)).toBe(rasterStorageIdentity(source))

    useWorkspace.getState().undo()
    expect(document.layers.some((layer) => layer.id === linked.id)).toBe(false)
    expect(source.linkedContentId).toBeUndefined()
    expect(source.name).toBe('角色')

    useWorkspace.getState().redo()
    const restored = document.layers.find((layer) => layer.id === linked.id)!
    expect(restored.linkedContentId).toBe(source.linkedContentId)
    expect(source.name).toBe('角色')
    expect(restored.name).toBe('角色 关联1')
    expect(rasterStorageIdentity(restored)).toBe(rasterStorageIdentity(source))
  })



  it('maps copied association groups to a new identity in another document', () => {
    const sourceDocument = createDocument('source links', 1, 1, 'rgba')
    useWorkspace.getState().addSession(sourceDocument)
    const source = getActiveLayer(sourceDocument)
    source.name = '角色'
    const linkedId = useWorkspace.getState().createLinkedLayer(source.id)!
    const linked = sourceDocument.layers.find((layer) => layer.id === linkedId)!
    const sourceSession = useWorkspace.getState().sessions.find((session) => session.document.id === sourceDocument.id)!
    sourceSession.selectedLayerIds = [source.id, linked.id]
    useWorkspace.getState().copySelectedLayersToClipboard()

    const targetDocument = createDocument('target links', 1, 1, 'rgba')
    useWorkspace.getState().addSession(targetDocument)
    expect(useWorkspace.getState().pasteLayersFromClipboard()).toBe(true)
    const pasted = targetDocument.layers.filter((layer) => layer.id !== targetDocument.layers[0].id && layer.linkedContentId)

    expect(pasted).toHaveLength(2)
    expect(pasted[0].linkedContentId).toBe(pasted[1].linkedContentId)
    expect(pasted[0].linkedContentId).not.toBe(source.linkedContentId)
    expect(pasted.map((layer) => layer.name)).toEqual(['角色 关联1', '角色 关联2'])
    expect(rasterStorageIdentity(pasted[0])).toBe(rasterStorageIdentity(pasted[1]))
  })

  it('rejects text, tile, free-tile, and background layers', () => {
    const document = createDocument('unavailable links', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = getActiveLayer(document)
    layer.background = { mode: 'canvas' }
    expect(useWorkspace.getState().createLinkedLayer(layer.id)).toBeNull()
    delete layer.background
    layer.kind = 'text'
    expect(useWorkspace.getState().createLinkedLayer(layer.id)).toBeNull()
  })
})
