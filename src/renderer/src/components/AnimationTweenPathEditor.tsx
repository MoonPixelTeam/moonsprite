import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { AnimationCelSurface } from '@shared/types-animation'
import type { PaletteEntry } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'
import { cropTweenSource, type TweenPathPoint } from '@/core/animation-tween'
import { anchoredPreviewPan, pixelAlignedPreviewFitScale } from '@/core/preview-geometry'
import { loadEditorPreferences } from '@/core/file-preferences'
import { drawTweenCheckerboard, drawTweenPixelPath, tweenPreviewCanvas } from './animation-tween-preview'
import { registerExclusiveShortcutScope } from './exclusive-shortcut-scope'
import { ModalShell } from './ModalShell'
import { DialogHeader } from './DialogHeader'
import { Button } from './Button'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { useI18n } from './I18nProvider'
import './animation-tween-path-editor.css'
import selectionPivotIcon from '@/assets/pixel-icons/selection-pivot.svg'
import { extendTweenPath } from './animation-tween-path'
import { PixelAnchorPresetIcon } from './PixelAnchorPresetIcon'
import { AnimationTweenPathPresets } from './AnimationTweenPathPresets'

type Path = readonly TweenPathPoint[]
interface PathDraft { path: Path; anchor: TweenPathPoint }
interface Props {
  initialPath: Path
  initialAnchor?: TweenPathPoint
  source?: AnimationCelSurface
  palette: readonly PaletteEntry[]
  pivot: SelectionRect
  documentSize: { width: number; height: number }
  onApply(path: Path, anchor: TweenPathPoint): void
  onCancel(): void
}
const emptyPath: Path = [{ x: 0, y: 0 }]
const hasPath = (path: Path) => path.some(point => point.x !== 0 || point.y !== 0)

