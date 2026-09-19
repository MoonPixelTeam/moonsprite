import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { EditorToolRail } from './EditorToolRail'
import { toolDefinitions } from './editor-tools'

vi.mock('@/components/useQuickToolShortcut', () => ({ currentHeldShortcutKeyParts: () => new Set(), useQuickToolShortcut: () => null }))
beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('tools', 2, 2, 'rgba'))
})
afterEach(cleanup)

describe('tool memories', () => {
  it('keeps the smooth brush slot after selecting fill and reactivates smooth', () => {
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
