import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { animationCelAt, animationCelKey, animationLayerAtFrame, ensureAnimationDocument, linkAnimationFrameCels, refreshActiveAnimationFrame, resolveAnimationCel } from '@/core/animation'
import { createDocument, createLayer, readLayerColorAt } from '@/core/document'
import { handleSelectionShortcuts } from '@/components/app/app-selection-shortcuts'
import { createBlankTileset, writeTilesetTilePixels } from '@/core/tilemap'
import { useWorkspace } from './workspace'

beforeEach(() => {
  vi.stubGlobal('moonSprite', {})
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
})
afterEach(() => vi.unstubAllGlobals())

const setup = () => {
  const document = createDocument('batch flip', 3, 2, 'rgba')
  document.layers.push(createLayer('Second', 3, 2, 'rgba'), createLayer('Third', 3, 2, 'rgba'))
  const timeline = ensureAnimationDocument(document)
  timeline.frames = Array.from({ length: 4 }, (_, i) => ({ id: `frame-${i + 1}`, duration: 100 + i * 20 }))
  timeline.cels = document.layers.flatMap((layer, li) => timeline.frames.map((frame, fi) => ({
    id: `cel-${li}-${fi}`, layerId: layer.id, frameId: frame.id, opacity: 1,
    surface: { format: 'rgba' as const, width: 3, height: 2, offsetX: li, offsetY: -fi,
      pixels: new Uint8ClampedArray(Array.from({ length: 6 }, (_, p) => [1 + li * 40 + fi * 8 + p, 0, 0, 255]).flat()) }
  })))
  refreshActiveAnimationFrame(document)
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const pixels = (li: number, fi: number) => {
    const layer = animationLayerAtFrame(document, document.layers[li].id, timeline.frames[fi].id)!
    return Array.from({ length: 6 }, (_, p) => readLayerColorAt(document, layer, layer.offsetX + p % 3, layer.offsetY + Math.floor(p / 3)).r)
  }
  const snapshot = () => document.layers.map((_, li) => timeline.frames.map((_, fi) => pixels(li, fi)))
  return { document, timeline, session, pixels, snapshot }
}

const flipShortcut = (axis: 'horizontal' | 'vertical') => {
  const context = {
    workspace: useWorkspace.getState(), session: useWorkspace.getState().sessions[0], runCommand: () => false,
    matches: (id: string) => id === (axis === 'horizontal' ? 'flipHorizontal' : 'flipVertical'),
    event: { repeat: false, preventDefault() {}, stopPropagation() {} }
  }
  expect(handleSelectionShortcuts(context as unknown as Parameters<typeof handleSelectionShortcuts>[0])).toBe(true)
}

const mirrored = (pixels: number[], axis: 'horizontal' | 'vertical') =>
  (axis === 'horizontal' ? [2, 1, 0, 5, 4, 3] : [3, 4, 5, 0, 1, 2]).map((index) => pixels[index])

