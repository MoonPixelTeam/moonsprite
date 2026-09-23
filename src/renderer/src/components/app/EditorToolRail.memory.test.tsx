import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { EditorToolRail } from './EditorToolRail'
import { toolDefinitions } from './editor-tools'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { serializeToolRail, TOOL_RAIL_PREFERENCE_KEY, type RailGroup } from '@/core/tool-rail-preferences'
import { railToolCatalog } from './tool-rail-catalog'

vi.mock('@/components/useQuickToolShortcut', () => ({ currentHeldShortcutKeyParts: () => new Set(), useQuickToolShortcut: () => null }))
beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('tools', 2, 2, 'rgba'))
})
afterEach(cleanup)

describe('tool memories', () => {
  it('shows the first tool with no arrow and opens its group by holding the primary button', () => {
    vi.useFakeTimers()
    try {
      const view = render(<EditorToolRail side="right" onGripPointerDown={() => {}} />)
      const pencil = toolDefinitions('zh-CN').find(tool => tool.id === 'pencil')!.label
      act(() => useWorkspace.getState().setTool('smooth'))
      const button = view.getByRole('button', { name: pencil })
      expect(view.container.querySelector('.tool-group-expand')).toBeNull()
      fireEvent.pointerDown(button, { button: 0 })
      act(() => vi.advanceTimersByTime(400))
      expect(button.getAttribute('aria-expanded')).toBe('true')
      fireEvent.pointerUp(button)
      fireEvent.click(button)
      expect(useWorkspace.getState().sessions[0].tool).toBe('smooth')
      fireEvent.keyDown(button, { key: 'Escape' })
      expect(button.getAttribute('aria-expanded')).toBe('false')
    } finally { vi.useRealTimers() }
  })
  it('persists a mixed custom group and activates its exact subtype independently of the current tool', () => {
    const group: RailGroup = { kind: 'group', id: 'group:test', name: '测试组', tools: ['pencil', 'shape.ellipse', 'selection.lasso', 'fill.gradient'], behavior: 'fixed', defaultTool: 'shape.ellipse' }
    saveEditorPreferences({ ...loadEditorPreferences(), toolRail: [group] })
    expect(loadEditorPreferences().toolRail).toEqual([group])
    const view = render(<EditorToolRail side="right" onGripPointerDown={() => {}} />)
    const label = (id: string) => railToolCatalog('zh-CN').find(tool => tool.id === id)!.label
    fireEvent.click(view.getByRole('button', { name: label('shape.ellipse') }))
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'shape', shapeKind: 'ellipse' })
    expect(view.getByRole('dialog', { name: '测试组' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: label('selection.lasso') }))
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'selection', selectionKind: 'lasso' })
    fireEvent.contextMenu(view.getByRole('button', { name: label('shape.ellipse') }))
    fireEvent.click(view.getByRole('button', { name: label('fill.gradient') }))
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'fill', fillKind: 'gradient' })
    fireEvent.click(view.getByRole('button', { name: label('shape.ellipse') }))
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ tool: 'shape', shapeKind: 'ellipse' })
  })
  it('keeps hidden tools usable and retains group memory after remount and project switches', () => {
    const group: RailGroup = { kind: 'group', id: 'group:test', name: '测试组', tools: ['eraser', 'line.curve'], behavior: 'remember', defaultTool: 'eraser' }
    localStorage.setItem(TOOL_RAIL_PREFERENCE_KEY, serializeToolRail([group]))
    let view = render(<EditorToolRail side="left" onGripPointerDown={() => {}} />)
    act(() => { useWorkspace.getState().setTool('line'); useWorkspace.getState().setLineKind('curve') })
    act(() => useWorkspace.getState().setTool('hand'))
    const label = railToolCatalog('zh-CN').find(tool => tool.id === 'line.curve')!.label
    view.unmount()
    act(() => useWorkspace.getState().addSession(createDocument('second', 2, 2, 'rgba')))
    view = render(<EditorToolRail side="left" onGripPointerDown={() => {}} />)
    fireEvent.click(view.getByRole('button', { name: label }))
    const state = useWorkspace.getState()
    expect(state.sessions.find(session => session.document.id === state.activeId)).toMatchObject({ tool: 'line', lineKind: 'curve' })
  })
  it('keeps the smooth brush slot when the user explicitly chooses memory', () => {
    saveEditorPreferences({ ...loadEditorPreferences(), toolRail: [{ kind: 'group', id: 'group:pencil', name: '', tools: ['pencil', 'airbrush', 'smooth'], behavior: 'remember', defaultTool: 'pencil' }] })
    const view = render(<EditorToolRail side="left" onGripPointerDown={() => {}} />)
    act(() => useWorkspace.getState().setTool('smooth'))
    act(() => useWorkspace.getState().setTool('fill'))
    const label = toolDefinitions('zh-CN').find((tool) => tool.id === 'smooth')!.label
    const button = view.getByRole('button', { name: label })
    expect(button.classList.contains('selected')).toBe(false)
    fireEvent.click(button)
    expect(useWorkspace.getState().sessions[0].tool).toBe('smooth')
  })

  it.each(['airbrush', 'smooth', 'shape', 'liquify'] as const)('retains independent brush size and shape for %s', (tool) => {
    const store = useWorkspace.getState()
    store.setBrushSize(5)
    store.setBrushShape('round')
    store.setTool(tool)
    store.setBrushSize(17)
    store.setBrushShape('square')
    store.setTool('fill')
    store.setTool('pencil')
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ brushSize: 5, brushShape: 'round' })
    store.setTool(tool)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ brushSize: 17, brushShape: 'square' })
  })
})
