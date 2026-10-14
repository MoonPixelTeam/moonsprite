import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { animationCelAt, animationLayerAtFrame, ensureAnimationDocument, refreshActiveAnimationFrame, resolveAnimationCel } from '@/core/animation'
import { createDocument, createLayer, getActiveLayer, readLayerColorAt } from '@/core/document'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { createBlankTileset, writeTilesetTilePixels } from '@/core/tilemap'
import { useWorkspace } from '@/store/workspace'
import { QuickCommandBar } from '../app/QuickCommandBar'
import { handleSelectionShortcuts } from '../app/app-selection-shortcuts'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, dialog: null })
  const preferences = loadEditorPreferences()
  saveEditorPreferences({ ...preferences, quickCommandBarEnabled: true, quickCommandBars: [{
    ...preferences.quickCommandBars[0], edge: 'top', expanded: true,
    commands: [{ id: 'selectionFlipHorizontal', enabled: true }, { id: 'selectionFlipVertical', enabled: true }]
  }] })
})
afterEach(cleanup)

function ConnectedPanel() {
  const session = useWorkspace(state => state.sessions[0])
  return <><LayersPanel session={session} docked /><QuickCommandBar documentId={session.document.id}
    shortcutFor={() => ''} onToggleMirror={() => {}} onOpenAntiAlias={() => {}} onOpenPreferences={() => {}} /></>
}

const cases = (['raster', 'free-tile'] as const).flatMap(kind =>
  (['shortcut', 'toolbar'] as const).flatMap(entry => (['horizontal', 'vertical'] as const).map(axis => ({ kind, entry, axis }))))

it.each(cases)('mirrors selected frame headers for $kind through $entry: $axis', ({ kind, entry, axis }) => {
  const document = createDocument('frame mirror', 3, 2, 'rgba')
  const first = getActiveLayer(document)
  first.pixels.set([1, 2, 3, 4, 5, 6].flatMap(value => [value, 0, 0, 255]))
  const second = createLayer('Second', 3, 2, 'rgba')
  second.pixels.set(first.pixels)
  document.layers.push(second)
  const timeline = ensureAnimationDocument(document)
  if (kind === 'free-tile') {
    const tileset = createBlankTileset('set', 'Source', 3, 2, 'tile', 1)
    writeTilesetTilePixels(tileset, 'tile', new Uint8ClampedArray(first.pixels))
    document.tilesets = [tileset]
    first.kind = 'free-tile'
    first.freeTileSources = [{ id: 'source', name: 'Source', tilesetId: 'set', visible: true, locked: false, opacity: 1, blendMode: 'normal', offsetX: 0, offsetY: 0 }]
    animationCelAt(timeline, first.id, timeline.activeFrameId)!.freeTiles = { instances: [
      { id: 'a', sourceId: 'source', x: 0, y: 0 }, { id: 'b', sourceId: 'source', x: 4, y: 0 }
    ] }
    refreshActiveAnimationFrame(document)
  }
  const commands = useWorkspace.getState()
  commands.addSession(document)
  commands.duplicateAnimationFrame()
  commands.duplicateAnimationFrame()
  if (kind === 'free-tile') commands.selectFreeTileInstanceRow('a')
  const { container } = render(<ConnectedPanel />)
  const clickFrame = (index: number, ctrlKey = false) => {
    const header = container.querySelector<HTMLElement>(`[data-animation-frame-id="${timeline.frames[index].id}"]`)!
    fireEvent.pointerDown(header, { button: 0, ctrlKey, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
  }
  clickFrame(0)
  clickFrame(1, true)
  const session = useWorkspace.getState().sessions[0]
  expect(session.selectedAnimationFrameIds).toEqual(timeline.frames.slice(0, 2).map(frame => frame.id))
  if (entry === 'toolbar') {
    const button = screen.getByRole('button', { name: axis === 'horizontal' ? '水平镜像' : '垂直镜像' })
    fireEvent.pointerDown(button, { button: 0 })
    fireEvent.pointerUp(button)
    fireEvent.click(button)
  } else act(() => {
    const context = { workspace: useWorkspace.getState(), session, runCommand: () => false,
      matches: (id: string) => id === (axis === 'horizontal' ? 'flipHorizontal' : 'flipVertical'),
      event: { repeat: false, preventDefault() {}, stopPropagation() {} } }
    expect(handleSelectionShortcuts(context as unknown as Parameters<typeof handleSelectionShortcuts>[0])).toBe(true)
  })
  const flipped = axis === 'horizontal' ? [3, 2, 1, 6, 5, 4] : [4, 5, 6, 1, 2, 3]
  timeline.frames.forEach((frame, index) => {
    if (kind === 'raster') for (const layer of document.layers) {
      const proxy = animationLayerAtFrame(document, layer.id, frame.id)!
      expect(Array.from({ length: 6 }, (_, p) => readLayerColorAt(document, proxy, p % 3, Math.floor(p / 3)).r))
        .toEqual(index < 2 ? flipped : [1, 2, 3, 4, 5, 6])
    } else {
      const instances = resolveAnimationCel(timeline, animationCelAt(timeline, first.id, frame.id))!.freeTiles!.instances
      for (const instance of instances) expect(Boolean(instance[axis === 'horizontal' ? 'flipHorizontal' : 'flipVertical'])).toBe(index < 2)
    }
  })
  expect(session.selectedAnimationFrameIds).toEqual(timeline.frames.slice(0, 2).map(frame => frame.id))
})
