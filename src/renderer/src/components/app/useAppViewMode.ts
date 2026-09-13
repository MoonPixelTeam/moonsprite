import { useCallback, useEffect, useState } from 'react'
import { type ShortcutId } from '@/core/shortcuts'
import { useWorkspace } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import type { DocumentSession } from '@/store/workspace'
type AdvancedMode = 'tool-options' | 'canvas-only'

export function useAppViewMode({
  homeOpen,
  session,
  shortcutFor
}: {
  homeOpen: boolean
  session: DocumentSession | null
  shortcutFor: (id: ShortcutId) => string
}) {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const [advancedMode, setAdvancedMode] = useState<AdvancedMode | null>(null)

  const [advancedModeNotice, setAdvancedModeNotice] = useState<string | null>(null)

  const [advancedModeNoticeShortcut, setAdvancedModeNoticeShortcut] = useState('')

  useEffect(() => {
    if (!advancedModeNotice) return
    const timer = window.setTimeout(() => setAdvancedModeNotice(null), 1700)
    return () => window.clearTimeout(timer)
  }, [advancedModeNotice])

  useEffect(() => {
    if (!session || homeOpen) setAdvancedMode(null)
  }, [homeOpen, session?.document.id])

  const cycleAdvancedMode = useCallback((): void => {
    const next: AdvancedMode | null = advancedMode === null ? 'tool-options' : advancedMode === 'tool-options' ? 'canvas-only' : null
    setAdvancedMode(next)
    setAdvancedModeNotice(t('app.advanced.enabled'))
    setAdvancedModeNoticeShortcut(shortcutFor('advancedMode'))
  }, [advancedMode, shortcutFor])

  const toggleMirrorView = useCallback(
    (axis: 'horizontal' | 'vertical'): void => {
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === useWorkspace.getState().activeId)
      if (!active) return
      const vertical = axis === 'vertical'
      const next = vertical ? !active.view.mirroredVertical : !active.view.mirrored
      workspace.setView(vertical ? { mirroredVertical: next } : { mirrored: next })
      setAdvancedModeNotice(
        t(
          `app.mirror.${vertical ? 'vertical' : 'horizontal'}${next ? 'On' : 'Off'}` as
            | 'app.mirror.horizontalOn'
            | 'app.mirror.horizontalOff'
            | 'app.mirror.verticalOn'
            | 'app.mirror.verticalOff'
        )
      )
      setAdvancedModeNoticeShortcut(shortcutFor(vertical ? 'mirrorViewVertical' : 'mirrorView'))
    },
    [shortcutFor, workspace]
  )

  const editorOnly = advancedMode !== null && Boolean(session) && !homeOpen
  return { advancedMode, advancedModeNotice, advancedModeNoticeShortcut, cycleAdvancedMode, toggleMirrorView, editorOnly }
}
