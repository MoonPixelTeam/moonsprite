import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '@/store/workspace'
import { isCanvasToolGestureLocked } from '@/core/canvas-tool-gesture-lock'
import { useI18n } from '@/components/I18nProvider'
import { Button } from '@/components/Button'
import { NumberInput } from '@/components/NumberInput'
import { RangeField } from '@/components/RangeField'
import { FormField } from '@/components/FormField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SettingsSection } from '@/components/SettingsSection'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { Tooltip } from '@/components/Tooltip'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { FLOATING_PANEL_STORAGE_KEYS } from '@/core/workspace-layout-preferences'
import { resetTabletInteraction, setTabletBoxMove, setTabletModifier, setTabletTemporaryTool, tabletBoxMove, tabletFeedback, tabletModifier, tabletTemporaryTool, TABLET_FEEDBACK_EVENT, TABLET_INTERACTION_EVENT } from '@/core/tablet-interaction'
import { TabletPressButton } from './TabletPressButton'
import './tablet-workspace.css'

export function TabletAssistBar({ docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock, onClose }: DockDragProps & { onClose: () => void }) {
  const state = useWorkspace(), session = state.sessions.find(s => s.document.id === state.activeId)
  const { t } = useI18n()
  const floating = useFloatingPanel(docked ? null : { x: 64, y: 96, width: 260, height: 560 }, false, true, FLOATING_PANEL_STORAGE_KEYS.tabletAssist, true, onFloatingDock, docked)
  const [, refresh] = useState(0)
  const [locked, setLocked] = useState(false), [message, setMessage] = useState('')
  const [viewOpen, setViewOpen] = useState(false)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const repeat = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pointerNudge = useRef(false)
  const stopRepeat = () => { clearTimeout(repeat.current); repeat.current = undefined }
  useEffect(() => {
    const change = () => refresh(v => v + 1)
    const feedback = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      clearTimeout(feedbackTimer.current); setMessage(text === 'clear' ? '' : text)
      if (text !== 'holding') feedbackTimer.current = setTimeout(() => setMessage(''), 1600)
    }
    const release = () => { resetTabletInteraction(); stopRepeat(); setLocked(false) }
    const hidden = () => { if (document.hidden) release() }
    setLocked(false)
    window.addEventListener(TABLET_INTERACTION_EVENT, change)
    window.addEventListener(TABLET_FEEDBACK_EVENT, feedback)
    window.addEventListener('blur', release); document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener(TABLET_INTERACTION_EVENT, change); window.removeEventListener(TABLET_FEEDBACK_EVENT, feedback)
      window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden)
      clearTimeout(feedbackTimer.current); stopRepeat(); resetTabletInteraction()
    }
  }, [state.activeId])
  if (!session) return null
  const id = session.document.id
  const messages: Record<string, string> = { undo: t('tablet.undone'), redo: t('tablet.redone'), sampling: t('tablet.sampling'), holding: t('tablet.holding'), snap: t('tablet.snap') }
  const emitKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  }
  const nudge = (x: number, y: number) => {
    if (useWorkspace.getState().activeId !== id || isCanvasToolGestureLocked()) return
    const commands = useWorkspace.getState()
    if (tabletBoxMove(id)) commands.moveActiveSelectionWithSelectionHistory(x, y, false)
    else commands.moveActiveSelection(x, y)
  }
  return <><section ref={floating.ref} style={floating.style} onPointerDown={floating.bringToFront} onContextMenu={onPanelContextMenu} className={`panel tablet-assist-bar ${floating.style ? 'floating-panel' : ''}`} aria-label={t('tablet.assist')}
    onClickCapture={event => {
      if (isCanvasToolGestureLocked() && !(event.target instanceof Element && event.target.closest('[data-tablet-modifier]'))) { event.preventDefault(); event.stopPropagation() }
    }}>
    <header onPointerDown={event => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}>
      <strong title={t('tablet.assist')}>{t('tablet.assist')}</strong>
      <span className="panel-actions tablet-assist-actions" onPointerDown={event => event.stopPropagation()}>
        <button type="button" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}><PixelUtilityIcon kind="close" /></button>
      </span>
    </header>
    <div className="tablet-assist-scroll touch-controls component-scrollbar">
      <div className="tablet-assist-pair">
        <Button disabled={!session.history.canUndo} onClick={() => { state.undo(); tabletFeedback('undo') }}><PixelUtilityIcon kind="undo" />{t('tablet.undo')}</Button>
        <Button disabled={!session.history.canRedo} onClick={() => { state.redo(); tabletFeedback('redo') }}><PixelUtilityIcon kind="redo" />{t('tablet.redo')}</Button>
      </div>
      <SegmentedControl label={t('tablet.tool')} layout="grid" value={session.tool} onChange={state.setTool} options={(['pencil', 'eraser'] as const).map(value => ({ value, label: t(`tablet.${value}`) }))} />
      <TabletPressButton label={t('tablet.sample')} active={tabletTemporaryTool(id) === 'eyedropper'} onActive={active => setTabletTemporaryTool(id, active ? 'eyedropper' : null)} />
      <FormField className="tablet-assist-group" label={t('tablet.modifiers')}>
        <SegmentedControl label={t('tablet.modifiers')} layout="grid" value={locked ? 'latch' : 'hold'} onChange={mode => { for (const modifier of ['constrain', 'center', 'rotate'] as const) setTabletModifier(id, modifier, false); setLocked(mode === 'latch') }} options={(['hold', 'latch'] as const).map(value => ({ value, label: t(`tablet.${value}`) }))} />
        <div className="tablet-assist-modifiers">{(['constrain', 'center', 'rotate'] as const).map(modifier => <TabletPressButton key={modifier} label={t(`tablet.${modifier}`)} active={tabletModifier(id, modifier)} locked={locked} onActive={active => setTabletModifier(id, modifier, active)} />)}</div>
      </FormField>
      <div className="tablet-assist-group tablet-assist-brush-fields">
        <FormField className="tablet-assist-value-field" layout="inline" label={t('tablet.size')}>
          <NumberInput density="touch" aria-label={t('tablet.size')} min={1} max={64} value={session.brushSize} onValueChange={state.setBrushSize} />
        </FormField>
        <RangeField ariaLabel={t('tablet.size')} min={1} max={64} value={session.brushSize} onChange={state.setBrushSize} />
        <FormField className="tablet-assist-value-field" layout="inline" label={t('tablet.opacity')}>
          <NumberInput density="touch" aria-label={t('tablet.opacity')} min={0} max={100} suffix="%" value={session.brushOpacity} onValueChange={state.setBrushOpacity} />
        </FormField>
        <RangeField ariaLabel={t('tablet.opacity')} min={0} max={100} suffix="%" value={session.brushOpacity} onChange={state.setBrushOpacity} />
      </div>
      {session.selection && <SettingsSection className="tablet-assist-group" title={t('tablet.selection')}>
        <div className="settings-section-body tablet-selection-controls">
          <output>{session.selection.width} × {session.selection.height} · {Math.round(session.pendingPaste?.transformAngle ?? 0)}°</output>
          <SegmentedControl label={t('tablet.selectionMode')} layout="grid" value={session.selectionMode} onChange={state.setSelectionMode} options={(['replace', 'add', 'subtract', 'intersect'] as const).map(value => ({ value, label: t(`tablet.${value}`) }))} />
          <SegmentedControl label={t('tablet.moveMode')} layout="grid" value={tabletBoxMove(id) ? 'boundary' : 'pixels'} onChange={mode => { if (mode === 'boundary') state.commitFloatingPaste(); state.setTool('selection'); state.setSelectionMode('replace'); setTabletBoxMove(id, mode === 'boundary') }} options={(['boundary', 'pixels'] as const).map(value => ({ value, label: t(`tablet.${value}`) }))} />
          <Button onClick={() => { setTabletBoxMove(id, false); state.beginFreeTransform() }}>{t('tablet.transform')}</Button>
          <div className="tablet-assist-nudge" role="group" aria-label={t('tablet.nudge')}>{([[-1, 0, 'left'], [0, -1, 'up'], [0, 1, 'down'], [1, 0, 'right']] as const).map(([x, y, direction]) => <Tooltip key={direction} className={`tablet-nudge-${direction}`} content={t(`tablet.${direction}`)}><Button aria-label={t(`tablet.${direction}`)}
            onPointerDown={event => {
              if (event.button !== 0 || isCanvasToolGestureLocked()) return
              event.preventDefault(); pointerNudge.current = true; event.currentTarget.setPointerCapture(event.pointerId); stopRepeat(); nudge(x, y)
              const step = () => { nudge(x, y); repeat.current = setTimeout(step, 90) }; repeat.current = setTimeout(step, 380)
            }}
            onKeyDown={() => { pointerNudge.current = false }} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onLostPointerCapture={stopRepeat}
            onClick={() => { if (pointerNudge.current) { pointerNudge.current = false; return }; nudge(x, y) }}><PixelUtilityIcon kind={direction} /></Button></Tooltip>)}<span className="tablet-nudge-step" aria-hidden="true">1 px</span></div>
          <Button onClick={() => { state.commitFloatingPaste(); state.setSelection(null) }}>{t('tablet.deselect')}</Button>
        </div>
      </SettingsSection>}
      <Button className="tablet-assist-view-toggle" aria-expanded={viewOpen} onClick={() => setViewOpen(!viewOpen)}><PixelUtilityIcon kind={viewOpen ? 'down' : 'right'} />{Math.round(session.view.zoom * 100)}% · {Math.round(session.view.rotation)}°</Button>
      {viewOpen && <div className="tablet-assist-pair tablet-assist-view-actions">
        <Button onClick={() => state.setView({ zoom: 1, panX: 0, panY: 0 })}>100%</Button>
        <Button onClick={() => state.setView({ zoom: Math.max(0.01, Math.min((session.viewportSize.width - 40) / session.document.width, (session.viewportSize.height - 40) / session.document.height)), panX: 0, panY: 0, rotation: 0 })}>{t('tablet.fit')}</Button>
        <Button onClick={() => state.setView({ rotation: 0 })}>{t('tablet.resetRotation')}</Button>
      </div>}
    </div>
    <output className={`tablet-feedback${message === 'holding' ? ' holding' : ''}`} role="status">{messages[message] ?? message}</output>
    <div className="tablet-assist-footer touch-controls">
      <Button variant="primary" onClick={() => emitKey('Enter')}>{t('tablet.confirm')}</Button>
      <Button onClick={() => emitKey('Escape')}>{t('tablet.cancel')}</Button>
    </div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section><FloatingDockPreview style={floating.dockPreview} /></>
}
