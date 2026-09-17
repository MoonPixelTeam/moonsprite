import { expect, it, vi } from 'vitest'
import { DEFAULT_TABLET_PREFERENCES, parseTabletPreferences } from '@/core/file-preferences'
import type { DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document'
import { deviceSampleUsesSecondary, deviceTemporaryTool, withDeviceTemporaryTool } from './canvas-device-tools'
import { createCanvasSamplingStart } from './canvas-sampling-start'

it('uses the stored eraser size without modifying the pencil session, and keeps a live eraser size', () => {
  const session = { tool: 'pencil', brushSize: 3, brushProfiles: { eraser: { brushSize: 27 } } } as DocumentSession
  const temporary = withDeviceTemporaryTool(session, 'eraser')
  expect(temporary.brushSize).toBe(27)
  expect(temporary.tool).toBe('eraser')
  expect(session.brushSize).toBe(3)
  expect(session.tool).toBe('pencil')
  expect(withDeviceTemporaryTool(session, null)).toBe(session)
  const eraser = { ...session, tool: 'eraser' as const, brushSize: 41 }
  expect(withDeviceTemporaryTool(eraser, 'eraser').brushSize).toBe(41)
})

it('handles pen-tip precedence, held barrel buttons, disabled pen input, and mouse right-click preferences', () => {
  const preferences = { ...DEFAULT_TABLET_PREFERENCES, rightClickAction: 'foreground-eyedropper' as const }
  expect(deviceTemporaryTool({ pointerType: 'pen', button: 5, buttons: 32 }, preferences)).toBe('eraser')
  expect(deviceTemporaryTool({ pointerType: 'pen', button: -1, buttons: 34 }, preferences)).toBe('eraser')
  expect(deviceTemporaryTool({ pointerType: 'pen', button: -1, buttons: 2 }, { ...DEFAULT_TABLET_PREFERENCES, barrelButtonAction: 'eyedropper' })).toBe('eyedropper')
  expect(deviceTemporaryTool({ pointerType: 'mouse', button: 2, buttons: 2 }, preferences)).toBe('eyedropper')
  expect(deviceTemporaryTool({ pointerType: 'mouse', button: 2, buttons: 2 }, DEFAULT_TABLET_PREFERENCES)).toBeNull()
  expect(deviceTemporaryTool({ pointerType: 'pen', button: 2, buttons: 2 }, { ...preferences, api: 'disabled' })).toBeNull()
  expect(deviceTemporaryTool({ pointerType: 'mouse', button: 0, buttons: 1 }, preferences)).toBeNull()
  expect(deviceSampleUsesSecondary(2, null)).toBe(true)
  expect(deviceSampleUsesSecondary(2, 'eyedropper')).toBe(false)
})

it('defaults existing preferences to background drawing and retains the opt-in', () => {
  expect(parseTabletPreferences('{}').rightClickAction).toBe('background')
  expect(parseTabletPreferences('{"rightClickAction":"invalid"}').rightClickAction).toBe('background')
  expect(parseTabletPreferences('{"rightClickAction":"foreground-eyedropper"}').rightClickAction).toBe('foreground-eyedropper')
})

it('routes a right-button temporary eyedropper to foreground and preserves temporary sampling on release', () => {
  const canvas = document.createElement('canvas')
  const input = new CanvasInputState()
  input.setTemporaryTool(7, 'eyedropper')
  const primary = { r: 1, g: 2, b: 3, a: 255 }, secondary = { r: 4, g: 5, b: 6, a: 255 }
  const sampled = { r: 10, g: 20, b: 30, a: 255 }
  const session = { document: createDocument('sample', 4, 4, 'rgba'), primaryColor: primary, secondaryColor: secondary } as DocumentSession
  const queue = vi.fn()
  const start = createCanvasSamplingStart({
    canvasRef: { current: null }, inputRef: { current: input }, queueEyedropperSampleColor: queue,
    updateEyedropperMagnifier: vi.fn(), updateRotationIndicator: vi.fn(), liveViewRef: { current: { rotation: 0 } },
    freeTileAtPoint: () => undefined, hideEyedropperMagnifier: vi.fn(), draw: vi.fn(),
    tilemapCellAtPoint: () => undefined, cursorCompositePointSamplerFor: () => () => sampled,
    eyedropperLens: { begin: vi.fn() }
  } as unknown as Parameters<typeof createCanvasSamplingStart>[0])
  const state = { setPrimaryColor: vi.fn(), setSecondaryColor: vi.fn() }
  start({ event: { button: 2, pointerId: 7, currentTarget: canvas, clientX: 1, clientY: 1 }, point: { x: 1, y: 1 }, readSession: () => session, state } as unknown as Parameters<typeof start>[0]).sampleAtPoint(false)
  expect(input.drag).toMatchObject({ kind: 'sample-color', sampleSecondary: false, temporarySampling: true })
  expect(state.setSecondaryColor).not.toHaveBeenCalled()
  expect(state.setPrimaryColor).toHaveBeenCalledWith(sampled)
})
