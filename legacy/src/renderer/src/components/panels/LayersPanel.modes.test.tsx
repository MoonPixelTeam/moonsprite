import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { animationMaskAt, createDocument, createLayer } from '@/core/document-model'
import { animationCelKey, ensureAnimationDocument } from '@/core/animation'
import { selectionContains } from '@/core/selection'
import { COMMAND_SCOPE_EVENT } from '@/core/command-context'
import { layersPanelRenderKey } from '@/core/panel-render-keys'
import { TIMELINE_HIDDEN_PREFERENCE_KEY } from '@/core/file-preferences'
import { LAYER_DENSITY_STORAGE_KEY } from '@/core/layer-panel-preferences'
import { useWorkspace } from '@/store/workspace'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, dialog: null })
  useWorkspace.getState().addSession(createDocument('layer modes', 2, 2, 'rgba'))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })

const session = () => useWorkspace.getState().sessions[0]
function ConnectedPanel() {
  useWorkspace(state => state.sessions[0] ? layersPanelRenderKey(state.sessions[0]) : '')
  return <LayersPanel session={session()} docked />
}
const setupDefault = () => {
  localStorage.setItem(TIMELINE_HIDDEN_PREFERENCE_KEY, 'true')
  return render(<ConnectedPanel />)
}

it('switches modes without changing the active frame or document history and persists the choice', () => {
  const store = useWorkspace.getState()
  store.duplicateAnimationFrame()
  store.setAnimationPlaying(true)
  const frame = session().document.animation!.activeFrameId
  const history = session().history.position
  const view = render(<ConnectedPanel />)
  expect(view.container.querySelector('.layer-animation-grid')).not.toBeNull()
  fireEvent.click(view.getByRole('button', { name: '图层设置' }))
  fireEvent.click(view.getByRole('button', { name: '普通模式' }))
  expect(view.container.querySelector('.layer-animation-grid')).toBeNull()
  expect(view.container.querySelector('.layer-animation-toolbar')).toBeNull()
  expect(view.container.querySelector('.layer-header-properties')).not.toBeNull()
  expect(session().animationPlaying).toBe(false)
  expect(session().selectedAnimationFrameIds).toEqual([])
  expect(session().document.animation!.activeFrameId).toBe(frame)
  expect(session().document.animation!.frames).toHaveLength(2)
  expect(session().history.position).toBe(history)
  expect(localStorage.getItem(TIMELINE_HIDDEN_PREFERENCE_KEY)).toBe('true')
  fireEvent.click(view.getByRole('button', { name: '动画模式' }))
  expect(view.container.querySelector('.layer-animation-grid')).not.toBeNull()
  expect(view.container.querySelector('.layer-animation-toolbar')).not.toBeNull()
  expect(view.container.querySelector('.layer-header-properties')).toBeNull()
  expect(session().document.animation!.activeFrameId).toBe(frame)
  expect(localStorage.getItem(TIMELINE_HIDDEN_PREFERENCE_KEY)).toBe('false')
})

it('commits opacity input into one undo step and edits blend mode through the header', () => {
  const view = setupDefault()
  const layer = session().document.layers[0]
  const history = session().history.position
  const header = within(view.container.querySelector<HTMLElement>('.layer-header-properties')!)
  const input = header.getByRole('spinbutton', { name: '不透明度' })
  fireEvent.change(input, { target: { value: '60' } })
  fireEvent.change(input, { target: { value: '35' } })
  expect(layer.opacity).toBe(1)
  expect(session().history.position).toBe(history)
  fireEvent.blur(input)
  expect(layer.opacity).toBe(.35)
  expect(session().history.position).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(layer.opacity).toBe(1)
  expect(input).toHaveValue('100')
  act(() => useWorkspace.getState().redo())
  expect(input).toHaveValue('35')
  fireEvent.keyDown(header.getByRole('button', { name: '混合模式' }), { key: 'ArrowDown' })
  expect(layer.blendMode).toBe('darken')
  act(() => useWorkspace.getState().undo())
  expect(layer.blendMode).toBe('normal')
  expect(layer.opacity).toBe(.35)
})

it('coalesces a held opacity stepper into one undo step', () => {
  vi.useFakeTimers()
  const view = setupDefault()
  const layer = session().document.layers[0]
  const history = session().history.position
  const decrement = view.container.querySelector<HTMLButtonElement>('.layer-header-opacity .number-input-stepper > button:last-child')!
  fireEvent.pointerDown(decrement, { button: 0 })
  act(() => vi.advanceTimersByTime(1000))
  expect(layer.opacity).toBeLessThan(.99)
  expect(session().history.position).toBe(history)
  fireEvent.pointerUp(decrement)
  expect(session().history.position).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(layer.opacity).toBe(1)
})

