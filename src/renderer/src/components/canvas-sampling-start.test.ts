import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { CanvasInputState } from '@/core/canvas-input'
import { useWorkspace } from '@/store/workspace'
import { createCanvasSamplingStart } from './canvas-sampling-start'

beforeEach(() => useWorkspace.setState({ sessions: [], activeId: null }))

describe('sampling after pointer-down changes the active target', () => {
  it.each([0, 2])('reads the current session and previous color at sample time (button %i)', (button) => {
    useWorkspace.getState().addSession(createDocument('sample target', 8, 8, 'rgba'))
    let session = useWorkspace.getState().sessions[0]
    const initial = session
    const sampled = { r: 12, g: 34, b: 56, a: 255 }
    const begin = vi.fn()
    const sampler = vi.fn(() => () => sampled)
    const setPrimaryColor = vi.fn()
    const setSecondaryColor = vi.fn()
    const inputRef = { current: new CanvasInputState() }
    const start = createCanvasSamplingStart({
      canvasRef: { current: null },
      inputRef,
      queueEyedropperSampleColor: vi.fn(),
      updateEyedropperMagnifier: vi.fn(),
      updateRotationIndicator: vi.fn(),
      liveViewRef: { current: session.view },
      freeTileAtPoint: () => undefined,
      tilemapCellAtPoint: () => undefined,
      hideEyedropperMagnifier: vi.fn(),
      draw: vi.fn(),
      cursorCompositePointSamplerFor: sampler,
      eyedropperLens: { begin }
    })
    const { sampleAtPoint } = start({
      event: { button, pointerId: 1, clientX: 1, clientY: 1, currentTarget: document.createElement('canvas') } as React.PointerEvent<HTMLCanvasElement>,
      point: { x: 1, y: 1 },
      readSession: () => session,
      state: { ...useWorkspace.getState(), setPrimaryColor, setSecondaryColor }
    })
    // Pointer-down can activate a tile target after constructing this callback.
    session = { ...session, primaryColor: { r: 99, g: 0, b: 0, a: 255 }, secondaryColor: { r: 0, g: 99, b: 0, a: 255 } }
    sampleAtPoint()
    expect(sampler).toHaveBeenCalledWith(session)
    expect(sampler).not.toHaveBeenCalledWith(initial)
    expect(begin).toHaveBeenCalledWith(button === 2 ? session.secondaryColor : session.primaryColor)
    expect(button === 2 ? setSecondaryColor : setPrimaryColor).toHaveBeenCalledWith(sampled)
    expect(inputRef.current.drag?.kind).toBe('sample-color')
  })
})
