import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import type { CanvasDragState } from '@/core/canvas-input'
import { sessionFromDocument } from '@/store/workspace-session'
import { useCanvasLayerFeedback } from './useCanvasLayerFeedback'

afterEach(cleanup)

it('keeps selection content on grid units even near smart alignment targets and respects axis lock', () => {
  const session = sessionFromDocument(createDocument('grid move', 64, 64, 'rgba'))
  session.view.showGrid = true
  session.view.grid = { x: 2, y: 3, width: 8, height: 6 }
  const { result } = renderHook(() => useCanvasLayerFeedback({
    session, liveViewRef: { current: { ...session.view, zoom: 1 } }, scheduleDraw: vi.fn(),
    moveLayerClickFlashEnabled: false, moveLayerClickFlashDuration: 120, moveLayerContentPreviewEnabled: false,
    alignmentPreferences: { gridAlignmentEnabled: true, smartAlignmentEnabled: true, alignmentGuidesVisible: true, alignmentThreshold: 8 }
  }))
  const drag = {
    ...result.current.alignmentDragFields([{ x: 2, y: 3, width: 8, height: 6 }], [], true),
    alignmentTargetBounds: [{ x: 13, y: 10, width: 8, height: 6 }]
  } as CanvasDragState
  expect(result.current.alignedDragTranslation(drag, { x: 9, y: 7 })).toEqual({ x: 8, y: 6 })
  expect(result.current.alignedDragTranslation(drag, { x: -9, y: -7 })).toEqual({ x: -8, y: -6 })
  drag.axisLock = 'x'
  drag.alignmentMovingBounds = [{ x: 4, y: 5, width: 8, height: 6 }]
  expect(result.current.alignedDragTranslation(drag, { x: 9, y: 0 })).toEqual({ x: 6, y: 0 })
  session.view.showGrid = false
  drag.alignmentSmartEnabled = false
  expect(result.current.alignedDragTranslation(drag, { x: 9, y: 0 })).toEqual({ x: 9, y: 0 })
})