it('keeps settings last in quick actions and opens the opacity slider without losing selection', () => {
  const view = setupDefault()
  const properties = view.container.querySelector<HTMLElement>('.layer-header-properties')!
  const actions = view.container.querySelector<HTMLElement>('.layer-quick-actions')!
  expect(within(actions).getByRole('button', { name: '图层设置' })).toBe(actions.lastElementChild)
  expect(view.queryByRole('slider', { name: '不透明度' })).toBeNull()
  const label = within(properties).getByRole('button', { name: '不透明度' })
  fireEvent.pointerDown(label)
  fireEvent.pointerUp(label)
  fireEvent.click(label)
  const slider = view.getByRole('slider', { name: '不透明度' })
  const history = session().history.position
  const input = within(properties).getByRole('spinbutton', { name: '不透明度' })
  fireEvent.focus(input)
  fireEvent.pointerDown(slider)
  fireEvent.blur(input, { relatedTarget: slider })
  fireEvent.change(slider, { target: { value: '70' } })
  fireEvent.change(slider, { target: { value: '45' } })
  expect(session().history.position).toBe(history)
  expect(session().document.layers[0].opacity).toBe(.45)
  fireEvent.pointerUp(slider)
  expect(session().history.position).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(slider).toHaveValue('100')
  fireEvent.keyDown(slider, { key: 'Escape' })
  expect(view.queryByRole('slider', { name: '不透明度' })).toBeNull()
  fireEvent.focus(within(properties).getByRole('spinbutton', { name: '不透明度' }))
  expect(view.getByRole('slider', { name: '不透明度' })).toBeInTheDocument()
  fireEvent.pointerDown(document.body)
  expect(view.queryByRole('slider', { name: '不透明度' })).toBeNull()
})

it.each(['side', 'bottom', 'floating'])('hides clipped quick actions from left to right and preserves settings in %s panels', placement => {
  const resizeCallbacks = new Set<() => void>()
  vi.stubGlobal('ResizeObserver', class {
    readonly notify: () => void
    constructor(callback: ResizeObserverCallback) {
      this.notify = () => callback([], this as unknown as ResizeObserver)
      resizeCallbacks.add(this.notify)
    }
    observe() {}
    unobserve() {}
    disconnect() { resizeCallbacks.delete(this.notify) }
  })
  localStorage.setItem(TIMELINE_HIDDEN_PREFERENCE_KEY, 'true')
  localStorage.setItem('moonsprite.layers-panel.v1', JSON.stringify({ x: 20, y: 20, width: 350, height: 300 }))
  const view = render(<LayersPanel session={session()} docked={placement !== 'floating'} sideDocked={placement === 'side'} />)
  if (placement === 'floating') expect(view.container.querySelector('.layers-panel')).toHaveClass('floating-panel')
  const toolbar = view.container.querySelector<HTMLElement>('.layer-quick-actions')!
  const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.layer-structure-edit-button'))
  expect(buttons).toHaveLength(5)
  const settings = within(toolbar).getByRole('button', { name: '图层设置' })
  let left = 20
  vi.spyOn(toolbar, 'getBoundingClientRect').mockImplementation(() => new DOMRect(left, 0, 180 - left, 26))
  buttons.forEach((button, index) => vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(index * 30, 0, 26, 26)))
  const resize = () => act(() => resizeCallbacks.forEach(callback => callback()))
  resize()
  expect(buttons.map(button => button.style.visibility)).toEqual(['hidden', '', '', '', ''])
  left = 75
  resize()
  expect(buttons.map(button => button.style.visibility)).toEqual(['hidden', 'hidden', 'hidden', '', ''])
  left = 150
  resize()
  expect(buttons.every(button => button.style.visibility === 'hidden')).toBe(true)
  expect(settings).toBeVisible()
  expect(settings).toBe(toolbar.lastElementChild)
  left = 0
  resize()
  expect(buttons.every(button => button.style.visibility === '')).toBe(true)
  fireEvent.click(settings)
  expect(view.getByRole('button', { name: '普通模式' })).toBeInTheDocument()
})

