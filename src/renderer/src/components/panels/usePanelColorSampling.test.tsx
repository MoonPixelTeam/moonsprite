import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { useWorkspace } from '@/store/workspace'
import { samplePanelColor, usePanelColorSampling } from './usePanelColorSampling'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('maps scaled and panned artwork to source pixels without sampling the panel background', () => {
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 400, 200))
  const color = { r: 17, g: 45, b: 89, a: 128 }
  const read = vi.fn(() => color)
  const source = { width: 4, height: 2, viewportWidth: 200, viewportHeight: 100, originX: 40, originY: 20, scale: 10, read }
  expect(samplePanelColor(canvas, source, 231, 261)).toEqual(color)
  expect(read).toHaveBeenCalledWith(2, 1)
  read.mockClear()
  expect(samplePanelColor(canvas, source, 120, 220)).toBeNull()
  expect(samplePanelColor(canvas, source, 260, 260)).toBeNull()
  expect(samplePanelColor(canvas, source, 90, 260)).toBeNull()
  expect(read).not.toHaveBeenCalled()
})

it.each(['alt', 'eyedropper'] as const)('samples on click and drag with %s without starting a pan or changing tools', (mode) => {
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 7 })
  const previous = useWorkspace.getState()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('panel sample', 2, 2, 'rgba'))
  useWorkspace.getState().setTool(mode === 'alt' ? 'pencil' : 'eyedropper')
  const color = { r: 25, g: 50, b: 75, a: 128 }
  const sample = vi.fn(() => color)
  const pan = vi.fn()
  function Harness() {
    const sampling = usePanelColorSampling(sample)
    return <div data-testid="panel" onPointerDown={event => { if (!sampling.start(event)) pan() }} onPointerMove={sampling.move} onPointerUp={sampling.finish} onLostPointerCapture={sampling.cancel} />
  }
  try {
    const view = render(<Harness />)
    const panel = view.getByTestId('panel')
    panel.setPointerCapture = vi.fn()
    panel.hasPointerCapture = () => true
    panel.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(panel, { button: 0, altKey: mode === 'alt', clientX: 20, clientY: 30 })
    expect(useWorkspace.getState().sessions[0].primaryColor).toEqual(color)
    fireEvent.pointerMove(panel, { clientX: 21, clientY: 31 })
    expect(sample).toHaveBeenCalledTimes(2)
    fireEvent.pointerUp(panel)
    fireEvent.pointerMove(panel)
    expect(sample).toHaveBeenCalledTimes(2)
    expect(pan).not.toHaveBeenCalled()
    expect(useWorkspace.getState().sessions[0].tool).toBe(mode === 'alt' ? 'pencil' : 'eyedropper')
    fireEvent.pointerDown(panel, { button: 2, altKey: mode === 'alt' })
    expect(useWorkspace.getState().sessions[0].secondaryColor).toEqual(color)
    act(() => window.dispatchEvent(new Event('blur')))
    sample.mockClear()
    fireEvent.pointerMove(panel)
    expect(sample).not.toHaveBeenCalled()
    fireEvent.pointerDown(panel, { button: 1, altKey: true })
    expect(pan).toHaveBeenCalledOnce()
    view.unmount()
  } finally { useWorkspace.setState(previous) }
})
