import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document'
import { loadEditorPreferences, saveEditorPreferences, type QuickCommandId } from '@/core/file-preferences'
import { useWorkspace } from '@/store/workspace'
import { QuickCommandBar } from './QuickCommandBar'

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

it('routes editing commands to the existing workspace commands and outline dialog', () => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  useWorkspace.getState().addSession(createDocument('commands', 4, 4, 'rgba'))
  const state = useWorkspace.getState()
  const ids: QuickCommandId[] = ['copy', 'copyMerged', 'paste', 'pasteToCurrentCell', 'pasteAsNewDocument', 'pasteAsNewLayer', 'deleteContent', 'fillForeground', 'quickOutline', 'outline']
  const prefs = loadEditorPreferences()
  saveEditorPreferences({ ...prefs, quickCommandBarEnabled: true, quickCommandBars: [{ ...prefs.quickCommandBars[0], edge: 'top', expanded: true, commands: ids.map(id => ({ id, enabled: true })) }] })
  const copyLayers = vi.spyOn(state, 'copySelectedLayersToClipboard').mockReturnValue(true)
  const copyMerged = vi.spyOn(state, 'copySelection').mockImplementation(() => {})
  const paste = vi.spyOn(state, 'pasteClipboard').mockResolvedValue(undefined)
  const pasteCel = vi.spyOn(state, 'pasteSelection').mockResolvedValue(undefined)
  const pasteProject = vi.spyOn(state, 'pasteAsNewDocument').mockResolvedValue(true)
  const pasteLayer = vi.spyOn(state, 'pasteAsNewLayer').mockResolvedValue(true)
  const remove = vi.spyOn(state, 'deleteActiveLayer').mockImplementation(() => {})
  const fill = vi.spyOn(state, 'fillForeground').mockImplementation(() => {})
  const quickOutline = vi.spyOn(state, 'quickOutlineActiveSelection').mockReturnValue(true)
  const outline = vi.fn()
  const view = render(<QuickCommandBar documentId={state.activeId!} shortcutFor={() => ''} onToggleMirror={() => {}} onOpenAntiAlias={() => {}} onOpenPreferences={() => {}} onOpenOutline={outline} />)
  for (const name of ['复制', '复制合并', '粘贴', '粘贴到当前单元格', '粘贴为新项目', '粘贴为新图层', '删除', '填充', '快捷描边', '描边']) fireEvent.click(view.getByRole('button', { name }))
  for (const command of [copyLayers, paste, pasteCel, pasteProject, pasteLayer, remove, fill, quickOutline, outline]) expect(command).toHaveBeenCalledOnce()
  expect(copyMerged).toHaveBeenCalledWith(true)
  fireEvent.contextMenu(view.getByRole('button', { name: '填充' }))
  expect(fill).toHaveBeenLastCalledWith('background')
})
