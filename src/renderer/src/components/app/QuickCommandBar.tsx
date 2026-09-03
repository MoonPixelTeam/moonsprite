import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { Tooltip } from '@/components/Tooltip'
import { useI18n } from '@/components/I18nProvider'
import { loadEditorPreferences, saveEditorPreferences, type QuickCommandBarEdge, type QuickCommandBarPreference, type QuickCommandId } from '@/core/file-preferences'
import { useWorkspace } from '@/store/workspace'
import type { ShortcutId } from '@/core/shortcuts'
import { QUICK_COMMAND_METADATA, type QuickCommandMetadata, type QuickCommandSettingsTarget } from './quick-command-registry'
import { detectDocumentPixelScale } from '@/core/image-scale-detection'

interface QuickCommandBarProps {
  documentId: string
  shortcutFor: (id: ShortcutId) => string
  onToggleMirror: (axis: 'horizontal' | 'vertical') => void
  onOpenPreferences: () => void
  onOpenCommandSettings?: (target: QuickCommandSettingsTarget) => void
}

interface QuickCommandBarInstanceProps extends QuickCommandBarProps {
  bar: QuickCommandBarPreference
  translucent: boolean
  onBarChange: (bar: QuickCommandBarPreference) => void
}

interface QuickCommandRuntime {
  disabled?: boolean
  pressed?: boolean
  run: () => void
}

type QuickCommandDefinition = QuickCommandMetadata & QuickCommandRuntime

interface QuickCommandDragState {
  pointerId: number
  edge: QuickCommandBarEdge
  position: number
  startEdge: QuickCommandBarEdge
  grabOffset: number
}

const QUICK_COMMAND_EDGE_INSET = 8
const QUICK_COMMAND_CENTER_SNAP_DISTANCE = 12
const DEFAULT_QUICK_COMMAND_POSITION = 0.5

const normalizeQuickCommandPosition = (value: number | undefined): number => Number.isFinite(value)
  ? Math.min(1, Math.max(0, value!))
  : DEFAULT_QUICK_COMMAND_POSITION

const preserveCanvasFocus = (event: ReactPointerEvent<HTMLButtonElement>): void => {
  event.preventDefault()
}

