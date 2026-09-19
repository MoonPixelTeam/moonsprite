import { useEffect, useRef, useState } from 'react'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { anchoredPreviewPan, pixelAlignedPreviewFitScale } from '@/core/preview-geometry'
import { normalizeCanvasWheelDelta, steppedCanvasZoom, viewDragClientDelta } from '@/core/canvas-input'
import { loadEditorPreferences } from '@/core/file-preferences'
import { pixelSamplingMode } from '@/core/pixel-display'
import { useWorkspace } from '@/store/workspace'
import { addClipboardReference, REFERENCE_PASTE_EVENT, useReferenceImages } from './reference-image-state'
import { referenceImageDisplayCanvas } from './reference-image-display'
import './reference-image-panel.css'

export function ReferenceImagePanel({ onClose, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: { onClose: () => void } & DockDragProps) {
  const { t } = useI18n()
  const floating = useFloatingPanel(docked ? null : { x: Math.max(12, window.innerWidth - 576), y: 80, width: 280, height: 280 }, false, true, 'moonsprite.reference-panel.v1', true, onFloatingDock, docked)
  const { images, activeId, remove, step, setView, relativeLuminance } = useReferenceImages()
  const current = images.find((image) => image.id === activeId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fitRef = useRef<number | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; pan: { x: number; y: number } } | null>(null)
  const [panning, setPanning] = useState(false)
  const [pasting, setPasting] = useState(false)
  const busyRef = useRef(false)
  const [preferences, setPreferences] = useState(loadEditorPreferences)

  const paste = async (): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setPasting(true)
    try {
      const image = await window.moonSprite.readClipboardImage()
      if (image) addClipboardReference(image)
      else useWorkspace.getState().setMessage(t('workspace.clipboard.emptyPixels'))
    } catch (error) {
      useWorkspace.getState().setMessage(`${t('reference.pasteFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      busyRef.current = false
      setPasting(false)
    }
  }
  const pasteRef = useRef(paste)
  pasteRef.current = paste
  useEffect(() => {
    const panel = floating.ref.current
    const handlePaste = (): void => { void pasteRef.current() }
    panel?.addEventListener(REFERENCE_PASTE_EVENT, handlePaste)
    const updatePreferences = (): void => setPreferences(loadEditorPreferences())
    const releaseFocus = (event: PointerEvent): void => {
      if (event.target instanceof Node && !panel?.contains(event.target) && document.activeElement instanceof HTMLElement && panel?.contains(document.activeElement)) document.activeElement.blur()
    }
    window.addEventListener('moonsprite:preferences-changed', updatePreferences)
    window.addEventListener('pointerdown', releaseFocus, true)
    return () => {
      panel?.removeEventListener(REFERENCE_PASTE_EVENT, handlePaste)
      window.removeEventListener('moonsprite:preferences-changed', updatePreferences)
      window.removeEventListener('pointerdown', releaseFocus, true)
    }
  }, [floating.ref])

  useEffect(() => { fitRef.current = null; drag.current = null; setPanning(false) }, [activeId, docked])
  useEffect(() => {
    const canvas = canvasRef.current
    const frame = canvas?.parentElement
    if (!canvas || !frame || !current) return
    const draw = (): void => {
      const width = frame.clientWidth, height = frame.clientHeight
      if (width < 1 || height < 1) return
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const context = canvas.getContext('2d')
      if (!context) return
      const source = referenceImageDisplayCanvas(current.canvas, relativeLuminance)
      fitRef.current ??= pixelAlignedPreviewFitScale(Math.min(width / source.width, height / source.height), dpr)
      const scale = current.zoom ?? fitRef.current
      context.scale(dpr, dpr)
      const x = Math.round(((width - source.width * scale) / 2 + current.pan.x) * dpr) / dpr
      const y = Math.round(((height - source.height * scale) / 2 + current.pan.y) * dpr) / dpr
      context.translate(x, y)
      context.beginPath()
      context.rect(0, 0, source.width * scale, source.height * scale)
      context.clip()
      const { lightColor, darkColor, size } = preferences.checkerboard
      const tile = document.createElement('canvas')
      tile.width = tile.height = size * 2
      const tileContext = tile.getContext('2d')
      if (tileContext) {
        tileContext.fillStyle = `rgb(${lightColor.r} ${lightColor.g} ${lightColor.b})`
        tileContext.fillRect(0, 0, size * 2, size * 2)
        tileContext.fillStyle = `rgb(${darkColor.r} ${darkColor.g} ${darkColor.b})`
        tileContext.fillRect(0, 0, size, size)
        tileContext.fillRect(size, size, size, size)
        const pattern = context.createPattern(tile, 'repeat')
        if (pattern) {
          pattern.setTransform(new DOMMatrix().scale(scale))
          context.fillStyle = pattern
          context.fillRect(0, 0, source.width * scale, source.height * scale)
        }
      }
      context.imageSmoothingEnabled = pixelSamplingMode(scale) === 'smooth'
      context.drawImage(source, 0, 0, source.width * scale, source.height * scale)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(frame)
    draw()
    return () => observer.disconnect()
  }, [current, preferences, docked, relativeLuminance])

  const adjustZoom = (zoomIn: boolean, pointer?: { x: number; y: number }): void => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!current || !bounds || bounds.width <= 0 || bounds.height <= 0) return
    const zoom = current.zoom ?? fitRef.current ?? pixelAlignedPreviewFitScale(Math.min(bounds.width / current.canvas.width, bounds.height / current.canvas.height), window.devicePixelRatio)
    const nextZoom = steppedCanvasZoom(zoom, zoomIn)
    setView(nextZoom, anchoredPreviewPan({ documentSize: current.canvas, viewportSize: bounds, pointer: pointer ?? { x: bounds.width / 2, y: bounds.height / 2 }, pan: current.pan, zoom, nextZoom }))
  }
  const finishPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <section ref={floating.ref} className={`panel preview-panel reference-image-panel ${floating.style ? 'floating-panel' : ''}`} style={floating.style} tabIndex={-1} onPointerDown={(event) => { floating.bringToFront(); if (!(event.target as HTMLElement).closest('button')) event.currentTarget.focus({ preventScroll: true }) }} onContextMenu={onPanelContextMenu} onPaste={(event) => { event.preventDefault(); event.stopPropagation(); void paste() }}>
    <header onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}>
      <span className="reference-image-title">{t('panel.reference')}</span><span className="panel-actions">
        <button title={t('common.paste')} aria-label={t('common.paste')} disabled={pasting} onClick={() => { void paste() }}><PixelUtilityIcon kind="paste" /></button>
        <button title={t('preview.zoomOut')} aria-label={t('preview.zoomOut')} disabled={!current} onClick={() => adjustZoom(false)}><PixelUtilityIcon kind="minus" /></button>
        <button title={t('preview.zoomIn')} aria-label={t('preview.zoomIn')} disabled={!current} onClick={() => adjustZoom(true)}><PixelUtilityIcon kind="plus" /></button>
        <button title={t('reference.fit')} aria-label={t('reference.fit')} disabled={!current} onClick={() => { fitRef.current = null; setView(null, { x: 0, y: 0 }) }}><PixelUtilityIcon kind="paletteCenter" /></button>
        <button title={t('common.delete')} aria-label={t('common.delete')} disabled={!current} onClick={remove}><PixelUtilityIcon kind="delete" /></button>
        <button title={t('reference.close')} aria-label={t('reference.close')} onClick={onClose}><PixelUtilityIcon kind="close" /></button>
      </span>
    </header>
    <div className={`preview-canvas-wrap ${panning ? 'space-panning' : ''}`} onWheel={(event) => {
      const bounds = canvasRef.current?.getBoundingClientRect()
      const delta = normalizeCanvasWheelDelta(event.nativeEvent)
      if (!bounds || !current || !delta) return
      event.preventDefault(); event.stopPropagation()
      adjustZoom(delta < 0, { x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    }} onPointerDown={(event) => {
      if (!current || (event.button !== 0 && event.button !== 1)) return
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: current.pan }
      setPanning(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    }} onPointerMove={(event) => {
      if (!current || !drag.current || drag.current.id !== event.pointerId) return
      const delta = viewDragClientDelta({ x: event.clientX, y: event.clientY }, drag.current, preferences.viewDragSensitivity)
      setView(current.zoom ?? fitRef.current, { x: drag.current.pan.x + delta.x, y: drag.current.pan.y + delta.y })
    }} onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={() => { drag.current = null; setPanning(false) }}>
      <div className="preview-canvas-frame">
        {current ? <canvas ref={canvasRef} aria-label={t('panel.reference')} /> : <button className="reference-image-empty" disabled={pasting} onClick={() => { void paste() }}>{t('reference.empty')}</button>}
        {images.length > 1 && <div className="panel-actions reference-image-navigation" onPointerDown={(event) => { floating.bringToFront(); event.stopPropagation() }}>
          <button title={t('reference.previous')} aria-label={t('reference.previous')} onClick={() => step(-1)}><PixelUtilityIcon kind="left" /></button>
          <span className="reference-image-count" aria-live="polite">{images.findIndex((image) => image.id === activeId) + 1} / {images.length}</span>
          <button title={t('reference.next')} aria-label={t('reference.next')} onClick={() => step(1)}><PixelUtilityIcon kind="right" /></button>
        </div>}
      </div>
    </div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
    <FloatingDockPreview style={floating.dockPreview} />
  </section>
}
