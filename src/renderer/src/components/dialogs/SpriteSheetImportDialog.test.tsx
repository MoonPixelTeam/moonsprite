import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { useWorkspace } from '@/store/workspace'
import { SpriteSheetImportDialog } from './SpriteSheetImportDialog'
vi.mock('../I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('./SpriteSheetImportPreview', () => ({ SpriteSheetImportPreview: () => <div /> }))
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null, message: null }) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function setup() {
  useWorkspace.getState().addSession(createDocument('sheet', 64, 32, 'rgba', false))
  const onClose = vi.fn(), onChoose = vi.fn().mockResolvedValue(undefined)
  const view = render(<SpriteSheetImportDialog session={useWorkspace.getState().sessions[0]} onClose={onClose} onChoose={onChoose} />)
  return { view, onClose, onChoose }
}
it('derives frame width from columns, imports the selected source and cancels without importing', async () => {
  const { view, onClose } = setup()
  const command = vi.spyOn(useWorkspace.getState(), 'importSpriteSheet').mockResolvedValue(true)
  const columns = view.getByRole('spinbutton', { name: 'spriteSheetImport.columns' })
  fireEvent.change(columns, { target: { value: '4' } }); fireEvent.blur(columns)
  expect(view.getByRole('spinbutton', { name: 'spriteSheetImport.width' })).toHaveValue('16')
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'spriteSheetImport.import' })))
  expect(command).toHaveBeenCalledWith(useWorkspace.getState().activeId, expect.objectContaining({ width: 16, paddingX: 0 }))
  expect(onClose).toHaveBeenCalledOnce()
})
it('cancel and choosing a source never run the import command', async () => {
  const { view, onClose, onChoose } = setup()
  const command = vi.spyOn(useWorkspace.getState(), 'importSpriteSheet')
  await act(async () => fireEvent.click(view.getByRole('button', { name: 'spriteSheetImport.choose' })))
  expect(onChoose).toHaveBeenCalledOnce()
  fireEvent.click(view.getByRole('button', { name: 'common.cancel' }))
  expect(command).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledOnce()
})
