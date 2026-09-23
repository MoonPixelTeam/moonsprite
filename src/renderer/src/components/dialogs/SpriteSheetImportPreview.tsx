import { useEffect, useRef, useState } from 'react'
import type { SpriteDocument } from '@shared/types-document'
import { checkResourceLimit } from '@/core/resource-policy'
import { compositeRegionAsync } from '@/core/document-composite'
import { pixelAlignedPreviewFitScale, anchoredPreviewPan } from '@/core/preview-geometry'
import { spriteSheetImportPlan, type SpriteSheetImportOptions } from '@/core/sprite-sheet-import'
import { loadEditorPreferences } from '@/core/file-preferences'
import { drawTweenCheckerboard } from '../animation-tween-preview'
import { useI18n } from '../I18nProvider'
import { Button } from '../Button'

interface Props { source: SpriteDocument; revision: number; options: SpriteSheetImportOptions; disabled: boolean; onChange(options: SpriteSheetImportOptions): void }
export function SpriteSheetImportPreview({ source, revision, options, disabled, onChange }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 720, height: 480 })
  const [view, setView] = useState<{ zoom: number; pan: { x: number; y: number } } | null>(null)
  const [image, setImage] = useState<HTMLCanvasElement | null>(null)
  const [error, setError] = useState('')
  const [checker] = useState(() => loadEditorPreferences().checkerboard)
  const space = useRef(false)
  const drag = useRef<{ id: number; x: number; y: number; initial: SpriteSheetImportOptions; pan: { x: number; y: number }; mode: 'move' | 'draw' | 'left' | 'top' | 'right' | 'bottom' | 'paddingX' | 'paddingY' | 'pan' } | null>(null)
  const zoom = view?.zoom ?? pixelAlignedPreviewFitScale(Math.min((size.width - 48) / source.width, (size.height - 48) / source.height))
  const pan = view?.pan ?? { x: 0, y: 0 }
  const origin = { x: (size.width - source.width * zoom) / 2 + pan.x, y: (size.height - source.height * zoom) / 2 + pan.y }
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const resize = () => { const rect = canvas.getBoundingClientRect(); if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height }) }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let disposed = false
    setImage(null); setError('')
    void window.moonSprite.getResourceInfo().then(resource => {
      const check = checkResourceLimit(source.width, source.height, 3, 'rgba', resource)
      if (!check.allowed) throw new Error(check.reason)
      if (disposed) return null
      return compositeRegionAsync(source, 0, 0, source.width, source.height, undefined, () => disposed, 128)
    }).then(pixels => {
      if (disposed || !pixels) return
      const bitmap = document.createElement('canvas'); bitmap.width = source.width; bitmap.height = source.height
      const context = bitmap.getContext('2d')
      if (context) { const data = context.createImageData(source.width, source.height); data.data.set(pixels); context.putImageData(data, 0, 0) }
      setImage(bitmap)
    }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { disposed = true }
  }, [source, revision])
  useEffect(() => {
    const canvas = ref.current, context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr); context.scale(dpr, dpr)
    drawTweenCheckerboard(context, size.width, size.height, checker, zoom, origin.x, origin.y)
    context.imageSmoothingEnabled = false
    if (image) context.drawImage(image, origin.x, origin.y, source.width * zoom, source.height * zoom)
    context.strokeStyle = '#FFFFFF'; context.lineWidth = 1
    context.strokeRect(origin.x, origin.y, source.width * zoom, source.height * zoom)
    let tiles: ReturnType<typeof spriteSheetImportPlan>['tiles'] = []
    try { tiles = spriteSheetImportPlan(source, options).tiles } catch { /* The owning dialog displays validation errors. */ }
    for (const [index, tile] of tiles.entries()) {
      const x = origin.x + tile.x * zoom, y = origin.y + tile.y * zoom, w = tile.width * zoom, h = tile.height * zoom
      if (x + w < 0 || y + h < 0 || x > size.width || y > size.height) continue
      context.strokeStyle = index === 0 ? '#2979FF' : '#000000'; context.lineWidth = index === 0 ? 3 : 2; context.strokeRect(x, y, w, h)
      if (index !== 0) { context.strokeStyle = '#FFFFFF'; context.lineWidth = 1; context.strokeRect(x, y, w, h) }
      if (w > 28 && h > 22) { context.font = '12px monospace'; context.fillStyle = '#000000'; context.fillRect(x + 2, y + 2, String(index + 1).length * 8 + 6, 16); context.fillStyle = '#FFFFFF'; context.fillText(String(index + 1), x + 5, y + 14) }
    }
    const x = origin.x + options.x * zoom, y = origin.y + options.y * zoom
    context.strokeStyle = '#2979FF'; context.lineWidth = 2
    context.strokeRect(x, y, options.width * zoom, options.height * zoom)
    context.fillStyle = '#2979FF'
    for (const [dx, dy] of [[0, options.height / 2], [options.width, options.height / 2], [options.width / 2, 0], [options.width / 2, options.height]]) context.fillRect(x + dx * zoom - 3, y + dy * zoom - 3, 6, 6)
  }, [image, source, size, zoom, origin.x, origin.y, options, checker])
  useEffect(() => {
    const canvas = ref.current
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); if (!canvas || drag.current || !event.deltaY) return
      const rect = canvas.getBoundingClientRect(), pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const nextZoom = Math.max(0.01, Math.min(256, zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)))
      setView({ zoom: nextZoom, pan: anchoredPreviewPan({ documentSize: source, viewportSize: size, pointer, pan, zoom, nextZoom }) })
    }
    canvas?.addEventListener('wheel', wheel, { passive: false })
    return () => canvas?.removeEventListener('wheel', wheel)
  }, [zoom, pan.x, pan.y, size, source])
  const finish = (cancel: boolean) => {
    const active = drag.current; drag.current = null
    if (cancel && active) { if (active.mode === 'pan') setView({ zoom, pan: active.pan }); else onChange(active.initial) }
    if (active && ref.current?.hasPointerCapture(active.id)) ref.current.releasePointerCapture(active.id)
  }
  return <div className="sprite-sheet-import-preview">
    <canvas ref={ref} tabIndex={0} aria-label={t('spriteSheetImport.preview')} onContextMenu={event => event.preventDefault()}
      onKeyDown={event => { if (event.key === ' ') { event.preventDefault(); space.current = true } if (event.key === 'Escape' && drag.current) { event.stopPropagation(); finish(true) } }} onKeyUp={event => { if (event.key === ' ') space.current = false }} onBlur={() => { space.current = false; finish(true) }}
      onPointerDown={event => {
        if (disabled || drag.current || ![0, 1].includes(event.button)) return
        event.preventDefault(); event.currentTarget.focus(); setView({ zoom, pan })
        const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left - origin.x) / zoom, y = (event.clientY - rect.top - origin.y) / zoom
        const near = (a: number, b: number) => Math.abs(a - b) * zoom <= 7
        const insideX = x >= options.x && x <= options.x + options.width, insideY = y >= options.y && y <= options.y + options.height
        const mode = event.button === 1 || space.current ? 'pan'
          : insideY && near(x, options.x) ? 'left' : insideY && near(x, options.x + options.width) ? 'right'
          : insideX && near(y, options.y) ? 'top' : insideX && near(y, options.y + options.height) ? 'bottom'
          : insideY && options.paddingX > 0 && near(x, options.x + options.width + options.paddingX) ? 'paddingX'
          : insideX && options.paddingY > 0 && near(y, options.y + options.height + options.paddingY) ? 'paddingY'
          : insideX && insideY ? 'move' : 'draw'
        drag.current = { id: event.pointerId, x: Math.floor(x), y: Math.floor(y), initial: options, pan, mode }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const active = drag.current; if (!active || event.pointerId !== active.id) return
        const rect = event.currentTarget.getBoundingClientRect(), x = Math.floor((event.clientX - rect.left - origin.x) / zoom), y = Math.floor((event.clientY - rect.top - origin.y) / zoom)
        const dx = x - active.x, dy = y - active.y, original = active.initial
        if (active.mode === 'pan') { setView({ zoom, pan: { x: pan.x + dx * zoom, y: pan.y + dy * zoom } }); return }
        const next = { ...original }
        if (active.mode === 'draw') { next.x = Math.min(x, active.x); next.y = Math.min(y, active.y); next.width = Math.abs(dx) + 1; next.height = Math.abs(dy) + 1 }
        if (active.mode === 'move') { next.x += dx; next.y += dy }
        if (active.mode === 'right') next.width = Math.max(1, original.width + dx)
        if (active.mode === 'bottom') next.height = Math.max(1, original.height + dy)
        if (active.mode === 'left') { next.x = Math.min(original.x + dx, original.x + original.width - 1); next.width = original.x + original.width - next.x }
        if (active.mode === 'top') { next.y = Math.min(original.y + dy, original.y + original.height - 1); next.height = original.y + original.height - next.y }
        if (active.mode === 'paddingX') next.paddingX = Math.max(0, original.paddingX + dx)
        if (active.mode === 'paddingY') next.paddingY = Math.max(0, original.paddingY + dy)
        onChange(next)
      }} onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} />
    <div className="sprite-sheet-import-zoom"><output>{Math.round(zoom * 100)}%</output><Button onClick={() => setView(null)}>{t('spriteSheetImport.fit')}</Button></div>
    {error && <p role="alert" className="sprite-sheet-import-error">{error}</p>}
  </div>
}
