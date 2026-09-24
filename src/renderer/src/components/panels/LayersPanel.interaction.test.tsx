import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument, createLayer, createLayerMask, getActiveLayer } from '@/core/document'
import { addBlankAnimationFrame, animationCelAt, ensureAnimationDocument, animationCelKey, linkAnimationFrameCels } from '@/core/animation'
import { LayersPanel } from './LayersPanel'
import { useWorkspace } from '@/store/workspace'
import { notifyAnimationCelThumbnailPreview, notifyLayerMaskThumbnailPreview } from '@/core/canvas-preview-lifecycle'
import { layersPanelRenderKey } from '@/core/panel-render-keys'
import { startCanvasSelection } from '@/components/layer-panel-reveal'

describe('LayersPanel timeline focus interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    useWorkspace.setState({ sessions: [], activeId: null })
  })

  it.each(['cell', 'frame'] as const)('moves playback highlighting away from the previously selected %s', async kind => {
    const document = createDocument('playback highlight regression', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.frames[0]!.id
    addBlankAnimationFrame(document)
    const mask = createLayerMask(layer.id, 2, 2)
    timeline.layerMasks = [{ layerId: layer.id, frameId: firstFrameId, mask }]
    useWorkspace.getState().addSession(document)
    if (kind === 'cell') useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    else useWorkspace.getState().selectAnimationFrame(firstFrameId)
    const selectedFrames = [...useWorkspace.getState().sessions[0]!.selectedAnimationFrameIds]
    const selectedCells = [...useWorkspace.getState().sessions[0]!.selectedAnimationCellKeys]
    useWorkspace.getState().setAnimationPlaying(true)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    for (let step = 0; step < 3; step++) {
      await act(async () => { useWorkspace.getState().advanceAnimationFrame() })
      const session = useWorkspace.getState().sessions[0]!
      view.rerender(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
      const activeFrameId = ensureAnimationDocument(session.document).activeFrameId
      for (const frame of timeline.frames) {
        const cell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, frame.id)}"]`)
        expect(cell).not.toBeNull()
        expect(cell!.classList.contains('active-frame')).toBe(frame.id === activeFrameId)
        if (frame.id !== activeFrameId) {
          expect(cell).not.toHaveClass('current-cel')
          expect(cell).not.toHaveClass('selected-cel')
          const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, frame.id)}"]`)
          expect(maskCell).not.toBeNull()
          expect(maskCell).not.toHaveClass('active-frame')
        }
      }
      expect(session.selectedAnimationFrameIds).toEqual(selectedFrames)
      expect(session.selectedAnimationCellKeys).toEqual(selectedCells)
    }
  })

  it('links selected layer-mask cells from the context menu', async () => {
    const document = createDocument('mask linking interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.frames[0]!
    const secondFrameId = addBlankAnimationFrame(document)
    const firstMask = createLayerMask(layer.id, 2, 2)
    const secondMask = createLayerMask(layer.id, 2, 2)
    timeline.layerMasks = [
      { layerId: layer.id, frameId: firstFrame.id, mask: firstMask },
      { layerId: layer.id, frameId: secondFrameId, mask: secondMask }
    ]
    useWorkspace.getState().addSession(document)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const firstCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, firstFrame.id)}"]`)
    const secondCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)
    if (!firstCell || !secondCell) throw new Error('mask cells were not rendered')

    await act(async () => {
      fireEvent.click(firstCell)
      fireEvent.click(secondCell, { ctrlKey: true })
    })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    await act(async () => { fireEvent.contextMenu(secondCell, { clientX: 40, clientY: 40 }) })
    const linkButton = [...view.baseElement.querySelectorAll<HTMLButtonElement>('.animation-context-menu .context-menu-item')]
      .find((button) => button.textContent?.includes('链接图层蒙版单元格'))
    if (!linkButton) throw new Error('link mask cells command was not rendered')
    expect(linkButton).not.toBeDisabled()

    await act(async () => { fireEvent.click(linkButton) })

    expect(secondMask.linkedMaskId).toBe(firstMask.id)
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, firstFrame.id)}"]`)).toHaveClass('linked-cel')
    expect(view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)).toHaveClass('linked-cel')
    expect(view.container.querySelector('[data-linked-cel-block]')).toBeTruthy()
  })

  it('redraws every linked mask thumbnail during a live canvas preview', async () => {
    localStorage.setItem('moonsprite.layers.display-density', 'detailed')
    const putImageData = vi.fn()
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MoonSpriteTest')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData
    }) as unknown as CanvasRenderingContext2D)
    const document = createDocument('live linked mask thumbnails', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.frames[0]!
    const secondFrameId = addBlankAnimationFrame(document)
    const firstMask = createLayerMask(layer.id, 2, 2)
    const secondMask = createLayerMask(layer.id, 2, 2)
    secondMask.linkedMaskId = firstMask.id
    timeline.layerMasks = [
      { layerId: layer.id, frameId: firstFrame.id, mask: firstMask },
      { layerId: layer.id, frameId: secondFrameId, mask: secondMask }
    ]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, firstFrame.id))

    render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    await waitFor(() => expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(2))
    const rendersBeforePreview = putImageData.mock.calls.length
    firstMask.pixels.fill(0)
    for (let offset = 3; offset < firstMask.pixels.length; offset += 4) firstMask.pixels[offset] = 255

    act(() => { notifyLayerMaskThumbnailPreview(document.id, firstMask.id) })

    await waitFor(() => expect(putImageData.mock.calls.length - rendersBeforePreview).toBeGreaterThanOrEqual(2))
    const linkedPreviews = putImageData.mock.calls.slice(rendersBeforePreview)
    expect(linkedPreviews.filter(([image]) => image.data[0] === 0 && image.data[3] === 255).length).toBeGreaterThanOrEqual(2)
  })

  it('redraws every linked ordinary cel thumbnail from the live layer', async () => {
    localStorage.setItem('moonsprite.layers.display-density', 'detailed')
    const putImageData = vi.fn()
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MoonSpriteTest')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData
    }) as unknown as CanvasRenderingContext2D)
    const document = createDocument('live linked cel thumbnails', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.frames[0]!.id
    const secondFrameId = addBlankAnimationFrame(document)
    expect(linkAnimationFrameCels(document, firstFrameId, secondFrameId, [layer.id])).toBe(true)
    const sourceCel = timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === firstFrameId)!
    useWorkspace.getState().addSession(document)

    render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    await waitFor(() => expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(2))
    const rendersBeforePreview = putImageData.mock.calls.length
    layer.pixels.fill(255)

    act(() => { notifyAnimationCelThumbnailPreview(document.id, sourceCel.id, layer.id) })

    await waitFor(() => expect(putImageData.mock.calls.length - rendersBeforePreview).toBeGreaterThanOrEqual(2))

    const rendersBeforeFill = putImageData.mock.calls.length
    const panelKeyBeforeFill = layersPanelRenderKey(useWorkspace.getState().sessions[0]!)
    act(() => { useWorkspace.getState().fillForeground() })
    expect(layersPanelRenderKey(useWorkspace.getState().sessions[0]!)).toBe(panelKeyBeforeFill)
    await waitFor(() => expect(putImageData.mock.calls.length - rendersBeforeFill).toBeGreaterThanOrEqual(2))

    const rendersBeforeUndo = putImageData.mock.calls.length
    act(() => { useWorkspace.getState().undo() })
    await waitFor(() => expect(putImageData.mock.calls.length - rendersBeforeUndo).toBeGreaterThanOrEqual(2))
  })

  it('redraws pasted thumbnails for selected cells on inactive frames', async () => {
    localStorage.setItem('moonsprite.layers.display-density', 'detailed')
    const renderCounts = new WeakMap<HTMLCanvasElement, number>()
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MoonSpriteTest')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const canvas = this
      return {
        createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: () => renderCounts.set(canvas, (renderCounts.get(canvas) ?? 0) + 1)
      } as unknown as CanvasRenderingContext2D
    })
    const document = createDocument('paste thumbnail refresh', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    const fourthFrameId = addBlankAnimationFrame(document)
    animationCelAt(timeline, layer.id, firstFrameId)!.surface!.pixels.set([255, 0, 0, 255])
    animationCelAt(timeline, layer.id, secondFrameId)!.surface!.pixels.set([0, 0, 255, 255])
    animationCelAt(timeline, layer.id, thirdFrameId)!.surface!.pixels.set([0, 255, 0, 255])
    animationCelAt(timeline, layer.id, fourthFrameId)!.surface!.pixels.set([0, 255, 0, 255])
    timeline.activeFrameId = thirdFrameId
    useWorkspace.getState().addSession(document)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const targetKey = animationCelKey(layer.id, fourthFrameId)
    const targetCanvas = view.container.querySelector<HTMLCanvasElement>(`[data-animation-cel-key="${targetKey}"] canvas`)
    if (!targetCanvas) throw new Error('target cel thumbnail was not rendered')
    await waitFor(() => expect(renderCounts.get(targetCanvas) ?? 0).toBeGreaterThan(0))
    const rendersBeforePaste = renderCounts.get(targetCanvas) ?? 0

    act(() => {
      useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
      useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId), 'toggle')
      useWorkspace.getState().copySelectedAnimationCels()
      useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, thirdFrameId))
      useWorkspace.getState().pasteAnimationCels()
    })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    const updatedTargetCanvas = view.container.querySelector<HTMLCanvasElement>(`[data-animation-cel-key="${targetKey}"] canvas`)
    expect(updatedTargetCanvas).toBe(targetCanvas)
    await waitFor(() => expect(renderCounts.get(updatedTargetCanvas!) ?? 0).toBeGreaterThan(rendersBeforePaste))
  })

  it('keeps populated cel thumbnail canvases mounted while changing the active cell', () => {
    localStorage.setItem('moonsprite.layers.display-density', 'detailed')
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('MoonSpriteTest')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: vi.fn()
    }) as unknown as CanvasRenderingContext2D)
    const document = createDocument('stable cel thumbnails', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    animationCelAt(timeline, layer.id, firstFrameId)!.surface!.pixels.set([255, 0, 0, 255])
    animationCelAt(timeline, layer.id, secondFrameId)!.surface!.pixels.set([0, 0, 255, 255])
    useWorkspace.getState().addSession(document)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const firstSelector = `[data-animation-cel-key="${animationCelKey(layer.id, firstFrameId)}"] canvas`
    const secondSelector = `[data-animation-cel-key="${animationCelKey(layer.id, secondFrameId)}"] canvas`
    const firstCanvas = view.container.querySelector(firstSelector)
    const secondCanvas = view.container.querySelector(secondSelector)
    expect(firstCanvas).toBeTruthy()
    expect(secondCanvas).toBeTruthy()

    act(() => { useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId)) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    expect(view.container.querySelector(firstSelector)).toBe(firstCanvas)
    expect(view.container.querySelector(secondSelector)).toBe(secondCanvas)
  })

  it('keeps explicit layer activity distinct from mask markers', async () => {
    const document = createDocument('timeline focus interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const row = view.container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)
    if (!row) throw new Error('layer row was not rendered')
    await act(async () => {
      const target = row.querySelector<HTMLElement>('.layer-name') ?? row
      fireEvent.pointerDown(target, { button: 0 })
    })
    await act(async () => { useWorkspace.getState().selectLayer(layer.id) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const cell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    expect(cell).toHaveClass('active-frame')
    expect(cell).not.toHaveClass('selected-cel')
  })

  it('does not flash a content marker when an empty cel is selected', () => {
    const document = createDocument('empty selected cel', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const key = animationCelKey(layer.id, timeline.activeFrameId)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationCell(key)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const cell = view.container.querySelector(`[data-animation-cel-key="${key}"]`)
    expect(cell).toBeTruthy()
    expect(cell?.querySelector('.cel-content-marker')).toBeNull()
  })

  it('treats a held cel press as a single-cell gesture over a multi-layer selection', async () => {
    const document = createDocument('single cel press over layer selection', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    await act(async () => { await useWorkspace.getState().addLayer() })
    const selectedSession = useWorkspace.getState().sessions[0]!
    const secondLayer = selectedSession.document.layers.find((layer) => layer.id !== firstLayer.id)!
    useWorkspace.getState().selectLayer(firstLayer.id)
    useWorkspace.getState().selectLayer(secondLayer.id, 'toggle')
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const targetCell = view.container.querySelector<HTMLElement>(`[data-animation-cel-key^="${secondLayer.id}:"]`)
    if (!targetCell) throw new Error('target cel was not rendered')

    await act(async () => { fireEvent.pointerDown(targetCell, { button: 0, clientX: 20, clientY: 20 }) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    expect(view.container.querySelector(`[data-layer-id="${firstLayer.id}"]`)).not.toHaveClass('selected')
    expect(view.container.querySelector(`[data-layer-id="${secondLayer.id}"]`)).toHaveClass('active-layer')

    await act(async () => { fireEvent.pointerUp(window, { button: 0, clientX: 20, clientY: 20 }) })
    const after = useWorkspace.getState().sessions[0]!
    expect(after.selectedLayerIds).toEqual([secondLayer.id])
    expect(after.selectedAnimationCellKeys).toEqual([animationCelKey(secondLayer.id, after.document.animation!.activeFrameId)])
  })

  it('keeps the timeline row active for multi-selected linked layers', () => {
    const document = createDocument('multi selected linked layers', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    const secondLayer = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(secondLayer)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    for (const layer of [firstLayer, secondLayer]) {
      const source = timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === firstFrameId)!
      const target = timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === secondFrameId)!
      target.linkedCelId = source.id
      target.surface = source.surface
    }
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayer(firstLayer.id)
    useWorkspace.getState().selectLayer(secondLayer.id, 'toggle')

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    for (const layer of [firstLayer, secondLayer]) {
      expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, firstFrameId)}"]`)).toHaveClass('selected-layer')
      expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)).toHaveClass('selected-layer')
    }
    expect(view.container.querySelectorAll('.animation-linked-cel-block.layer-selected')).toHaveLength(2)
  })

  it('dismisses a timeline selection made during playback on release', async () => {
    const document = createDocument('playback-only timeline selection', 2, 2, 'rgba')
    getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().setAnimationLoop(true)
    useWorkspace.getState().setAnimationPlaying(true)

    const timeline = ensureAnimationDocument(document)
    const frameId = timeline.frames[0]!.id
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const frame = view.container.querySelector<HTMLElement>(`[data-animation-frame-id="${frameId}"]`)
    if (!frame) throw new Error('frame header was not rendered')

    await act(async () => {
      fireEvent.pointerDown(frame, { button: 0, clientX: 20, clientY: 20 })
      fireEvent.pointerUp(window, { button: 0, clientX: 20, clientY: 20 })
    })

    expect(useWorkspace.getState().sessions[0]!.selectedAnimationFrameIds).toEqual([])
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(frame).not.toHaveClass('selected-animation-frame')
    expect(view.container.querySelector('[data-animation-cel-selection]')).toBeNull()
  })

  it('keeps an ordinary cel selection separate from its layer mask row', async () => {
    const document = createDocument('ordinary cel with layer mask', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectLayer(layer.id)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const cel = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    if (!cel) throw new Error('ordinary cel was not rendered')

    await act(async () => { fireEvent.click(cel) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    const maskRow = view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)
    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    expect(maskRow).not.toHaveClass('selected')
    expect(maskRow).not.toHaveClass('active-layer')
    expect(maskCell).not.toHaveClass('selected-cel')
    expect(maskCell).not.toHaveClass('active-mask')
    expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)).toHaveClass('current-cel')

  })

  it('keeps frame focus on the ordinary layer after selecting one of its cels', async () => {
    const document = createDocument('ordinary cel then frame with layer mask', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const ordinaryCell = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layer.id, firstFrameId)}"]`)
    const secondFrameHeader = view.container.querySelector<HTMLElement>(`[data-animation-frame-id="${secondFrameId}"]`)
    if (!ordinaryCell || !secondFrameHeader) throw new Error('timeline targets were not rendered')

    await act(async () => {
      fireEvent.click(ordinaryCell)
      fireEvent.click(secondFrameHeader)
    })
    const selectedSession = useWorkspace.getState().sessions[0]!
    expect(selectedSession.selectedAnimationFrameIds).toEqual([secondFrameId])
    expect(selectedSession.selectedAnimationMaskCellKeys).toEqual([])
    expect(selectedSession.selectedAnimationMaskRowKeys).toEqual([])
    expect(selectedSession.activeLayerMaskId).toBeNull()
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).toHaveClass('active-layer')
    expect(view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)).not.toHaveClass('active-layer')
    const ordinaryFrameCell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)
    const maskFrameCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)
    expect(ordinaryFrameCell).toHaveClass('active-frame', 'selected-animation-frame')
    expect(maskFrameCell).toHaveClass('active-frame')
    expect(maskFrameCell).toHaveClass('selected-animation-frame')
    expect(maskFrameCell).not.toHaveClass('selected-cel')
    expect(maskFrameCell?.querySelector('.cel-mask-marker')).toBeNull()
    expect(view.container.querySelector('.layer-animation-grid')).toHaveStyle({ '--active-layer-row': '1' })
  })

  it('keeps current-frame activity on a mask row after canvas selection', async () => {
    const document = createDocument('canvas selection mask activity', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.activeFrameId))
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    await act(async () => { startCanvasSelection(document.id) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    expect(maskCell).toHaveClass('active-frame')
  })

  it('projects the playback frame onto every mask row', async () => {
    const document = createDocument('playback mask activity', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.activeFrameId))
    useWorkspace.getState().setAnimationLoop(true)
    useWorkspace.getState().setAnimationPlaying(true)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    const ordinaryCell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    expect(maskCell).toBeTruthy()
    expect(ordinaryCell).toHaveClass('active-frame')
    expect(maskCell).toHaveClass('active-frame')
  })

  it('keeps the focused mask activity visible while playback advances', async () => {
    const document = createDocument('focused playback mask activity', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, timeline.activeFrameId))
    const secondFrameId = ensureAnimationDocument(document).frames[1]!.id
    useWorkspace.getState().setActiveAnimationFrame(secondFrameId)
    useWorkspace.getState().setAnimationPlaybackMode('once')
    useWorkspace.getState().setAnimationPlaying(true)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    if (!maskCell) throw new Error('focused playback mask cell was not rendered')
    expect(useWorkspace.getState().sessions[0]!.activeLayerMaskId).not.toBeNull()
    expect(maskCell).toHaveClass('active-frame')
    expect(maskCell).toHaveClass('active-mask')

    await act(async () => { useWorkspace.getState().advanceAnimationFrame() })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const nextMaskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, ensureAnimationDocument(useWorkspace.getState().sessions[0]!.document).activeFrameId)}"]`)
    if (!nextMaskCell) throw new Error('advanced playback mask cell was not rendered')
    expect(nextMaskCell).toHaveClass('active-frame')
  })

  it('keeps mask activity when playback follows a selected frame', async () => {
    const document = createDocument('frame-focused playback mask activity', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    const current = useWorkspace.getState().sessions[0]!
    const currentTimeline = ensureAnimationDocument(current.document)
    const firstFrame = currentTimeline.frames[0]!
    const secondFrame = currentTimeline.frames[1]!
    useWorkspace.getState().createLayerMask(currentTimeline.cels.find((cel) => cel.frameId === firstFrame.id)!.id)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, firstFrame.id))
    useWorkspace.getState().selectAnimationFrame(secondFrame.id)
    useWorkspace.getState().setAnimationPlaying(true)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const activeFrameId = ensureAnimationDocument(useWorkspace.getState().sessions[0]!.document).activeFrameId
    const maskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, activeFrameId)}"]`)
    if (!maskCell) throw new Error('frame-focused playback mask cell was not rendered')
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationMaskRowKeys).toEqual([`layer:${layer.id}`])
    expect(maskCell).toHaveClass('active-frame')
  })

  it('does not leave a mask-cell marker when disabling a selected frame during playback', async () => {
    const document = createDocument('disabled playback mask marker', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    const timeline = ensureAnimationDocument(useWorkspace.getState().sessions[0]!.document)
    const firstFrameId = timeline.frames[0]!.id
    const secondFrameId = timeline.frames[1]!.id
    useWorkspace.getState().createLayerMask(timeline.cels.find((cel) => cel.frameId === firstFrameId)!.id)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().setAnimationLoop(true)
    useWorkspace.getState().setAnimationPlaying(true)
    useWorkspace.getState().setSelectedAnimationFramesDisabled(true)
    expect(useWorkspace.getState().sessions[0]!.activeLayerMaskId).not.toBeNull()
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationMaskCellKeys).toEqual([animationCelKey(layer.id, firstFrameId)])
    expect(useWorkspace.getState().sessions[0]!.document.animation?.activeFrameId).toBe(secondFrameId)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const disabledMaskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, firstFrameId)}"]`)
    const activeMaskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)
    if (!disabledMaskCell || !activeMaskCell) throw new Error('mask cells were not rendered')
    expect(disabledMaskCell).not.toHaveClass('active-frame', 'selected-animation-frame', 'active-mask', 'selected-cel')
    expect(activeMaskCell).toHaveClass('active-frame')

    act(() => { useWorkspace.getState().setSelectedAnimationFramesDisabled(false) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(useWorkspace.getState().sessions[0]!.activeLayerMaskId).not.toBeNull()
    expect(activeMaskCell).toHaveClass('active-frame')
  })

  it('keeps the paused current mask frame active after disabling it', () => {
    const document = createDocument('disabled paused current mask frame', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    timeline.layerMasks = [
      { layerId: layer.id, frameId: firstFrameId, mask: createLayerMask(layer.id, 2, 2) },
      { layerId: layer.id, frameId: secondFrameId, mask: createLayerMask(layer.id, 2, 2) },
    ]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, secondFrameId))
    useWorkspace.getState().selectAnimationFrame(secondFrameId)
    useWorkspace.getState().setSelectedAnimationFramesDisabled(true)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)
    if (!maskCell) throw new Error('paused disabled mask cell was not rendered')
    expect(useWorkspace.getState().sessions[0]!.animationPlaying).toBe(false)
    expect(maskCell).toHaveClass('active-frame', 'selected-animation-frame')
    expect(maskCell).not.toHaveClass('active-mask')

    act(() => { useWorkspace.getState().setAnimationPlaying(true) })
    act(() => { useWorkspace.getState().pauseAnimationAtCurrentFrame() })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const firstMaskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, firstFrameId)}"]`)
    if (!firstMaskCell) throw new Error('first mask cell was not rendered')
    expect(useWorkspace.getState().sessions[0]!.document.animation?.activeFrameId).toBe(firstFrameId)
    expect(firstMaskCell).toHaveClass('active-frame')
  })

  it('keeps playback activity after selecting and disabling another frame', () => {
    const document = createDocument('disable selected frame during playback', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    const thirdFrameId = addBlankAnimationFrame(document)
    timeline.layerMasks = [firstFrameId, secondFrameId, thirdFrameId].map((frameId) => ({
      layerId: layer.id,
      frameId,
      mask: createLayerMask(layer.id, 2, 2),
    }))
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().setAnimationLoop(true)
    useWorkspace.getState().setAnimationPlaying(true)
    useWorkspace.getState().selectAnimationFrame(thirdFrameId)
    useWorkspace.getState().setSelectedAnimationFramesDisabled(true)

    const session = useWorkspace.getState().sessions[0]!
    const activeFrameId = session.document.animation!.activeFrameId
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const activeMaskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, activeFrameId)}"]`)
    const activeCel = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layer.id, activeFrameId)}"]`)
    if (!activeMaskCell || !activeCel) throw new Error('active playback cells were not rendered')
    expect(activeFrameId).toBe(firstFrameId)
    expect(activeMaskCell).toHaveClass('active-frame')
    expect(activeCel).toHaveClass('active-frame')

    useWorkspace.getState().setSelectedAnimationFramesDisabled(false)
    const afterEnable = useWorkspace.getState().sessions[0]!
    const enabledActiveFrameId = afterEnable.document.animation!.activeFrameId
    view.rerender(<I18nProvider><LayersPanel session={afterEnable} /></I18nProvider>)
    const enabledActiveCel = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layer.id, enabledActiveFrameId)}"]`)
    if (!enabledActiveCel) throw new Error('active playback cel was not rendered after enabling a frame')
    expect(enabledActiveFrameId).toBe(firstFrameId)
    expect(enabledActiveCel).toHaveClass('active-frame')
  })

  it('keeps an empty mask slot blank while allowing it to be selected', async () => {
    const document = createDocument('select empty mask slot', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    timeline.layerMasks = [{ layerId: layer.id, frameId: firstFrameId, mask: createLayerMask(layer.id, 2, 2) }]
    useWorkspace.getState().addSession(document)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const secondFrameHeader = view.container.querySelector<HTMLElement>(`[data-animation-frame-id="${secondFrameId}"]`)
    const emptyMaskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)
    if (!secondFrameHeader || !emptyMaskCell) throw new Error('empty mask timeline slot was not rendered')

    await act(async () => { fireEvent.click(secondFrameHeader) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(emptyMaskCell.querySelector('.cel-mask-marker')).toBeNull()

    await act(async () => {
      fireEvent.pointerDown(emptyMaskCell, { button: 0, clientX: 20, clientY: 20 })
      fireEvent.pointerUp(window, { button: 0, clientX: 20, clientY: 20 })
    })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationMaskCellKeys).toEqual([animationCelKey(layer.id, secondFrameId)])
    expect(useWorkspace.getState().sessions[0]!.activeLayerMaskId).toBeNull()
    expect(view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"]`)).toHaveClass('selected-cel')
    expect(view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, secondFrameId)}"] .cel-mask-marker`)).toBeNull()
    expect(view.container.querySelector('[data-animation-cel-selection]')).toBeTruthy()

    const firstFrameHeader = view.container.querySelector<HTMLElement>(`[data-animation-frame-id="${firstFrameId}"]`)
    if (!firstFrameHeader) throw new Error('first frame header was not rendered')
    await act(async () => { fireEvent.click(firstFrameHeader) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationFrameIds).toEqual([firstFrameId])
    expect(view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)).toHaveClass('active-layer')
    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).not.toHaveClass('active-layer')
  })

  it('shows only the active ordinary cel after pasting a frame with multiple masks', async () => {
    const document = createDocument('paste frame with multiple masks', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    await act(async () => { await useWorkspace.getState().addLayer() })
    const session = useWorkspace.getState().sessions[0]!
    const secondLayer = session.document.layers.find((layer) => layer.id !== firstLayer.id)!
    const timeline = ensureAnimationDocument(session.document)
    const sourceFrameId = timeline.activeFrameId
    const firstCel = animationCelAt(timeline, firstLayer.id, sourceFrameId)!
    const secondCel = animationCelAt(timeline, secondLayer.id, sourceFrameId)!
    firstCel.surface!.pixels[3] = 255
    secondCel.surface!.pixels[3] = 255
    timeline.layerMasks = [
      { layerId: firstLayer.id, frameId: sourceFrameId, mask: createLayerMask(firstLayer.id, 2, 2) },
      { layerId: secondLayer.id, frameId: sourceFrameId, mask: createLayerMask(secondLayer.id, 2, 2) },
    ]
    useWorkspace.getState().selectLayer(secondLayer.id)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const sourceFrameHeader = view.container.querySelector<HTMLElement>(`[data-animation-frame-id="${sourceFrameId}"]`)
    if (!sourceFrameHeader) throw new Error('source frame header was not rendered')

    await act(async () => { fireEvent.click(sourceFrameHeader) })
    useWorkspace.getState().copySelectedAnimationFrames()
    await act(async () => { useWorkspace.getState().pasteAnimationFrames() })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    const pastedFrameId = timeline.activeFrameId
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationFrameIds).toEqual([])
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationCellKeys).toEqual([animationCelKey(secondLayer.id, pastedFrameId)])
    await waitFor(() => {
      const activeCell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(secondLayer.id, pastedFrameId)}"]`)
      const inactiveCell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(firstLayer.id, pastedFrameId)}"]`)
      const maskCells = view.container.querySelectorAll(`[data-animation-mask-cel-key$=":${pastedFrameId}"]`)
      expect(activeCell).toHaveClass('current-cel')
      expect(inactiveCell).not.toHaveClass('current-cel')
      expect(maskCells).toHaveLength(2)
      for (const maskCell of maskCells) {
        expect(maskCell).not.toHaveClass('selected-animation-frame')
        expect(maskCell.querySelector('.mask-slot-marker-selected')).toBeNull()
      }
    })
  })

  it('allows ctrl-clicking a mask row while a layer row is selected', async () => {
    const document = createDocument('mixed layer and mask row interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectLayer(layer.id)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskRow = view.container.querySelector<HTMLElement>(`[data-layer-mask-row-owner="${layer.id}"]`)
    if (!maskRow) throw new Error('mask row was not rendered')

    await act(async () => { fireEvent.click(maskRow, { ctrlKey: true }) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).toHaveClass('selected')
    expect(maskRow).toHaveClass('selected')
    const layerCell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    expect(layerCell).toHaveClass('selected-layer')
    expect(layerCell?.querySelector('.cel-content-marker')).toHaveClass('selection-marker')
    expect(maskCell).toHaveClass('selected-layer')
    expect(maskCell?.querySelector('.cel-mask-marker')).toHaveClass('mask-slot-marker-selected')
    const session = useWorkspace.getState().sessions[0]!
    expect(session.selectedLayerIds).toEqual([layer.id])
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${layer.id}`])
  })

  it('allows shift-clicking a mask row while a layer row is selected', async () => {
    const document = createDocument('shift layer and mask row interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectLayer(layer.id)

    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskRow = view.container.querySelector<HTMLElement>(`[data-layer-mask-row-owner="${layer.id}"]`)
    if (!maskRow) throw new Error('mask row was not rendered')

    await act(async () => { fireEvent.click(maskRow, { shiftKey: true }) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).toHaveClass('selected')
    expect(maskRow).toHaveClass('selected')
    expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)).toHaveClass('selected-layer')
    expect(view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)).toHaveClass('selected-layer')
    const session = useWorkspace.getState().sessions[0]!
    expect(session.selectedLayerIds).toEqual([layer.id])
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${layer.id}`])
  })

  it('clears explicit row selection without restoring mask activity', async () => {
    const document = createDocument('implicit cursor interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const session = useWorkspace.getState().sessions[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const row = view.container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)
    if (!row) throw new Error('layer row was not rendered')
    await act(async () => { fireEvent.pointerDown(row.querySelector('.layer-name') ?? row, { button: 0 }) })
    const maskRow = view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)
    if (maskRow) expect(maskRow).not.toHaveClass('active-layer')
    const list = view.container.querySelector('.layer-list')!
    await act(async () => { fireEvent.pointerDown(list, { button: 0 }) })
    const after = useWorkspace.getState().sessions[0]!
    expect(after.selectedAnimationMaskCellKeys).toEqual([])
    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    if (maskCell) {
      expect(maskCell).toHaveClass('active-frame')
      expect(maskCell).not.toHaveClass('mask-frame-activity-suppressed')
    }
    expect(view.container.querySelector('.animation-active-cell-column')).toBeTruthy()
    const afterRow = view.container.querySelector(`[data-layer-id="${layer.id}"]`)
    expect(afterRow).not.toHaveClass('selected')
    expect(afterRow).toHaveClass('active-layer')
  })

  it('keeps mask owner and current marker when blank is clicked', async () => {
    const document = createDocument('mask blank interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const session = useWorkspace.getState().sessions[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    if (!maskCell) throw new Error('mask cell was not rendered')
    await act(async () => { fireEvent.click(maskCell) })
    const list = view.container.querySelector('.layer-list')!
    await act(async () => { fireEvent.pointerDown(list, { button: 0 }) })
    const after = useWorkspace.getState().sessions[0]!
    expect(after.selectedAnimationMaskCellKeys).toEqual([])
    expect(after.activeLayerMaskId).not.toBeNull()
    const maskRow = view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)
    expect(maskRow).toHaveClass('active-layer')
    expect(maskRow).not.toHaveClass('selected')
    view.rerender(<I18nProvider><LayersPanel session={after} /></I18nProvider>)
    const marker = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"] .cel-mask-marker`)
    expect(marker).toHaveClass('mask-slot-marker-selected')
    expect(view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)).toHaveClass('active-mask')
    expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)).not.toHaveClass('current-cel')
    expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)).not.toHaveClass('selected-cel')
    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).not.toHaveClass('cel-owner-active')
    await act(async () => { fireEvent.pointerDown(list, { button: 0 }) })
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationMaskCellKeys).toEqual([])
    expect(view.container.querySelectorAll('.layer-mask-cel.active-mask')).toHaveLength(1)
  })

  it('does not create a normal-layer cel marker when blank space in the layer row is clicked from mask focus', async () => {
    const document = createDocument('mask layer row blank interaction', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    const layerRow = view.container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)
    if (!maskCell || !layerRow) throw new Error('mask cell or layer row was not rendered')
    await act(async () => { fireEvent.click(maskCell) })
    await act(async () => {
      fireEvent.pointerDown(layerRow, { button: 0, clientX: 500, clientY: 10 })
      fireEvent.pointerUp(window, { button: 0, clientX: 500, clientY: 10 })
    })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const ordinaryCell = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    if (!ordinaryCell) throw new Error('ordinary cel was not rendered')
    expect(ordinaryCell).not.toHaveClass('current-cel', 'selected-cel')
  })

  it('diagnoses playback mask focus after blank refresh', async () => {
    const document = createDocument('mask playback blank diagnostics', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(document)
    timeline.layerMasks = [firstFrameId, secondFrameId].map((frameId) => ({ layerId: layer.id, frameId, mask: createLayerMask(layer.id, 2, 2) }))
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().setAnimationLoop(true)
    useWorkspace.getState().setAnimationPlaying(true)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const list = view.container.querySelector('.layer-list')!
    await act(async () => { fireEvent.pointerDown(list, { button: 0 }) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    console.log('playback-mask ordinary:', view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, firstFrameId)}"]`)?.outerHTML)
    console.log('playback-mask mask:', view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, firstFrameId)}"]`)?.outerHTML)
  })

  it('gates mask activity to the focused owner when multiple owners have masks', async () => {
    const document = createDocument('multi mask owner focus', 2, 2, 'rgba')
    const layerA = getActiveLayer(document)
    layerA.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const celA = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(celA.id)
    await useWorkspace.getState().addLayer()
    const sessionAfterLayer = useWorkspace.getState().sessions[0]!
    const layerB = sessionAfterLayer.document.layers.find((layer) => layer.id !== layerA.id)!
    layerB.pixels[3] = 255
    const timelineAfterLayer = ensureAnimationDocument(sessionAfterLayer.document)
    const celB = timelineAfterLayer.cels.find((cel) => cel.layerId === layerB.id)!
    useWorkspace.getState().createLayerMask(celB.id)
    const session = useWorkspace.getState().sessions[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const maskCells = [...view.container.querySelectorAll<HTMLElement>('[data-animation-mask-cel-key]')]
    if (maskCells.length < 2) throw new Error('multiple mask cells were not rendered')
    const target = maskCells.find((cell) => cell.querySelector('.cel-mask-marker')) ?? maskCells[0]!
    const targetOwnerId = target.dataset.animationMaskCelKey!.split(':')[0]!
    const otherOwnerId = [layerA.id, layerB.id].find((id) => id !== targetOwnerId) ?? layerB.id
    await act(async () => { fireEvent.click(target) })
    const ownerRow = view.container.querySelector(`[data-layer-mask-row-owner="${targetOwnerId}"]`)
    const otherRow = view.container.querySelector(`[data-layer-mask-row-owner="${otherOwnerId}"]`)
    expect(ownerRow).toHaveClass('active-layer')
    expect(otherRow).not.toHaveClass('active-layer')
    expect(target).toHaveClass('active-mask')
    expect(view.container.querySelector(`[data-animation-mask-cel-key^="${otherOwnerId}:"]`)).not.toHaveClass('active-mask')
    expect(view.container.querySelector('.animation-active-cell-column')).toBeTruthy()

    const targetFrameId = target.dataset.animationMaskCelKey!.split(':').slice(1).join(':')
    const ordinaryCel = view.container.querySelector(`[data-animation-cel-key="${targetOwnerId}:${targetFrameId}"]`)
    if (!ordinaryCel) throw new Error('ordinary cel was not rendered')
    await act(async () => { fireEvent.click(ordinaryCel) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(view.container.querySelector('.animation-active-cell-column')).toBeTruthy()
    expect(view.container.querySelectorAll('.layer-mask-cel.active-mask')).toHaveLength(0)
    expect(view.container.querySelectorAll('.layer-mask-cel.selected-cel')).toHaveLength(0)
  })

  it('keeps frame selection column-wide without solid cel markers', async () => {
    const document = createDocument('frame selection visuals', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().addAnimationFrame()
    const session = useWorkspace.getState().sessions[0]!
    const timeline = ensureAnimationDocument(session.document)
    const selectedFrame = timeline.frames[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const header = view.container.querySelector(`[data-animation-frame-id="${selectedFrame.id}"]`)
    if (!header) throw new Error('selected frame header was not rendered')
    await act(async () => { fireEvent.click(header) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const cell = view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, selectedFrame.id)}"]`)
    if (!cell) throw new Error('selected frame cel was not rendered')
    expect(cell).toHaveClass('selected-animation-frame')
    expect(cell).toHaveClass('selected-cel')
    expect(cell).not.toHaveClass('current-cel')
    expect(view.container.querySelector(`[data-animation-frame-selection~="${selectedFrame.id}"]`)).toBeTruthy()
    expect(view.container.querySelector('.animation-active-cell-column')).toBeTruthy()
    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).toHaveClass('active-layer')

    await act(async () => { fireEvent.click(cell) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, selectedFrame.id)}"]`)).toHaveClass('current-cel')
  })

  it('keeps frame markers column-wide while limiting active-row styling', async () => {
    const document = createDocument('scoped frame activity', 2, 2, 'rgba')
    const firstLayer = getActiveLayer(document)
    firstLayer.pixels[3] = 255
    ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    await act(async () => { await useWorkspace.getState().addLayer() })
    const session = useWorkspace.getState().sessions[0]!
    const secondLayer = session.document.layers.find((layer) => layer.id !== firstLayer.id)!
    secondLayer.pixels[0] = 255
    useWorkspace.getState().selectLayer(secondLayer.id)
    const timeline = ensureAnimationDocument(useWorkspace.getState().sessions[0]!.document)
    const selectedFrame = timeline.frames[0]!
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const header = view.container.querySelector(`[data-animation-frame-id="${selectedFrame.id}"]`)
    if (!header) throw new Error('selected frame header was not rendered')
    await act(async () => { fireEvent.click(header) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)

    const firstCell = view.container.querySelector(`[data-animation-cel-key="${firstLayer.id}:${selectedFrame.id}"]`)
    const secondCell = view.container.querySelector(`[data-animation-cel-key="${secondLayer.id}:${selectedFrame.id}"]`)
    if (!firstCell || !secondCell) throw new Error('both frame cells were not rendered')
    expect(firstCell).toHaveClass('selected-animation-frame')
    expect(secondCell).toHaveClass('selected-animation-frame')
    expect(firstCell).not.toHaveClass('active-frame')
    expect(secondCell).toHaveClass('active-frame')
    expect(view.container.querySelector(`[data-layer-id="${firstLayer.id}"]`)).not.toHaveClass('active-layer')
    expect(view.container.querySelector(`[data-layer-id="${secondLayer.id}"]`)).toHaveClass('active-layer')
  })

  it('keeps selected frame column activity and mask markers in sync', async () => {
    const document = createDocument('frame mask marker visuals', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    const session = useWorkspace.getState().sessions[0]!
    const currentTimeline = ensureAnimationDocument(session.document)
    const firstFrame = currentTimeline.frames[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const header = view.container.querySelector(`[data-animation-frame-id="${firstFrame.id}"]`)
    if (!header) throw new Error('first frame header was not rendered')
    await act(async () => { fireEvent.click(header) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const maskCell = view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(layer.id, firstFrame.id)}"]`)
    if (!maskCell) throw new Error('first frame mask cel was not rendered')
    expect(maskCell).toHaveClass('selected-animation-frame')
    expect(maskCell).not.toHaveClass('active-mask')
    expect(maskCell.querySelector('.cel-mask-marker')).toBeTruthy()
    expect(maskCell.querySelector('.mask-slot-marker-selected')).toBeTruthy()
    expect(maskCell).not.toHaveClass('mask-frame-activity-suppressed')
    expect(view.container.querySelector(`[data-animation-frame-selection~="${firstFrame.id}"]`)).toBeTruthy()
    expect(view.container.querySelector('.animation-active-cell-column')).toBeTruthy()
    expect(view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)).toHaveClass('active-layer')
    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).not.toHaveClass('active-layer')
  })

  it('switches from an ordinary layer to a mask on pointer-down', async () => {
    const document = createDocument('immediate mask switch', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().selectLayer(layer.id)
    const session = useWorkspace.getState().sessions[0]!
    const view = render(<I18nProvider><LayersPanel session={session} /></I18nProvider>)
    const maskCell = view.container.querySelector<HTMLElement>(`[data-animation-mask-cel-key="${animationCelKey(layer.id, timeline.activeFrameId)}"]`)
    if (!maskCell) throw new Error('mask cell was not rendered')
    await act(async () => { fireEvent.pointerDown(maskCell, { button: 0 }) })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    expect(view.container.querySelector(`[data-layer-mask-row-owner="${layer.id}"]`)).toHaveClass('active-layer')
    expect(view.container.querySelector(`[data-layer-id="${layer.id}"]`)).not.toHaveClass('active-layer')
  })

  it('does not add a second cell outline during a single-cel drag', () => {
    const document = createDocument('single cel drag preview', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    useWorkspace.getState().addAnimationFrame()
    const currentTimeline = ensureAnimationDocument(useWorkspace.getState().sessions[0]!.document)
    const sourceKey = animationCelKey(layer.id, currentTimeline.frames[0]!.id)
    const targetKey = animationCelKey(layer.id, currentTimeline.frames[1]!.id)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const source = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${sourceKey}"]`)
    const target = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${targetKey}"]`)
    if (!source || !target) throw new Error('ordinary cells were not rendered')

    fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 80 })
    fireEvent.pointerUp(source, { clientX: 10, clientY: 80 })
    const outline = view.container.querySelector<HTMLElement>('[data-animation-cel-selection]')
    if (!outline) throw new Error('selection outline was not rendered')
    vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 34, top: 30, bottom: 114, width: 34, height: 84, x: 0, y: 30, toJSON: () => ({}) })
    fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 80 })
    fireEvent.pointerMove(target, { clientX: 40, clientY: 80 })

    expect(target).not.toHaveClass('drop-target')
    expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({
      '--animation-row-span': '1'
    })
  })

  it('keeps a multi-cel drag preview inside the existing frame grid', async () => {
    const document = createDocument('bounded multi cel drag preview', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    useWorkspace.getState().addAnimationFrame()
    const timeline = ensureAnimationDocument(useWorkspace.getState().sessions[0]!.document)
    const secondKey = animationCelKey(layer.id, timeline.frames[1]!.id)
    const thirdKey = animationCelKey(layer.id, timeline.frames[2]!.id)
    const view = render(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    await act(async () => {
      useWorkspace.getState().selectAnimationCell(secondKey)
      useWorkspace.getState().selectAnimationCell(thirdKey, 'toggle')
    })
    view.rerender(<I18nProvider><LayersPanel session={useWorkspace.getState().sessions[0]!} /></I18nProvider>)
    const second = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${secondKey}"]`)
    const third = view.container.querySelector<HTMLElement>(`[data-animation-cel-key="${thirdKey}"]`)
    const outline = view.container.querySelector<HTMLElement>('[data-animation-cel-selection]')
    if (!second || !third || !outline) throw new Error('multi-cell selection was not rendered')
    vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 68, top: 30, bottom: 58, width: 68, height: 28, x: 0, y: 30, toJSON: () => ({}) })
    for (const cell of view.container.querySelectorAll<HTMLElement>('[data-animation-cel-key]')) {
      const index = Number(cell.dataset.frameIndex ?? 0)
      vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({ left: index * 28, right: (index + 1) * 28, top: 30, bottom: 58, width: 28, height: 28, x: index * 28, y: 30, toJSON: () => ({}) })
    }

    await act(async () => {
      fireEvent.pointerDown(second, { button: 0, clientX: 1, clientY: 40 })
      fireEvent.pointerMove(third, { clientX: 60, clientY: 40 })
    })

    await waitFor(() => expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveClass('animation-cel-drag-preview'))
    let movedOutline = view.container.querySelector('[data-animation-cel-selection]')
    expect(movedOutline).toHaveClass('animation-cel-drag-preview')
    expect(movedOutline).toHaveStyle({
      '--animation-frame-index': '1',
      '--animation-frame-span': '2'
    })
    expect(second).toHaveClass('selected-cel', 'dragging')
    expect(third).toHaveClass('selected-cel', 'dragging')

    const grid = view.container.querySelector<HTMLElement>('.layer-animation-grid')
    if (!grid) throw new Error('animation grid was not rendered')
    await act(async () => { fireEvent.pointerMove(grid, { clientX: -100, clientY: 40 }) })
    await waitFor(() => expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({ '--animation-frame-index': '0' }))
    movedOutline = view.container.querySelector('[data-animation-cel-selection]')
    expect(movedOutline).toHaveClass('animation-cel-drag-preview')
    expect(movedOutline).toHaveStyle({ '--animation-frame-index': '0' })

    await act(async () => { fireEvent.pointerMove(grid, { clientX: 200, clientY: 40 }) })
    await waitFor(() => expect(view.container.querySelector('[data-animation-cel-selection]')).toHaveStyle({ '--animation-frame-index': '1' }))
    movedOutline = view.container.querySelector('[data-animation-cel-selection]')
    expect(movedOutline).toHaveClass('animation-cel-drag-preview')
    expect(movedOutline).toHaveStyle({ '--animation-frame-index': '1' })

    await act(async () => { fireEvent.pointerUp(window, { clientX: 200, clientY: 40 }) })
    expect(useWorkspace.getState().sessions[0]!.selectedAnimationCellKeys).toEqual([secondKey, thirdKey])
  })

})
