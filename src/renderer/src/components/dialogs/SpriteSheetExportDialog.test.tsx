import { createRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ExportDialogHost, type ExportDialogHandle } from '@/components/app/ExportDialogHost'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument } from '@/core/document'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { useWorkspace } from '@/store/workspace'
import { SpriteSheetExportDialog } from './SpriteSheetExportDialog'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkspace.setState({ sessions: [], activeId: null })
  localStorage.clear()
})

it.each([
  { mode: 'recent' as const, configured: 'D:/configured', recent: 'D:/recent', expected: 'D:/recent' },
  { mode: 'fixed' as const, configured: 'D:/configured', recent: 'D:/recent', expected: 'D:/configured' },
  { mode: 'recent' as const, configured: 'D:/configured', recent: '', expected: 'D:/configured' },
  { mode: 'recent' as const, configured: '', recent: '', expected: 'D:/exports' }
])('uses the ordinary export directory for $mode mode ($expected)', async ({ mode, configured, recent, expected }) => {
  saveEditorPreferences({ ...loadEditorPreferences(), exportLocationMode: mode, exportDirectory: configured, lastExportDirectory: recent })
  useWorkspace.getState().addSession(createDocument('Hero', 2, 2, 'rgba'))
  const session = useWorkspace.getState().sessions[0]
  const exportCommand = vi.spyOn(useWorkspace.getState(), 'exportActive').mockResolvedValue(true)
  const ref = createRef<ExportDialogHandle>()
  const ordinary = render(<I18nProvider><ExportDialogHost ref={ref} defaultFileDirectories={{ saveDirectory: 'D:/gallery', exportDirectory: 'D:/exports' }} exportScalePresets={[100]} /></I18nProvider>)
  act(() => ref.current!.open())
  await act(async () => { fireEvent.submit(ordinary.baseElement.querySelector('form.export-modal')!) })
  expect(exportCommand).toHaveBeenCalledWith(expect.objectContaining({ directory: expected }))
  ordinary.unmount()

  const onExport = vi.fn(async () => true)
  const sheet = render(<I18nProvider><SpriteSheetExportDialog session={session} defaultDirectory="D:/exports" localGalleryDirectory="D:/gallery" onClose={vi.fn()} onClosePreview={vi.fn()} onExport={onExport} onPreview={vi.fn()} /></I18nProvider>)
  fireEvent.click(sheet.getByRole('button', { name: /^输出$/ }))
  fireEvent.click(sheet.getByRole('checkbox', { name: '输出文件' }))
  await act(async () => { fireEvent.submit(sheet.baseElement.querySelector('form.sprite-sheet-export-modal')!) })
  expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ outputFile: true, directory: expected }))
})