const QuickCommandBarInstance = memo(function QuickCommandBarInstance({ documentId, shortcutFor, onToggleMirror, onOpenPreferences, onOpenCommandSettings, bar, translucent, onBarChange }: QuickCommandBarInstanceProps) {
  const { t } = useI18n()
  const [moving, setMoving] = useState(false)
  const [dragPreview, setDragPreview] = useState<{ edge: QuickCommandBarEdge; position: number } | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<QuickCommandDragState | null>(null)
  const activeId = useWorkspace((state) => state.activeId)
  const session = useWorkspace((state) => state.sessions.find((item) => item.document.id === documentId) ?? null)
  const renderKey = useWorkspace((state) => {
    const current = state.sessions.find((item) => item.document.id === documentId)
    return current
      ? `${current.document.id}:${current.selection ? 1 : 0}:${current.view.mirrored ? 1 : 0}:${current.view.mirroredVertical ? 1 : 0}:${current.view.showPixelGrid ? 1 : 0}:${current.view.showGrid ? 1 : 0}:${current.view.showSelectionOutline === false ? 0 : 1}:${current.view.relativeLuminance ? 1 : 0}:${current.view.tileRepeatMode ?? 'off'}:${current.history.canUndo ? 1 : 0}:${current.history.canRedo ? 1 : 0}`
      : ''
  })
  void renderKey
  if (!session) return null
  if (bar.edge === 'none') return null

  const expanded = bar.expanded
  const visuallyExpanded = expanded && activeId === documentId
  const edge = dragPreview?.edge ?? bar.edge
  const position = normalizeQuickCommandPosition(dragPreview?.position ?? bar.position)

  const runForDocument = (run: (state: ReturnType<typeof useWorkspace.getState>) => void): void => {
    const current = useWorkspace.getState()
    if (current.activeId !== documentId) current.setActive(documentId)
    run(useWorkspace.getState())
  }
  const openCommandSettings = (event: ReactMouseEvent<HTMLButtonElement>, target: QuickCommandSettingsTarget): void => {
    event.preventDefault()
    event.stopPropagation()
    runForDocument(() => onOpenCommandSettings?.(target))
  }
  const toggleExpanded = (): void => {
    const state = useWorkspace.getState()
    if (activeId !== documentId) state.setActive(documentId)
    onBarChange({ ...bar, expanded: activeId === documentId ? !expanded : true })
  }
  const startMoving = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const element = barRef.current
    const rect = element?.getBoundingClientRect()
    const isVertical = edge === 'left' || edge === 'right'
    const pointerCoordinate = isVertical ? event.clientY : event.clientX
    const barCenter = rect ? (isVertical ? (rect.top + rect.bottom) / 2 : (rect.left + rect.right) / 2) : pointerCoordinate
    dragRef.current = { pointerId: event.pointerId, edge, position, startEdge: edge, grabOffset: pointerCoordinate - barCenter }
    setDragPreview({ edge, position })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setMoving(true)
  }
  const moveBar = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    const element = barRef.current
    const container = element?.parentElement
    if (!drag || drag.pointerId !== event.pointerId || !element || !container) return
    event.preventDefault()
    const containerRect = container.getBoundingClientRect()
    if (containerRect.width <= 0 || containerRect.height <= 0) return
    const distances: Array<[QuickCommandBarEdge, number]> = [
      ['top', Math.abs(event.clientY - containerRect.top)],
      ['right', Math.abs(event.clientX - containerRect.right)],
      ['bottom', Math.abs(event.clientY - containerRect.bottom)],
      ['left', Math.abs(event.clientX - containerRect.left)]
    ]
    const nextEdge = distances.reduce((nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest)[0]
    const rect = element.getBoundingClientRect()
    const isVertical = nextEdge === 'left' || nextEdge === 'right'
    const trackStart = isVertical ? containerRect.top : containerRect.left
    const trackSize = isVertical ? containerRect.height : containerRect.width
    const commandTrackSize = Math.max(1, commands.length + 2) * 28 + 5
    const horizontalBarSize = drag.startEdge === 'top' || drag.startEdge === 'bottom' ? rect.width : commandTrackSize
    const verticalBarSize = drag.startEdge === 'left' || drag.startEdge === 'right' ? rect.height : commandTrackSize
    const itemSize = isVertical ? verticalBarSize : horizontalBarSize
    const pointerCoordinate = isVertical ? event.clientY : event.clientX
    const sameAxis = (drag.startEdge === 'top' || drag.startEdge === 'bottom') === !isVertical
    const minCenter = trackStart + QUICK_COMMAND_EDGE_INSET + itemSize / 2
    const maxCenter = trackStart + trackSize - QUICK_COMMAND_EDGE_INSET - itemSize / 2
    const rawCenter = pointerCoordinate - (sameAxis ? drag.grabOffset : 0)
    const trackCenter = trackStart + trackSize / 2
    const snappedCenter = Math.abs(rawCenter - trackCenter) <= QUICK_COMMAND_CENTER_SNAP_DISTANCE ? trackCenter : rawCenter
    const center = minCenter <= maxCenter
      ? Math.min(maxCenter, Math.max(minCenter, snappedCenter))
      : trackCenter
    const nextPosition = trackSize > 0 ? normalizeQuickCommandPosition((center - trackStart) / trackSize) : DEFAULT_QUICK_COMMAND_POSITION
    drag.edge = nextEdge
    drag.position = nextPosition
    setDragPreview({ edge: nextEdge, position: nextPosition })
  }
  const finishMoving = (): void => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setMoving(false)
    setDragPreview(null)
    onBarChange({ ...bar, edge: drag.edge, position: drag.position })
  }
  const stopMoving = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    finishMoving()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const toggleTileRepeatMode = (mode: 'x' | 'y' | 'both'): void => runForDocument((state) => {
    const active = state.sessions.find((item) => item.document.id === documentId)
    state.setTileRepeatMode((active?.view.tileRepeatMode ?? 'off') === mode ? 'off' : mode)
  })

  const runtimeFor = (id: QuickCommandId): QuickCommandRuntime => {
    const selectionUnavailable = !session.selection
    switch (id) {
      case 'selectionFlipHorizontal': return { disabled: selectionUnavailable, run: () => runForDocument((state) => state.flipActiveSelection('horizontal')) }
      case 'selectionFlipVertical': return { disabled: selectionUnavailable, run: () => runForDocument((state) => state.flipActiveSelection('vertical')) }
      case 'canvasMirrorHorizontal': return { pressed: session.view.mirrored, run: () => runForDocument(() => onToggleMirror('horizontal')) }
      case 'canvasMirrorVertical': return { pressed: session.view.mirroredVertical, run: () => runForDocument(() => onToggleMirror('vertical')) }
      case 'invertSelection': return { disabled: selectionUnavailable, run: () => runForDocument((state) => state.invertSelection()) }
      case 'customGrid': return { pressed: session.view.showGrid, run: () => runForDocument((state) => state.toggleGrid()) }
      case 'tileRepeatX': return { pressed: session.view.tileRepeatMode === 'x', run: () => toggleTileRepeatMode('x') }
      case 'tileRepeatY': return { pressed: session.view.tileRepeatMode === 'y', run: () => toggleTileRepeatMode('y') }
      case 'tileRepeatBoth': return { pressed: session.view.tileRepeatMode === 'both', run: () => toggleTileRepeatMode('both') }
      case 'undo': return { disabled: !session.history.canUndo, run: () => runForDocument((state) => state.undo()) }
      case 'redo': return { disabled: !session.history.canRedo, run: () => runForDocument((state) => state.redo()) }
      case 'selectAll': return { run: () => runForDocument((state) => { const active = state.sessions.find((item) => item.document.id === documentId); if (!active) return; state.commitFloatingPaste(); state.setTool('selection'); state.setSelection({ x: 0, y: 0, width: active.document.width, height: active.document.height }) }) }
      case 'deselect': return { disabled: selectionUnavailable, run: () => runForDocument((state) => { const active = state.sessions.find((item) => item.document.id === documentId); if (!active?.selection) return; const label = t('app.selection.cancelHistory'); if (active.pendingPaste) state.commitFloatingPaste(label); else state.commitSelectionChange({ ...active.selection, mask: active.selection.mask?.slice() }, null, label, { resetTimelineSelection: active.selectionGuidesPreservedAtContentRevision === active.contentRevision }) }) }
      case 'pixelGrid': return { pressed: Boolean(session.view.showPixelGrid), run: () => runForDocument((state) => state.togglePixelGrid()) }
      case 'selectionOutline': return { disabled: selectionUnavailable, pressed: !selectionUnavailable && session.view.showSelectionOutline !== false, run: () => runForDocument((state) => state.toggleSelectionOutline()) }
      case 'relativeLuminance': return { pressed: session.view.relativeLuminance, run: () => runForDocument((state) => { const active = state.sessions.find((item) => item.document.id === documentId); if (active) state.setView({ relativeLuminance: !active.view.relativeLuminance }) }) }
      case 'resetView': return { run: () => runForDocument((state) => state.setView({ zoom: 16, panX: 0, panY: 0, rotation: 0, mirrored: false, mirroredVertical: false })) }
      case 'fillForeground': return { run: () => runForDocument((state) => state.fillForeground()) }
      case 'deleteSelection': return { disabled: selectionUnavailable, run: () => runForDocument((state) => state.deleteSelection()) }
      case 'swapForegroundBackground': return { run: () => runForDocument((state) => state.swapPrimarySecondaryColors()) }
      case 'createBrushFromSelection': return { disabled: selectionUnavailable, run: () => runForDocument((state) => state.createBrushFromSelection()) }
      case 'rotateViewClockwise90': return { run: () => runForDocument((state) => { const active = state.sessions.find((item) => item.document.id === documentId); if (active) state.setView({ rotation: (active.view.rotation + 90) % 360 }) }) }
      case 'rotateViewCounterClockwise90': return { run: () => runForDocument((state) => { const active = state.sessions.find((item) => item.document.id === documentId); if (active) state.setView({ rotation: (active.view.rotation + 270) % 360 }) }) }
      case 'detectImageScale': return { run: () => runForDocument((state) => { const active = state.sessions.find((item) => item.document.id === documentId); if (!active) return; const scale = detectDocumentPixelScale(active.document); if (!scale || scale <= 1) { state.setMessage(t('imageResize.scaleNotDetected')); return }; void state.resizeActiveImage(Math.max(1, Math.round(active.document.width / scale)), Math.max(1, Math.round(active.document.height / scale)), 'nearest') }) }
      case 'centerSelectionBoth': return { run: () => runForDocument((state) => state.centerActiveContent('both')) }
      case 'centerSelectionHorizontal': return { run: () => runForDocument((state) => state.centerActiveContent('horizontal')) }
      case 'centerSelectionVertical': return { run: () => runForDocument((state) => state.centerActiveContent('vertical')) }
    }
  }
  const commands: QuickCommandDefinition[] = bar.commands.filter((item) => item.enabled).map((item) => ({ ...QUICK_COMMAND_METADATA[item.id], ...runtimeFor(item.id) }))
  const style = {
    '--quick-command-position': `${Math.round(position * 100000) / 1000}%`,
    '--quick-command-actions-size': `${Math.max(1, commands.length + 2) * 28 + 5}px`
  } as CSSProperties
  return <div ref={barRef} className={`quick-command-bar quick-command-bar-${edge} ${translucent ? 'translucent' : ''} ${visuallyExpanded ? 'expanded' : ''} ${moving ? 'moving' : ''}`.trim()} style={style} role="toolbar" aria-label={`${t('quickCommands.aria')}: ${bar.name}`} data-document-id={documentId} data-quick-command-bar-id={bar.id} data-command-scope="canvas" data-preserve-animation-selection>
    <Tooltip className="quick-command-tooltip quick-command-toggle-tooltip" content={<><strong>{t(visuallyExpanded ? 'quickCommands.collapse' : 'quickCommands.expand')}</strong><span>{t('quickCommands.toggleDescription')}</span></>}>
      <button type="button" className="quick-command-toggle" aria-label={t(visuallyExpanded ? 'quickCommands.collapse' : 'quickCommands.expand')} aria-expanded={visuallyExpanded} onPointerDown={preserveCanvasFocus} onClick={toggleExpanded}><PixelUtilityIcon kind={visuallyExpanded ? 'up' : 'down'} /></button>
    </Tooltip>
    <div className="quick-command-actions-clip" aria-hidden={!visuallyExpanded}><div className="quick-command-actions">
      {commands.map((command) => {
        const shortcut = command.shortcutId ? shortcutFor(command.shortcutId) : ''
        return <Tooltip key={command.id} className="quick-command-tooltip" content={<><strong>{t(command.label)}</strong><span>{t(command.description)}</span>{shortcut && <small>{shortcut}</small>}</>}>
          <button type="button" className={`quick-command-button ${command.pressed ? 'selected' : ''}`} aria-label={t(command.label)} aria-pressed={command.pressed} disabled={!visuallyExpanded || command.disabled} tabIndex={visuallyExpanded ? 0 : -1} onPointerDown={preserveCanvasFocus} onClick={command.run} onContextMenu={command.settingsTarget && onOpenCommandSettings ? (event) => openCommandSettings(event, command.settingsTarget!) : undefined}><PixelUtilityIcon kind={command.icon} /></button>
        </Tooltip>
      })}
      <Tooltip className="quick-command-tooltip quick-command-settings-tooltip" content={<><strong>{t('quickCommands.settings')}</strong><span>{t('quickCommands.settingsDescription')}</span></>}>
        <button type="button" className="quick-command-button quick-command-settings" aria-label={t('quickCommands.settings')} disabled={!visuallyExpanded} tabIndex={visuallyExpanded ? 0 : -1} onPointerDown={preserveCanvasFocus} onClick={onOpenPreferences}><PixelUtilityIcon kind="properties" /></button>
      </Tooltip>
      <Tooltip className="quick-command-tooltip quick-command-move-tooltip" content={<><strong>{t('quickCommands.move')}</strong><span>{t('quickCommands.moveDescription')}</span></>}>
        <button type="button" className="quick-command-button quick-command-move" aria-label={t('quickCommands.move')} disabled={!visuallyExpanded} tabIndex={visuallyExpanded ? 0 : -1} onPointerDown={startMoving} onPointerMove={moveBar} onPointerUp={stopMoving} onPointerCancel={stopMoving} onLostPointerCapture={finishMoving}><PixelUtilityIcon kind="move" /></button>
      </Tooltip>
    </div></div>
  </div>
})

export const QuickCommandBar = memo(function QuickCommandBar(props: QuickCommandBarProps) {
  const [preferences, setPreferences] = useState(loadEditorPreferences)
  useEffect(() => {
    const syncPreferences = (): void => setPreferences(loadEditorPreferences())
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])
  if (!preferences.quickCommandBarEnabled) return null
  const onBarChange = (next: QuickCommandBarPreference): void => {
    const latest = loadEditorPreferences()
    const bars = latest.quickCommandBars.map((bar) => bar.id === next.id ? { ...next, commands: next.commands.map((item) => ({ ...item })) } : bar)
    saveEditorPreferences({ ...latest, quickCommandBars: bars })
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }
  return <>{preferences.quickCommandBars.map((bar) => <QuickCommandBarInstance key={bar.id} {...props} bar={bar} translucent={preferences.quickCommandBarTranslucent} onBarChange={onBarChange} />)}</>
})
