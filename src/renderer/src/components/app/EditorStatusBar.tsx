import { memo, useEffect, useState } from 'react'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { useI18n } from '@/components/I18nProvider'
import { statusBarRenderKey } from '@/components/app/app-render-keys'
import { SELECTION_SIZE_PREVIEW_EVENT, type SelectionSizePreviewDetail } from '@/components/selection-size-preview-events'
import { useWorkspace } from '@/store/workspace'

interface EditorStatusBarProps {
  homeOpen: boolean
  resourceLabel: string
}

export const EditorStatusBar = memo(function EditorStatusBar({ homeOpen, resourceLabel }: EditorStatusBarProps) {
  const { t } = useI18n()
  const [selectionSizePreview, setSelectionSizePreview] = useState<SelectionSizePreviewDetail | null>(null)
  const renderKey = useWorkspace((state) => statusBarRenderKey(
    state.sessions.find((item) => item.document.id === state.activeId) ?? null,
    state.message
  ))
  const state = useWorkspace.getState()
  const session = state.sessions.find((item) => item.document.id === state.activeId) ?? null
  const sessionId = session?.document.id ?? null
  useEffect(() => {
    setSelectionSizePreview(null)
    const updateSelectionSizePreview = (event: Event): void => {
      const detail = (event as CustomEvent<SelectionSizePreviewDetail>).detail
      if (detail.documentId === sessionId) setSelectionSizePreview(detail.size ? detail : null)
    }
    window.addEventListener(SELECTION_SIZE_PREVIEW_EVENT, updateSelectionSizePreview)
    return () => window.removeEventListener(SELECTION_SIZE_PREVIEW_EVENT, updateSelectionSizePreview)
  }, [sessionId])
  void renderKey
  const displayedSelectionSize = selectionSizePreview?.documentId === sessionId
    ? selectionSizePreview.size
    : session?.selection ?? null

  return <PerformanceProfiler id="EditorStatusBar"><footer className="statusbar">
    {session && !homeOpen ? <>
      {selectionSizePreview?.toolDetails && <span>{selectionSizePreview.toolDetails}</span>}
      <span>{t(`colorMode.${session.document.colorMode}`)}</span>
      <span>{t('status.layers', { count: session.document.layers.length })}</span>
      <span>{Math.round(session.view.zoom * 100)}%</span>
      <span>{displayedSelectionSize ? t('status.selection', { width: displayedSelectionSize.width, height: displayedSelectionSize.height }) : t('status.noSelection')}</span>
    </> : <span>{t('status.ready')}</span>}
    <span className="status-spacer" />
    {state.message && <span key={state.message} className="status-message" onClick={() => useWorkspace.getState().setMessage(null)}>{state.message}</span>}
    <span>{resourceLabel}</span>
  </footer></PerformanceProfiler>
})
