import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument, createLayer, ensureLayerCoversCanvas, getActiveLayer } from '@/core/document'
import { addBlankAnimationFrame, animationCelAt, animationCelKey, connectAnimationCels, ensureAnimationDocument } from '@/core/animation'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { layersPanelRenderKey } from '@/core/panel-render-keys'
import { ONION_SKIN_PREFERENCE_KEY, SKIP_DISABLED_FRAMES_PREFERENCE_KEY, TIMELINE_HIDDEN_PREFERENCE_KEY } from '@/core/file-preferences'
import { useWorkspace } from '@/store/workspace'
import { finishAnimationCellOperation, revealLayerInPanel } from '@/components/layer-panel-reveal'
import { FREE_TILE_INSTANCE_FLASH_EVENT } from '@/components/free-tile-instance-events'
import { LayersPanel } from './LayersPanel'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { FREE_TILE_INSTANCE_PANEL_LAYOUT_STORAGE_KEY } from '@/core/layer-panel-preferences'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(FREE_TILE_INSTANCE_PANEL_LAYOUT_STORAGE_KEY, 'integrated')
  Object.defineProperty(window, 'moonSprite', {
    configurable: true,
    writable: true,
    value: { getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })) } as unknown as MoonSpriteApi
  })
  useWorkspace.setState({ sessions: [], activeId: null, layerStyleClipboard: null, message: null, dialog: null })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function ConnectedLayersPanel() {
  const revision = useWorkspace((state) => state.sessions[0] ? layersPanelRenderKey(state.sessions[0]) : '')
  const session = useWorkspace.getState().sessions[0]
  void revision
  return session ? <LayersPanel session={session} docked /> : null
}

describe('LayersPanel Free Tile instances', () => {
  it('does not highlight a child cel during playback when its folder is active', () => {
    const document = createDocument('folder playback focus', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const group = { id: 'playback-folder', name: 'Folder', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups.push(group)
    layer.groupId = group.id
    layer.pixels.set([255, 0, 0, 255])
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectGroup(group.id)
    useWorkspace.getState().setAnimationPlaying(true)
    const { container } = render(<ConnectedLayersPanel />)
    expect(container.querySelector('.cel-content-marker.selection-marker')).toBeNull()
    expect(useWorkspace.getState().sessions[0].selectedGroupId).toBe(group.id)
  })
  it('keeps the instance layout control out of the general layer settings', () => {
    const document = createDocument('layer settings without instance layout', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)

    render(<ConnectedLayersPanel />)
    fireEvent.click(screen.getByRole('button', { name: '图层设置' }))

    expect(screen.queryByRole('button', { name: '实例图层位置' })).toBeNull()
  })


  it('opens instance layers from the Free Tile icon and exposes layer-style controls', async () => {
    const document = createDocument('free tile instance layers', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Reusable Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'instance-layer-a', sourceId, x: 2, y: 3 }]
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instance')

    const { container } = render(<ConnectedLayersPanel />)
    const entry = container.querySelector<HTMLElement>('.free-tile-layer .layer-tilemap-indicator')!
    fireEvent.pointerDown(entry, { button: 0, pointerId: 41 })
    fireEvent.click(entry)

    expect(container.querySelector('.free-tile-instance-layer-view')).toBeTruthy()
    expect(container.querySelector('.free-tile-instance-layer-view .layer-animation-grid')).toBeNull()
    expect(container.querySelector('.free-tile-instance-layer-view .layer-animation-frame-header')).toBeNull()
    expect(useWorkspace.getState().sessions[0].freeTileInstanceLayerId).toBe(target.layer.id)
    let row = container.querySelector<HTMLButtonElement>('[data-free-tile-instance-id="instance-layer-a"]')!
    expect(row).toHaveClass('layer-row')
    expect(row).toHaveAttribute('aria-label', '自由瓦片1 实例1')
    expect(row.querySelector('.layer-color-stripe')).toBeTruthy()
    expect(row.querySelector('.layer-visibility')).toBeTruthy()
    expect(row.querySelector('.layer-lock-toggle')).toBeTruthy()
    expect(row.querySelector('.layer-instance-properties')).toBeTruthy()
    expect(screen.getByRole('button', { name: '实例图层设置' })).toBeTruthy()

    fireEvent.pointerDown(row, { button: 0, pointerId: 42 })
    expect(row).toHaveClass('selected')

    fireEvent.pointerDown(row.querySelector('.layer-visibility')!, { button: 0 })
    fireEvent.click(row.querySelector('.layer-visibility')!)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0].visible).toBe(false)

    row = container.querySelector<HTMLButtonElement>('[data-free-tile-instance-id="instance-layer-a"]')!
    fireEvent.pointerDown(row.querySelector('.layer-lock-toggle')!, { button: 0 })
    fireEvent.click(row.querySelector('.layer-lock-toggle')!)
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0].locked).toBe(true)

    row = container.querySelector<HTMLButtonElement>('[data-free-tile-instance-id="instance-layer-a"]')!
    fireEvent.pointerDown(row.querySelector('.layer-instance-properties')!, { button: 0 })
    fireEvent.click(row.querySelector('.layer-instance-properties')!)
    expect(globalThis.document.body.querySelector('.free-tile-instance-properties-dialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '返回图层' }))
    expect(container.querySelector('.layer-animation-list')).toBeTruthy()
    expect(useWorkspace.getState().sessions[0].freeTileInstanceLayerId).toBeNull()
    expect(useWorkspace.getState().sessions[0].selectedFreeTileInstanceId).toBeNull()
  })

  it('flashes an instance again every time its selected row is clicked', async () => {
    const document = createDocument('repeat instance flash', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Repeat Flash' })
    const target = activeFreeTileCelTarget(document)!
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'repeat-flash-instance', sourceId: target.layer.freeTileSources![0].id, x: 2, y: 2 }]
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Place repeat flash instance')
    useWorkspace.getState().setFreeTileInstanceLayerView(target.layer.id)
    useWorkspace.getState().setSelectedFreeTileInstance('repeat-flash-instance', 'edit')
    const flash = vi.fn()
    window.addEventListener(FREE_TILE_INSTANCE_FLASH_EVENT, flash)

    const { container } = render(<ConnectedLayersPanel />)
    const row = container.querySelector<HTMLButtonElement>('[data-free-tile-instance-id="repeat-flash-instance"]')!
    fireEvent.click(row)
    fireEvent.click(row)

    expect(flash).toHaveBeenCalledTimes(2)
    window.removeEventListener(FREE_TILE_INSTANCE_FLASH_EVENT, flash)
  })

  it('shows only the instances from the outer Free Tile layer active frame', async () => {
    const document = createDocument('free tile instance active frame', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Animated Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'stable-instance', sourceId, x: 2, y: 3 }]
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instance')
    useWorkspace.getState().duplicateAnimationFrame()
    const secondPlacement = useWorkspace.getState().beginFreeTilePlacement()!
    secondPlacement.after.instances.push({ id: 'second-frame-instance', sourceId, x: 5, y: 3 })
    useWorkspace.getState().previewFreeTilePlacement(secondPlacement)
    useWorkspace.getState().commitFreeTilePlacement(secondPlacement, 'Place second frame instance')
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().setActiveAnimationFrame(timeline.frames[0].id)

    const { container } = render(<ConnectedLayersPanel />)
    fireEvent.click(container.querySelector<HTMLElement>('.free-tile-layer .layer-tilemap-indicator')!)

    expect(container.querySelector('.free-tile-instance-layer-view .layer-animation-grid')).toBeNull()
    expect(container.querySelector('[data-free-tile-instance-id="stable-instance"]')).toBeTruthy()
    expect(container.querySelector('[data-free-tile-instance-id="second-frame-instance"]')).toBeNull()

    act(() => { useWorkspace.getState().setActiveAnimationFrame(timeline.frames[1].id) })
    await waitFor(() => expect(container.querySelector('[data-free-tile-instance-id="second-frame-instance"]')).toBeTruthy())
  })

  it('offers Show Only from an instance context menu', async () => {
    const document = createDocument('show only instance menu', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Reusable Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [
      { id: 'instance-layer-a', sourceId, x: 1, y: 1 },
      { id: 'instance-layer-b', sourceId, x: 4, y: 4 }
    ]
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instances')

    const { container } = render(<ConnectedLayersPanel />)
    fireEvent.click(container.querySelector<HTMLElement>('.free-tile-layer .layer-tilemap-indicator')!)
    fireEvent.contextMenu(container.querySelector('[data-free-tile-instance-id="instance-layer-a"]')!, { clientX: 80, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: '仅显示' }))

    expect(activeFreeTileCelTarget(document)!.freeTiles.instances.map(({ id, visible }) => ({ id, visible }))).toEqual([
      { id: 'instance-layer-a', visible: true },
      { id: 'instance-layer-b', visible: false }
    ])
  })


  it('edits instance-only rotation and mirroring from the context menu and properties', async () => {
    const document = createDocument('instance transform controls', 8, 8, 'rgba')
    useWorkspace.getState().addSession(document)
    await useWorkspace.getState().createFreeTileLayer({ name: 'Transform Props' })
    const target = activeFreeTileCelTarget(document)!
    const sourceId = target.layer.freeTileSources![0].id
    const placement = useWorkspace.getState().beginFreeTilePlacement()!
    placement.after.instances = [{ id: 'transform-instance', sourceId, x: 2, y: 3 }]
    useWorkspace.getState().previewFreeTilePlacement(placement)
    useWorkspace.getState().commitFreeTilePlacement(placement, 'Place instance')

    const { container } = render(<ConnectedLayersPanel />)
    fireEvent.click(container.querySelector<HTMLElement>('.free-tile-layer .layer-tilemap-indicator')!)
    const row = container.querySelector<HTMLElement>('[data-free-tile-instance-id="transform-instance"]')!
    fireEvent.contextMenu(row, { clientX: 80, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: '顺时针旋转 90°' }))
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0].rotation).toBe(1)

    fireEvent.contextMenu(row, { clientX: 80, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: '实例属性' }))
    const dialog = globalThis.document.body.querySelector<HTMLElement>('.free-tile-instance-properties-dialog')!
    expect(dialog.querySelector('.free-tile-instance-properties-meta')).toBeNull()
    expect(dialog.textContent!.indexOf('混合模式')).toBeLessThan(dialog.textContent!.indexOf('X 位置'))
    expect(within(dialog).queryByRole('button', { name: '保存' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: '取消' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '180°' }))
    fireEvent.click(screen.getByRole('button', { name: '垂直镜像实例' }))

    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ rotation: 2, flipVertical: true })
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    useWorkspace.getState().undo()
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).toMatchObject({ rotation: 1 })
    expect(activeFreeTileCelTarget(document)!.freeTiles.instances[0]).not.toHaveProperty('flipVertical')
  })

})