it.each(['compact', 'normal', 'detailed', 'expanded', 'large', 'huge'])('keeps default-mode thumbnails fixed while preserving animation density: %s', density => {
  localStorage.setItem(LAYER_DENSITY_STORAGE_KEY, density)
  const view = setupDefault()
  const thumbnail = view.container.querySelector('.layer-row-thumbnail')
  expect(thumbnail).toHaveStyle({ width: '30px', height: '30px' })
  expect(view.container.querySelector('.layer-name small')).toBeNull()
  const panel = view.container.querySelector('.layers-panel')!
  expect(panel).toHaveClass('layer-density-default')
  fireEvent.wheel(panel, { ctrlKey: true, deltaY: -100 })
  expect(localStorage.getItem(LAYER_DENSITY_STORAGE_KEY)).toBe(density)
  fireEvent.click(view.getByRole('button', { name: '图层设置' }))
  expect(view.queryByRole('slider', { name: '缩略图与帧信息大小' })).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '动画模式' }))
  expect(view.container.querySelector('.layer-row-thumbnail')).toBeNull()
  expect(panel).toHaveClass(`layer-density-${density}`)
  expect(view.container.querySelector('.layer-name small')).not.toBeNull()
  expect(view.getByRole('slider', { name: '缩略图与帧信息大小' })).toHaveValue(String(['compact', 'normal', 'detailed', 'expanded', 'large', 'huge'].indexOf(density)))
})

it('activates a layer thumbnail without selecting its row or adding history', () => {
  const document = createDocument('thumbnail activity', 4, 4, 'rgba')
  const second = createLayer('Second', 4, 4, 'rgba')
  document.layers.push(second)
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().selectLayer(document.layers[0].id)
  const view = setupDefault()
  const row = view.container.querySelector<HTMLElement>(`[data-layer-id="${second.id}"]`)!
  const thumbnail = row.querySelector('.layer-row-thumbnail')!
  const history = session().history.position
  fireEvent.pointerDown(thumbnail, { button: 0 })
  fireEvent.click(thumbnail)
  expect(session().document.activeLayerId).toBe(second.id)
  expect(session().layerSelectionExplicit).toBe(false)
  expect(session().selectedAnimationCellKeys).toEqual([])
  expect(row).toHaveClass('active-layer')
  expect(row).not.toHaveClass('selected')
  expect(thumbnail).toHaveAttribute('aria-pressed', 'true')
  expect(view.container.querySelector('.has-layer-selection-outline')).toBeNull()
  expect(session().history.position).toBe(history)
})

it.each([
  { defaultMode: true, shiftKey: false }, { defaultMode: true, shiftKey: true },
  { defaultMode: false, shiftKey: false }, { defaultMode: false, shiftKey: true }
])('Alt-click uses the same content selection with defaultMode=$defaultMode and Shift=$shiftKey', ({ defaultMode, shiftKey }) => {
  const document = createDocument('thumbnail content selection', 6, 5, 'rgba')
  const layer = createLayer('Content', 6, 5, 'rgba')
  layer.pixels[(1 * 6 + 2) * 4 + 3] = 255
  layer.pixels[(3 * 6 + 4) * 4 + 3] = 128
  document.layers.push(layer)
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
  const view = defaultMode ? setupDefault() : render(<ConnectedPanel />)
  const row = view.container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)!
  const history = session().history.position
  const dispatch = vi.spyOn(window, 'dispatchEvent')
  const target = defaultMode ? row.querySelector('.layer-row-thumbnail')!
    : view.container.querySelector(`[data-animation-cel-key="${animationCelKey(layer.id, document.animation!.activeFrameId)}"]`)!
  fireEvent.pointerDown(target, { button: 0, altKey: true, shiftKey })
  fireEvent.pointerUp(target, { button: 0, altKey: true, shiftKey })
  fireEvent.click(target, { detail: 1, altKey: true, shiftKey })
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: COMMAND_SCOPE_EVENT, detail: { scope: 'canvas', preferSelection: true } }))
  expect(session().document.activeLayerId).toBe(layer.id)
  expect(session().layerSelectionExplicit).toBe(false)
  expect(row).not.toHaveClass('selected')
  if (defaultMode) expect(view.container.querySelector('.has-layer-selection-outline')).toBeNull()
  expect(selectionContains(session().selection, 2, 1)).toBe(true)
  expect(selectionContains(session().selection, 4, 3)).toBe(true)
  expect(selectionContains(session().selection, 3, 2)).toBe(false)
  expect(selectionContains(session().selection, 0, 0)).toBe(shiftKey)
  expect(session().history.position).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(selectionContains(session().selection, 0, 0)).toBe(true)
  expect(selectionContains(session().selection, 2, 1)).toBe(false)
  act(() => useWorkspace.getState().redo())
  expect(selectionContains(session().selection, 2, 1)).toBe(true)
  expect(selectionContains(session().selection, 0, 0)).toBe(shiftKey)
})

