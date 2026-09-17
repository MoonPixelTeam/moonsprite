import { useCallback, useEffect, useRef, useState } from 'react'
import type { LuaScriptDialogAction } from '@shared/types-scripting'
import type { LuaScriptEntry } from '@shared/types-extensions'
import { appCoordinatorRenderKey } from '@/components/app/app-render-keys'
import { LuaScriptResultDialog, type LuaScriptReport } from '@/components/LuaScriptResultDialog'
import { LuaScriptDialogs } from '@/components/LuaScriptDialog'
import { useWorkspace } from '@/store/workspace'
import { closeLuaScriptClientSession, dispatchLuaScriptDialogForActiveDocument, luaScriptTargetIsActive, runLuaScriptForActiveDocument, type LuaScriptClientSession } from '@/store/lua-script-service'
import { useI18n } from '@/components/I18nProvider'

/** Owns script discovery, running exclusion, persistent sessions and their dialog lifecycle. */
export function useAppScriptRuntime() {
  const {t} = useI18n()
  const coordinatorRenderKey = useWorkspace(appCoordinatorRenderKey)
  const [luaScriptRunning, setLuaScriptRunning] = useState(false)

  const [luaScriptReport, setLuaScriptReport] = useState<LuaScriptReport | null>(null)

  const [luaScriptSession, setLuaScriptSession] = useState<LuaScriptClientSession | null>(null)

  const [luaScripts, setLuaScripts] = useState<LuaScriptEntry[]>([])

  const [luaScriptsLoading, setLuaScriptsLoading] = useState(true)

  const [luaScriptsLoadFailed, setLuaScriptsLoadFailed] = useState(false)

  const luaScriptSessionRef = useRef<LuaScriptClientSession | null>(null)

  const luaScriptRunningRef = useRef(false)
  const lifecycleRef = useRef(0)

  const refreshLuaScripts = useCallback(async (): Promise<void> => {
    setLuaScriptsLoading(true)
    setLuaScriptsLoadFailed(false)
    try {
      const listing = await window.moonSprite.listLuaScripts()
      setLuaScripts(listing.scripts)
    } catch {
      setLuaScripts([])
      setLuaScriptsLoadFailed(true)
    } finally {
      setLuaScriptsLoading(false)
    }
  }, [])

  useEffect(() => { luaScriptSessionRef.current = luaScriptSession }, [luaScriptSession])

  useEffect(() => {
    lifecycleRef.current += 1
    return () => {
      lifecycleRef.current += 1
      const current = luaScriptSessionRef.current
      luaScriptSessionRef.current = null
      if (current) void closeLuaScriptClientSession(window.moonSprite, current).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (!luaScriptSession) return
    if (luaScriptTargetIsActive(luaScriptSession)) return
    void closeLuaScriptClientSession(window.moonSprite, luaScriptSession).catch(() => undefined)
    luaScriptSessionRef.current = null
    setLuaScriptSession(null)
  }, [coordinatorRenderKey, luaScriptSession])

  const runLuaScript = async (scriptId: string): Promise<void> => {
    if (luaScriptRunningRef.current || luaScriptSessionRef.current) return
    const lifecycle = lifecycleRef.current
    luaScriptRunningRef.current = true
    setLuaScriptRunning(true)
    setLuaScriptReport(null)
    useWorkspace.getState().setMessage(t('script.running'))
    try {
      const outcome = await runLuaScriptForActiveDocument(window.moonSprite, scriptId)
      if (lifecycle !== lifecycleRef.current) {
        if (outcome.session) await closeLuaScriptClientSession(window.moonSprite, outcome.session)
        return
      }
      const { summary } = outcome
      luaScriptSessionRef.current = outcome.session
      setLuaScriptSession(outcome.session)
      useWorkspace.getState().setMessage(outcome.session && summary.changedPixelCount === 0
        ? t('script.dialogReady', { name: summary.fileName })
        : summary.changedPixelCount > 0
        ? t('script.completed', { name: summary.fileName, pixels: summary.changedPixelCount, transactions: summary.transactionCount })
        : t('script.completedNoChanges', { name: summary.fileName }))
      if (summary.output.length > 0) setLuaScriptReport({ kind: 'success', summary })
    } catch (error) {
      if (lifecycle !== lifecycleRef.current) {
        console.error('Script completion after runtime disposal failed', error)
        return
      }
      const message = error instanceof Error ? error.message : t('script.failed')
      useWorkspace.getState().setMessage(t('script.failed'))
      setLuaScriptReport({ kind: 'error', error: message })
    } finally {
      luaScriptRunningRef.current = false
      if (lifecycle === lifecycleRef.current) setLuaScriptRunning(false)
    }
  }

  const dispatchLuaScriptDialog = async (action: LuaScriptDialogAction): Promise<void> => {
    const current = luaScriptSessionRef.current
    if (!current || luaScriptRunningRef.current) return
    const lifecycle = lifecycleRef.current
    if (!luaScriptTargetIsActive(current)) {
      luaScriptSessionRef.current = null
      setLuaScriptSession(null)
      void closeLuaScriptClientSession(window.moonSprite, current).catch(() => undefined)
      return
    }
    luaScriptRunningRef.current = true
    setLuaScriptRunning(true)
    setLuaScriptReport(null)
    try {
      const outcome = await dispatchLuaScriptDialogForActiveDocument(window.moonSprite, current, action)
      if (lifecycle !== lifecycleRef.current) {
        if (outcome.session) await closeLuaScriptClientSession(window.moonSprite, outcome.session)
        return
      }
      const { summary } = outcome
      luaScriptSessionRef.current = outcome.session
      setLuaScriptSession(outcome.session)
      useWorkspace.getState().setMessage(outcome.session && summary.changedPixelCount === 0
        ? t('script.dialogReady', { name: summary.fileName })
        : summary.changedPixelCount > 0
        ? t('script.completed', { name: summary.fileName, pixels: summary.changedPixelCount, transactions: summary.transactionCount })
        : t('script.completedNoChanges', { name: summary.fileName }))
      if (summary.output.length > 0) setLuaScriptReport({ kind: 'success', summary })
    } catch (error) {
      await closeLuaScriptClientSession(window.moonSprite, current).catch(() => undefined)
      if (lifecycle !== lifecycleRef.current) {
        console.error('Script dialog completion after runtime disposal failed', error)
        return
      }
      const targetStillActive = luaScriptTargetIsActive(current)
      if (luaScriptSessionRef.current?.sessionId === current.sessionId) {
        luaScriptSessionRef.current = null
        setLuaScriptSession(null)
      }
      if (!targetStillActive) return
      const message = error instanceof Error ? error.message : t('script.failed')
      useWorkspace.getState().setMessage(t('script.failed'))
      setLuaScriptReport({ kind: 'error', error: message })
    } finally {
      luaScriptRunningRef.current = false
      if (lifecycle === lifecycleRef.current) setLuaScriptRunning(false)
    }
  }
  return {
    scripts: luaScripts, loading: luaScriptsLoading, loadFailed: luaScriptsLoadFailed,
    busy: luaScriptRunning || Boolean(luaScriptSession), refresh: refreshLuaScripts, run: runLuaScript,
    closeTopDialog: (): boolean => {
      if (luaScriptReport) { setLuaScriptReport(null); return true }
      const dialog = luaScriptSessionRef.current?.dialogs.at(-1)
      if (!dialog) return false
      void dispatchLuaScriptDialog({dialogId: dialog.id, controlId: null, event: 'close', values: Object.fromEntries(dialog.controls.flatMap(control => control.dataKey ? [[control.dataKey, control.value]] : []))})
      return true
    },
    dialogs: <>    {luaScriptSession && <LuaScriptDialogs busy={luaScriptRunning} dialogs={luaScriptSession.dialogs} sessionId={luaScriptSession.sessionId} onAction={(action) => { void dispatchLuaScriptDialog(action) }} />}
    {luaScriptReport && <LuaScriptResultDialog report={luaScriptReport} onClose={() => setLuaScriptReport(null)} />}
  </>
  }
}
