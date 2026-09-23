import { act, cleanup, renderHook, render, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, readLayerPacked } from '@/core/document'
import { createAnimationCelLookup, ensureAnimationDocument } from '@/core/animation'
import { beginPixelEdit, commitPixelEdit, HistoryStack, recordPixel } from '@/core/history'
import type { DocumentSession } from '@/store/workspace'
import { useTimelineContextActions } from './useTimelineContextActions'

const workspace = vi.hoisted(() => ({ getState: vi.fn() }))
vi.mock('@/store/workspace', () => ({ useWorkspace: workspace }))
vi.mock('@/components/AnimationTweenDialog', () => ({ AnimationTweenDialog: (props: { initialLoopSectionId?: string }) => <div data-testid="tween-dialog">{props.initialLoopSectionId ?? 'frame'}</div> }))
vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function fixture() {
  const document = createDocument('history lifecycle', 4, 4, 'rgba')
  const timeline = ensureAnimationDocument(document)
  const session = { document, history: new HistoryStack(), selectedAnimationFrameIds: [], selectedAnimationCellKeys: [], animationFrameClipboard: [] } as unknown as DocumentSession
  return { session, timeline, activeFrameIndex: 0, celLookup: createAnimationCelLookup(timeline),
    setContextMenu: vi.fn(), setLayerCreateMenu: vi.fn(), shortcutHint: () => null,
    emptyLayerMaskCelTooltip: <span />, layerMaskTooltip: <span /> }
}

function installStore(...sessions: DocumentSession[]) {
  const commit = vi.fn((id: string, label: string) => sessions.find(s => s.document.id === id)!.history.endCompound(label))
  workspace.getState.mockImplementation(() => ({
    beginLayerPanelTransaction: (id: string) => sessions.find(s => s.document.id === id)!.history.beginCompound(),
    commitLayerPanelTransaction: commit,
    selectAnimationCell: vi.fn(),
  }))
  return commit
}

function paint(session: DocumentSession, color: number) {
  const layer = session.document.layers[0]
  const edit = beginPixelEdit(layer.id)
  recordPixel(session.document, layer, edit, 0, color)
  session.history.push(commitPixelEdit(session.document, edit, 'paint')!)
}

it.each(['frame', 'cel'] as const)('closing %s properties through the external close path resumes independent undo steps', kind => {
  const options = fixture()
  const commit = installStore(options.session)
  const hook = renderHook(useTimelineContextActions, { initialProps: options })
  act(() => {
    if (kind === 'frame') hook.result.current.openFramePropertiesFor(options.timeline.activeFrameId)
    else hook.result.current.openCelProperties(options.session.document.layers[0].id, options.timeline.activeFrameId)
  })
  hook.rerender({ ...options })
  expect(commit).not.toHaveBeenCalled()
  // Escape and panel-close events use these same close commands.
  act(() => { hook.result.current.closeFrameProperties(); hook.result.current.closeCelProperties() })
  expect(commit).toHaveBeenCalledOnce()
  paint(options.session, 0xff112233)
  paint(options.session, 0xff445566)
  expect(options.session.history.length).toBe(2)
  options.session.history.undo()
  expect(readLayerPacked(options.session.document, options.session.document.layers[0], 0)).toBe(0xff112233)
  options.session.history.redo()
  expect(readLayerPacked(options.session.document, options.session.document.layers[0], 0)).toBe(0xff445566)
  hook.unmount()
  expect(commit).toHaveBeenCalledOnce()
})

it('commits applied property previews on document switch and closes an empty transaction on unmount', () => {
  const first = fixture(), second = fixture()
  const commit = installStore(first.session, second.session)
  const hook = renderHook(useTimelineContextActions, { initialProps: first })
  act(() => hook.result.current.openFramePropertiesFor(first.timeline.activeFrameId))
  const frame = first.timeline.frames[0], oldDuration = frame.duration
  frame.duration = 250
  first.session.history.push({ label: 'duration', bytes: 8, undo: () => { frame.duration = oldDuration }, redo: () => { frame.duration = 250 } })
  hook.rerender(second)
  expect(first.session.history.length).toBe(1)
  expect(commit).toHaveBeenCalledWith(first.session.document.id, 'workspace.history.animationFrameDuration')
  paint(first.session, 0xff112233)
  first.session.history.undo()
  expect(frame.duration).toBe(250)
  first.session.history.undo()
  expect(frame.duration).toBe(oldDuration)
  act(() => hook.result.current.openFramePropertiesFor(second.timeline.activeFrameId))
  hook.unmount()
  paint(second.session, 0xff445566)
  expect(second.session.history.length).toBe(1)
})

it('places tween below loop creation for frames and passes the clicked loop to the dialog', () => {
  const options = fixture()
  installStore(options.session)
  const frameId = options.timeline.activeFrameId
  options.timeline.loopSections = [{ id: 'clicked-loop', name: 'Loop', startFrameId: frameId, endFrameId: frameId, direction: 'forward', repeatCount: null }]
  const hook = renderHook(useTimelineContextActions, { initialProps: options })
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: 10, clientY: 10 } as unknown as React.MouseEvent<HTMLElement>
  act(() => hook.result.current.openAnimationMenu(event, { kind: 'frame', frameId, x: 10, y: 10 }))
  const view = render(hook.result.current.timelineContextSurfaces)
  expect(view.getAllByRole('menuitem').slice(0, 2).map(item => item.textContent)).toEqual(['timeline.createLoopSection', 'timeline.tween.title'])
  act(() => hook.result.current.openLoopSectionMenu(event, 'clicked-loop'))
  view.rerender(hook.result.current.timelineContextSurfaces)
  fireEvent.click(view.getByRole('menuitem', { name: 'timeline.tween.title' }))
  view.rerender(hook.result.current.timelineContextSurfaces)
  expect(view.getByTestId('tween-dialog')).toHaveTextContent('clicked-loop')
})
