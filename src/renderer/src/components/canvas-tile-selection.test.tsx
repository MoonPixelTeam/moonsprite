import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasInputState, type CanvasDragState } from '@/core/canvas-input'
import { createDocument } from '@/core/document-model'
import { selectionContains } from '@/core/selection'
import { useWorkspace } from '@/store/workspace'
import { useCanvasRotatableGeometry } from './useCanvasRotatableGeometry'
import { useCanvasTileTarget } from './useCanvasTileTarget'
import { renderCanvasSelectionPreview } from './canvas-render-selection-preview'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); useWorkspace.setState({ sessions: [], activeId: null }); localStorage.clear() })

it.each(['rectangle', 'ellipse'] as const)('shows complete non-square tiles throughout %s creation, matching the committed selection', async selectionKind => {
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })) })
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('tile preview', 12, 12, 'rgba'))
  await useWorkspace.getState().createTilemapLayer({ name: 'Terrain', tileWidth: 2, tileHeight: 3 })
  const session = useWorkspace.getState().sessions[0]
  Object.assign(session, { tilemapMode: 'paint', tool: 'selection', selectionKind })
  const input = new CanvasInputState()
  const tiles = useCanvasTileTarget({ session })
  const modifiers = { fromCenter: false, proportional: false, rotate: false }
  const { result } = renderHook(() => useCanvasRotatableGeometry({
    session, inputRef: { current: input }, liveViewRef: { current: session.view },
    selectionMarqueeModifierState: () => modifiers,
    alignmentPreferences: { gridAlignmentEnabled: false, smartAlignmentEnabled: false, alignmentGuidesVisible: false, alignmentThreshold: 4 },
    quickSelectionCellAt: () => null, tilemapPaintSelectionForIncoming: tiles.tilemapPaintSelectionForIncoming,
    scheduleDraw: vi.fn(), selectionCornerRadius: 0, symmetryCenter: session.symmetryCenter
  }))
  const drag: CanvasDragState = { kind: 'marquee', moved: true, start: { x: 1, y: 1 }, last: { x: 1, y: 1 }, selectionMode: 'replace' }
  for (const point of [{ x: 1, y: 1 }, { x: 5, y: 7 }]) {
    result.current.updateMarqueePreview(drag, point, modifiers)
    const selected = drag.marqueePreviewSelection!
    expect(selected).toBeTruthy()
    expect(selected.x % 2).toBe(0)
    expect(selected.y % 3).toBe(0)
    expect(selected.width % 2).toBe(0)
    expect(selected.height % 3).toBe(0)
    for (let y = 0; y < 12; y += 3) for (let x = 0; x < 12; x += 2) {
      const included = selectionContains(selected, x, y)
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) expect(selectionContains(selected, x + dx, y + dy)).toBe(included)
    }
    const drawTiles = vi.fn(), drawPixels = vi.fn()
    renderCanvasSelectionPreview({
      inputRef: { current: { drag, sampling: true, pointer: { visible: false } } }, session, document: session.document,
      view: session.view, repeatCopies: [], drawSelectionPathPreview: drawTiles, drawSelectionPathPreviewPoints: drawPixels
    } as unknown as Parameters<typeof renderCanvasSelectionPreview>[0])
    expect(drawTiles).toHaveBeenCalledOnce()
    expect(drawPixels).not.toHaveBeenCalled()
  }
  const live = drag.marqueePreviewSelection
  result.current.updateMarqueePreview(drag, drag.last, modifiers, true)
  expect(drag.previewSelection).toEqual(live)
})
