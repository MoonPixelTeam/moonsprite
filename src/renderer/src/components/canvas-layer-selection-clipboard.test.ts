import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { CanvasInputState } from '@/core/canvas-input-controller'
import { syncActiveAnimationFrame, animationCelKey, ensureAnimationDocument, addBlankAnimationFrame } from '@/core/animation'
import { useWorkspace } from '@/store/workspace'
import { clipboardService } from '@/store/clipboard-service'
import { createSelectionCanvasInput } from './canvas-input-selection'
import { handleDocumentShortcuts } from './app/app-document-shortcuts'

beforeEach(() => {
  localStorage.clear()
  clipboardService.clearSelection()
  clipboardService.clearLayer()
  clipboardService.clearAnimation()
  useWorkspace.setState({ sessions: [], activeId: null })
  vi.stubGlobal('moonSprite', { readClipboardImage: vi.fn().mockResolvedValue(null), writeClipboardImage: vi.fn().mockResolvedValue(undefined) })
})
afterEach(() => vi.unstubAllGlobals())

const current = () => useWorkspace.getState().sessions[0]

function marquee(moved: boolean) {
  const session = current()
  const input = new CanvasInputState()
  const ports = {
    inputRef: { current: input }, liveViewRef: { current: session.view },
    selectionCrosshair: false, selectionInteractionEditable: true,
    currentSelectionMarqueeModifierState: () => ({ fromCenter: false, proportional: false, rotate: false }),
    updateMarqueePreview: (drag: NonNullable<typeof input.drag>) => { drag.previewSelection = { x: 0, y: 0, width: 1, height: 1 } },
    t: () => 'select', updateCursor: vi.fn(), scheduleDraw: vi.fn()
  } as unknown as Parameters<typeof createSelectionCanvasInput>[0]
  const handler = createSelectionCanvasInput(ports)
  const event = { button: 0, clientX: 0, clientY: 0, currentTarget: { style: {} } } as React.PointerEvent<HTMLCanvasElement>
  handler.beginMarquee({ session, event, point: { x: 0, y: 0 }, selectionMode: () => 'replace', state: useWorkspace.getState() })
  expect(current().layerSelectionExplicit).toBe(false)
  expect(current().selectedAnimationCellKeys).toEqual([])
  input.drag!.moved = moved
  handler.endMarquee({ drag: input.drag!, event, session: current(), state: useWorkspace.getState() })
  expect(current().layerSelectionExplicit).toBe(false)
  expect(current().selectedAnimationCellKeys).toEqual([])
}

it.each(['rectangle', 'ellipse'] as const)('clears explicit layer selection on %s marquee and empty click', (kind) => {
  const document = createDocument('layer focus', 3, 1, 'rgba')
  const store = useWorkspace.getState()
  store.addSession(document)
  store.selectLayer(document.activeLayerId)
  current().tool = 'selection'
  current().selectionKind = kind
  marquee(false)
  marquee(true)
  expect(current().selectedLayerIds).toEqual([document.activeLayerId])
})

it('cuts pixels from A and pastes over B after a canvas click without replacing B', async () => {
  const document = createDocument('cut A onto B', 3, 1, 'rgba')
  const a = document.layers[0]
  const b = createLayer('B', 3, 1, 'rgba')
  document.layers.push(b)
  const red = { r: 255, g: 0, b: 0, a: 255 }
  const blue = { r: 0, g: 0, b: 255, a: 255 }
  writeLayerColor(document, a, 0, red)
  writeLayerColor(document, b, 2, blue)
  syncActiveAnimationFrame(document)
  const store = useWorkspace.getState()
  store.addSession(document)
  store.selectLayer(a.id)
  current().tool = 'selection'
  current().selectionKind = 'rectangle'
  marquee(true)
  expect(readLayerColorAt(current().document, a, 0, 0)).toEqual(red)
  handleDocumentShortcuts({
    workspace: useWorkspace.getState(), session: current(), commandScope: () => 'canvas', selectionOverride: () => false,
    runCommand: (id: string, run: () => void) => { if (id !== 'cut') return false; run(); return true },
  } as unknown as Parameters<typeof handleDocumentShortcuts>[0])
  expect(readLayerColorAt(current().document, a, 0, 0).a).toBe(0)
  expect(clipboardService.getAnimationCells()).toBeNull()
  store.selectLayer(b.id)
  marquee(false)
  await store.pasteClipboard()
  expect(current().pendingPaste?.layerId).toBe(b.id)
  expect(current().pendingPaste?.target).toMatchObject({ x: 0, y: 0 })
  store.commitFloatingPaste()
  const color = (x: number) => readLayerColorAt(current().document, current().document.layers.find(layer => layer.id === b.id)!, x, 0)
  expect(color(0)).toEqual(red)
  expect(color(2)).toEqual(blue)
  store.undo()
  expect(color(0).a).toBe(0)
  expect(color(2)).toEqual(blue)
  store.redo()
  expect(color(0)).toEqual(red)
  expect(color(2)).toEqual(blue)
})

it('clears a multi-cel selection without selecting the active cel', () => {
  const document = createDocument('timeline focus', 3, 1, 'rgba')
  const timeline = ensureAnimationDocument(document)
  const first = timeline.activeFrameId
  const second = addBlankAnimationFrame(document)
  const store = useWorkspace.getState()
  store.addSession(document)
  store.selectAnimationCell(animationCelKey(document.activeLayerId, first))
  store.selectAnimationCell(animationCelKey(document.activeLayerId, second), 'toggle')
  expect(current().selectedAnimationCellKeys).toHaveLength(2)
  current().tool = 'selection'
  current().selectionKind = 'rectangle'
  marquee(true)
  expect(current().selectedAnimationFrameIds).toEqual([])
  expect(current().animationCellSelectionExplicit).toBe(false)
  expect(current().document.animation?.activeFrameId).toBe(second)
})