/** A private draft: strokes and clear are undoable; only Apply updates tween options. */
export function AnimationTweenPathEditor({ initialPath, initialAnchor, source, palette, pivot, documentSize, onApply, onCancel }: Props) {
  const { t } = useI18n()
  const [history, setHistory] = useState<{ past: PathDraft[]; present: PathDraft; future: PathDraft[] }>(() => ({ past: [], present: {
    path: hasPath(initialPath) ? initialPath.map(point => ({ x: Math.round(point.x), y: Math.round(point.y) })) : emptyPath,
    anchor: initialAnchor ?? { x: Math.floor(pivot.x + pivot.width / 2), y: Math.floor(pivot.y + pivot.height / 2) }
  }, future: [] }))
  const [draft, setDraft] = useState<PathDraft | null>(null)
  const [mode, setMode] = useState<'draw' | 'pan' | 'anchor'>('draw')
  const overlayRef = useRef<HTMLDivElement>(null)
  const spaceHeld = useRef(false)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const refreshPointer = useRef<(shift: boolean, constrain: boolean) => void>(() => {})
  const [linePreview, setLinePreview] = useState<Path | null>(null)
  const [size, setSize] = useState({ width: 900, height: 520 })
  const [view, setView] = useState<{ zoom: number; pan: TweenPathPoint } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<{ id: number; mode: 'draw' | 'pan' | 'anchor'; initial: PathDraft; start: TweenPathPoint; pan: TweenPathPoint; zoom: number; points: PathDraft; lineBase?: PathDraft } | null>(null)
  const [checkerboard] = useState(() => loadEditorPreferences().checkerboard)
  const current = draft ?? history.present
  const path = linePreview ?? current.path
  const center = current.anchor
  const fit = (route: PathDraft) => {
    const left = Math.min(pivot.x, ...route.path.map(point => Math.min(pivot.x + point.x, route.anchor.x + point.x)))
    const top = Math.min(pivot.y, ...route.path.map(point => Math.min(pivot.y + point.y, route.anchor.y + point.y)))
    const right = Math.max(pivot.x + pivot.width, ...route.path.map(point => Math.max(pivot.x + pivot.width + point.x, route.anchor.x + point.x + 1)))
    const bottom = Math.max(pivot.y + pivot.height, ...route.path.map(point => Math.max(pivot.y + pivot.height + point.y, route.anchor.y + point.y + 1)))
    const zoom = pixelAlignedPreviewFitScale(Math.min((size.width - 100) / Math.max(1, right - left), (size.height - 100) / Math.max(1, bottom - top)))
    return { zoom, pan: { x: (documentSize.width / 2 - (left + right) / 2) * zoom, y: (documentSize.height / 2 - (top + bottom) / 2) * zoom } }
  }
  // Fit only the initial path automatically; drawing and undo never move the view.
  const currentView = view ?? fit(history.present)
  useEffect(() => setLinePreview(null), [history.present, mode, view])
  const origin = { x: (size.width - documentSize.width * currentView.zoom) / 2 + currentView.pan.x,
    y: (size.height - documentSize.height * currentView.zoom) / 2 + currentView.pan.y }
  const artwork = useMemo(() => {
    try {
      if (!source) return { value: null, error: '' }
      const cropped = cropTweenSource(source, palette)
      return { value: { canvas: tweenPreviewCanvas(cropped, palette), x: cropped.offsetX, y: cropped.offsetY }, error: '' }
    } catch (error) { return { value: null, error: error instanceof Error ? error.message : String(error) } }
  }, [source, palette])
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    canvas.focus({ preventScroll: true })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr)
    context.scale(dpr, dpr)
    drawTweenCheckerboard(context, size.width, size.height, checkerboard, currentView.zoom, origin.x, origin.y)
    context.imageSmoothingEnabled = false
    if (artwork.value) {
      const { canvas: image, x, y } = artwork.value
      context.drawImage(image, origin.x + x * currentView.zoom, origin.y + y * currentView.zoom, image.width * currentView.zoom, image.height * currentView.zoom)
    }
    // Continuous checks on both sides; only the outline marks the document edge.
    context.strokeStyle = '#000000'; context.lineWidth = 3
    context.strokeRect(origin.x, origin.y, documentSize.width * currentView.zoom, documentSize.height * currentView.zoom)
    context.strokeStyle = '#FFFFFF'; context.lineWidth = 1
    context.strokeRect(origin.x, origin.y, documentSize.width * currentView.zoom, documentSize.height * currentView.zoom)
    drawTweenPixelPath(context, path.map(point => ({ x: center.x + point.x, y: center.y + point.y })),
      size.width, size.height, { zoom: currentView.zoom, originX: origin.x, originY: origin.y, dpr, showAnchor: false })
  }, [path, size, currentView.zoom, origin.x, origin.y, artwork, checkerboard, documentSize.width, documentSize.height, center.x, center.y])
  const commit = (next: PathDraft) => setHistory(current => ({ past: [...current.past.slice(-49), current.present], present: next, future: [] }))
  const undo = () => setHistory(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] } : current)
  const redo = () => setHistory(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current)
  const release = () => {
    const active = gesture.current
    gesture.current = null
    setDraft(null)
    setLinePreview(null)
    if (active && canvasRef.current?.hasPointerCapture(active.id)) canvasRef.current.releasePointerCapture(active.id)
  }
  const cancelGesture = () => {
    const active = gesture.current
    if (active?.mode === 'pan') setView({ zoom: active.zoom, pan: active.pan })
    release()
  }
  useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const unregister = registerExclusiveShortcutScope({
      keyDown: (event) => {
        const command = event.ctrlKey || event.metaKey
        const key = event.key.toLowerCase()
        if (key === 'shift' || key === 'control' || key === 'meta') refreshPointer.current(event.shiftKey, event.ctrlKey || event.metaKey)
        if (key === 'tab') {
          event.preventDefault()
          const items = Array.from(overlayRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
          if (items.length) { const index = items.indexOf(document.activeElement as HTMLElement); items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus() }
          return
        }
        // Allow native typing, text undo and select navigation while keeping app shortcuts isolated.
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
          if (key === 'escape') { event.preventDefault(); canvasRef.current?.focus({ preventScroll: true }) }
          else if (command && ['s', 'o', 'p'].includes(key)) event.preventDefault()
          return
        }
        // Keep native button activation, but all shortcuts stay in this editor.
        if ((key === 'enter' || key === ' ') && event.target instanceof HTMLButtonElement && !command) return
        event.preventDefault()
        if (key === 'escape') { if (gesture.current) cancelGesture(); else onCancel() }
        else if (command && ['z', 'y'].includes(key)) {
          if (gesture.current) { cancelGesture(); return }
          if (key === 'y' || event.shiftKey) redo(); else undo()
        } else if (!command && !event.altKey) {
          if (key === ' ') spaceHeld.current = true
          else if (key === 'b') setMode('draw')
          else if (key === 'h') setMode('pan')
          else if (key === 'a') setMode('anchor')
        }
      },
      keyUp: event => { if (event.key === ' ') spaceHeld.current = false; refreshPointer.current(event.shiftKey, event.ctrlKey || event.metaKey) }
    })
    const blur = () => { spaceHeld.current = false; cancelGesture() }
    const focus = (event: FocusEvent) => { if (!overlayRef.current?.contains(event.target as Node)) canvasRef.current?.focus({ preventScroll: true }) }
    window.addEventListener('blur', blur)
    document.addEventListener('focusin', focus)
    return () => {
      unregister(); window.removeEventListener('blur', blur); document.removeEventListener('focusin', focus)
      previousFocus?.focus({ preventScroll: true })
    }
  }, [onCancel])
  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
  }
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pathGesture = gesture.current
    const local = localPoint(event)
    pointerRef.current = local
    if (!pathGesture) { refreshPointer.current(event.shiftKey, event.ctrlKey || event.metaKey); return }
    if (event.pointerId !== pathGesture.id) return
    if (pathGesture.mode === 'pan') {
      setView({ zoom: pathGesture.zoom, pan: { x: pathGesture.pan.x + local.x - pathGesture.start.x, y: pathGesture.pan.y + local.y - pathGesture.start.y } })
      return
    }
    const clamp = (value: number) => Math.max(-16384, Math.min(16384, Math.floor(value)))
    const documentPoint = { x: clamp((local.x - origin.x) / pathGesture.zoom), y: clamp((local.y - origin.y) / pathGesture.zoom) }
    if (pathGesture.mode === 'anchor') {
      const dx = documentPoint.x - Math.floor((pathGesture.start.x - origin.x) / pathGesture.zoom)
      const dy = documentPoint.y - Math.floor((pathGesture.start.y - origin.y) / pathGesture.zoom)
      const anchor = { x: clamp(pathGesture.initial.anchor.x + dx), y: clamp(pathGesture.initial.anchor.y + dy) }
      const shiftX = pathGesture.initial.anchor.x - anchor.x, shiftY = pathGesture.initial.anchor.y - anchor.y
      if (!shiftX && !shiftY) { pathGesture.points = pathGesture.initial; setDraft(pathGesture.initial); return }
      const path = pathGesture.initial.path.map((point, index) => index === 0 ? { x: 0, y: 0 } : { x: point.x + shiftX, y: point.y + shiftY })
      if (path.some(point => Math.abs(point.x) > 16384 || Math.abs(point.y) > 16384)) return
      pathGesture.points = { anchor, path }
    } else {
      const point = { x: clamp(documentPoint.x - pathGesture.points.anchor.x), y: clamp(documentPoint.y - pathGesture.points.anchor.y) }
      if (event.shiftKey && !pathGesture.lineBase) pathGesture.lineBase = pathGesture.points
      const base = pathGesture.lineBase ?? pathGesture.points
      const nextPath = extendTweenPath(base.path, point, event.shiftKey && (event.ctrlKey || event.metaKey))
      pathGesture.points = nextPath === base.path ? base : { ...base, path: nextPath }
      if (!event.shiftKey) pathGesture.lineBase = undefined
    }
    setDraft(pathGesture.points)
  }
  refreshPointer.current = (shift, constrain) => {
    if (!shift || mode !== 'draw' || gesture.current || !pointerRef.current) { setLinePreview(null); return }
    const local = pointerRef.current, anchor = history.present.anchor
    const clamp = (value: number) => Math.max(-16384, Math.min(16384, Math.floor(value)))
    setLinePreview(extendTweenPath(history.present.path, { x: clamp((local.x - origin.x) / currentView.zoom - anchor.x), y: clamp((local.y - origin.y) / currentView.zoom - anchor.y) }, constrain))
  }
  const zoomAt = (factor: number, pointer = { x: size.width / 2, y: size.height / 2 }) => {
    if (gesture.current) return
    const nextZoom = Math.max(0.01, Math.min(256, currentView.zoom * factor))
    setView({ zoom: nextZoom, pan: anchoredPreviewPan({ documentSize, viewportSize: size, pointer, pan: currentView.pan, zoom: currentView.zoom, nextZoom }) })
  }
  useEffect(() => {
    const canvas = canvasRef.current
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation()
      if (!canvas || !event.deltaY) return
      const rect = canvas.getBoundingClientRect()
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    canvas?.addEventListener('wheel', wheel, { passive: false })
    return () => canvas?.removeEventListener('wheel', wheel)
  }, [currentView.zoom, currentView.pan.x, currentView.pan.y, size.width, size.height])
  const iconButton = (label: string, icon: 'undo' | 'redo' | 'minus' | 'plus' | 'paletteCenter', action: () => void, disabled = false) =>
    <Button className="icon-button" aria-label={label} title={label} disabled={disabled} onClick={action}><PixelUtilityIcon kind={icon} /></Button>
  return createPortal(<div ref={overlayRef} className="modal-backdrop dialog-backdrop tween-path-backdrop" role="presentation">
    <ModalShell data-preserve-animation-selection role="dialog" aria-modal="true" aria-label={t('timeline.tween.pathEdit')} storageKey="animation-tween-path" className="layer-modal animation-tween-path-editor" defaultWidth={1100} defaultHeight={800} minWidth={520} minHeight={420} maxWidth={1800} maxHeight={1200} fitContent={false}>
      <DialogHeader title={t('timeline.tween.pathEdit')} closeLabel={t('common.close')} onClose={onCancel} />
      <div className="tween-path-toolbar">
        <Button aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>{t('timeline.tween.pathDraw')}</Button>
        <Button aria-pressed={mode === 'pan'} onClick={() => setMode('pan')}>{t('timeline.tween.pathPan')}</Button>
        <Button aria-pressed={mode === 'anchor'} onClick={() => setMode('anchor')}><PixelAnchorPresetIcon anchor="center" />{t('timeline.tween.pathAnchor')}</Button>
        {iconButton(t('common.undo'), 'undo', undo, !history.past.length || draft !== null)}
        {iconButton(t('common.redo'), 'redo', redo, !history.future.length || draft !== null)}
        <Button disabled={!hasPath(history.present.path) || draft !== null} onClick={() => commit({ ...history.present, path: emptyPath })}>{t('timeline.tween.pathClear')}</Button>
        <span className="modal-footer-spacer" />
        {iconButton(t('preview.zoomOut'), 'minus', () => zoomAt(1 / 1.25))}
        <output>{Math.round(currentView.zoom * 100)}%</output>
        {iconButton(t('preview.zoomIn'), 'plus', () => zoomAt(1.25))}
        {iconButton(t('timeline.tween.pathFit'), 'paletteCenter', () => setView(fit(history.present)))}
      </div>
      <AnimationTweenPathPresets path={history.present.path} busy={draft !== null || gesture.current !== null} onLoad={(path) => {
        const next = { path, anchor: { ...history.present.anchor } }
        commit(next); setLinePreview(null); setView(fit(next))
      }} />
      <p className="modal-note tween-path-hint">{t('timeline.tween.pathEditorHint')}</p>
      <div className="tween-path-surface"><canvas ref={canvasRef} tabIndex={0} aria-label={t('timeline.tween.pathDrawn')} style={{ cursor: mode === 'pan' ? 'grab' : mode === 'anchor' ? 'move' : 'crosshair' }}
        onContextMenu={event => event.preventDefault()}

        onPointerDown={event => {
          if (gesture.current || (event.button !== 0 && event.button !== 1)) return
          event.preventDefault(); event.currentTarget.focus({ preventScroll: true })
          setLinePreview(null)
          setView(currentView)
          const activeMode = event.button === 1 || spaceHeld.current ? 'pan' : mode
          gesture.current = { id: event.pointerId, mode: activeMode, initial: history.present, start: localPoint(event), pan: currentView.pan, zoom: currentView.zoom, points: history.present, lineBase: event.shiftKey ? history.present : undefined }
          event.currentTarget.setPointerCapture(event.pointerId)
          if (activeMode === 'draw') move(event)
        }}
        onPointerMove={move}
        onPointerLeave={() => { pointerRef.current = null; setLinePreview(null) }}
        onPointerUp={event => {
          const active = gesture.current
          if (!active || active.id !== event.pointerId) return
          move(event)
          if (active.mode !== 'pan' && active.points !== history.present) commit(active.points)
          release()
        }}
        onPointerCancel={cancelGesture} onLostPointerCapture={cancelGesture} />
        <img className="tween-path-anchor" src={selectionPivotIcon} alt="" aria-hidden="true" style={{ left: origin.x + (center.x + 0.5) * currentView.zoom, top: origin.y + (center.y + 0.5) * currentView.zoom }} />
      </div>
      {artwork.error && <p className="modal-note" role="alert">{artwork.error}</p>}
      <footer><span className="modal-footer-spacer" /><Button onClick={onCancel}>{t('common.cancel')}</Button><Button variant="primary" disabled={!hasPath(history.present.path) || draft !== null} onClick={() => onApply(history.present.path, history.present.anchor)}>{t('common.apply')}</Button></footer>
    </ModalShell>
  </div>, document.body)
}
