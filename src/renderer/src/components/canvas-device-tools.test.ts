import { expect, it, vi } from 'vitest'
import { DEFAULT_TABLET_PREFERENCES, parseTabletPreferences, RIGHT_CLICK_ACTIONS } from '@/core/file-preferences'
import type { DocumentSession } from '@/store/workspace'
import { CanvasInputState } from '@/core/canvas-input'
import { createDocument } from '@/core/document'
import { deviceSampleUsesSecondary, deviceTemporaryTool, withDeviceTemporaryTool, rightClickToolEvent } from './canvas-device-tools'
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


it('persists all seven actions and maps right gestures to primary tool input without changing left clicks', () => {
  const tools = [null, 'eyedropper', 'eraser', 'hand', 'selection', 'selection', 'move']
  for (const [index, action] of RIGHT_CLICK_ACTIONS.entries()) {
    const preferences = parseTabletPreferences(JSON.stringify({ rightClickAction: action }))
    expect(preferences.rightClickAction).toBe(action)
    expect(deviceTemporaryTool({ pointerType: 'mouse', button: 2, buttons: 2 }, preferences)).toBe(tools[index])
    expect(deviceTemporaryTool({ pointerType: 'mouse', button: -1, buttons: 2 }, preferences)).toBe(tools[index])
    expect(deviceTemporaryTool({ pointerType: 'mouse', button: 0, buttons: 1 }, preferences)).toBeNull()
    const down = { button: 2, buttons: 2 }
    expect(rightClickToolEvent(down, action)).toMatchObject(action === 'background' ? down : { button: 0, buttons: 1 })
    expect(down).toEqual({ button: 2, buttons: 2 })
    expect(rightClickToolEvent({ button: 2, buttons: 0 }, action).button).toBe(action === 'background' ? 2 : 0)
  }
})

it('uses rectangle/lasso and single-layer auto-selection without changing stored settings', () => {
  const stored = { tool: 'pencil', selectionKind: 'ellipse', selectionMode: 'subtract', moveKind: 'slice', moveAutoSelect: false,
    selectedLayerIds: ['one', 'two'], selectedGroupIds: ['group'], selectedAnimationFrameIds: ['frame'], selectedAnimationCellKeys: ['cell'] } as unknown as DocumentSession
  for (const action of ['rectangle', 'lasso'] as const) {
    expect(withDeviceTemporaryTool(stored, 'selection', action)).toMatchObject({ tool: 'selection', selectionKind: action, selectionMode: 'replace' })
  }
  expect(withDeviceTemporaryTool(stored, 'move', 'select-layer-move')).toMatchObject({ tool: 'move', moveKind: 'move', moveAutoSelect: true,
    selectedLayerIds: [], selectedGroupIds: [], selectedAnimationFrameIds: [], selectedAnimationCellKeys: [] })
  expect(stored).toMatchObject({ tool: 'pencil', selectionKind: 'ellipse', moveAutoSelect: false, selectedLayerIds: ['one', 'two'] })
})

it('clears right-click routing on release, cancel, and device reset', () => {
  const input = new CanvasInputState()
  for (const clear of [() => input.clearTemporaryTool(7), () => input.resetInteraction(), () => input.resetPointerDeviceState()]) {
    input.setTemporaryTool(7, 'selection')
    input.temporaryRightClickAction = 'lasso'
    clear()
    expect(input.temporaryTool).toBeNull()
    expect(input.temporaryRightClickAction).toBeNull()
  }
})

it('preserves inherited React event methods when routing a primary tool action', () => {
  const preventDefault = vi.fn()
  const event = Object.assign(Object.create({ preventDefault }), { button: 2, buttons: 2 })
  rightClickToolEvent(event, 'eraser').preventDefault()
  expect(preventDefault).toHaveBeenCalledOnce()
})