describe('LayersPanel animation', () => {
  it('does not focus the onion-skin toggle after a pointer click', () => {
    const document = createDocument('onion keyboard focus', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    const onionToggle = screen.getByRole('button', { name: '启用洋葱皮' })
    fireEvent.pointerDown(onionToggle)
    fireEvent.click(onionToggle)

    expect(onionToggle).not.toHaveFocus()
  })

  it('uses compact density by default', () => {
    const document = createDocument('default compact density', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    expect(container.querySelector('.layers-panel')).toHaveClass('layer-density-compact')
  })

  it('can keep frame and layer edit buttons while docked on either side', () => {
    const document = createDocument('side dock actions', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked sideDocked />)

    expect(container.querySelectorAll('.timeline-frame-edit-button')).toHaveLength(0)
    expect(container.querySelectorAll('.layer-structure-edit-button')).toHaveLength(0)
    expect(container.querySelectorAll('.layer-animation-edit button')).toHaveLength(1)
    expect(container.querySelectorAll('.panel-actions button')).toHaveLength(1)

    fireEvent.click(container.querySelector<HTMLButtonElement>('.panel-actions button')!)
    fireEvent.click(screen.getByRole('checkbox', { name: '左右吸附时自动隐藏按钮' }))

    expect(container.querySelectorAll('.timeline-frame-edit-button')).toHaveLength(2)
    expect(container.querySelectorAll('.layer-structure-edit-button')).toHaveLength(5)
    expect(localStorage.getItem('moonsprite.layers.side-dock-auto-hide')).toBe('false')

    rerender(<LayersPanel session={session} docked />)
    expect(container.querySelectorAll('.timeline-frame-edit-button')).toHaveLength(2)
    expect(container.querySelectorAll('.layer-structure-edit-button')).toHaveLength(5)
  })


  it('keeps timeline selections while sampling a color from the canvas', () => {
    const document = createDocument('preserved eyedropper selection', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const timeline = ensureAnimationDocument(document)
    const key = animationCelKey(document.activeLayerId, timeline.activeFrameId)
    useWorkspace.getState().selectAnimationCell(key)
    useWorkspace.getState().setTool('eyedropper')
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const canvas = globalThis.document.createElement('canvas')
    canvas.className = 'stage-canvas'
    globalThis.document.body.appendChild(canvas)

    fireEvent.pointerDown(canvas)

    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual([key])
    canvas.remove()
  })

  it('keeps a frame multi-selection when the selection tool starts a canvas interaction', () => {
    const document = createDocument('preserved frame selection', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame] = timeline.frames
    useWorkspace.getState().selectAnimationFrame(firstFrame.id)
    useWorkspace.getState().selectAnimationFrame(secondFrame.id, 'toggle')
    useWorkspace.getState().setTool('selection')
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const canvas = globalThis.document.createElement('canvas')
    canvas.className = 'stage-canvas'
    globalThis.document.body.appendChild(canvas)

    fireEvent.pointerDown(canvas)

    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([firstFrame.id, secondFrame.id])
    canvas.remove()
  })


  it('keeps selected frame activity on group timeline cells', async () => {
    const document = createDocument('selected group frames', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const group = { id: 'group-1', name: 'Group 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    layer.groupId = group.id
    document.groups.push(group)
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 4; index += 1) useWorkspace.getState().duplicateAnimationFrame()

    const timeline = ensureAnimationDocument(document)
    const { container } = render(<ConnectedLayersPanel />)
    useWorkspace.getState().selectAnimationFrame(timeline.frames[0].id)
    useWorkspace.getState().selectAnimationFrame(timeline.frames[3].id, 'range')
    await waitFor(() => {
      const groupCells = timeline.frames.map((frame) => container.querySelector<HTMLElement>(`[data-animation-group-cel-key="${animationCelKey(group.id, frame.id)}"]`))
      expect(groupCells).toHaveLength(5)
      expect(groupCells.slice(0, 4).every((cell) => cell?.classList.contains('selected-animation-frame'))).toBe(true)
      expect(groupCells[4]).not.toHaveClass('selected-animation-frame')
    })
  })

  it('creates a named loop section from selected frames and exposes play, edit, and delete actions', () => {
    const document = createDocument('timeline loop section', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().selectAnimationFrame(timeline.frames[0].id)
    useWorkspace.getState().selectAnimationFrame(timeline.frames[2].id, 'range')
    const { container } = render(<ConnectedLayersPanel />)

    const headers = container.querySelectorAll<HTMLElement>('.layer-animation-frame-header')
    fireEvent.contextMenu(headers[2], { clientX: 40, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: '创建循环节' }))
    let dialog = globalThis.document.querySelector<HTMLElement>('.animation-loop-section-modal')!
    expect(within(dialog).getByRole('spinbutton', { name: '开始帧' })).toHaveValue('1')
    expect(within(dialog).getByRole('spinbutton', { name: '结束帧' })).toHaveValue('3')
    fireEvent.pointerDown(within(dialog).getByRole('textbox', { name: '名称' }))
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual(timeline.frames.slice(0, 3).map((frame) => frame.id))
    const repeatToggle = within(dialog).getByRole('checkbox', { name: '重复' })
    expect(repeatToggle).not.toBeChecked()
    expect(within(dialog).getByRole('textbox', { name: '重复' })).toHaveValue('无限')
    fireEvent.click(repeatToggle)
    expect(within(dialog).getByRole('spinbutton', { name: '重复' })).toHaveValue('1')
    fireEvent.click(repeatToggle)
    expect(within(dialog).getByRole('textbox', { name: '重复' })).toHaveValue('无限')
    fireEvent.change(within(dialog).getByRole('textbox', { name: '名称' }), { target: { value: '行走' } })
    fireEvent.submit(dialog.closest('form')!)

    let loopBar = container.querySelector<HTMLButtonElement>('[data-animation-loop-section-id]')!
    const loopId = loopBar.dataset.animationLoopSectionId!
    expect(loopBar).toHaveTextContent('行走')
    expect(loopBar.style.gridColumn).toBe('1 / span 3')
    const loopTrack = loopBar.closest<HTMLElement>('.animation-loop-section-track')!
    expect(loopTrack).toBeInTheDocument()
    expect(loopBar.closest('header')).toBe(container.querySelector('.layers-panel > header'))
    expect(loopBar.closest('.layer-animation-grid')).toBeNull()
    const animationList = container.querySelector<HTMLElement>('.layer-animation-list')!
    animationList.scrollLeft = 37
    fireEvent.scroll(animationList)
    expect(loopTrack.style.transform).toBe('translate3d(-37px, 0, 0)')

    fireEvent.contextMenu(loopBar, { clientX: 50, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitem', { name: '播放循环节' }))
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ animationPlaying: true, animationPlaybackLoopSectionId: loopId })

    loopBar = container.querySelector<HTMLButtonElement>(`[data-animation-loop-section-id="${loopId}"]`)!
    fireEvent.doubleClick(loopBar)
    dialog = globalThis.document.querySelector<HTMLElement>('.animation-loop-section-modal')!
    fireEvent.change(within(dialog).getByRole('textbox', { name: '名称' }), { target: { value: '反向行走' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '播放方向' }))
    fireEvent.click(screen.getByRole('option', { name: '反向' }))
    fireEvent.submit(dialog.closest('form')!)
    expect(container.querySelector(`[data-animation-loop-section-id="${loopId}"]`)).toHaveTextContent('反向行走')

    loopBar = container.querySelector<HTMLButtonElement>(`[data-animation-loop-section-id="${loopId}"]`)!
    fireEvent.contextMenu(loopBar, { clientX: 50, clientY: 40 })
    fireEvent.click(screen.getByRole('menuitem', { name: '删除循环节' }))
    expect(container.querySelector(`[data-animation-loop-section-id="${loopId}"]`)).not.toBeInTheDocument()
  })

  it('resizes loop section boundaries by dragging either bracket edge', () => {
    const document = createDocument('timeline loop section resize', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 3; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const loopId = useWorkspace.getState().createAnimationLoopSection({
      name: '可调整循环节',
      startFrameId: timeline.frames[0].id,
      endFrameId: timeline.frames[2].id,
      direction: 'forward',
      repeatCount: null
    })!
    const { container } = render(<ConnectedLayersPanel />)
    const firstHeader = container.querySelector<HTMLElement>('[data-frame-index="0"]')!
    vi.spyOn(firstHeader, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 34, top: 0, bottom: 30, width: 34, height: 30, x: 0, y: 0, toJSON: () => ({}) })

    let loopBar = container.querySelector<HTMLButtonElement>(`[data-animation-loop-section-id="${loopId}"]`)!
    const startEdge = loopBar.querySelector<HTMLElement>('.animation-loop-section-edge-start')!
    fireEvent.pointerDown(startEdge, { button: 0, clientX: 0, clientY: 10, pointerId: 71 })
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([])
    fireEvent.pointerMove(window, { clientX: 68, clientY: 10, pointerId: 71 })
    expect(loopBar.style.gridColumn).toBe('3 / span 1')
    fireEvent.pointerUp(window, { clientX: 68, clientY: 10, pointerId: 71 })
    expect(ensureAnimationDocument(document).loopSections?.[0]).toMatchObject({ startFrameId: timeline.frames[2].id, endFrameId: timeline.frames[2].id })

    loopBar = container.querySelector<HTMLButtonElement>(`[data-animation-loop-section-id="${loopId}"]`)!
    const endEdge = loopBar.querySelector<HTMLElement>('.animation-loop-section-edge-end')!
    fireEvent.pointerDown(endEdge, { button: 0, clientX: 102, clientY: 10, pointerId: 72 })
    fireEvent.pointerMove(window, { clientX: 136, clientY: 10, pointerId: 72 })
    expect(loopBar.style.gridColumn).toBe('3 / span 2')
    fireEvent.pointerUp(window, { clientX: 136, clientY: 10, pointerId: 72 })
    expect(ensureAnimationDocument(document).loopSections?.[0]).toMatchObject({ startFrameId: timeline.frames[2].id, endFrameId: timeline.frames[3].id })
  })

  it('renders a contained loop section inside its parent bracket', () => {
    const document = createDocument('nested timeline loop sections', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 7; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const parentId = useWorkspace.getState().createAnimationLoopSection({
      name: '父循环节',
      startFrameId: timeline.frames[0].id,
      endFrameId: timeline.frames[6].id,
      direction: 'forward',
      repeatCount: null
    })!
    const childId = useWorkspace.getState().createAnimationLoopSection({
      name: '子循环节',
      startFrameId: timeline.frames[1].id,
      endFrameId: timeline.frames[3].id,
      direction: 'forward',
      repeatCount: null
    })!
    const crossingChildId = useWorkspace.getState().createAnimationLoopSection({
      name: '交叉子循环节',
      startFrameId: timeline.frames[2].id,
      endFrameId: timeline.frames[4].id,
      direction: 'forward',
      repeatCount: null
    })!
    const trailingChildId = useWorkspace.getState().createAnimationLoopSection({
      name: '后续子循环节',
      startFrameId: timeline.frames[5].id,
      endFrameId: timeline.frames[6].id,
      direction: 'forward',
      repeatCount: null
    })!
    const independentId = useWorkspace.getState().createAnimationLoopSection({
      name: '独立循环节',
      startFrameId: timeline.frames[7].id,
      endFrameId: timeline.frames[7].id,
      direction: 'forward',
      repeatCount: null
    })!
    const { container } = render(<ConnectedLayersPanel />)

    const parent = container.querySelector<HTMLElement>(`[data-animation-loop-section-id="${parentId}"]`)!
    const child = container.querySelector<HTMLElement>(`[data-animation-loop-section-id="${childId}"]`)!
    const crossingChild = container.querySelector<HTMLElement>(`[data-animation-loop-section-id="${crossingChildId}"]`)!
    const trailingChild = container.querySelector<HTMLElement>(`[data-animation-loop-section-id="${trailingChildId}"]`)!
    const independent = container.querySelector<HTMLElement>(`[data-animation-loop-section-id="${independentId}"]`)!
    expect(parent.style.gridRow).toBe('1 / span 3')
    expect(child.style.gridRow).toBe('3 / span 1')
    expect(crossingChild.style.gridRow).toBe('2 / span 2')
    expect(trailingChild.style.gridRow).toBe('3 / span 1')
    expect(independent.style.gridRow).toBe('3 / span 1')
    expect(Number(child.style.zIndex)).toBeGreaterThan(Number(parent.style.zIndex))
  })

  it('keeps tag playback running when a clicked frame switches loop sections', () => {
    const document = createDocument('timeline playback loop switch', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    for (let index = 0; index < 3; index += 1) useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().createAnimationLoopSection({
      name: 'First',
      startFrameId: timeline.frames[0].id,
      endFrameId: timeline.frames[1].id,
      direction: 'forward',
      repeatCount: null
    })
    const secondLoopId = useWorkspace.getState().createAnimationLoopSection({
      name: 'Second',
      startFrameId: timeline.frames[2].id,
      endFrameId: timeline.frames[3].id,
      direction: 'forward',
      repeatCount: null
    })!
    useWorkspace.getState().setActiveAnimationFrame(timeline.frames[0].id)
    useWorkspace.getState().setAnimationPlaybackMode('tag')
    useWorkspace.getState().setAnimationPlaying(true)
    const { container } = render(<ConnectedLayersPanel />)

    fireEvent.click(container.querySelector(`[data-animation-frame-id="${timeline.frames[3].id}"]`)!)

    expect(timeline.activeFrameId).toBe(timeline.frames[3].id)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({
      animationPlaying: true,
      animationPlaybackLoopSectionId: secondLoopId,
      animationPlaybackLoopSectionRepeatIndefinitely: true
    })
  })

  it('uses a shorter frame header without duration text at compact density', () => {
    localStorage.setItem('moonsprite.layers.display-density', 'compact')
    const document = createDocument('compact timeline header', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    expect(container.querySelector('.layers-panel')).toHaveClass('layer-density-compact')
    const frameHeader = container.querySelector('.layer-animation-frame-header')
    expect(frameHeader?.querySelector('strong')).toHaveTextContent('1')
    expect(frameHeader?.querySelector('small')).not.toBeInTheDocument()
  })

  it('uses Alt-click to select cel content and Shift+Alt-click to add it', () => {
    const document = createDocument('timeline content selection', 3, 1, 'rgba')
    getActiveLayer(document).pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    ensureLayerCoversCanvas(document, getActiveLayer(document))
    getActiveLayer(document).pixels[11] = 255
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame] = timeline.frames
    const layerId = document.activeLayerId
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)

    const firstCell = container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layerId, firstFrame.id)}"]`)!
    fireEvent.pointerDown(firstCell, { button: 0, altKey: true })
    const secondCell = container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(layerId, secondFrame.id)}"]`)!
    fireEvent.pointerDown(secondCell, { button: 0, altKey: true, shiftKey: true })

    expect(Array.from(useWorkspace.getState().sessions[0].selection?.mask ?? [])).toEqual([1, 0, 1])
  })

  it('creates a frame by copying the selected frame and still supports blank frames from the frame menu', () => {
    const document = createDocument('animation', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels.set([23, 45, 67, 255], 0)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { rerender } = render(<LayersPanel session={session} docked />)

    fireEvent.click(screen.getByRole('button', { name: '新增帧' }))
    expect(document.animation?.frames).toHaveLength(2)
    const copiedFrameId = ensureAnimationDocument(document).activeFrameId
    expect(ensureAnimationDocument(document).cels.find((cel) => cel.frameId === copiedFrameId && cel.layerId === layer.id)?.surface?.pixels.slice(0, 4)).toEqual(new Uint8ClampedArray([23, 45, 67, 255]))

    rerender(<LayersPanel session={session} docked />)
    fireEvent.contextMenu(screen.getByRole('button', { name: '第 2 帧' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '新建空白帧' }))
    expect(document.animation?.frames).toHaveLength(3)

    rerender(<LayersPanel session={session} docked />)
    fireEvent.click(screen.getByRole('button', { name: '删除当前帧' }))
    expect(document.animation?.frames).toHaveLength(2)
  })

  it('edits independent frame durations from the frame context menu', async () => {
    const document = createDocument('animation grid', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)

    expect(container.querySelectorAll('.layer-animation-cel')).toHaveLength(1)
    expect(container.querySelector('.layer-animation-cel.has-cel')).toBeInTheDocument()
    expect(container.querySelector('.layer-animation-cel.has-cel')).toBeEmptyDOMElement()
    expect(container.querySelector('.layer-animation-cel > .cel-content-marker')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '帧时长' })).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '第 1 帧' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '帧属性' }))
    const duration = screen.getByRole('spinbutton', { name: '帧时长' })
    fireEvent.change(duration, { target: { value: '240' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await waitFor(() => expect(document.animation?.frames[0].duration).toBe(240))

    useWorkspace.getState().duplicateAnimationFrame()
    rerender(<LayersPanel session={session} docked />)
    fireEvent.contextMenu(screen.getByRole('button', { name: '第 2 帧' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '帧属性' }))
    const secondDuration = screen.getByRole('spinbutton', { name: '帧时长' })
    fireEvent.change(secondDuration, { target: { value: '80' } })
    fireEvent.keyDown(secondDuration, { key: 'Enter' })
    await waitFor(() => expect(document.animation?.frames.map((frame) => frame.duration)).toEqual([240, 80]))
  })

  it('opens frame and cel properties on double click, confirms with Enter, and closes with Escape', async () => {
    const document = createDocument('animation properties', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    timeline.cels[0].surface!.pixels.set([20, 40, 60, 255])
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { rerender } = render(<LayersPanel session={session} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: '第 1 帧' }))
    const duration = screen.getByRole('spinbutton', { name: '帧时长' })
    fireEvent.change(duration, { target: { value: '180' } })
    fireEvent.keyDown(duration, { key: 'Enter' })
    await waitFor(() => expect(timeline.frames[0].duration).toBe(180))
    expect(screen.queryByRole('spinbutton', { name: '帧时长' })).not.toBeInTheDocument()

    rerender(<LayersPanel session={session} docked />)
    fireEvent.doubleClick(screen.getByRole('button', { name: '第 1 帧动画单元格' }))
    expect(screen.getByRole('slider', { name: '不透明度' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('slider', { name: '不透明度' })).not.toBeInTheDocument()

    fireEvent.doubleClick(screen.getByRole('button', { name: '第 1 帧动画单元格' }))
    const opacity = screen.getByRole('slider', { name: '不透明度' })
    expect(opacity.closest('.layer-opacity-control')).not.toBeNull()
    fireEvent.change(opacity, { target: { value: '45' } })
    await waitFor(() => expect(screen.getByRole('slider', { name: '不透明度' })).toHaveValue('45'))
    fireEvent.keyDown(opacity, { key: 'Enter' })
    await waitFor(() => expect(timeline.cels[0].opacity).toBeCloseTo(0.45))
    expect(screen.queryByRole('slider', { name: '不透明度' })).not.toBeInTheDocument()
  })

  it('applies cel properties to the complete multi-cell selection', async () => {
    const document = createDocument('multi cel properties', 1, 1, 'rgba')
    const timeline = ensureAnimationDocument(document)
    const secondFrameId = addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationCell(animationCelKey(document.activeLayerId, timeline.frames[0].id))
    useWorkspace.getState().selectAnimationCell(animationCelKey(document.activeLayerId, secondFrameId), 'toggle')
    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toHaveLength(2)
    render(<LayersPanel session={session} docked />)

    fireEvent.contextMenu(screen.getByRole('button', { name: '第 2 帧动画单元格' }))
    expect(session.selectedAnimationCellKeys).toHaveLength(2)
    fireEvent.click(screen.getByRole('menuitem', { name: '单元格属性' }))
    const zCoordinate = screen.getByRole('spinbutton', { name: 'Z 坐标' })
    fireEvent.change(zCoordinate, { target: { value: '8' } })
    fireEvent.blur(zCoordinate)
    fireEvent.submit(zCoordinate.closest('form')!)

    await waitFor(() => {
      expect(animationCelAt(timeline, document.activeLayerId, timeline.frames[0].id)?.zIndex).toBe(8)
      expect(animationCelAt(timeline, document.activeLayerId, secondFrameId)?.zIndex).toBe(8)
    })
  })

  it('updates the active cel content without rerendering the full layer panel', () => {
    const document = createDocument('live cel content', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const timeline = ensureAnimationDocument(document)
    const { container } = render(<LayersPanel session={session} docked />)
    expect(container.querySelector('.cel-content-marker')).toBeNull()

    act(() => {
      timeline.cels[0].surface!.pixels.set([20, 40, 60, 255])
      session.contentRevision += 1
      useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })
    })

    expect(container.querySelector('.cel-content-marker')).not.toBeNull()
  })

  it('opens playback settings on right click and adjusts the layer display scale with Ctrl+wheel', () => {
    const document = createDocument('animation playback', 2, 2, 'rgba')
    getActiveLayer(document).pixels.set([20, 40, 60, 255], 0)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)

    fireEvent.contextMenu(screen.getByRole('button', { name: '播放动画' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '播放速度 2x' }))
    expect(session.animationPlaybackRate).toBe(2)
    expect(screen.queryByRole('menu', { name: '播放设置' })).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('button', { name: '播放动画' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '播放一次' }))
    expect(document.animation?.loop).toBe(false)
    fireEvent.contextMenu(screen.getByRole('button', { name: '播放动画' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '播放标签并重复' }))
    expect(session.animationPlaybackMode).toBe('tag')

    const panel = container.querySelector('.layers-panel') as HTMLElement
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
    expect(panel).toHaveClass('layer-density-normal')
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
    expect(panel).toHaveClass('layer-density-detailed')
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
    expect(panel).toHaveClass('layer-density-expanded')
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
    expect(panel).toHaveClass('layer-density-large')
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
    expect(panel).toHaveClass('layer-density-huge')
    expect(container.querySelector('.cel-thumbnail')).toBeInTheDocument()

    // Shift is the horizontal axis; Alt only accelerates it.
    const list = container.querySelector('.layer-animation-list') as HTMLElement
    const scrollWidth = vi.spyOn(list, 'scrollWidth', 'get').mockReturnValue(3_000)
    const clientWidth = vi.spyOn(list, 'clientWidth', 'get').mockReturnValue(400)
    list.scrollLeft = 0
    fireEvent.wheel(panel, { altKey: true, shiftKey: true, deltaY: 120 })
    expect(list.scrollLeft).toBeGreaterThan(0)
    scrollWidth.mockRestore()
    clientWidth.mockRestore()

    const separator = screen.getByRole('separator', { name: '调整图层名称区域宽度' })
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(localStorage.getItem('moonsprite.layers.label-width')).toBe('202')
  })

  it('keeps each wheel gesture on one axis and one action', () => {
    const document = createDocument('wheel gestures', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const panel = container.querySelector('.layers-panel') as HTMLElement
    const list = container.querySelector('.layer-animation-list') as HTMLElement
    const wheel = (init: { deltaX?: number; deltaY?: number; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
      const event = createEvent.wheel(panel, { cancelable: true, ...init })
      fireEvent(panel, event)
      return event
    }
    const atZero = () => { list.scrollTop = 0; list.scrollLeft = 0 }

    // Plain wheel stays with the browser, so native vertical scrolling is untouched.
    atZero()
    expect(wheel({ deltaY: 120 }).defaultPrevented).toBe(false)
    expect(list.scrollTop).toBe(0)
    expect(list.scrollLeft).toBe(0)

    // Shift is the horizontal axis on its own.
    atZero()
    expect(wheel({ shiftKey: true, deltaY: 120 }).defaultPrevented).toBe(false)
    expect(list.scrollTop).toBe(0)

    // Ctrl resizes only, and is consumed even at the size limit so the browser can
    // never fall back to its own zoom.
    atZero()
    const densityBefore = panel.className
    const ctrl = wheel({ ctrlKey: true, deltaY: -100 })
    expect(ctrl.defaultPrevented).toBe(true)
    expect(panel.className).not.toBe(densityBefore)
    expect(list.scrollTop).toBe(0)
    expect(list.scrollLeft).toBe(0)
    expect(wheel({ ctrlKey: true, deltaY: -100 }).defaultPrevented).toBe(true)
    expect(list.scrollTop).toBe(0)
  })

  it('uses Alt as an accelerator for the plain, Shift and Ctrl wheel', () => {
    const document = createDocument('wheel acceleration', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const panel = container.querySelector('.layers-panel') as HTMLElement
    const list = container.querySelector('.layer-animation-list') as HTMLElement
    const scrollHeight = vi.spyOn(list, 'scrollHeight', 'get').mockReturnValue(2_400)
    const clientHeight = vi.spyOn(list, 'clientHeight', 'get').mockReturnValue(400)
    const scrollWidth = vi.spyOn(list, 'scrollWidth', 'get').mockReturnValue(2_000)
    const clientWidth = vi.spyOn(list, 'clientWidth', 'get').mockReturnValue(400)
    const wheel = (init: { deltaX?: number; deltaY?: number; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean }) => {
      const event = createEvent.wheel(panel, { cancelable: true, ...init })
      fireEvent(panel, event)
      return event
    }
    const atZero = () => { list.scrollTop = 0; list.scrollLeft = 0 }

    // Alt + plain wheel accelerates the vertical scroll.
    atZero()
    expect(wheel({ altKey: true, deltaY: 120 }).defaultPrevented).toBe(true)
    expect(list.scrollTop).toBe(600)
    expect(list.scrollLeft).toBe(0)

    // Alt + Shift accelerates the horizontal pan.
    atZero()
    wheel({ altKey: true, shiftKey: true, deltaY: 120 })
    expect(list.scrollLeft).toBe(600)
    expect(list.scrollTop).toBe(0)

    // The accelerated pan still stops at the last reachable offset.
    list.scrollLeft = 1_550
    wheel({ altKey: true, shiftKey: true, deltaY: 120 })
    expect(list.scrollLeft).toBe(1_600)
    list.scrollTop = 1_550
    wheel({ altKey: true, deltaY: 120 })
    expect(list.scrollTop).toBe(2_000)

    // Alt + Ctrl skips several display sizes per notch instead of one.
    const sizes = ['compact', 'normal', 'detailed', 'expanded', 'large', 'huge']
    const indexOfDensity = () => sizes.indexOf(sizes.find((size) => panel.classList.contains(`layer-density-${size}`))!)
    const start = indexOfDensity()
    wheel({ altKey: true, ctrlKey: true, deltaY: -100 })
    expect(indexOfDensity() - start).toBe(3)

    scrollHeight.mockRestore()
    clientHeight.mockRestore()
    scrollWidth.mockRestore()
    clientWidth.mockRestore()
  })

  it('consumes the wheel before panning so native scroll cannot add a second axis', () => {
    const document = createDocument('wheel ordering', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const panel = container.querySelector('.layers-panel') as HTMLElement
    const list = container.querySelector('.layer-animation-list') as HTMLElement

    const scrollWidth = vi.spyOn(list, 'scrollWidth', 'get').mockReturnValue(3_000)
    const clientWidth = vi.spyOn(list, 'clientWidth', 'get').mockReturnValue(400)
    const order: string[] = []
    const originalPreventDefault = WheelEvent.prototype.preventDefault
    WheelEvent.prototype.preventDefault = function (this: WheelEvent) {
      order.push('preventDefault')
      return originalPreventDefault.call(this)
    }
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')
    Object.defineProperty(list, 'scrollLeft', {
      configurable: true,
      get: () => 0,
      set: () => { order.push('scroll') }
    })
    try {
      fireEvent(panel, createEvent.wheel(panel, { cancelable: true, altKey: true, shiftKey: true, deltaY: 120 }))
      expect(order[0]).toBe('preventDefault')
      expect(order).toEqual(['preventDefault', 'scroll'])
    } finally {
      WheelEvent.prototype.preventDefault = originalPreventDefault
      if (descriptor) Object.defineProperty(list, 'scrollLeft', descriptor)
      else delete (list as unknown as Record<string, unknown>).scrollLeft
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
    }
  })
  it('listens for wheel on the panel with a non-passive listener', () => {
    const document = createDocument('wheel listener options', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const addEventListener = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    // (type, listener, options) — the panel must own a non-passive wheel listener so
    // preventDefault stays authoritative for the modifier branches.
    const wheelCalls = addEventListener.mock.calls.filter(([type]) => type === 'wheel')
    expect(wheelCalls.length).toBeGreaterThan(0)
    expect(wheelCalls.some(([, , options]) => (options as AddEventListenerOptions | undefined)?.passive === false)).toBe(true)
    addEventListener.mockRestore()
  })
  it('shows a layer mask thumbnail after Ctrl+wheel enlarges the timeline', () => {
    const document = createDocument('mask thumbnail', 2, 2, 'rgba')
    getActiveLayer(document).pixels[3] = 255
    useWorkspace.getState().addSession(document)
    const cel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().createLayerMask(cel.id)
    const { container, rerender } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    expect(container.querySelector('.layer-mask-thumbnail')).not.toBeInTheDocument()
    const panel = container.querySelector('.layers-panel') as HTMLElement
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
    expect(panel).toHaveClass('layer-density-normal')
    fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })

    expect(panel).toHaveClass('layer-density-detailed')
    expect(container.querySelector('.cel-mask-marker')).toBeInTheDocument()
    expect(container.querySelector('.layer-mask-thumbnail')).toBeInTheDocument()
  })

  it('disables layer-mask creation and paste for empty cels with an explanatory tooltip', async () => {
    const document = createDocument('empty mask commands', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    fireEvent.contextMenu(container.querySelector<HTMLElement>('[data-animation-cel-key]')!, { clientX: 30, clientY: 40 })

    const createMask = screen.getByRole('menuitem', { name: '新建图层蒙版' })
    const pasteMask = screen.getByRole('menuitem', { name: '粘贴图层蒙版单元格' })
    expect(createMask).toBeDisabled()
    expect(pasteMask).toBeDisabled()

    fireEvent.pointerEnter(createMask.closest('.moon-tooltip-anchor')!)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('当前图层单元格没有可见内容，无法创建或粘贴图层蒙版。请先在该单元格中绘制内容。')
  })


  it('outlines the complete selected frame column instead of only its header', () => {
    const document = createDocument('animation frame selection', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)

    fireEvent.click(screen.getByRole('button', { name: '第 2 帧' }))
    rerender(<LayersPanel session={session} docked />)

    const column = container.querySelector<HTMLElement>('.animation-frame-selection-column')
    expect(column).not.toBeNull()
    expect(column?.style.getPropertyValue('--animation-frame-index')).toBe('1')
    expect(screen.getByRole('button', { name: '第 2 帧' })).not.toHaveClass('selected-frame-range-start', 'selected-frame-range-end')
  })

  it('uses separate outer frames for non-contiguous frame multi-selection', () => {
    const document = createDocument('animation frame range outline', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)
    const frames = screen.getAllByRole('button', { name: /第 [1-3] 帧/ })
    fireEvent.click(frames[0])
    fireEvent.click(frames[2], { ctrlKey: true })
    rerender(<LayersPanel session={session} docked />)

    const selections = container.querySelectorAll<HTMLElement>('.animation-frame-selection-column')
    expect(selections).toHaveLength(2)
    expect(selections[0].style.getPropertyValue('--animation-frame-index')).toBe('0')
    expect(selections[0].style.getPropertyValue('--animation-frame-span')).toBe('1')
    expect(selections[1].style.getPropertyValue('--animation-frame-index')).toBe('2')
    expect(selections[1].style.getPropertyValue('--animation-frame-span')).toBe('1')
    expect(selections[0].style.getPropertyValue('--animation-frame-index')).not.toBe('1')
  })

  it('moves a pointer-dragged frame header and fades the source while dragging', () => {
    const document = createDocument('animation frame drag', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [firstFrame, secondFrame, thirdFrame] = timeline.frames
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)
    const first = screen.getByRole('button', { name: '第 1 帧' })
    const third = screen.getByRole('button', { name: '第 3 帧' })
    vi.spyOn(third, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 134, top: 0, bottom: 30, width: 34, height: 30, x: 100, y: 0, toJSON: () => ({}) })

    fireEvent.pointerDown(first, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(first, { clientX: 10, clientY: 10 })
    const outline = container.querySelector<HTMLElement>('[data-animation-frame-selection]')!
    vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 34, top: 0, bottom: 114, width: 34, height: 114, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(first, { button: 0, clientX: 1, clientY: 10 })
    fireEvent.pointerMove(third, { clientX: 133, clientY: 10 })
    expect(first).toHaveClass('dragging')
    expect(container.querySelector('.animation-frame-drop-line')).toBeInTheDocument()
    fireEvent.pointerUp(third, { clientX: 133, clientY: 10 })

    expect(timeline.frames.map((frame) => frame.id)).toEqual([secondFrame.id, thirdFrame.id, firstFrame.id])
  })

  it('continues scrolling the timeline while dragging selected frames at its horizontal edge', () => {
    vi.useFakeTimers()
    const document = createDocument('animation frame edge auto scroll', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const session = useWorkspace.getState().sessions[0]
    useWorkspace.getState().selectAnimationFrame(timeline.frames[0].id)
    const { container } = render(<LayersPanel session={session} docked />)
    const list = container.querySelector<HTMLElement>('.layer-animation-list')!
    const first = container.querySelector<HTMLElement>(`[data-animation-frame-id="${timeline.frames[0].id}"]`)!
    const outline = container.querySelector<HTMLElement>('[data-animation-frame-selection]')!
    vi.spyOn(list, 'scrollWidth', 'get').mockReturnValue(1_000)
    vi.spyOn(list, 'clientWidth', 'get').mockReturnValue(200)
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 200, top: 0, bottom: 120, width: 200, height: 120, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 200, top: 0, bottom: 120, width: 200, height: 120, x: 0, y: 0, toJSON: () => ({}) })

    fireEvent.pointerDown(first, { button: 0, pointerId: 7, clientX: 1, clientY: 10 })
    fireEvent.pointerMove(first, { pointerId: 7, clientX: 199, clientY: 10 })
    act(() => vi.advanceTimersByTime(50))
    expect(list.scrollLeft).toBeGreaterThan(18)

    fireEvent.pointerUp(first, { pointerId: 7, clientX: 199, clientY: 10 })
    const stoppedAt = list.scrollLeft
    act(() => vi.advanceTimersByTime(50))
    expect(list.scrollLeft).toBe(stoppedAt)

    const tree = container.querySelector<HTMLElement>('.layer-animation-tree')!
    vi.spyOn(tree, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 100, top: 0, bottom: 120, width: 100, height: 120, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(outline, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 200, top: 0, bottom: 120, width: 100, height: 120, x: 100, y: 0, toJSON: () => ({}) })
    list.scrollLeft = 100
    fireEvent.pointerDown(first, { button: 0, pointerId: 8, clientX: 199, clientY: 10 })
    fireEvent.pointerMove(first, { pointerId: 8, clientX: 101, clientY: 10 })
    act(() => vi.advanceTimersByTime(50))
    expect(list.scrollLeft).toBeLessThan(100)
    fireEvent.pointerUp(first, { pointerId: 8, clientX: 101, clientY: 10 })
  })







  it('updates the frame range outline continuously while dragging across headers', () => {
    vi.useFakeTimers()
    const document = createDocument('animation live range preview', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)
    const frames = Array.from(container.querySelectorAll<HTMLElement>('[data-animation-frame-id]'))

    fireEvent.pointerDown(frames[0], { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(frames[1], { pointerId: 1, clientX: 50, clientY: 10 })
    expect(container.querySelector<HTMLElement>('[data-animation-frame-selection]')?.style.getPropertyValue('--animation-frame-span')).toBe('2')
    fireEvent.pointerMove(frames[2], { pointerId: 1, clientX: 90, clientY: 10 })
    expect(container.querySelector<HTMLElement>('[data-animation-frame-selection]')?.style.getPropertyValue('--animation-frame-span')).toBe('3')
    fireEvent.pointerUp(frames[2], { pointerId: 1, clientX: 90, clientY: 10 })
    expect(session.selectedAnimationFrameIds).toHaveLength(3)
    vi.useRealTimers()
  })

  it('updates the cel range outline continuously while dragging across cells', () => {
    const document = createDocument('animation live cel range preview', 1, 1, 'rgba')
    const secondLayer = createLayer('second', 1, 1, 'rgba')
    document.layers.push(secondLayer)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)

    useWorkspace.getState().duplicateAnimationFrame()
    rerender(<LayersPanel session={session} docked />)

    const timeline = ensureAnimationDocument(document)
    const firstKey = animationCelKey(document.layers[0].id, timeline.frames[0].id)
    const lastKey = animationCelKey(secondLayer.id, timeline.frames[1].id)
    const firstCell = container.querySelector<HTMLElement>(`[data-animation-cel-key="${firstKey}"]`)!
    const lastCell = container.querySelector<HTMLElement>(`[data-animation-cel-key="${lastKey}"]`)!

    fireEvent.pointerDown(firstCell, { button: 0, pointerId: 1, clientX: 10, clientY: 50 })
    fireEvent.pointerMove(lastCell, { pointerId: 1, clientX: 50, clientY: 90 })

    const outline = container.querySelector<HTMLElement>('[data-animation-cel-selection]')
    expect(outline?.style.getPropertyValue('--animation-frame-span')).toBe('2')
    expect(outline?.style.getPropertyValue('--animation-row-span')).toBe('2')
    expect(session.selectedAnimationCellKeys).toHaveLength(0)

    fireEvent.pointerUp(lastCell, { pointerId: 1, clientX: 50, clientY: 90 })
    expect(session.selectedAnimationCellKeys).toHaveLength(4)
  })

  it('extends a selected frame range while the pointer moves through cel rows', () => {
    vi.useFakeTimers()
    const document = createDocument('animation frame range through cells', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const session = useWorkspace.getState().sessions[0]
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().selectAnimationFrame(timeline.frames[0].id)
    const { container } = render(<LayersPanel session={session} docked />)
    const firstHeader = container.querySelector<HTMLElement>(`[data-animation-frame-id="${timeline.frames[0].id}"]`)!
    const fourthCell = container.querySelector<HTMLElement>(`[data-animation-cel-key="${animationCelKey(document.activeLayerId, timeline.frames[3].id)}"]`)!

    fireEvent.pointerDown(firstHeader, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    act(() => vi.advanceTimersByTime(360))
    fireEvent.pointerMove(fourthCell, { pointerId: 1, clientX: 130, clientY: 60 })

    expect(container.querySelector<HTMLElement>('[data-animation-frame-selection]')?.style.getPropertyValue('--animation-frame-span')).toBe('4')
    fireEvent.pointerUp(fourthCell, { pointerId: 1, clientX: 130, clientY: 60 })
    expect(session.selectedAnimationFrameIds).toEqual(timeline.frames.map((frame) => frame.id))
    expect(session.selectedAnimationCellKeys).toEqual([])
    vi.useRealTimers()
  })






  it('keeps cel properties available but disables content-only commands for an empty cel context menu', () => {
    const document = createDocument('empty cel menu', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(screen.getByRole('button', { name: '第 1 帧动画单元格' }))

    expect(screen.getByRole('menuitem', { name: '单元格属性' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: '复制单元格' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '删除单元格' })).toBeDisabled()
  })

  it('connects selected cels from the cel context menu', () => {
    const document = createDocument('connect cel menu', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const firstKey = animationCelKey(layer.id, timeline.frames[0].id)
    const secondKey = animationCelKey(layer.id, timeline.frames[1].id)
    useWorkspace.getState().selectAnimationCell(firstKey)
    useWorkspace.getState().selectAnimationCell(secondKey, 'toggle')
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-animation-cel-key="${secondKey}"]`)!)
    fireEvent.click(screen.getByRole('menuitem', { name: '连接单元格' }))

    expect(ensureAnimationDocument(document).cels.find((cel) => cel.frameId === timeline.frames[1].id)?.linkedCelId).toBe(
      ensureAnimationDocument(document).cels.find((cel) => cel.frameId === timeline.frames[0].id)?.id
    )
    expect(container.querySelector(`[data-animation-cel-key="${firstKey}"]`)).toHaveClass('linked-cel')
    expect(container.querySelector(`[data-animation-cel-key="${secondKey}"]`)).toHaveClass('linked-cel')

    fireEvent.contextMenu(container.querySelector(`[data-animation-cel-key="${firstKey}"]`)!)
    expect(screen.getByRole('menuitem', { name: '断开单元格连接' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('menuitem', { name: '断开单元格连接' }))
    expect(ensureAnimationDocument(document).cels.find((cel) => cel.frameId === timeline.frames[1].id)?.linkedCelId).toBeNull()
  })

  it('renders adjacent linked cels as one block and shows selected non-adjacent links', () => {
    const document = createDocument('linked cel visuals', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const linkedFrames = [timeline.frames[0], timeline.frames[2], timeline.frames[3]]
    const linkedCels = linkedFrames.map((frame) => timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === frame.id)!)
    expect(connectAnimationCels(document, linkedCels.map((cel) => cel.id))).toBe(true)
    linkedFrames.forEach((frame, index) => useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, frame.id), index === 0 ? 'replace' : 'toggle'))

    const { container, rerender } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    expect(container.querySelector('[data-linked-cel-block][data-frame-index="2"][data-frame-span="2"]')).toBeInTheDocument()
    expect(container.querySelector('[data-linked-cel-block][data-frame-index="0"][data-frame-span="1"]')).toHaveClass('selected')
    expect(container.querySelector('[data-linked-cel-block][data-frame-index="2"][data-frame-span="2"]')).toHaveClass('selected')
    expect(container.querySelector('[data-linked-cel-connector][data-start-frame-index="0"][data-end-frame-index="2"]')).toBeInTheDocument()
    expect(container.querySelector('[data-linked-cel-connector][data-start-frame-index="0"][data-end-frame-index="2"]')).toHaveClass('selected')

    useWorkspace.getState().selectAnimationFrame(timeline.frames[2].id)
    rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    expect(container.querySelector('[data-linked-cel-block][data-frame-index="2"][data-frame-span="2"]')).toHaveClass('selected')
    expect(container.querySelector('[data-linked-cel-connector][data-start-frame-index="0"][data-end-frame-index="2"]')).toHaveClass('selected')

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, timeline.frames[1].id))
    rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    expect(container.querySelector('[data-linked-cel-connector]')).not.toBeInTheDocument()
  })

  it('does not highlight the linked run from active context after deselection', () => {
    const document = createDocument('active linked cel visual', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const cels = timeline.frames.map((frame) => timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === frame.id)!).filter(Boolean)
    expect(connectAnimationCels(document, cels.map((cel) => cel.id))).toBe(true)
    useWorkspace.getState().clearAnimationSelection(true)

    const { container } = render(<ConnectedLayersPanel />)

    expect(container.querySelector('[data-linked-cel-block]')).not.toHaveClass('selected')
  })


  it('keeps thumbnails on every cel in a linked group at enlarged density', () => {
    localStorage.setItem('moonsprite.layers.display-density', 'huge')
    const document = createDocument('linked cel thumbnails', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels.set([20, 40, 60, 255], 0)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const cels = timeline.frames.map((frame) => timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === frame.id)!).filter(Boolean)
    expect(connectAnimationCels(document, cels.map((cel) => cel.id))).toBe(true)

    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    expect(container.querySelectorAll('.layer-animation-cel .cel-thumbnail canvas')).toHaveLength(3)
    expect(container.querySelector('[data-linked-cel-block]')).toBeInTheDocument()
    expect(container.querySelector('[data-linked-cel-connector]')).not.toBeInTheDocument()
    expect(container.querySelector('.layer-animation-cel.linked-cel')).toBeInTheDocument()
    expect(container.querySelectorAll('.cel-thumbnail.shared-checkerboard')).toHaveLength(3)
  })


  it('persists animation density and onion skin from layer settings', () => {
    const spriteDocument = createDocument('layer settings', 1, 1, 'rgba')
    useWorkspace.getState().addSession(spriteDocument)
    const { container, rerender } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.click(container.querySelector<HTMLButtonElement>('.panel-actions button:last-child')!)
    const modal = document.querySelector<HTMLElement>('.layer-settings-modal')
    expect(modal).not.toBeNull()
    const densitySlider = modal!.querySelector<HTMLElement>('.layer-density-range .range-slider')!
    const densityLabel = within(modal!).getByText('紧凑')
    fireEvent.pointerEnter(densitySlider)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.pointerEnter(densityLabel.parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('隐藏次要信息，以最小行高显示更多图层与帧。')
    fireEvent.pointerLeave(densityLabel.parentElement!)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(modal!.querySelector('.layer-settings-pair')).toBeNull()
    const skipDisabledFrames = screen.getByRole('checkbox', { name: '左右切换时跳过停用帧' })
    expect(skipDisabledFrames).toBeChecked()
    const onionPlayback = screen.getByRole('checkbox', { name: '播放动画时显示洋葱皮' })
    expect(onionPlayback).toBeChecked()
    fireEvent.click(onionPlayback)
    fireEvent.click(skipDisabledFrames)
    fireEvent.click(screen.getByRole('checkbox', { name: '启用洋葱皮' }))
    expect(modal!.querySelector('.layer-settings-pair')).not.toBeNull()
    fireEvent.submit(modal!)

    expect(JSON.parse(localStorage.getItem(ONION_SKIN_PREFERENCE_KEY) ?? '{}')).toMatchObject({ enabled: true, showDuringPlayback: false, previousFrames: 1, nextFrames: 1 })
    expect(localStorage.getItem(SKIP_DISABLED_FRAMES_PREFERENCE_KEY)).toBe('false')
  })

  it('hides timeline editing and clears active animation interaction from layer settings', () => {
    const spriteDocument = createDocument('hidden timeline', 1, 1, 'rgba')
    useWorkspace.getState().addSession(spriteDocument)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().setAnimationPlaying(true)
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)

    fireEvent.click(container.querySelector<HTMLButtonElement>('.panel-actions button:last-child')!)
    fireEvent.click(screen.getByRole('checkbox', { name: '隐藏时间轴' }))

    expect(container.querySelector('.layers-panel')).toHaveClass('timeline-hidden')
    expect(container.querySelector('.layer-animation-toolbar')).toBeInTheDocument()
    expect(document.querySelector('.layer-settings-modal')).toHaveClass('timeline-disabled')
    expect(document.querySelector('.layer-settings-onion')).toBeDisabled()
    expect(localStorage.getItem(TIMELINE_HIDDEN_PREFERENCE_KEY)).toBe('true')
    expect(useWorkspace.getState().sessions[0].animationPlaying).toBe(false)
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([])
  })
})

describe('LayersPanel properties', () => {

  it('creates a layer-group mask from the group menu and renders a normal-size mask cell', () => {
    const document = createDocument('group mask menu', 2, 2, 'rgba')
    const group = { id: 'group-1', name: 'Folder', visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups.push(group)
    document.layers[0].groupId = group.id
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-group-id="${group.id}"]`)!, { clientX: 20, clientY: 20 })
    const createMaskItem = screen.getAllByRole('menuitem').find((item) => item.textContent?.includes('新建图层组蒙版'))
    expect(createMaskItem).toBeDefined()
    fireEvent.click(createMaskItem!)
    rerender(<LayersPanel session={session} docked />)

    const mask = ensureAnimationDocument(document).groupMasks?.[0]?.mask
    expect(mask).toBeDefined()
    expect(container.querySelector(`[data-layer-mask-row-owner="${group.id}"]`)).toHaveTextContent('图层组蒙版')
    expect(container.querySelector(`[data-layer-mask-id="${mask?.id}"]`)).toBeInTheDocument()
  })


  it('extends a mask-cell selection while long-press dragging across frames', () => {
    vi.useFakeTimers()
    const document = createDocument('mask long press selection', 1, 1, 'rgba')
    getActiveLayer(document).pixels[3] = 255
    useWorkspace.getState().addSession(document)
    const firstCel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().createLayerMask(firstCel.id)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().clearAnimationSelection()
    const timeline = ensureAnimationDocument(document)
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)
    const cells = Array.from(container.querySelectorAll<HTMLElement>('[data-animation-mask-cel-key]'))

    fireEvent.pointerDown(cells[0], { button: 0, pointerId: 1, clientX: 10, clientY: 40 })
    act(() => vi.advanceTimersByTime(360))
    fireEvent.pointerMove(cells[1], { pointerId: 1, clientX: 50, clientY: 40 })
    expect(container.querySelector<HTMLElement>('[data-animation-cel-selection]')?.style.getPropertyValue('--animation-frame-span')).toBe('2')
    expect([...container.querySelectorAll<HTMLElement>('.animation-active-cell-column')].some((column) =>
      column.style.getPropertyValue('--animation-frame-index') === '0'
      && column.style.getPropertyValue('--animation-frame-span') === '2'
    )).toBe(true)
    expect(cells.every((cell) => cell.classList.contains('active-frame'))).toBe(true)
    fireEvent.pointerUp(cells[1], { pointerId: 1, clientX: 50, clientY: 40 })
    expect(session.selectedAnimationMaskCellKeys).toEqual(timeline.frames.map((frame) => animationCelKey(document.activeLayerId, frame.id)))
    expect(cells.every((cell) => cell.classList.contains('active-frame'))).toBe(true)
  })

  it('toggles clipping masks for layers and groups from the context menu', () => {
    const document = createDocument('clipping mask menu', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${layer.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '开启剪贴蒙版' }))
    rerender(<LayersPanel session={session} docked />)
    expect(layer.clippingMask).toBe(true)
    expect(container.querySelector(`[data-layer-id="${layer.id}"] [data-pixel-icon="clippingMask"]`)).toBeInTheDocument()

    fireEvent.contextMenu(container.querySelector('[data-group-id="group"]')!, { clientX: 20, clientY: 48 })
    fireEvent.click(screen.getByRole('menuitem', { name: '开启剪贴蒙版' }))
    rerender(<LayersPanel session={session} docked />)
    expect(document.groups[0].clippingMask).toBe(true)
    expect(container.querySelector('[data-group-id="group"] [data-pixel-icon="clippingMask"]')).toBeInTheDocument()

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${layer.id}"]`)!, { clientX: 20, clientY: 76 })
    fireEvent.click(screen.getByRole('menuitem', { name: '关闭剪贴蒙版' }))
    expect(layer.clippingMask).toBeUndefined()
  })

  it('groups layer type changes under Convert To and opens the Tilemap conversion dialog', () => {
    const document = createDocument('layer conversion menu', 8, 8, 'rgba')
    const layer = getActiveLayer(document)
    layer.name = 'Source Pixels'
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${layer.id}"]`)!, { clientX: 20, clientY: 20 })
    const contextMenu = globalThis.document.body.querySelector<HTMLElement>('.layer-context-menu')!
    expect(within(contextMenu).getByRole('button', { name: '转换为' })).toBeInTheDocument()
    expect(within(contextMenu).queryByRole('menuitem', { name: '停用图层样式' })).not.toBeInTheDocument()
    expect(within(contextMenu).queryByRole('menuitem', { name: '启用图层样式' })).not.toBeInTheDocument()
    const convertMenu = within(contextMenu).getByRole('menu', { name: '转换为', hidden: true })
    expect(within(convertMenu).getByRole('menuitem', { name: '转换为背景图层', hidden: true })).toBeEnabled()
    expect(within(convertMenu).getByRole('menuitem', { name: '转换为普通图层', hidden: true })).toBeDisabled()

    fireEvent.click(within(convertMenu).getByRole('menuitem', { name: '转换为瓦片图层', hidden: true }))

    expect(screen.getByRole('dialog', { name: '转换为瓦片图层' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Source Pixels')).toBeInTheDocument()
  })

  it('opens layer styles for layers and groups from their context menu or status icon', () => {
    const document = createDocument('layer style menu', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const layerStyles = createDefaultLayerStyles()
    layerStyles.stroke.enabled = true
    layer.layerStyles = layerStyles
    const groupStyles = createDefaultLayerStyles()
    groupStyles.shadow.enabled = true
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles: groupStyles })
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(container.querySelector('[data-group-id="group"]')!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '图层样式' }))
    expect(screen.getByRole('dialog', { name: '图层样式' })).toHaveTextContent('Group')
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    const layerIndicator = container.querySelector(`[data-layer-id="${layer.id}"] .layer-style-indicator`)
    const groupIndicator = container.querySelector('[data-group-id="group"] .layer-style-indicator')
    expect(layerIndicator).toBeInTheDocument()
    expect(groupIndicator).toBeInTheDocument()
    fireEvent.click(layerIndicator!)

    expect(screen.getByRole('dialog', { name: '图层样式' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `${layer.name} 图层样式` })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: '图层样式效果' })).getByRole('button', { name: '描边' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: '图层样式' })
    expect(dialog.querySelector('.layer-style-effect-editor > header')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: '描边设置' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '圆形' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '方形' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '水平' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '垂直' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('允许描边的像素方向')).toBeInTheDocument()
    expect(within(within(dialog).getByRole('group', { name: '位置' })).getByRole('button', { name: '两侧' })).toBeInTheDocument()
    expect(dialog.querySelector('.layer-style-effect-list')).toHaveClass('component-scrollbar')
    expect(dialog.querySelector('.layer-style-fields')).toHaveClass('component-scrollbar')
    expect(dialog.querySelector('.color-value-trigger')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '智能色相' }))
    expect(dialog.querySelector('.color-value-trigger')).not.toBeInTheDocument()
    expect(dialog.querySelector('.layer-style-smart-darkness')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '方形' }))
    expect(layer.layerStyles?.stroke).toMatchObject({ kernel: 'square', directions: { nw: true, n: true, ne: true, w: true, e: true, sw: true, s: true, se: true } })
    fireEvent.click(within(screen.getByRole('navigation', { name: '图层样式效果' })).getByRole('button', { name: '阴影' }))
    expect(dialog.querySelector('.color-value-trigger')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '智能阴影' }))
    expect(dialog.querySelector('.color-value-trigger')).not.toBeInTheDocument()
    expect(dialog.querySelector('.layer-style-smart-darkness')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: '图层样式效果' })).getByRole('button', { name: '渐变叠加' }))
    expect(within(dialog).getByRole('button', { name: '渐变抖动' })).toBeInTheDocument()
  })

  it('opens batch properties on double-click without collapsing a multi-layer selection', () => {
    const document = createDocument('double-click batch properties', 2, 2, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 2, 2, 'rgba')
    document.layers.push(top)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([bottom.id, top.id], [])
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)

    fireEvent.doubleClick(container.querySelector(`[data-layer-id="${top.id}"]`)!)

    expect(screen.getByRole('heading', { name: '多个图层属性' })).toBeInTheDocument()
    expect(session.selectedLayerIds).toEqual([bottom.id, top.id])
  })

  it('opens layer styles for the current multi-selection and commits one batch action', () => {
    const document = createDocument('batch layer style dialog', 2, 2, 'rgba')
    const source = getActiveLayer(document)
    const target = createLayer('Target', 2, 2, 'rgba')
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.size = 4
    source.layerStyles = styles
    document.layers.push(target)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([source.id, target.id], [])
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${source.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '图层样式' }))
    expect(screen.getByRole('heading', { name: '多个图层 图层样式' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '应用' }))

    expect(source.layerStyles?.stroke.size).toBe(4)
    expect(target.layerStyles?.stroke).toMatchObject({ enabled: true, size: 4 })
    useWorkspace.getState().undo()
    expect(source.layerStyles?.stroke.size).toBe(4)
    expect(target.layerStyles).toBeUndefined()
  })

  it('copies a layer style from the context menu and pastes or clears it across the selection', () => {
    const document = createDocument('layer style menu actions', 2, 2, 'rgba')
    const source = getActiveLayer(document)
    const target = createLayer('Target', 2, 2, 'rgba')
    const styles = createDefaultLayerStyles()
    styles.shadow.enabled = true
    source.layerStyles = styles
    document.layers.push(target)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${source.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '复制图层样式' }))
    rerender(<LayersPanel session={session} docked />)
    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${target.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '粘贴图层样式' }))
    expect(target.layerStyles?.shadow.enabled).toBe(true)

    useWorkspace.getState().selectLayerRows([source.id, target.id], [])
    rerender(<LayersPanel session={session} docked />)
    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${target.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '清除图层样式' }))
    expect(source.layerStyles).toBeUndefined()
    expect(target.layerStyles).toBeUndefined()
  })

  it('toggles layer styles from the context menu without hiding the status icon', () => {
    const document = createDocument('layer style visibility menu', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const styles = createDefaultLayerStyles()
    styles.stroke.enabled = true
    styles.stroke.size = 4
    layer.layerStyles = styles
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container, rerender } = render(<LayersPanel session={session} docked />)
    const row = container.querySelector(`[data-layer-id="${layer.id}"]`)!

    expect(row.querySelector('.layer-style-indicator')).toBeInTheDocument()
    fireEvent.contextMenu(row, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '停用图层样式' }))
    expect(layer.layerStyles).toMatchObject({ enabled: false, stroke: { enabled: true, size: 4 } })

    rerender(<LayersPanel session={session} docked />)
    expect(container.querySelector(`[data-layer-id="${layer.id}"] .layer-style-indicator`)).toBeInTheDocument()
    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${layer.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '启用图层样式' }))
    expect(layer.layerStyles).toMatchObject({ enabled: true, stroke: { enabled: true, size: 4 } })
  })

  it('Alt-drags the layer style indicator to copy styles onto another layer', () => {
    const document = createDocument('drag layer style', 2, 2, 'rgba')
    const source = getActiveLayer(document)
    const target = createLayer('Target', 2, 2, 'rgba')
    const styles = createDefaultLayerStyles()
    styles.colorOverlay.enabled = true
    source.layerStyles = styles
    document.layers.push(target)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const { container } = render(<LayersPanel session={session} docked />)
    const indicator = container.querySelector<HTMLElement>(`[data-layer-id="${source.id}"] .layer-style-indicator`)!
    const targetRow = container.querySelector<HTMLElement>(`[data-layer-id="${target.id}"]`)!
    const originalElementFromPoint = window.document.elementFromPoint
    Object.defineProperty(window.document, 'elementFromPoint', { configurable: true, value: vi.fn(() => targetRow) })

    try {
      fireEvent.pointerDown(indicator, { button: 0, altKey: true, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(window, { clientX: 40, clientY: 40 })
      expect(targetRow).toHaveClass('layer-style-drop-target')
      fireEvent.pointerUp(window, { clientX: 40, clientY: 40 })
      expect(target.layerStyles?.colorOverlay.enabled).toBe(true)
    } finally {
      Object.defineProperty(window.document, 'elementFromPoint', { configurable: true, value: originalElementFromPoint })
    }
  })

  it('edits a single selected group without changing its implicit descendant selection', () => {
    const document = createDocument('single group properties', 2, 2, 'rgba')
    const member = getActiveLayer(document)
    member.groupId = 'group'
    member.blendMode = 'screen'
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectGroup('group')
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(container.querySelector('[data-group-id="group"]')!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    expect(screen.getByRole('heading', { name: '图层组属性' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '混合模式' }))
    fireEvent.click(screen.getByRole('option', { name: '正片叠底' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /累积混合/ }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(document.groups[0].blendMode).toBe('multiply')
    expect(document.groups[0].cumulativeBlend).toBe(true)
    expect(member.blendMode).toBe('screen')

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${member.id}"]`)!, { clientX: 20, clientY: 48 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    expect(screen.getByRole('heading', { name: `${member.name} 图层属性` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '混合模式' }))
    fireEvent.click(screen.getByRole('option', { name: '正常' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(document.groups[0].blendMode).toBe('multiply')
    expect(member.blendMode).toBe('normal')
  })

  it('commits the previewed properties and closes on Enter', () => {
    const document = createDocument('layer properties', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    render(<LayersPanel session={session} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(layer.name) }))
    const nameInput = screen.getByDisplayValue(layer.name)
    fireEvent.change(nameInput, { target: { value: '已确认名称' } })
    fireEvent.keyDown(nameInput, { key: 'Enter' })

    expect(layer.name).toBe('已确认名称')
    expect(screen.queryByDisplayValue('已确认名称')).not.toBeInTheDocument()
    expect(document.dirty).toBe(true)
  })

  it('commits a typed opacity value before Enter closes layer properties', async () => {
    const document = createDocument('layer opacity properties', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(layer.name) }))
    const opacity = screen.getByRole('slider', { name: '不透明度' })
    fireEvent.change(opacity, { target: { value: '37' } })
    fireEvent.keyDown(opacity, { key: 'Enter' })

    await waitFor(() => expect(layer.opacity).toBeCloseTo(0.37))
    expect(screen.queryByRole('heading', { name: '图层属性' })).not.toBeInTheDocument()
  })

  it('does not open properties when the visibility control is double-clicked', () => {
    const document = createDocument('layer visibility', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    render(<LayersPanel session={session} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: '隐藏图层' }))

    expect(screen.queryByRole('heading', { name: '图层属性' })).not.toBeInTheDocument()
  })

  it('ends a toggle gesture on click and previews a reversible crossed-row range', () => {
    const document = createDocument('layer toggle painting', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    const third = createLayer('Third', 2, 2, 'rgba')
    document.layers.push(second, third)
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const control = (layerId: string, selector: string): HTMLElement => container.querySelector<HTMLElement>(`[data-layer-id="${layerId}"] ${selector}`)!

    const firstVisibility = control(first.id, '.layer-visibility')
    const secondVisibility = control(second.id, '.layer-visibility')
    const thirdVisibility = control(third.id, '.layer-visibility')
    fireEvent.pointerDown(firstVisibility, { button: 0 })
    fireEvent.pointerUp(firstVisibility)
    fireEvent.pointerEnter(secondVisibility, { buttons: 0 })

    expect(first.visible).toBe(false)
    expect(second.visible).toBe(true)
    expect(third.visible).toBe(true)
    useWorkspace.getState().undo()
    expect(first.visible).toBe(true)

    fireEvent.pointerDown(firstVisibility, { button: 0 })
    fireEvent.pointerEnter(thirdVisibility, { buttons: 1 })

    expect(first.visible).toBe(false)
    expect(second.visible).toBe(false)
    expect(third.visible).toBe(false)

    fireEvent.pointerEnter(secondVisibility, { buttons: 1 })

    expect(first.visible).toBe(false)
    expect(second.visible).toBe(false)
    expect(third.visible).toBe(true)

    fireEvent.pointerEnter(firstVisibility, { buttons: 1 })
    fireEvent.pointerUp(window)

    expect(first.visible).toBe(false)
    expect(second.visible).toBe(true)
    expect(third.visible).toBe(true)
    useWorkspace.getState().undo()
    expect(first.visible).toBe(true)
    expect(second.visible).toBe(true)

    const firstLock = control(first.id, '.layer-lock-toggle')
    const secondLock = control(second.id, '.layer-lock-toggle')
    const thirdLock = control(third.id, '.layer-lock-toggle')
    fireEvent.pointerDown(firstLock, { button: 0 })
    fireEvent.pointerEnter(thirdLock, { buttons: 1 })

    expect(first.locked).toBe(true)
    expect(second.locked).toBe(true)
    expect(third.locked).toBe(true)

    fireEvent.pointerEnter(secondLock, { buttons: 1 })

    expect(first.locked).toBe(true)
    expect(second.locked).toBe(true)
    expect(third.locked).toBe(false)

    fireEvent.pointerEnter(firstLock, { buttons: 1 })
    fireEvent.pointerUp(window)

    expect(first.locked).toBe(true)
    expect(second.locked).toBe(false)
    expect(third.locked).toBe(false)
    useWorkspace.getState().undo()
    expect(first.locked).toBe(false)
    expect(second.locked).toBe(false)
  })

  it('dims child visibility controls while a parent group is hidden and reopens the group only when showing a hidden child', () => {
    const document = createDocument('group visibility inheritance', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    first.name = 'A'
    first.visible = true
    const second = createLayer('B', 2, 2, 'rgba')
    second.visible = false
    const group = { id: 'visibility-group', name: 'Group 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    first.groupId = group.id
    second.groupId = group.id
    document.groups.push(group)
    document.layers.push(second)
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const visibility = (id: string): HTMLElement => container.querySelector<HTMLElement>(`[data-layer-id="${id}"] .layer-visibility`)!
    const groupVisibility = container.querySelector<HTMLElement>(`[data-group-id="${group.id}"] .layer-visibility`)!

    fireEvent.pointerDown(groupVisibility, { button: 0 })
    fireEvent.click(groupVisibility)
    expect(group.visible).toBe(false)
    expect(visibility(first.id)).toHaveClass('group-visibility-inherited-hidden')
    expect(visibility(second.id)).toHaveClass('group-visibility-inherited-hidden')

    fireEvent.pointerDown(visibility(first.id), { button: 0 })
    fireEvent.click(visibility(first.id))
    expect(first.visible).toBe(false)
    expect(group.visible).toBe(false)

    fireEvent.pointerDown(visibility(second.id), { button: 0 })
    fireEvent.click(visibility(second.id))
    expect(second.visible).toBe(true)
    expect(group.visible).toBe(true)
    expect(first.visible).toBe(false)
  })

  it('reopens hidden ancestor groups when showing a nested child group', () => {
    const document = createDocument('nested group visibility inheritance', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const outer = { id: 'outer-visibility-group', name: 'Group 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    const inner = { id: 'inner-visibility-group', name: 'Group 2', parentGroupId: outer.id, visible: false, locked: false, opacity: 1, blendMode: 'normal' as const }
    layer.groupId = inner.id
    document.groups.push(outer, inner)
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const groupVisibility = (id: string): HTMLElement => container.querySelector<HTMLElement>(`[data-group-id="${id}"] .layer-visibility`)!

    fireEvent.pointerDown(groupVisibility(outer.id), { button: 0 })
    fireEvent.click(groupVisibility(outer.id))
    expect(outer.visible).toBe(false)
    expect(inner.visible).toBe(false)
    expect(groupVisibility(inner.id)).toHaveClass('group-visibility-inherited-hidden')

    fireEvent.pointerDown(groupVisibility(inner.id), { button: 0 })
    fireEvent.click(groupVisibility(inner.id))
    expect(inner.visible).toBe(true)
    expect(outer.visible).toBe(true)
  })

  it('shows inherited locks without changing child data and unlocks the parent from the child', () => {
    const document = createDocument('group lock inheritance', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const group = { id: 'lock-group', name: 'Locked Group', parentGroupId: null, visible: true, locked: true, opacity: 1, blendMode: 'normal' as const }
    layer.groupId = group.id
    layer.locked = false
    document.groups.push(group)
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)

    const lock = container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"] .layer-lock-toggle`)!
    expect(lock).toHaveClass('group-lock-inherited')
    expect(lock).not.toHaveClass('locked')
    expect(lock).not.toHaveAttribute('aria-disabled', 'true')
    expect(lock).toHaveAttribute('aria-pressed', 'false')
    expect(lock.querySelector('[data-pixel-icon="unlock"]')).toBeInTheDocument()

    fireEvent.pointerDown(lock, { button: 0 })
    fireEvent.click(lock)

    expect(group.locked).toBe(true)
    expect(layer.locked).toBe(true)
    expect(lock).toHaveClass('locked')
    fireEvent.pointerDown(lock, { button: 0 })
    fireEvent.click(lock)

    expect(group.locked).toBe(false)
    expect(layer.locked).toBe(false)
    expect(lock).not.toHaveClass('group-lock-inherited')
    useWorkspace.getState().undo()
    expect(group.locked).toBe(true)
    expect(layer.locked).toBe(true)
  })

  it('applies auto-link changes across a dragged layer range', () => {
    const document = createDocument('auto-link toggle painting', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    const third = createLayer('Third', 2, 2, 'rgba')
    document.layers.push(second, third)
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const control = (layerId: string): HTMLElement => container.querySelector<HTMLElement>(`[data-layer-id="${layerId}"] .layer-auto-link-toggle`)!
    const firstAutoLink = control(first.id)
    const secondAutoLink = control(second.id)
    const thirdAutoLink = control(third.id)

    fireEvent.pointerDown(firstAutoLink, { altKey: true, button: 0, pointerId: 60 })
    expect(first.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).not.toBe(true)
    expect(third.autoLinkAnimationCels).not.toBe(true)
    fireEvent.pointerDown(firstAutoLink, { altKey: true, button: 0, pointerId: 60 })
    expect(first.autoLinkAnimationCels).not.toBe(true)
    expect(second.autoLinkAnimationCels).not.toBe(true)
    expect(third.autoLinkAnimationCels).not.toBe(true)
    useWorkspace.getState().selectLayerRows([second.id, third.id], [])
    fireEvent.pointerDown(thirdAutoLink, { ctrlKey: true, button: 0, pointerId: 60 })
    expect(first.autoLinkAnimationCels).not.toBe(true)
    expect(second.autoLinkAnimationCels).toBe(true)
    expect(third.autoLinkAnimationCels).toBe(true)
    useWorkspace.getState().undo()
    expect(first.autoLinkAnimationCels).not.toBe(true)
    expect(second.autoLinkAnimationCels).not.toBe(true)
    expect(third.autoLinkAnimationCels).not.toBe(true)
    useWorkspace.getState().selectLayerRows([], [])
    fireEvent.pointerDown(firstAutoLink, { ctrlKey: true, button: 0, pointerId: 60 })
    expect(first.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).toBe(true)
    expect(third.autoLinkAnimationCels).toBe(true)
    useWorkspace.getState().undo()
    fireEvent.pointerDown(firstAutoLink, { button: 0, pointerId: 60 })
    fireEvent.pointerUp(window, { pointerId: 60 })
    useWorkspace.getState().selectLayerRows([second.id, third.id], [])
    fireEvent.pointerDown(thirdAutoLink, { altKey: true, button: 0, pointerId: 60 })
    expect(first.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).not.toBe(true)
    expect(third.autoLinkAnimationCels).toBe(true)
    fireEvent.pointerDown(thirdAutoLink, { altKey: true, button: 0, pointerId: 60 })
    expect(first.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).not.toBe(true)
    expect(third.autoLinkAnimationCels).not.toBe(true)
    fireEvent.pointerDown(firstAutoLink, { button: 0, pointerId: 60 })
    fireEvent.pointerUp(window, { pointerId: 60 })
    useWorkspace.getState().selectLayerRows([], [])

    fireEvent.pointerDown(firstAutoLink, { button: 0, pointerId: 61 })
    fireEvent.pointerEnter(thirdAutoLink, { buttons: 1, pointerId: 61 })
    expect(first.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).toBe(true)
    expect(third.autoLinkAnimationCels).toBe(true)

    fireEvent.pointerEnter(secondAutoLink, { buttons: 1, pointerId: 61 })
    expect(first.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).toBe(true)
    expect(third.autoLinkAnimationCels).not.toBe(true)
    fireEvent.pointerUp(window, { pointerId: 61 })

    useWorkspace.getState().undo()
    expect(first.autoLinkAnimationCels).not.toBe(true)
    expect(second.autoLinkAnimationCels).not.toBe(true)
    expect(third.autoLinkAnimationCels).not.toBe(true)
  })

  it('applies Alt solo and restore to visibility and lock controls', () => {
    const document = createDocument('hierarchy toggle batch', 2, 2, 'rgba')
    const firstRoot = getActiveLayer(document)
    const secondRoot = createLayer('Second root', 2, 2, 'rgba')
    const nested = createLayer('Nested', 2, 2, 'rgba')
    const group = { id: 'root-group', name: 'Root group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    nested.groupId = group.id
    document.layers.push(secondRoot, nested)
    document.groups.push(group)
    useWorkspace.getState().addSession(document)
    const { container, rerender } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const firstRow = container.querySelector<HTMLElement>(`[data-layer-id="${firstRoot.id}"]`)!

    fireEvent.pointerDown(firstRow.querySelector('.layer-visibility')!, { button: 0, altKey: true })

    expect(firstRoot.visible).toBe(true)
    expect(secondRoot.visible).toBe(false)
    expect(group.visible).toBe(false)
    expect(nested.visible).toBe(false)
    fireEvent.pointerDown(firstRow.querySelector('.layer-visibility')!, { button: 0, altKey: true })
    expect(firstRoot.visible).toBe(true)
    expect(secondRoot.visible).toBe(true)
    expect(group.visible).toBe(true)
    rerender(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.pointerDown(firstRow.querySelector('.layer-lock-toggle')!, { button: 0, altKey: true })

    expect(firstRoot.locked).toBe(true)
    expect(secondRoot.locked).toBe(false)
    expect(group.locked).toBe(false)
    expect(nested.locked).toBe(false)
    fireEvent.pointerDown(firstRow.querySelector('.layer-lock-toggle')!, { button: 0, altKey: true })
    expect(firstRoot.locked).toBe(false)
    expect(secondRoot.locked).toBe(false)
    expect(group.locked).toBe(false)

    const groupRow = container.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`)
    const folder = groupRow?.querySelector<HTMLElement>('.group-folder')
    expect(folder).toBeTruthy()
    fireEvent.pointerDown(folder!, { button: 0, altKey: true })
    expect(useWorkspace.getState().sessions[0].collapsedGroupIds).toEqual([])
    fireEvent.pointerDown(folder!, { button: 0, altKey: true })
    expect(useWorkspace.getState().sessions[0].collapsedGroupIds).toEqual([])
    useWorkspace.getState().selectGroup(group.id)
    fireEvent.pointerDown(folder!, { button: 0, ctrlKey: true })
    expect(useWorkspace.getState().sessions[0].collapsedGroupIds).toContain(group.id)
  })

  it('opens locked layer properties while disabling visual controls', () => {
    const document = createDocument('locked layer properties', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.locked = true
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(layer.name) }))

    expect(screen.getByDisplayValue(layer.name)).toBeEnabled()
    expect(screen.getByRole('button', { name: '混合模式' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: '不透明度' })).toBeDisabled()
  })

  it('replaces a multi-layer selection on an ordinary click', () => {
    const document = createDocument('replace layer selection', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(second)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayer(first.id)
    useWorkspace.getState().selectLayer(second.id, 'toggle')
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    const row = screen.getByRole('button', { name: new RegExp(first.name) })
    fireEvent.pointerDown(row, { button: 0, clientX: 20, clientY: 20 })
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([first.id, second.id])
    fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })

    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([first.id])
  })

  it('collapses a Shift-selected range even when another selected layer is locked', () => {
    const document = createDocument('replace locked layer selection', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    const third = createLayer('Third', 2, 2, 'rgba')
    third.locked = true
    document.layers.push(second, third)
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const firstRow = container.querySelector<HTMLElement>(`[data-layer-id="${first.id}"]`)!
    const secondRow = container.querySelector<HTMLElement>(`[data-layer-id="${second.id}"]`)!
    const thirdRow = container.querySelector<HTMLElement>(`[data-layer-id="${third.id}"]`)!

    fireEvent.pointerDown(firstRow, { button: 0, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 20 })
    fireEvent.pointerDown(thirdRow, { button: 0, shiftKey: true, clientX: 20, clientY: 80 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 80 })
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([third.id, second.id, first.id])

    fireEvent.pointerDown(secondRow, { button: 0, clientX: 20, clientY: 50 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 50 })

    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([second.id])
  })

  it('includes a group row when Shift extends the visible selection range', () => {
    const document = createDocument('group range panel', 2, 2, 'rgba')
    const bottom = getActiveLayer(document)
    const member = createLayer('Member', 2, 2, 'rgba')
    member.groupId = 'group'
    document.layers.push(member)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.pointerDown(screen.getByRole('button', { name: /Group/ }), { button: 0, clientX: 20, clientY: 20 })
    fireEvent.pointerDown(screen.getByRole('button', { name: new RegExp(bottom.name) }), { button: 0, shiftKey: true, clientX: 20, clientY: 80 })

    expect(useWorkspace.getState().sessions[0].selectedGroupIds).toEqual(['group'])
  })

  it('supports Shift and Ctrl multi-selection from a group row to layer rows', () => {
    const document = createDocument('group layer multi selection', 2, 2, 'rgba')
    const outside = getActiveLayer(document)
    outside.name = 'Outside'
    const member = createLayer('Member', 2, 2, 'rgba')
    member.groupId = 'group'
    const other = createLayer('Other', 2, 2, 'rgba')
    document.layers.push(member, other)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const groupRow = container.querySelector<HTMLElement>('[data-group-id="group"]')!
    const otherRow = container.querySelector<HTMLElement>(`[data-layer-id="${other.id}"]`)!
    const outsideRow = container.querySelector<HTMLElement>(`[data-layer-id="${outside.id}"]`)!

    fireEvent.pointerDown(groupRow, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(window)
    expect(useWorkspace.getState().sessions[0].selectedGroupIds).toEqual(['group'])

    fireEvent.pointerDown(otherRow, { button: 0, shiftKey: true, clientX: 10, clientY: 30 })
    fireEvent.pointerUp(window)
    const afterRange = useWorkspace.getState().sessions[0]
    expect(afterRange.selectedGroupIds).toContain('group')
    expect(afterRange.selectedLayerIds).toContain(other.id)

    fireEvent.pointerDown(outsideRow, { button: 0, ctrlKey: true, clientX: 10, clientY: 50 })
    fireEvent.pointerUp(window)
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toContain(outside.id)
  })

  it('keeps a selected group when Ctrl adds a layer row', () => {
    const document = createDocument('group plus layer selection', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const group = { id: 'group-1', name: 'Group 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    document.groups.push(group)
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const groupRow = container.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`)!
    const layerRow = container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)!

    fireEvent.pointerDown(groupRow, { button: 0 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(layerRow, { button: 0, ctrlKey: true })
    fireEvent.pointerUp(window)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedGroupIds).toEqual([group.id])
    expect(session.selectedLayerIds).toEqual([layer.id])
    expect(groupRow).toHaveClass('selected')
    expect(layerRow).toHaveClass('selected')
  })

  it('moves a mixed group and layer selection after Ctrl multi-select', () => {
    const document = createDocument('move mixed group ctrl selection', 2, 2, 'rgba')
    const outside = getActiveLayer(document)
    const member = createLayer('Member', 2, 2, 'rgba')
    const sourceGroup = { id: 'source-group', name: 'Source Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    const targetGroup = { id: 'target-group', name: 'Target Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    member.groupId = sourceGroup.id
    document.layers.push(member)
    document.groups.push(sourceGroup, targetGroup)
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const sourceRow = container.querySelector<HTMLElement>(`[data-group-id="${sourceGroup.id}"]`)!
    const targetRow = container.querySelector<HTMLElement>(`[data-group-id="${targetGroup.id}"]`)!
    const outsideRow = container.querySelector<HTMLElement>(`[data-layer-id="${outside.id}"]`)!
    const list = container.querySelector<HTMLElement>('.layer-list')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 0, bottom: 400, width: 300, height: 400, x: 0, y: 0, toJSON: () => ({}) }) })
    Object.defineProperty(sourceRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 0, bottom: 40, width: 300, height: 40, x: 0, y: 0, toJSON: () => ({}) }) })
    Object.defineProperty(targetRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 80, bottom: 120, width: 300, height: 40, x: 0, y: 80, toJSON: () => ({}) }) })
    Object.defineProperty(outsideRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 160, width: 300, height: 40, x: 0, y: 120, toJSON: () => ({}) }) })

    fireEvent.pointerDown(sourceRow, { button: 0, clientX: 150, clientY: 20 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(outsideRow, { button: 0, ctrlKey: true, clientX: 150, clientY: 140 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(sourceRow, { button: 0, clientX: 150, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 150, clientY: 100 })

    expect(outside.groupId).toBe(targetGroup.id)
    expect(document.groups.find((group) => group.id === sourceGroup.id)?.parentGroupId).toBe(targetGroup.id)
  })

  it('selects the entire visible range from a group through its last child layer', () => {
    const document = createDocument('group through child range', 2, 2, 'rgba')
    const first = createLayer('图层 1', 2, 2, 'rgba')
    const second = createLayer('图层 1 副本', 2, 2, 'rgba')
    const last = createLayer('图层 1 副本 副本', 2, 2, 'rgba')
    const group = { id: 'group-1', name: '组 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    first.groupId = group.id
    second.groupId = group.id
    last.groupId = group.id
    document.layers = [first, second, last]
    document.groups = [group]
    document.activeLayerId = first.id
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const groupRow = container.querySelector<HTMLElement>('[data-group-id="group-1"]')!
    const lastRow = container.querySelector<HTMLElement>(`[data-layer-id="${last.id}"]`)!

    fireEvent.pointerDown(groupRow, { button: 0, clientX: 12, clientY: 20 })
    fireEvent.pointerUp(window)
    expect(useWorkspace.getState().sessions[0].selectedGroupIds).toEqual(['group-1'])
    expect(useWorkspace.getState().sessions[0].layerSelectionAnchorId).toBe('group-1')
    expect(buildLayerPanelTree({ layers: document.layers, groups: document.groups }).map((node) => node.id)).toEqual(['group-1', last.id, second.id, first.id])
    fireEvent.pointerDown(lastRow, { button: 0, shiftKey: true, clientX: 12, clientY: 100 })
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([last.id, second.id, first.id])
    fireEvent.pointerUp(window)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedLayerIds).toEqual([last.id, second.id, first.id])
    expect(session.selectedGroupIds).toEqual(['group-1'])
    expect(groupRow).toHaveClass('selected')
    for (const layerId of [last.id, second.id, first.id]) {
      expect(container.querySelector(`[data-layer-id="${layerId}"]`)).toHaveClass('selected')
    }
    expect(container.querySelectorAll('[data-animation-selected-row]')).toHaveLength(4)
  })

  it('selects a group and its children when Shift extends from a child layer', () => {
    const document = createDocument('child to group range', 2, 2, 'rgba')
    const first = createLayer('Layer 1', 2, 2, 'rgba')
    const second = createLayer('Layer 2', 2, 2, 'rgba')
    const group = { id: 'group-1', name: 'Group 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    first.groupId = group.id
    second.groupId = group.id
    document.layers = [first, second]
    document.groups = [group]
    document.activeLayerId = first.id
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const groupRow = container.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`)!
    const firstRow = container.querySelector<HTMLElement>(`[data-layer-id="${first.id}"]`)!

    fireEvent.pointerDown(firstRow, { button: 0 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(groupRow, { button: 0, shiftKey: true })
    fireEvent.pointerUp(window)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedGroupIds).toEqual([group.id])
    expect(session.selectedLayerIds).toEqual([second.id, first.id])
    expect(groupRow).toHaveClass('selected')
    expect(firstRow).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${second.id}"]`)).toHaveClass('selected')
  })

  it('selects the visible range when Shift extends from a layer to a group', () => {
    const document = createDocument('layer to group range', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    const member = createLayer('Member', 2, 2, 'rgba')
    const group = { id: 'group-1', name: 'Group 1', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' as const }
    member.groupId = group.id
    document.layers.push(member)
    document.groups.push(group)
    useWorkspace.getState().addSession(document)
    const { container } = render(<ConnectedLayersPanel />)
    const groupRow = container.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`)!
    const layerRow = container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)!

    fireEvent.pointerDown(layerRow, { button: 0 })
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(groupRow, { button: 0, shiftKey: true })
    fireEvent.pointerUp(window)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedGroupIds).toEqual([group.id])
    expect(session.selectedLayerIds).toEqual([member.id, layer.id])
    expect(groupRow).toHaveClass('selected')
    expect(layerRow).toHaveClass('selected')
    expect(container.querySelector(`[data-layer-id="${member.id}"]`)).toHaveClass('selected')
  })

  it('does not show merge or ungroup actions in the panel header', () => {
    const document = createDocument('compact layer header', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const header = container.querySelector('.layers-panel > header')!

    expect(header.querySelector('[aria-label="向下合并"]')).not.toBeInTheDocument()
    expect(header.querySelector('[aria-label="解组"]')).not.toBeInTheDocument()
  })

  it('shows an unlocked icon for an unlocked group', () => {
    const document = createDocument('group lock icon', 2, 2, 'rgba')
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    const lockButton = screen.getByRole('button', { name: '锁定图层组' })
    expect(lockButton.querySelector('[data-pixel-icon="unlock"]')).toBeInTheDocument()
    expect(lockButton.querySelector('[data-pixel-icon="lock"]')).not.toBeInTheDocument()
  })

  it('keeps realtime property edits when the close button is used', () => {
    const document = createDocument('layer close', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const initialContentRevision = session.contentRevision
    render(<LayersPanel session={session} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(layer.name) }))
    fireEvent.change(screen.getByDisplayValue(layer.name), { target: { value: '关闭仍保存' } })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(layer.name).toBe('关闭仍保存')
    expect(document.dirty).toBe(true)
    expect(session.contentRevision).toBe(initialContentRevision)
    useWorkspace.getState().undo()
    expect(layer.name).not.toBe('关闭仍保存')
    expect(session.contentRevision).toBe(initialContentRevision)
  })

  it('closes unchanged properties without invalidating canvas content', () => {
    const document = createDocument('unchanged layer close', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const initialRevision = session.revision
    const initialContentRevision = session.contentRevision
    render(<LayersPanel session={session} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(layer.name) }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(session.revision).toBe(initialRevision)
    expect(session.contentRevision).toBe(initialContentRevision)
    expect(session.history.canUndo).toBe(false)
  })

  it.each(['解除图层锁定', '锁定图层'] as const)('does not open properties when the %s control is double-clicked', (label) => {
    const document = createDocument('layer lock', 2, 2, 'rgba')
    getActiveLayer(document).locked = label === '解除图层锁定'
    useWorkspace.getState().addSession(document)
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.doubleClick(screen.getByRole('button', { name: label }))

    expect(screen.queryByRole('heading', { name: '图层属性' })).not.toBeInTheDocument()
  })

  it('shows the top edge indicator and places a layer above an anchored group', () => {
    const document = createDocument('layer top edge', 2, 2, 'rgba')
    const member = getActiveLayer(document)
    const root = createLayer('根图层', 2, 2, 'rgba')
    member.groupId = 'anchored'
    document.layers.push(root)
    document.groups.push({ id: 'anchored', name: '锚定组', parentGroupId: null, panelOrder: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const rootRow = container.querySelector<HTMLElement>(`[data-layer-id="${root.id}"]`)!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(rootRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 180, bottom: 222, width: 300, height: 42, x: 0, y: 180, toJSON: () => ({}) }) })

    fireEvent.pointerDown(rootRow, { button: 0, clientX: 150, clientY: 200 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 104 })
    expect(container.querySelector('.layer-edge-drop-indicator.top')).toBeInTheDocument()
    fireEvent.pointerUp(window, { clientX: 150, clientY: 104 })

    expect(buildLayerPanelTree(document).map((node) => node.id)).toEqual([root.id, 'anchored', member.id])
    expect(container.querySelector('.layer-edge-drop-indicator')).not.toBeInTheDocument()
  })

  it('uses the lower edge of the last root group as the root bottom target', () => {
    const document = createDocument('layer bottom edge', 2, 2, 'rgba')
    const root = getActiveLayer(document)
    document.groups.push({ id: 'bottom-group', name: 'Bottom Group', parentGroupId: null, panelOrder: -1, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const rootRow = container.querySelector<HTMLElement>(`[data-layer-id="${root.id}"]`)!
    const groupRow = container.querySelector<HTMLElement>('[data-group-id="bottom-group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(rootRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 162, width: 300, height: 42, x: 0, y: 120, toJSON: () => ({}) }) })
    Object.defineProperty(groupRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 180, bottom: 222, width: 300, height: 42, x: 0, y: 180, toJSON: () => ({}) }) })

    fireEvent.pointerDown(rootRow, { button: 0, clientX: 150, clientY: 140 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 220 })
    expect(container.querySelector('.layer-edge-drop-indicator.bottom')).toBeInTheDocument()
    fireEvent.pointerUp(window, { clientX: 150, clientY: 220 })

    expect(buildLayerPanelTree(document).map((node) => node.id)).toEqual(['bottom-group', root.id])
  })


  it('moves a mixed selection of a layer and a group into another group as one action', () => {
    const document = createDocument('mixed row drag', 2, 2, 'rgba')
    const root = getActiveLayer(document)
    document.groups.push(
      { id: 'source-group', name: 'Source Group', parentGroupId: null, panelOrder: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
      { id: 'target-group', name: 'Target Group', parentGroupId: null, panelOrder: 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    )
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([root.id], ['source-group'])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const rootRow = container.querySelector<HTMLElement>(`[data-layer-id="${root.id}"]`)!
    const targetRow = container.querySelector<HTMLElement>('[data-group-id="target-group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(rootRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 162, width: 300, height: 42, x: 0, y: 120, toJSON: () => ({}) }) })
    Object.defineProperty(targetRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 220, bottom: 258, width: 300, height: 38, x: 0, y: 220, toJSON: () => ({}) }) })

    fireEvent.pointerDown(rootRow, { button: 0, clientX: 150, clientY: 140 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 239 })
    expect(targetRow).toHaveClass('group-drop-target')
    expect(targetRow.querySelector('.layer-group-drop-frame')).not.toBeInTheDocument()
    expect(targetRow.querySelector('.layer-drop-indicator')).not.toBeInTheDocument()
    fireEvent.pointerUp(window, { clientX: 150, clientY: 239 })

    expect(root.groupId).toBe('target-group')
    expect(document.groups.find((group) => group.id === 'source-group')?.parentGroupId).toBe('target-group')
    useWorkspace.getState().undo()
    expect(root.groupId ?? null).toBeNull()
    expect(document.groups.find((group) => group.id === 'source-group')?.parentGroupId ?? null).toBeNull()
  })

  it('keeps the layer drag preview aligned with the pointer after scrolling', () => {
    const document = createDocument('scrolled layer drag preview', 2, 2, 'rgba')
    const first = getActiveLayer(document)
    const second = createLayer('Second', 2, 2, 'rgba')
    document.layers.push(second)
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const firstRow = container.querySelector<HTMLElement>(`[data-layer-id="${first.id}"]`)!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 300, width: 300, height: 200, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(list, 'scrollTop', { configurable: true, value: 160, writable: true })
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 })
    Object.defineProperty(firstRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 160, width: 300, height: 40, x: 0, y: 120, toJSON: () => ({}) }) })

    fireEvent.pointerDown(firstRow, { button: 0, clientX: 150, clientY: 140 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 240 })

    const ghost = container.querySelector<HTMLElement>('.layer-drag-ghost')
    expect(ghost).toBeInTheDocument()
    expect(ghost?.style.top).toBe('286.5px')
    fireEvent.pointerUp(window, { clientX: 150, clientY: 240 })
  })

  it('auto-scrolls the layer list while dragging near an edge', () => {
    vi.useFakeTimers()
    try {
      const document = createDocument('auto-scroll layer drag', 2, 2, 'rgba')
      const first = getActiveLayer(document)
      const second = createLayer('Second', 2, 2, 'rgba')
      document.layers.push(second)
      useWorkspace.getState().addSession(document)
      const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
      const list = container.querySelector<HTMLElement>('.layer-list')!
      const firstRow = container.querySelector<HTMLElement>(`[data-layer-id="${first.id}"]`)!
      Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 300, width: 300, height: 200, x: 0, y: 100, toJSON: () => ({}) }) })
      Object.defineProperty(list, 'scrollTop', { configurable: true, value: 160, writable: true })
      Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 })
      Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 })

      fireEvent.pointerDown(firstRow, { button: 0, clientX: 150, clientY: 140 })
      fireEvent.pointerMove(window, { clientX: 150, clientY: 108 })
      act(() => { vi.advanceTimersByTime(80) })

      expect(list.scrollTop).toBeLessThan(160)
      fireEvent.pointerUp(window, { clientX: 150, clientY: 108 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies right-click properties to a mixed selection as one action', () => {
    const document = createDocument('mixed row properties', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([layer.id], ['group'])
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(screen.getByRole('button', { name: new RegExp(layer.name) }), { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    expect(screen.getByRole('heading', { name: '多个图层属性' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: '不透明度' }), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(layer.opacity).toBe(0.4)
    expect(document.groups.find((group) => group.id === 'group')?.opacity).toBe(0.4)
    useWorkspace.getState().undo()
    expect(layer.opacity).toBe(1)
    expect(document.groups.find((group) => group.id === 'group')?.opacity).toBe(1)
  })

  it('previews and commits all editable properties across a mixed selection', async () => {
    const document = createDocument('mixed row property preview', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.name = 'Layer source'
    layer.description = 'Layer description'
    layer.displayColor = { r: 255, g: 0, b: 0, a: 255 }
    document.groups.push({ id: 'group', name: 'Group source', description: 'Group description', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal', displayColor: { r: 0, g: 255, b: 0, a: 255 } })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([layer.id], ['group'])
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Layer source/ }), { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    fireEvent.change(screen.getByDisplayValue('Group source'), { target: { value: '统一名称' } })
    await waitFor(() => expect(layer.name).toBe('统一名称'))
    expect(document.groups[0].name).toBe('统一名称')

    fireEvent.click(screen.getByRole('button', { name: '混合模式' }))
    fireEvent.click(screen.getByRole('option', { name: '正片叠底' }))
    fireEvent.change(screen.getByRole('slider', { name: '不透明度' }), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: '无显示颜色' }))
    fireEvent.change(screen.getByPlaceholderText('输入图层描述'), { target: { value: '统一描述' } })

    await waitFor(() => expect(layer).toMatchObject({ name: '统一名称', blendMode: 'multiply', opacity: 0.4, description: '统一描述' }))
    expect(layer.displayColor).toBeUndefined()
    expect(document.groups[0]).toMatchObject({ name: '统一名称', blendMode: 'multiply', opacity: 0.4, description: '统一描述' })
    expect(document.groups[0].displayColor).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    useWorkspace.getState().undo()
    expect(layer).toMatchObject({ name: 'Layer source', blendMode: 'normal', opacity: 1, description: 'Layer description' })
    expect(layer.displayColor).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(document.groups[0]).toMatchObject({ name: 'Group source', blendMode: 'normal', opacity: 1, description: 'Group description' })
    expect(document.groups[0].displayColor).toEqual({ r: 0, g: 255, b: 0, a: 255 })
  })

  it('applies batch properties to every explicitly selected parent, child, and layer row', async () => {
    const document = createDocument('nested mixed row properties', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.groupId = 'child-group'
    document.groups.push(
      { id: 'root-group', name: 'Root', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
      { id: 'child-group', name: 'Child', parentGroupId: 'root-group', visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    )
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([layer.id], ['root-group', 'child-group'])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(container.querySelector('[data-group-id="root-group"]')!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    expect(screen.getByRole('heading', { name: '多个图层属性' })).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Root'), { target: { value: '统一名称' } })

    await waitFor(() => expect(layer.name).toBe('统一名称'))
    expect(document.groups.map((group) => group.name)).toEqual(['统一名称', '统一名称'])
  })

  it('coalesces rapid batch property previews and flushes the final value', async () => {
    const document = createDocument('coalesced batch preview', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([layer.id], ['group'])
    const mutate = vi.spyOn(useWorkspace.getState(), 'mutateActive')
    render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(screen.getByRole('button', { name: new RegExp(layer.name) }), { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    const slider = screen.getByRole('slider', { name: '不透明度' })
    for (let value = 90; value >= 20; value -= 10) fireEvent.change(slider, { target: { value: String(value) } })

    expect(layer.opacity).toBe(1)
    await waitFor(() => expect(layer.opacity).toBe(0.2))
    expect(mutate.mock.calls.length).toBeLessThan(4)
  })

  it.each([
    { edge: 'bottom' as const, groupOrder: -1, dragKind: 'layer' as const },
    { edge: 'top' as const, groupOrder: 1, dragKind: 'group' as const }
  ])('keeps mixed row order when dragging to the $edge edge', ({ edge, groupOrder, dragKind }) => {
    const document = createDocument(`mixed row ${edge}`, 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, panelOrder: groupOrder, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([layer.id], ['group'])
    const before = buildLayerPanelTree(document).filter((node) => node.depth === 0).map((node) => node.id)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const row = container.querySelector<HTMLElement>(dragKind === 'layer' ? `[data-layer-id="${layer.id}"]` : '[data-group-id="group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(row, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 180, bottom: 222, width: 300, height: 42, x: 0, y: 180, toJSON: () => ({}) }) })

    const targetY = edge === 'top' ? 104 : 396
    fireEvent.pointerDown(row, { button: 0, clientX: 150, clientY: 200 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: targetY })
    expect(container.querySelectorAll('.layer-drag-ghost > span')).toHaveLength(2)
    fireEvent.pointerUp(window, { clientX: 150, clientY: targetY })

    expect(buildLayerPanelTree(document).filter((node) => node.depth === 0).map((node) => node.id)).toEqual(before)
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([layer.id])
    expect(useWorkspace.getState().sessions[0].selectedGroupIds).toEqual(['group'])
  })

  it('keeps expanded group members selected after moving the mixed selection', () => {
    const document = createDocument('preserve expanded group selection', 2, 2, 'rgba')
    const member = getActiveLayer(document)
    member.groupId = 'group'
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, panelOrder: 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([member.id], ['group'])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const groupRow = container.querySelector<HTMLElement>('[data-group-id="group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(groupRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 158, width: 300, height: 38, x: 0, y: 120, toJSON: () => ({}) }) })

    fireEvent.pointerDown(groupRow, { button: 0, clientX: 150, clientY: 139 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 396 })
    fireEvent.pointerUp(window, { clientX: 150, clientY: 396 })

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedGroupId).toBeNull()
    expect(session.selectedGroupIds).toEqual(['group'])
    expect(session.selectedLayerIds).toEqual([member.id])
  })

  it('Alt-drags a copied mixed selection while leaving the sources in place', () => {
    const document = createDocument('mixed row copy drag', 2, 2, 'rgba')
    const root = getActiveLayer(document)
    document.groups.push(
      { id: 'source-group', name: 'Source Group', parentGroupId: null, panelOrder: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
      { id: 'target-group', name: 'Target Group', parentGroupId: null, panelOrder: 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    )
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([root.id], ['source-group'])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const rootRow = container.querySelector<HTMLElement>(`[data-layer-id="${root.id}"]`)!
    const targetRow = container.querySelector<HTMLElement>('[data-group-id="target-group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(rootRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 162, width: 300, height: 42, x: 0, y: 120, toJSON: () => ({}) }) })
    Object.defineProperty(targetRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 220, bottom: 258, width: 300, height: 38, x: 0, y: 220, toJSON: () => ({}) }) })

    fireEvent.pointerDown(rootRow, { button: 0, altKey: true, clientX: 150, clientY: 140 })
    fireEvent.pointerMove(window, { altKey: true, clientX: 150, clientY: 239 })
    fireEvent.pointerUp(window, { altKey: true, clientX: 150, clientY: 239 })

    expect(root.groupId ?? null).toBeNull()
    expect(document.groups.find((group) => group.id === 'source-group')?.parentGroupId ?? null).toBeNull()
    const copiedGroup = document.groups.find((group) => group.name.startsWith('Source Group '))!
    const copiedLayer = document.layers.find((layer) => layer.id !== root.id)!
    expect(copiedGroup.parentGroupId).toBe('target-group')
    expect(copiedLayer.groupId).toBe('target-group')
    useWorkspace.getState().undo()
    expect(document.layers).toEqual([root])
    expect(document.groups.map((group) => group.id)).toEqual(['source-group', 'target-group'])
  })

  it('shows every visible selected row in the drag preview while moving only top-level rows', () => {
    const document = createDocument('visible drag preview', 2, 2, 'rgba')
    const member = getActiveLayer(document)
    member.groupId = 'group'
    const root = createLayer('Root', 2, 2, 'rgba')
    document.layers.push(root)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, panelOrder: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([member.id, root.id], ['group'])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const groupRow = container.querySelector<HTMLElement>('[data-group-id="group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(groupRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 158, width: 300, height: 38, x: 0, y: 120, toJSON: () => ({}) }) })

    fireEvent.pointerDown(groupRow, { button: 0, clientX: 150, clientY: 139 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 300 })

    expect([...container.querySelectorAll('.layer-drag-ghost > span b')].map((item) => item.textContent)).toEqual(['Group', member.name, 'Root'])
  })

  it('shows a lower insertion line when Alt-copying below the original selection', () => {
    const document = createDocument('copy below source', 2, 2, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 2, 2, 'rgba')
    document.layers.push(top)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([bottom.id, top.id], [])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const topRow = container.querySelector<HTMLElement>(`[data-layer-id="${top.id}"]`)!
    const bottomRow = container.querySelector<HTMLElement>(`[data-layer-id="${bottom.id}"]`)!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(topRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 160, width: 300, height: 40, x: 0, y: 120, toJSON: () => ({}) }) })
    Object.defineProperty(bottomRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 160, bottom: 200, width: 300, height: 40, x: 0, y: 160, toJSON: () => ({}) }) })

    fireEvent.pointerDown(topRow, { button: 0, altKey: true, clientX: 150, clientY: 140 })
    fireEvent.pointerMove(window, { altKey: true, clientX: 150, clientY: 195 })

    expect(bottomRow.querySelector('.layer-drop-indicator')).toHaveClass('below')
  })

  it('Alt-copies an all-row selection to the content bottom and anchors the line to the last row', () => {
    const document = createDocument('copy all rows to bottom', 2, 2, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 2, 2, 'rgba')
    document.layers.push(top)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([bottom.id, top.id], [])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const topRow = container.querySelector<HTMLElement>(`[data-layer-id="${top.id}"]`)!
    const bottomRow = container.querySelector<HTMLElement>(`[data-layer-id="${bottom.id}"]`)!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 500, width: 300, height: 400, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(topRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 160, width: 300, height: 40, x: 0, y: 120, toJSON: () => ({}) }) })
    Object.defineProperty(bottomRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 160, bottom: 200, width: 300, height: 40, x: 0, y: 160, toJSON: () => ({}) }) })

    fireEvent.pointerDown(topRow, { button: 0, altKey: true, clientX: 150, clientY: 140 })
    fireEvent.pointerMove(window, { altKey: true, clientX: 150, clientY: 230 })

    const indicator = list.querySelector(':scope > .layer-edge-drop-indicator.bottom')!
    expect(indicator).toHaveStyle({ top: '100px' })
    expect(indicator.querySelectorAll('i')).toHaveLength(2)
    expect(indicator.querySelector('b')).toBeInTheDocument()

    fireEvent.pointerUp(window, { altKey: true, clientX: 150, clientY: 230 })
    expect(document.layers).toHaveLength(4)
    expect(document.layers.filter((layer) => layer.id === top.id || layer.id === bottom.id)).toHaveLength(2)
  })

  it('summarizes selected rows hidden inside a collapsed group in the drag preview', () => {
    const document = createDocument('collapsed drag preview count', 2, 2, 'rgba')
    const member = getActiveLayer(document)
    member.groupId = 'group'
    const root = createLayer('Root', 2, 2, 'rgba')
    document.layers.push(root)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, panelOrder: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([member.id, root.id], ['group'])
    useWorkspace.getState().toggleGroupCollapsed('group')
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)
    const list = container.querySelector<HTMLElement>('.layer-list')!
    const groupRow = container.querySelector<HTMLElement>('[data-group-id="group"]')!
    Object.defineProperty(list, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300, x: 0, y: 100, toJSON: () => ({}) }) })
    Object.defineProperty(groupRow, 'getBoundingClientRect', { value: () => ({ left: 0, right: 300, top: 120, bottom: 158, width: 300, height: 38, x: 0, y: 120, toJSON: () => ({}) }) })

    fireEvent.pointerDown(groupRow, { button: 0, clientX: 150, clientY: 139 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 280 })

    expect(container.querySelectorAll('.layer-drag-ghost > span')).toHaveLength(2)
    expect(container.querySelector('.layer-drag-ghost > small')).toHaveTextContent('+1')
  })

  it('applies a batch display color on the first click', async () => {
    const document = createDocument('batch display color', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayerRows([layer.id], ['group'])
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    fireEvent.contextMenu(container.querySelector(`[data-layer-id="${layer.id}"]`)!, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
    const preset = globalThis.document.body.querySelectorAll<HTMLButtonElement>('.layer-color-preset:not(.no-color)')[1]
    fireEvent.click(preset)

    await waitFor(() => expect(layer.displayColor).toBeDefined())
    expect(document.groups[0].displayColor).toEqual(layer.displayColor)
  })

  it('shows the outermost colored group on all descendant group and layer rows', () => {
    const document = createDocument('inherited display color', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.groupId = 'child-group'
    layer.displayColor = { r: 255, g: 0, b: 0, a: 255 }
    document.groups.push(
      { id: 'root-group', name: 'Root', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal', displayColor: { r: 41, g: 121, b: 255, a: 255 } },
      { id: 'child-group', name: 'Child', parentGroupId: 'root-group', visible: true, locked: false, opacity: 1, blendMode: 'normal', displayColor: { r: 0, g: 255, b: 0, a: 255 } }
    )
    useWorkspace.getState().addSession(document)
    const { container } = render(<LayersPanel session={useWorkspace.getState().sessions[0]} docked />)

    expect(container.querySelector('[data-group-id="child-group"] .layer-color-stripe')).toHaveStyle({ backgroundColor: 'rgba(41, 121, 255, 1)' })
    expect(container.querySelector(`[data-layer-id="${layer.id}"] .layer-color-stripe`)).toHaveStyle({ backgroundColor: 'rgba(41, 121, 255, 1)' })
  })

  it('reveals an auto-selected layer inside collapsed groups without changing horizontal timeline scroll', async () => {
    const document = createDocument('reveal selected layer', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    layer.groupId = 'child-group'
    document.groups.push(
      { id: 'root-group', name: 'Root', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
      { id: 'child-group', name: 'Child', parentGroupId: 'root-group', visible: true, locked: false, opacity: 1, blendMode: 'normal' }
    )
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    session.collapsedGroupIds = ['root-group', 'child-group']
    const { container } = render(<LayersPanel session={session} docked />)
    const list = container.querySelector<HTMLElement>('.layer-animation-list')!
    list.scrollLeft = 137
    act(() => revealLayerInPanel(document.id, layer.id))
    await waitFor(() => expect(container.querySelector(`[data-layer-id="${layer.id}"]`)).not.toBeNull())
    expect(session.collapsedGroupIds).toEqual([])
    expect(list.scrollLeft).toBe(137)
  })
})