it('Ctrl-click only activates the default thumbnail without loading content selection', () => {
  const view = setupDefault()
  const history = session().history.position
  fireEvent.click(view.container.querySelector('.layer-row-thumbnail')!, { ctrlKey: true })
  expect(session().selection).toBeNull()
  expect(session().layerSelectionExplicit).toBe(false)
  expect(session().history.position).toBe(history)
})

it.each([
  { defaultMode: true, group: false }, { defaultMode: true, group: true },
  { defaultMode: false, group: false }, { defaultMode: false, group: true }
])('Alt-click toggles the same mask isolated view with defaultMode=$defaultMode and group=$group', ({ defaultMode, group }) => {
  const document = createDocument('mask shortcut parity', 4, 4, 'rgba')
  document.layers[0].pixels[3] = 255
  if (group) document.groups.push({ id: 'folder', name: 'Folder', opacity: 1, blendMode: 'normal', locked: false, visible: true })
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(document)
  const timeline = ensureAnimationDocument(document)
  const ownerId = group ? 'folder' : document.layers[0].id
  if (group) useWorkspace.getState().createGroupMask(ownerId)
  else useWorkspace.getState().createLayerMask(timeline.cels[0].id)
  useWorkspace.getState().activateLayerForCanvas(document.layers[0].id)
  const view = defaultMode ? setupDefault() : render(<ConnectedPanel />)
  const target = defaultMode ? view.container.querySelector('.layer-row-mask-thumbnail')!
    : view.container.querySelector(`[data-animation-mask-cel-key="${animationCelKey(ownerId, timeline.activeFrameId)}"]`)!
  const click = (altKey: boolean) => {
    fireEvent.pointerDown(target, { button: 0, altKey })
    fireEvent.pointerUp(target, { button: 0, altKey })
    fireEvent.click(target, { detail: 1, altKey })
  }
  const history = session().history.position
  click(true)
  expect(session().layerMaskIsolatedView).toBe(true)
  expect(session().activeLayerMaskId).toBe(animationMaskAt(timeline, ownerId, timeline.activeFrameId)!.id)
  click(true)
  expect(session().layerMaskIsolatedView).toBe(false)
  click(true)
  expect(session().layerMaskIsolatedView).toBe(true)
  if (defaultMode) {
    click(false)
    expect(session().layerMaskIsolatedView).toBe(false)
    expect(session().layerSelectionExplicit).toBe(false)
    expect(session().selectedAnimationMaskCellKeys).toEqual([])
  }
  expect(session().history.position).toBe(history)
})

it('edits the current-frame mask beside its layer and toggles its movement link with undo', () => {
  const document = createDocument('inline mask', 4, 4, 'rgba')
  document.layers[0].pixels[3] = 255
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(document)
  const timeline = ensureAnimationDocument(document)
  const layer = document.layers[0]
  const frameId = timeline.activeFrameId
  useWorkspace.getState().createLayerMask(timeline.cels[0].id)
  useWorkspace.getState().selectLayer(layer.id)
  const view = setupDefault()
  const row = view.container.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)!
  expect(view.container.querySelector('.layer-mask-row')).toBeNull()
  const maskButton = within(row).getByRole('button', { name: '图层蒙版' })
  expect(maskButton.querySelector('canvas')).toHaveAttribute('width', '30')
  expect(row.querySelector('.layer-mask-link svg')).toHaveAttribute('data-pixel-icon', 'aspectLink')
  expect(row.querySelector('.layer-mask-link svg')).toHaveClass('pixel-utility-icon-2x')
  expect(maskButton.parentElement?.previousElementSibling).toHaveClass('layer-row-thumbnail')
  fireEvent.pointerDown(maskButton, { button: 0 })
  fireEvent.click(maskButton)
  const mask = animationMaskAt(timeline, layer.id, frameId)!
  expect(session().activeLayerMaskId).toBe(mask.id)
  expect(session().layerMaskIsolatedView).toBe(false)
  expect(session().selectedAnimationMaskCellKeys).toEqual([])
  expect(session().layerSelectionExplicit).toBe(false)
  expect(row).not.toHaveClass('selected')
  expect(maskButton).toHaveAttribute('aria-pressed', 'true')
  expect(row).toHaveClass('active-layer')
  const history = session().history.position
  fireEvent.click(within(row).getByRole('button', { name: '停用绑定移动' }))
  expect(mask.moveWithOwner).toBe(false)
  expect(session().history.position).toBe(history + 1)
  act(() => useWorkspace.getState().undo())
  expect(mask.moveWithOwner).toBe(true)
  fireEvent.click(row.querySelector('.layer-row-thumbnail')!)
  expect(session().activeLayerMaskId).toBeNull()
  expect(session().document.activeLayerId).toBe(layer.id)
  expect(session().layerSelectionExplicit).toBe(false)
  expect(row).not.toHaveClass('selected')
  fireEvent.contextMenu(maskButton)
  expect(view.getAllByText('停用绑定移动').length).toBeGreaterThan(0)
})

