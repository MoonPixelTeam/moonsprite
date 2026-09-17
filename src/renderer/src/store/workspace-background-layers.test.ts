import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { addBlankAnimationFrame, ensureAnimationDocument, resolveAnimationCel } from '@/core/animation'
import { createDocument, createLayer, ensureLayerCoversCanvas, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { encodeProject, decodeProject } from '@/core/project-format'
import { encodePng } from '@/core/png-encode'
import { decodeBackgroundPresetTile } from '@/core/background-preset-images'
import { backgroundPatternColorAt, type BackgroundPatternTile } from '@/core/background-patterns'
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
  it.each(['rgba', 'indexed'] as const)('uses the exact decoded preset image even when its filename names a built-in pattern (%s)', async mode => {
    const pixels = new Uint8ClampedArray([
      18, 36, 72, 255, 90, 30, 60, 255, 40, 80, 120, 128,
      210, 40, 20, 255, 60, 180, 90, 255, 140, 110, 80, 255
    ])
    const tile = await decodeBackgroundPresetTile({ id: 'diamond-nested.png', name: 'Diamond', filePath: 'diamond-nested.png', builtIn: true }, encodePng(pixels, 3, 2, true).bytes)
    expect(tile.pattern).toBe('diamond-nested')
    expect(tile.pixels).toEqual(pixels)
    const document = createDocument('preset matches preview', 2, 1, mode)
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createBackgroundLayer(tile)
    const assertPattern = () => {
      for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
        const offset = ((y % 2) * 3 + x % 3) * 4
        expect(readLayerColorAt(document, document.layers[0], x, y)).toEqual({ r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3] })
      }
    }
    assertPattern()
    expect(document.layers[0].background).toEqual({ mode: 'canvas', repeatWidth: 3, repeatHeight: 2 })
    await useWorkspace.getState().resizeActiveCanvas(11, 7, 'nw')
    assertPattern()
    await useWorkspace.getState().resizeActiveCanvas(1, 1, 'nw', 0, 0, true)
    await useWorkspace.getState().resizeActiveCanvas(13, 9, 'nw')
    assertPattern()
  })

  it.each(['rgba', 'indexed'] as const)('keeps a custom repeat unit through repeated crop/expand, offsets, undo and reopen in %s', async mode => {
    let document = createDocument('repeat background', 5, 3, mode)
    useWorkspace.getState().addSession(document)
    const colors = [30, 60, 90, 120, 150, 180].map(r => ({ r, g: 0, b: 0, a: 255 }))
    await useWorkspace.getState().createBackgroundLayer({ id: 'tile', name: 'tile', width: 3, height: 2, pixels: new Uint8ClampedArray(colors.flatMap(Object.values)) })
    let shiftX = 0, shiftY = 0
    const assertPattern = () => {
      for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
        const cx = ((x - shiftX) % 3 + 3) % 3, cy = ((y - shiftY) % 2 + 2) % 2
        expect(readLayerColorAt(document, document.layers[0], x, y)).toEqual(colors[cy * 3 + cx])
      }
    }
    for (const [width, height, x, y] of [[8, 5, 1, 1], [1, 1, -3, -2], [11, 7, 2, -1], [11, 7, 3, 2], [4, 2, -1, -3], [14, 9, -2, 1]]) {
      await useWorkspace.getState().resizeActiveCanvas(width, height, 'nw', x, y, true)
      shiftX += x; shiftY += y
      assertPattern()
      useWorkspace.getState().undo()
      shiftX -= x; shiftY -= y
      assertPattern()
      useWorkspace.getState().redo()
      shiftX += x; shiftY += y
      assertPattern()
      document = decodeProject(encodeProject(document))
      useWorkspace.setState({ sessions: [], activeId: null })
      useWorkspace.getState().addSession(document)
      assertPattern()
    }
  })

  it('keeps preset phase when cropping smaller than a unit and expanding repeatedly', async () => {
    const document = createDocument('preset phase', 25, 19, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createBackgroundLayer('grid')
    let shiftX = 0, shiftY = 0
    for (const [width, height, x, y] of [[43, 33, 7, 5], [1, 1, -9, -8], [52, 41, 3, 2], [52, 41, -6, 9]]) {
      await useWorkspace.getState().resizeActiveCanvas(width, height, 'nw', x, y, true)
      shiftX += x; shiftY += y
      for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
        expect(readLayerColorAt(document, document.layers[0], px, py)).toEqual(backgroundPatternColorAt('grid', px - shiftX, py - shiftY))
      }
    }
  })

  it('retains separate frame patterns and restores repeat metadata on undo', async () => {
    const document = createDocument('animated repeating background', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.background = { mode: 'canvas' }
    for (let x = 0; x < 3; x++) writeLayerColor(document, layer, x, { r: 20 + x, g: 0, b: 0, a: 255 })
    addBlankAnimationFrame(document)
    ensureLayerCoversCanvas(document, layer)
    for (let x = 0; x < 3; x++) writeLayerColor(document, layer, x, { r: 70 + x, g: 0, b: 0, a: 255 })
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().resizeActiveCanvas(1, 1, 'nw', -1, 0, true)
    useWorkspace.getState().undo()
    expect(layer.background).toEqual({ mode: 'canvas' })
    useWorkspace.getState().redo()
    await useWorkspace.getState().resizeActiveCanvas(8, 1, 'nw', 0, 0, true)
    const timeline = ensureAnimationDocument(document)
    for (const [index, frame] of timeline.frames.entries()) {
      useWorkspace.getState().setActiveAnimationFrame(frame.id)
      for (let x = 0; x < 8; x++) expect(readLayerColorAt(document, layer, x, 0).r).toBe((index === 0 ? 20 : 70) + (x + 1) % 3)
    }
  })

  it('continues preset backgrounds by their pattern period when the canvas expands', async () => {
    const document = createDocument('expanded background preset', 64, 64, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer('diamond-nested')
    const background = document.layers[0]
    const editedColor = { r: 255, g: 32, b: 64, a: 255 }
    writeLayerColor(document, background, 0, editedColor)
    await useWorkspace.getState().resizeActiveCanvas(128, 128, 'nw')

    const expected = backgroundPatternColorAt('diamond-nested', 64, 0)
    expect(Array.from(background.pixels.subarray(0, 4))).toEqual(Object.values(editedColor))
    expect(Array.from(background.pixels.subarray(64 * 4, 64 * 4 + 4))).toEqual([expected.r, expected.g, expected.b, expected.a])
    expect(Array.from(background.pixels.subarray((22 * 128 + 86) * 4, (22 * 128 + 86) * 4 + 4))).toEqual([expected.r, expected.g, expected.b, expected.a])
  })

  it('creates a bottom preset layer shared by every existing animation frame and restores it through history', async () => {
    const document = createDocument('background preset', 32, 1, 'rgba')
    addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    const artwork = getActiveLayer(document)

    await useWorkspace.getState().createBackgroundLayer('grid')

    const background = document.layers[0]
    const session = useWorkspace.getState().sessions[0]
    const timeline = ensureAnimationDocument(document)
    const cels = timeline.cels.filter((cel) => cel.layerId === background.id)
    expect(background.background).toEqual({ mode: 'preset', pattern: 'grid' })
    expect(background.format).toBe('rgba')
    expect(background.pixels[0]).toBe(214)
    expect(background.pixels[16 * 4]).toBe(228)
    // The background is added underneath the artwork; the editing target does not move.
    expect(document.activeLayerId).not.toBe(background.id)
    expect(document.activeLayerId).toBe(artwork.id)
    expect(session.selectedLayerIds).not.toContain(background.id)
    expect(session.timelineActiveContext.row).toEqual({ kind: 'layer', ownerKind: 'layer', ownerId: artwork.id })
    expect(session.timelineActiveContext.frameId).toBe(timeline.activeFrameId)
    expect(new Set(cels.map((cel) => resolveAnimationCel(timeline, cel)?.id)).size).toBe(1)

    useWorkspace.getState().undo()
    expect(document.layers.some((layer) => layer.id === background.id)).toBe(false)
    useWorkspace.getState().redo()
    expect(document.layers[0].background).toEqual({ mode: 'preset', pattern: 'grid' })
  })

  it('keeps the current editing target and its selection when a background is created', async () => {
    const document = createDocument('background keeps target', 8, 8, 'rgba')
    const first = createLayer('first', 8, 8, 'rgba')
    document.layers.push(first)
    useWorkspace.getState().addSession(document)

    const target = createLayer('target', 8, 8, 'rgba')
    document.layers.push(target)
    const session = useWorkspace.getState().sessions[0]
    session.selectedLayerIds = [target.id, first.id]
    document.activeLayerId = target.id
    const activeContextBefore = { ...session.timelineActiveContext }

    await useWorkspace.getState().createBackgroundLayer('grid')

    const background = document.layers[0]
    expect(background.background).toEqual({ mode: 'preset', pattern: 'grid' })
    // Active layer, multi-row selection, group selection and the timeline focus are
    // all exactly what they were before the background existed.
    expect(document.activeLayerId).toBe(target.id)
    expect(session.selectedLayerIds).toEqual([target.id, first.id])
    // The timeline focus is preserved verbatim, not re-pointed at the background.
    expect(session.timelineActiveContext).toEqual(activeContextBefore)
    expect(background.id).not.toBe(document.activeLayerId)

    // Undo and redo must land on the same target as well.
    useWorkspace.getState().undo()
    expect(document.layers.some((layer) => layer.id === background.id)).toBe(false)
    expect(document.activeLayerId).toBe(target.id)
    expect(session.selectedLayerIds).toEqual([target.id, first.id])
    useWorkspace.getState().redo()
    expect(document.layers[0].id).toBe(background.id)
    expect(document.activeLayerId).toBe(target.id)
  })

  it('adds preset colors to indexed documents instead of collapsing the pattern', async () => {
    const document = createDocument('indexed background preset', 32, 1, 'indexed')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer('grid')

    const background = document.layers[0]
    expect(background.format).toBe('indexed')
    expect(new Set(background.pixels).size).toBe(2)
    expect(document.palette.some((entry) => entry.color.r === 214 && entry.color.g === 214 && entry.color.b === 214)).toBe(true)
    expect(document.palette.some((entry) => entry.color.r === 228 && entry.color.g === 228 && entry.color.b === 228)).toBe(true)
  })

  it('creates the solid preset as an opaque #e4e4e4 background', async () => {
    const document = createDocument('solid background preset', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer('solid')

    const background = document.layers[0]
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

    const background = document.layers[0]
    expect(background.background).toEqual({ mode: 'canvas', repeatWidth: 2, repeatHeight: 1 })
    expect(Array.from(background.pixels)).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 128,
      255, 0, 0, 255,
      0, 0, 255, 128
    ])
  })

  it('uses built-in image preset pixels instead of the matching generated pattern', async () => {
    const document = createDocument('built-in image preset', 4, 2, 'rgba')
    const tile: BackgroundPatternTile = {
      id: 'diamond-nested.png', name: 'Diamond 2', pattern: 'diamond-nested', width: 2, height: 2,
      pixels: new Uint8ClampedArray([
        228, 228, 228, 255, 214, 214, 214, 255,
        214, 214, 214, 255, 228, 228, 228, 255
      ])
    }
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().createBackgroundLayer(tile)

    const background = document.layers[0]
    expect(background.background).toEqual({ mode: 'canvas', repeatWidth: 2, repeatHeight: 2 })
    expect(Array.from(background.pixels)).toEqual([
      228, 228, 228, 255, 214, 214, 214, 255, 228, 228, 228, 255, 214, 214, 214, 255,
      214, 214, 214, 255, 228, 228, 228, 255, 214, 214, 214, 255, 228, 228, 228, 255
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