describe.each(['horizontal', 'vertical'] as const)('batch %s flip', (axis) => {
  it('mirrors entire selected frames immediately after repeatedly pasting layers', () => {
    const { document, timeline, session, snapshot } = setup()
    const commands = useWorkspace.getState()
    commands.selectLayer(document.layers[0].id)
    commands.copySelectedLayersToClipboard()
    expect(commands.pasteLayersFromClipboard()).toBe(true)
    expect(commands.pasteLayersFromClipboard()).toBe(true)
    const pastedLayerIds = [...session.selectedLayerIds]
    expect(session.layerSelectionExplicit).toBe(true)
    commands.selectAnimationFrame(timeline.frames[0].id)
    commands.selectAnimationFrame(timeline.frames[2].id, 'toggle')
    const before = snapshot()
    const position = session.history.position

    flipShortcut(axis)

    const expected = before.map(frames => frames.map((pixels, index) => index === 0 || index === 2 ? mirrored(pixels, axis) : pixels))
    expect(snapshot()).toEqual(expected)
    expect(document.layers.some(layer => pastedLayerIds.includes(layer.id))).toBe(true)
    expect(session.selectedAnimationFrameIds).toEqual([timeline.frames[0].id, timeline.frames[2].id])
    expect(session.history.position).toBe(position + 1)
    commands.undo()
    expect(snapshot()).toEqual(before)
    commands.redo()
    expect(snapshot()).toEqual(expected)
  })

  it.each(['cells', 'layers', 'frames', 'layers-and-frames'] as const)('targets only selected %s and undoes in one step', (scope) => {
    const { document, timeline, session, snapshot } = setup()
    const commands = useWorkspace.getState()
    if (scope === 'cells') {
      commands.selectAnimationCell(animationCelKey(document.layers[0].id, timeline.frames[0].id))
      commands.selectAnimationCell(animationCelKey(document.layers[2].id, timeline.frames[2].id), 'toggle')
    } else {
      if (scope !== 'frames') {
        commands.selectLayer(document.layers[0].id)
        commands.selectLayer(document.layers[2].id, 'toggle')
      }
      if (scope !== 'layers') {
        commands.selectAnimationFrame(timeline.frames[0].id, scope === 'layers-and-frames' ? 'toggle' : 'replace')
        commands.selectAnimationFrame(timeline.frames[2].id, 'toggle')
      }
    }
    const before = snapshot()
    const selected = (li: number, fi: number) => scope === 'cells' ? (li === 0 && fi === 0) || (li === 2 && fi === 2)
      : scope === 'layers' ? li !== 1 : scope === 'frames' ? fi === 0 || fi === 2 : li !== 1 && (fi === 0 || fi === 2)
    const expected = before.map((frames, li) => frames.map((pixels, fi) => selected(li, fi) ? mirrored(pixels, axis) : pixels))
    const activeFrameId = timeline.activeFrameId
    const selection = { layers: [...session.selectedLayerIds], cells: [...session.selectedAnimationCellKeys], frames: [...session.selectedAnimationFrameIds] }
    const position = session.history.position

    flipShortcut(axis)

    expect(snapshot()).toEqual(expected)
    expect(timeline.activeFrameId).toBe(activeFrameId)
    expect(timeline.frames.map((frame) => frame.duration)).toEqual([100, 120, 140, 160])
    expect(session.selection).toBeNull()
    expect(session.selectedLayerIds).toEqual(selection.layers)
    expect(session.selectedAnimationCellKeys).toEqual(selection.cells)
    expect(session.selectedAnimationFrameIds).toEqual(selection.frames)
    expect(session.selectionGuidesPreservedAtContentRevision).toBe(session.contentRevision)
    expect(session.history.position).toBe(position + 1)
    commands.setActiveAnimationFrame(timeline.frames[3].id)
    commands.undo()
    expect(snapshot()).toEqual(before)
    commands.redo()
    expect(snapshot()).toEqual(expected)
  })

  it('flips shared linked cels once and leaves locked or hidden layers unchanged', () => {
    const { document, timeline, session, snapshot } = setup()
    linkAnimationFrameCels(document, timeline.frames[0].id, timeline.frames[1].id, [document.layers[0].id])
    document.layers[1].locked = true
    document.layers[2].visible = false
    const commands = useWorkspace.getState()
    commands.selectAnimationFrame(timeline.frames[0].id)
    commands.selectAnimationFrame(timeline.frames[1].id, 'toggle')
    const before = snapshot()
    const position = session.history.position
    flipShortcut(axis)
    const after = snapshot()
    expect(after[0][0]).toEqual(mirrored(before[0][0], axis))
    expect(after[0][1]).toEqual(after[0][0])
    expect(after[1]).toEqual(before[1])
    expect(after[2]).toEqual(before[2])
    expect(session.history.position).toBe(position + 1)
    commands.undo()
    expect(snapshot()).toEqual(before)
  })
})

