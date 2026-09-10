import { useState, type ReactElement } from 'react'
import { useWorkspace } from '@/store/workspace'
import { exportAndroidSavedProject } from '@/platform/android-api'
import { isAndroidRuntime } from '@/platform/runtime-platform'

/** First tablet build: explicit pen-accessible alternatives to mouse buttons. */
export function AndroidTabletBar(): ReactElement | null {
  const activeId = useWorkspace((state) => state.activeId)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('笔绘模式：手指不会在画布落笔')
  if (!isAndroidRuntime()) return null
  const run = async (exportProject = false): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const state = useWorkspace.getState()
      const session = state.sessions.find((item) => item.document.id === state.activeId)
      if (!session) return
      const id = session.document.id
      const internalProject = /[\/]gallery[\/].*\.moonsprite$/i.test(session.document.filePath ?? '')
      const saved = internalProject ? await state.saveActive() : await state.saveActive(true, {
        name: session.document.name, format: 'moonsprite', scalePercent: 100,
      })
      if (!saved) { setStatus('保存未完成，请检查状态栏'); return }
      const path = useWorkspace.getState().sessions.find((item) => item.document.id === id)?.document.filePath
      if (exportProject && path) {
        setStatus(await exportAndroidSavedProject(path, window.moonSprite) ? '工程已导出' : '已保存到应用内，取消了导出')
      } else setStatus('已保存到应用内图库')
    } catch (error) {
      console.error('Android project save/export failed', error)
      setStatus(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  const exportImage = async (format: 'png-auto' | 'gif'): Promise<void> => {
    if (busy) return
    const state = useWorkspace.getState()
    const session = state.sessions.find((item) => item.document.id === state.activeId)
    if (!session) return
    setBusy(true)
    try {
      const ok = await state.exportActive({ name: session.document.name, format, scalePercent: 100, target: 'document', directory: '' })
      setStatus(ok ? '已导出到选择的位置' : '导出未完成，请检查状态栏')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally { setBusy(false) }
  }
  return <nav className="android-tablet-bar" aria-label="平板快捷操作">
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().setTool('pencil')}>画笔</button>
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().setTool('eraser')}>橡皮</button>
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().setTool('eyedropper')}>取色</button>
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().setTool('hand')}>平移</button>
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().setTool('zoom')}>缩放</button>
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().undo()}>撤销</button>
    <button disabled={!activeId || busy} onClick={() => useWorkspace.getState().redo()}>重做</button>
    <button disabled={!activeId || busy} onClick={() => { void run() }}>保存</button>
    <button disabled={!activeId || busy} onClick={() => { void run(true) }}>导出工程</button>
    <button disabled={!activeId || busy} onClick={() => { void exportImage('png-auto') }}>PNG</button>
    <button disabled={!activeId || busy} onClick={() => { void exportImage('gif') }}>GIF</button>
    <span role="status">{busy ? '正在保存…' : status}</span>
  </nav>
}
