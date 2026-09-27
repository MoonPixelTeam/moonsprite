import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { ensureAnimationDocument } from '@/core/animation'
import { useWorkspace, type AnimationPlaybackMode, type DocumentSession } from '@/store/workspace'
import { useI18n } from './I18nProvider'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { formatShortcutBindingsForLocale, loadShortcutBindings, shortcutBindingsFor, type ShortcutId } from '@/core/shortcuts'

const playbackRates = [0.25, 0.5, 1, 1.5, 2, 3]

export interface AnimationPlaybackState {
  playing: boolean
  rate: number
  mode: AnimationPlaybackMode
  returnToStart: boolean
  setPlaying: (playing: boolean) => void
  setRate: (rate: number) => void
  setMode: (mode: AnimationPlaybackMode) => void
  setReturnToStart: (enabled: boolean) => void
}

export function AnimationPlaybackMenu({ session, x, y, zIndex, onClose, playback: controlledPlayback }: { session: DocumentSession; x: number; y: number; zIndex?: number; onClose: () => void; playback?: AnimationPlaybackState }) {
  const { locale, t } = useI18n()
  const store = useWorkspace.getState()
  const [shortcuts, setShortcuts] = useState(() => loadShortcutBindings())
  const timeline = ensureAnimationDocument(session.document)
  const shortcutHint = (id: ShortcutId) => {
    const shortcut = formatShortcutBindingsForLocale(shortcutBindingsFor(shortcuts, id), locale)
    return shortcut ? <kbd>{shortcut}</kbd> : null
  }
  const playback: AnimationPlaybackState = controlledPlayback ?? {
    playing: session.animationPlaying,
    rate: session.animationPlaybackRate ?? 1,
    mode: session.animationPlaybackMode ?? (timeline.loop ? 'all' : 'once'),
    returnToStart: session.animationReturnToStart ?? false,
    setPlaying: (playing) => store.setAnimationPlaying(playing),
    setRate: (rate) => store.setAnimationPlaybackRate(rate),
    setMode: (mode) => store.setAnimationPlaybackMode(mode),
    setReturnToStart: (enabled) => store.setAnimationReturnToStart(enabled)
  }

  useEffect(() => {
    const refreshShortcuts = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
  }, [])

  useEffect(() => {
    const dismiss = (event: PointerEvent): void => {
      if ((event.target as HTMLElement | null)?.closest('.animation-context-menu')) return
      onClose()
    }
    const close = (): void => onClose()
    const keyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', keyDown)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', keyDown)
    }
  }, [onClose])

  return createPortal(<div className="context-menu animation-context-menu" role="menu" aria-label={t('timeline.playbackSettings')} style={{ zIndex, left: Math.min(x, Math.max(8, window.innerWidth - 244)), top: Math.max(8, Math.min(y, window.innerHeight - 420)) }} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
    <button className="context-menu-item" type="button" role="menuitem" onClick={() => { playback.setPlaying(!playback.playing); onClose() }}>{playback.playing ? <Pause size={15} /> : <Play size={15} />}<span>{t(playback.playing ? 'timeline.pause' : 'timeline.play')}</span>{shortcutHint('toggleAnimationPlayback')}</button>
    <span className="context-menu-divider" />
    {playbackRates.map((rate) => { const shortcutId: ShortcutId = rate === 0.25 ? 'animationPlaybackSpeed025' : rate === 0.5 ? 'animationPlaybackSpeed050' : rate === 1 ? 'animationPlaybackSpeed100' : rate === 1.5 ? 'animationPlaybackSpeed150' : rate === 2 ? 'animationPlaybackSpeed200' : 'animationPlaybackSpeed300'; return <button key={rate} className="context-menu-item" type="button" role="menuitemradio" aria-checked={playback.rate === rate} onClick={() => { playback.setRate(rate); onClose() }}>{playback.rate === rate ? <PixelUtilityIcon kind="check" /> : <span />}<span>{t('timeline.playbackSpeedValue', { rate })}</span>{shortcutHint(shortcutId)}</button> })}
    <span className="context-menu-divider" />
    <button className="context-menu-item" type="button" role="menuitemradio" aria-checked={playback.mode === 'once'} onClick={() => { playback.setMode('once'); onClose() }}>{playback.mode === 'once' ? <PixelUtilityIcon kind="check" /> : <span />}<span>{t('timeline.playOnce')}</span>{shortcutHint('animationPlaybackOnce')}</button>
    <button className="context-menu-item" type="button" role="menuitemradio" aria-checked={playback.mode === 'all'} onClick={() => { playback.setMode('all'); onClose() }}>{playback.mode === 'all' ? <PixelUtilityIcon kind="check" /> : <span />}<span>{t('timeline.loopAll')}</span>{shortcutHint('animationPlaybackAll')}</button>
    <button className="context-menu-item" type="button" role="menuitemradio" aria-checked={playback.mode === 'tag'} onClick={() => { playback.setMode('tag'); onClose() }}>{playback.mode === 'tag' ? <PixelUtilityIcon kind="check" /> : <span />}<span>{t('timeline.loopCurrentTag')}</span>{shortcutHint('animationPlaybackTag')}</button>
    <span className="context-menu-divider" />
    <button className="context-menu-item" type="button" role="menuitemcheckbox" aria-checked={playback.returnToStart} onClick={() => { playback.setReturnToStart(!playback.returnToStart); onClose() }}>{playback.returnToStart ? <PixelUtilityIcon kind="check" /> : <RotateCcw size={15} />}<span>{t('timeline.returnToStart')}</span>{shortcutHint('toggleAnimationReturnToStart')}</button>
  </div>, document.body)
}