it('keeps an implicit active layer limited to the current frame', () => {
  const { snapshot } = setup()
  const before = snapshot()
  flipShortcut('horizontal')
  const expected = before.map((frames) => frames.map((pixels) => [...pixels]))
  expected[0][0] = mirrored(expected[0][0], 'horizontal')
  expect(snapshot()).toEqual(expected)
})

it('does not add history for empty selected cels or flip an unselected active cel', () => {
  const { document, timeline, session, snapshot } = setup()
  animationCelAt(timeline, document.layers[2].id, timeline.frames[2].id)!.surface!.pixels.fill(0)
  useWorkspace.getState().selectAnimationCell(animationCelKey(document.layers[2].id, timeline.frames[2].id))
  const before = snapshot()
  const position = session.history.position
  flipShortcut('horizontal')
  expect(snapshot()).toEqual(before)
  expect(session.history.position).toBe(position)
})

it('mirrors raster, tilemap and linked free-tile cels together without losing editable metadata', () => {
  const { document, timeline, session, pixels } = setup()
  const tileLayer = document.layers[1]
  tileLayer.kind = 'tilemap'
  tileLayer.tilemapTilesetId = 'tileset'
  const freeLayer = document.layers[2]
  freeLayer.kind = 'free-tile'
  freeLayer.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: 'tileset', visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
  const tileset = createBlankTileset('tileset', 'Tiles', 1, 1, 'tile', 1)
  writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray([255, 0, 0, 255]))
  document.tilesets = [tileset]
  for (const frame of timeline.frames) {
    animationCelAt(timeline, tileLayer.id, frame.id)!.tilemap = {
      tileWidth: 1, tileHeight: 1, columns: 3, rows: 2,
      cells: [{ tilesetId: 'tileset', tileId: 'tile' }, null, null, null, null, null]
    }
    animationCelAt(timeline, freeLayer.id, frame.id)!.freeTiles = { instances: [
      { id: `instance-${frame.id}`, sourceId: 'source', x: 0, y: 0 },
      { id: `locked-${frame.id}`, sourceId: 'source', x: 2, y: 0, locked: true }
    ] }
  }
  linkAnimationFrameCels(document, timeline.frames[0].id, timeline.frames[1].id, [freeLayer.id])
  refreshActiveAnimationFrame(document)
  const commands = useWorkspace.getState()
  commands.selectAnimationFrame(timeline.frames[0].id)
  commands.selectAnimationFrame(timeline.frames[1].id, 'toggle')
  const rasterBefore = pixels(0, 0)
  const position = session.history.position
  flipShortcut('horizontal')
  expect(session.history.position).toBe(position + 1)
  expect(pixels(0, 0)).toEqual(mirrored(rasterBefore, 'horizontal'))
  for (const frame of timeline.frames.slice(0, 2)) {
    const cells = animationCelAt(timeline, tileLayer.id, frame.id)!.tilemap!.cells
    expect(cells[0]).toBeNull()
    // A one-pixel tile has no orientation; the cel still mirrors its placement.
    expect(cells[2]).toMatchObject({ tileId: 'tile' })
    const instances = resolveAnimationCel(timeline, animationCelAt(timeline, freeLayer.id, frame.id))!.freeTiles!.instances
    expect(instances[0].flipHorizontal).toBe(true)
    expect(instances[1].flipHorizontal).not.toBe(true)
  }
  expect(animationCelAt(timeline, tileLayer.id, timeline.frames[2].id)!.tilemap!.cells[0]?.tileId).toBe('tile')
  commands.undo()
  expect(pixels(0, 0)).toEqual(rasterBefore)
  expect(animationCelAt(timeline, tileLayer.id, timeline.frames[0].id)!.tilemap!.cells[0]?.tileId).toBe('tile')
  expect(animationCelAt(timeline, freeLayer.id, timeline.frames[0].id)!.freeTiles!.instances[0].flipHorizontal).not.toBe(true)
  commands.redo()
  expect(pixels(0, 0)).toEqual(mirrored(rasterBefore, 'horizontal'))
})
