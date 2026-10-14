import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import moonspriteLogo from '@/assets/moonsprite-logo.svg'
import { useI18n } from '@/components/I18nProvider'
import { APP_CHANNEL_LABEL } from '@/core/app-meta'
import { closeAppWindow, minimizeAppWindow, observeAppWindowMaximized, settleAppWindowCursorAfterMaximize, startAppWindowDragging, toggleAppWindowMaximized } from '@/platform/app-window'

const TITLEBAR_DRAG_THRESHOLD = 3

const captionGlyphs = {
  minimize: '\uE921',
  maximize: '\uE922',
  restore: '\uE923',
  close: '\uE8BB'
} as const

export function AppWindowTitleBar() {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)
  const dragCandidateRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null)

  useEffect(() => observeAppWindowMaximized(setMaximized), [])

  const toggleMaximized = useCallback(() => {
    void toggleAppWindowMaximized().then(setMaximized).catch(() => {})
  }, [])

  const beginDragCandidate = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false) return
    dragCandidateRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }, [])

  const moveDragCandidate = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const candidate = dragCandidateRef.current
    if (!candidate || candidate.pointerId !== event.pointerId) return
    if ((event.buttons & 1) === 0) {
      dragCandidateRef.current = null
      return
    }
    if (Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) < TITLEBAR_DRAG_THRESHOLD) return
    dragCandidateRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.preventDefault()
    void startAppWindowDragging().catch(() => {})
  }, [])

  const finishDragCandidate = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragCandidateRef.current?.pointerId === event.pointerId) dragCandidateRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const settleMaximizeCursor = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.buttons === 0) void settleAppWindowCursorAfterMaximize()
  }, [])

  const maximizeLabel = t(maximized ? 'app.window.restore' : 'app.window.maximize')
  // Caption buttons are pointer-only controls. Keeping their focus after a
  // click makes Enter invoke the native button again, which conflicts with the
  // animation playback shortcut while editing.
  const keepCanvasKeyboardFocus = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }, [])

  return <header className="app-window-titlebar" onPointerMoveCapture={settleMaximizeCursor}>
    <div className="app-window-titlebar-drag" onPointerDown={beginDragCandidate} onPointerMove={moveDragCandidate} onPointerUp={finishDragCandidate} onPointerCancel={finishDragCandidate} onLostPointerCapture={finishDragCandidate} onDoubleClick={toggleMaximized}>
      <img className="app-window-titlebar-logo" src={moonspriteLogo} alt="" aria-hidden="true" />
      <span className="app-window-titlebar-text">MoonSprite {APP_CHANNEL_LABEL}</span>
    </div>
    <div className="app-window-controls">
      <button type="button" tabIndex={-1} className="app-window-control" title={t('app.window.minimize')} aria-label={t('app.window.minimize')} onPointerDown={keepCanvasKeyboardFocus} onClick={() => { void minimizeAppWindow().catch(() => {}) }}><span aria-hidden="true">{captionGlyphs.minimize}</span></button>
      <button type="button" tabIndex={-1} className="app-window-control" title={maximizeLabel} aria-label={maximizeLabel} onPointerDown={keepCanvasKeyboardFocus} onClick={toggleMaximized}><span aria-hidden="true">{maximized ? captionGlyphs.restore : captionGlyphs.maximize}</span></button>
      <button type="button" tabIndex={-1} className="app-window-control app-window-control-close" title={t('app.window.close')} aria-label={t('app.window.close')} onPointerDown={keepCanvasKeyboardFocus} onClick={() => { void closeAppWindow().catch(() => {}) }}><span aria-hidden="true">{captionGlyphs.close}</span></button>
    </div>
  </header>
}
