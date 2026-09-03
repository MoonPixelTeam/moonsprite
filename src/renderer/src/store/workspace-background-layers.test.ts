import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types'
import { addBlankAnimationFrame, ensureAnimationDocument, resolveAnimationCel } from '@/core/animation'
import { createDocument, createLayer, getActiveLayer } from '@/core/document'
import type { BackgroundPatternTile } from '@/core/background-patterns'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { useWorkspace } from './workspace'

beforeEach(() => {
  const api = {
    getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 }))
  } as unknown as MoonSpriteApi
  Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: api })
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('workspace background layers', () => {
  it('creates a bottom preset layer shared by every existing animation frame and restores it through history', async () => {
    const document = createDocument('background preset', 32, 1, 'rgba')
    addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer('grid')

    const background = document.layers[0]
    const session = useWorkspace.getState().sessions[0]
    const timeline = ensureAnimationDocument(document)
    const cels = timeline.cels.filter((cel) => cel.layerId === background.id)
    expect(background.background).toEqual({ mode: 'preset', pattern: 'grid' })
    expect(background.format).toBe('rgba')
    expect(background.pixels[0]).toBe(180)
    expect(background.pixels[16 * 4]).toBe(191)
    expect(document.activeLayerId).toBe(background.id)
    expect(session.selectedLayerIds).toEqual([background.id])
    expect(new Set(cels.map((cel) => resolveAnimationCel(timeline, cel)?.id)).size).toBe(1)

    useWorkspace.getState().undo()
    expect(document.layers.some((layer) => layer.id === background.id)).toBe(false)
    useWorkspace.getState().redo()
    expect(document.layers[0].background).toEqual({ mode: 'preset', pattern: 'grid' })
  })

  it('adds preset colors to indexed documents instead of collapsing the pattern', async () => {
    const document = createDocument('indexed background preset', 32, 1, 'indexed')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer('grid')

    const background = getActiveLayer(document)
    expect(background.format).toBe('indexed')
    expect(new Set(background.pixels).size).toBe(2)
    expect(document.palette.some((entry) => entry.color.r === 180 && entry.color.g === 180 && entry.color.b === 180)).toBe(true)
    expect(document.palette.some((entry) => entry.color.r === 191 && entry.color.g === 191 && entry.color.b === 191)).toBe(true)
  })

  it('creates the solid preset as an opaque #e4e4e4 background', async () => {
    const document = createDocument('solid background preset', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer('solid')

    const background = getActiveLayer(document)
    expect(background.background).toEqual({ mode: 'preset', pattern: 'solid' })
    expect(Array.from(background.pixels)).toEqual([228, 228, 228, 255, 228, 228, 228, 255])
  })

  it('creates self-contained background layers from custom preset image tiles', async () => {
    const document = createDocument('custom background preset', 4, 1, 'rgba')
    const tile: BackgroundPatternTile = {
      id: 'custom.png', name: 'custom', width: 2, height: 1,
      pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128])
    }
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer(tile)

    const background = getActiveLayer(document)
    expect(background.background).toEqual({ mode: 'canvas' })
    expect(Array.from(background.pixels)).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 128,
      255, 0, 0, 255,
      0, 0, 255, 128
    ])
  })

  it('moves converted root layers to the bottom and restores both changes through one undo step', () => {
    const document = createDocument('converted background', 4, 4, 'rgba')
    const bottom = getActiveLayer(document)
    const layer = createLayer('Convert me', 4, 4, 'rgba')
    const top = createLayer('Top', 4, 4, 'rgba')
    document.layers.push(layer, top)
    document.activeLayerId = layer.id
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().setLayerBackground(layer.id, true)
    expect(layer.background).toEqual({ mode: 'canvas' })
    expect(document.layers.map((candidate) => candidate.id)).toEqual([layer.id, bottom.id, top.id])

    useWorkspace.getState().undo()
    expect(layer.background).toBeUndefined()
    expect(document.layers.map((candidate) => candidate.id)).toEqual([bottom.id, layer.id, top.id])
    expect(useWorkspace.getState().sessions[0].history.canUndo).toBe(false)

    useWorkspace.getState().redo()
    expect(layer.background).toEqual({ mode: 'canvas' })
    expect(document.layers.map((candidate) => candidate.id)).toEqual([layer.id, bottom.id, top.id])

    useWorkspace.getState().setLayerBackground(layer.id, false)
    expect(layer.background).toBeUndefined()
    expect(document.layers.map((candidate) => candidate.id)).toEqual([layer.id, bottom.id, top.id])
  })

  it('moves converted grouped layers to the absolute root bottom and restores their group on undo', () => {
    const document = createDocument('grouped converted background', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    const root = createLayer('Root', 4, 4, 'rgba')
    const groupId = 'background-source-group'
    layer.groupId = groupId
    document.layers.push(root)
    document.groups.push({ id: groupId, name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    document.activeLayerId = layer.id
    useWorkspace.getState().addSession(document)
    const beforeOrder = document.layers.map((candidate) => candidate.id)
    const beforePanelOrder = buildLayerPanelTree(document).map((node) => node.id)

    useWorkspace.getState().setLayerBackground(layer.id, true)

    expect(layer.background).toEqual({ mode: 'canvas' })
    expect(layer.groupId).toBeNull()
    expect(document.layers[0].id).toBe(layer.id)
    expect(buildLayerPanelTree(document).filter((node) => node.depth === 0).at(-1)?.id).toBe(layer.id)

    useWorkspace.getState().undo()
    expect(layer.background).toBeUndefined()
    expect(layer.groupId).toBe(groupId)
    expect(document.layers.map((candidate) => candidate.id)).toEqual(beforeOrder)
    expect(buildLayerPanelTree(document).map((node) => node.id)).toEqual(beforePanelOrder)

    useWorkspace.getState().redo()
    expect(layer.background).toEqual({ mode: 'canvas' })
    expect(layer.groupId).toBeNull()
    expect(buildLayerPanelTree(document).filter((node) => node.depth === 0).at(-1)?.id).toBe(layer.id)
  })
})
