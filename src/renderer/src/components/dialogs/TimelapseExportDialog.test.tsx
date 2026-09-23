import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TimelapseSettings } from '@shared/types-timelapse'
import { I18nProvider } from '../I18nProvider'
import { ProjectTimelapseDialog, TimelapseDialog } from '../TimelapseDialog'
import { useWorkspace } from '@/store/workspace'
import { createDocument } from '@/core/document'
import { TimelapseExportDialog } from './TimelapseExportDialog'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })
const settings: TimelapseSettings = { enabled: true, quality: 'low', fps: 12, speed: 2, snapshots: [
  { id: 'one', capturedAt: 100, elapsedMs: 100, width: 1, height: 1, data: new Uint8Array([1]) }
] }

it('updates project recording controls immediately and retains them after reopening the dialog', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const previous = useWorkspace.getState()
  useWorkspace.setState({ sessions: [], activeId: null })
  const document = createDocument('recording settings', 2, 2, 'rgba', false)
  useWorkspace.getState().addSession(document)
  const renderDialog = () => render(<I18nProvider><ProjectTimelapseDialog documentId={document.id} documentName={document.name} defaultDirectory="" onChange={useWorkspace.getState().setTimelapseSettings} onClear={useWorkspace.getState().clearTimelapse} onExport={vi.fn(async () => true)} onClose={vi.fn()} /></I18nProvider>)
  try {
    const view = renderDialog()
    const recording = view.getByRole('checkbox', { name: '记录绘画过程' })
    fireEvent.click(recording)
    expect(recording).toBeChecked()
    fireEvent.click(recording)
    expect(recording).not.toBeChecked()
    fireEvent.click(view.getByRole('checkbox', { name: '记录撤销步骤' }))
    expect(view.getByRole('checkbox', { name: '记录撤销步骤' })).toBeChecked()
    fireEvent.click(view.getByRole('button', { name: '录制方式' }))
    fireEvent.click(view.getByRole('option', { name: '全程录制' }))
    expect(view.getByRole('button', { name: '录制方式' })).toHaveTextContent('全程录制')
    expect(document.timelapse).toMatchObject({ enabled: false, recordUndoSteps: true, mode: 'full' })
    expect(document.dirty).toBe(true)
    view.unmount()
    const reopened = renderDialog()
    expect(reopened.getByRole('checkbox', { name: '记录撤销步骤' })).toBeChecked()
    expect(reopened.getByRole('button', { name: '录制方式' })).toHaveTextContent('全程录制')
    reopened.unmount()
  } finally { useWorkspace.setState(previous) }
})

it('opens a separate export form and keeps recording controls in the original dialog', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: vi.fn() })))
  const onExport = vi.fn(async () => true)
  const onChange = vi.fn()
  const view = render(<I18nProvider><TimelapseDialog settings={settings} documentName="Process.moonsprite" defaultDirectory="D:/exports" onChange={onChange} onClear={vi.fn()} onClose={vi.fn()} onExport={onExport} /></I18nProvider>)
  const smartDescription = '保留近期操作，定期精简较早的记录，并优先保留变化较大的画面。适合长时间绘制；不裁剪画布，也不会自动清理已写入本地库的数据。'
  expect(view.queryByText(smartDescription)).toBeNull()
  const recordingMode = view.getByRole('button', { name: '录制方式' })
  fireEvent.click(recordingMode)
  const smartOption = view.getByRole('option', { name: '智能采样' })
  fireEvent.pointerEnter(smartOption.querySelector('.moon-tooltip-anchor')!)
  expect(view.getByRole('tooltip')).toHaveTextContent(smartDescription)
  fireEvent.click(recordingMode)
  expect(view.queryByRole('button', { name: '导出格式' })).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '导出视频' }))
  expect(view.getAllByRole('dialog')).toHaveLength(1)
  expect(view.getByRole('button', { name: '导出格式' })).toBeTruthy()
  expect(view.baseElement.querySelector('.timelapse-modal')).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '导出格式' }))
  fireEvent.click(view.getByRole('option', { name: 'PNG' }))
  expect(view.getByRole('button', { name: '导出图片' })).toBeTruthy()
  expect(onExport).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(view.getByRole('button', { name: '取消' }))
  expect(view.baseElement.querySelector('.timelapse-modal')).toBeTruthy()
  await act(async () => {})
})

it('hides parameters during conflict resolution and restores them on cancellation without duplicate exports', async () => {
  let finish!: (value: boolean) => void
  const operation = new Promise<boolean>(resolve => { finish = resolve })
  const onExport = vi.fn(() => operation)
  const onComplete = vi.fn()
  const view = render(<I18nProvider><TimelapseExportDialog settings={settings} documentName="Process.moonsprite" defaultDirectory="D:/exports" onExport={onExport} onCancel={vi.fn()} onComplete={onComplete} /></I18nProvider>)
  fireEvent.change(view.getByRole('textbox', { name: '导出文件' }), { target: { value: 'custom.mp4' } })
  const form = view.baseElement.querySelector<HTMLFormElement>('form')!
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(onExport).toHaveBeenCalledTimes(1)
  expect(onExport).toHaveBeenCalledWith('mp4', expect.objectContaining({ name: 'custom.mp4', directory: 'D:/exports' }))
  expect(view.queryByRole('dialog')).toBeNull()
  await act(async () => { finish(false); await operation })
  expect(view.getByRole('textbox', { name: '导出文件' })).toHaveValue('custom.mp4')
  expect(onComplete).not.toHaveBeenCalled()
  onExport.mockResolvedValueOnce(true)
  await act(async () => { fireEvent.submit(view.baseElement.querySelector('form')!) })
  expect(onComplete).toHaveBeenCalledTimes(1)
})