it('keeps group masks accessible inline and restores mask rows in animation mode', () => {
  const document = session().document
  document.groups.push({ id: 'folder', name: 'Folder', opacity: 1, blendMode: 'normal', locked: false, visible: true })
  document.layers[0].groupId = 'folder'
  useWorkspace.getState().createGroupMask('folder')
  const view = setupDefault()
  const maskButton = view.getByRole('button', { name: '图层组蒙版' })
  fireEvent.click(maskButton)
  expect(maskButton).toHaveAttribute('aria-pressed', 'true')
  expect(view.container.querySelector('.layer-mask-row')).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '图层设置' }))
  fireEvent.click(view.getByRole('button', { name: '动画模式' }))
  expect(view.container.querySelector('.layer-mask-row')).not.toBeNull()
  expect(view.container.querySelector('.layer-inline-mask')).toBeNull()
})

it('applies header changes to selected layers while respecting locks', () => {
  const document = session().document
  const first = document.layers[0]
  const second = createLayer('Second', 2, 2, 'rgba')
  second.locked = true
  document.layers.push(second)
  useWorkspace.getState().selectLayer(first.id)
  useWorkspace.getState().selectLayer(second.id, true)
  const view = setupDefault()
  fireEvent.pointerDown(view.getByRole('spinbutton', { name: '不透明度' }))
  fireEvent.pointerUp(window)
  fireEvent.change(view.getByRole('spinbutton', { name: '不透明度' }), { target: { value: '50' } })
  fireEvent.blur(view.getByRole('spinbutton', { name: '不透明度' }))
  expect(session().selectedLayerIds).toEqual(expect.arrayContaining([first.id, second.id]))
  expect(first.opacity).toBe(.5)
  expect(second.opacity).toBe(1)
  act(() => useWorkspace.getState().selectLayer(second.id))
  expect(view.getByRole('spinbutton', { name: '不透明度' })).toBeDisabled()
  expect(view.getByRole('button', { name: '混合模式' })).toBeDisabled()
})

it('edits a selected group without also changing its implicitly selected children', () => {
  const document = session().document
  const layer = document.layers[0]
  document.groups.push({ id: 'folder', name: 'Folder', opacity: 1, blendMode: 'normal', locked: false, visible: true })
  layer.groupId = 'folder'
  useWorkspace.getState().selectGroup('folder')
  const view = setupDefault()
  fireEvent.change(view.getByRole('spinbutton', { name: '不透明度' }), { target: { value: '40' } })
  fireEvent.blur(view.getByRole('spinbutton', { name: '不透明度' }))
  expect(document.groups[0].opacity).toBe(.4)
  expect(layer.opacity).toBe(1)
})

it('responds to the window timeline toggle and rolls back an unfinished opacity gesture on mode exit', () => {
  const view = setupDefault()
  const layer = session().document.layers[0]
  const decrement = view.container.querySelector<HTMLButtonElement>('.layer-header-opacity .number-input-stepper > button:last-child')!
  fireEvent.pointerDown(decrement, { button: 0 })
  expect(layer.opacity).toBe(.99)
  act(() => {
    localStorage.setItem(TIMELINE_HIDDEN_PREFERENCE_KEY, 'false')
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  })
  expect(view.container.querySelector('.layer-animation-grid')).not.toBeNull()
  expect(layer.opacity).toBe(1)
  expect(session().history.position).toBe(0)
})
