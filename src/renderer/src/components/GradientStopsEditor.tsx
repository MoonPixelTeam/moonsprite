import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GradientStop } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { TranslationKey } from '@/core/localization'
import { interpolateRgbaColor } from '@/core/gradient-color'
import gradientStopIcon from '@/assets/pixel-icons/gradient-stop.svg?raw'
import { ColorValueControl } from './ColorValueControl'
import { NumberInput } from './NumberInput'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { ModalShell } from './ModalShell'
import { DialogHeader } from './DialogHeader'
const gradientStopCssColor = (color: RgbaColor): string => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
const gradientStopIconContent = gradientStopIcon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const gradientStopIdentity = (stop: GradientStop): string => `${stop.position.toFixed(6)}:${stop.color.r},${stop.color.g},${stop.color.b},${stop.color.a}`

function GradientStopIcon({ color }: { color: RgbaColor }) {
  return <svg className="gradient-editor-stop-icon" width={11} height={16} viewBox="0 0 11 16" style={{ '--gradient-stop-color': gradientStopCssColor(color) } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: gradientStopIconContent }} aria-hidden="true" />
}

export function GradientStopsEditor({ open, stops, disabled, primaryColor, secondaryColor, onChange, onClose, t, titleKey = 'toolOptions.gradientFreeform' }: { titleKey?: TranslationKey; open: boolean; stops: GradientStop[]; disabled: boolean; primaryColor: RgbaColor; secondaryColor: RgbaColor; onChange: (stops: GradientStop[]) => void; onClose: () => void; t: (key: TranslationKey, params?: Record<string, string | number>) => string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ index: number; pointerId: number; stops: GradientStop[]; pendingDelete: boolean; startX: number; startY: number; originalPosition: number; moved: boolean } | null>(null)
  const suppressTrackClickRef = useRef(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)
  const [selectedStopKey, setSelectedStopKey] = useState(() => gradientStopIdentity(stops[0] ?? { position: 0, color: primaryColor }))
  const selectedIndex = Math.max(0, stops.findIndex((stop) => gradientStopIdentity(stop) === selectedStopKey))
  const selectedStop = stops[selectedIndex] ?? stops[0]
  const selectStop = (index: number): void => {
    const stop = stops[index]
    if (stop) setSelectedStopKey(gradientStopIdentity(stop))
  }
  // Keep the existing event handlers readable while selection is keyed by
  // stop identity rather than by a position that can change after sorting.
  const setSelectedIndex = selectStop
  const addStopAtPosition = (position: number): void => {
    const clampedPosition = Math.max(0.001, Math.min(0.999, position))
    const ordered = [...stops].sort((left, right) => left.position - right.position)
    const rightIndex = ordered.findIndex((stop) => stop.position >= clampedPosition)
    const left = ordered[Math.max(0, rightIndex - 1)]
    const right = ordered[rightIndex < 0 ? ordered.length - 1 : rightIndex]
    if (!left || !right || Math.abs(right.position - left.position) < 0.002) return
    const amount = (clampedPosition - left.position) / (right.position - left.position)
    const next = [...ordered, { position: clampedPosition, color: interpolateRgbaColor(left.color, right.color, amount) }].sort((a, b) => a.position - b.position)
    const selected = next.find((stop) => stop.position === clampedPosition)
    if (selected) setSelectedStopKey(gradientStopIdentity(selected))
    onChange(next)
  }
  const addStop = (): void => {
    let largestGap = -1
    let position = 0.5
    const ordered = [...stops].sort((left, right) => left.position - right.position)
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const gap = ordered[index + 1].position - ordered[index].position
      if (gap > largestGap) { largestGap = gap; position = (ordered[index].position + ordered[index + 1].position) / 2 }
    }
    addStopAtPosition(position)
  }
  const restoreColors = (): void => {
    const next = [{ position: 0, color: { ...primaryColor } }, { position: 1, color: { ...secondaryColor } }]
    setSelectedStopKey(gradientStopIdentity(next[0]))
    onChange(next)
  }
  const reverseStops = (): void => {
    const selected = stops[selectedIndex]
    const next = stops.map(stop => ({ position: 1 - stop.position, color: { ...stop.color } })).reverse().sort((a, b) => a.position - b.position)
    draggingRef.current = null
    setDraggingIndex(null)
    setPendingDeleteIndex(null)
    if (selected) setSelectedStopKey(gradientStopIdentity({ position: 1 - selected.position, color: selected.color }))
    onChange(next)
  }
  const updateStop = (index: number, patch: Partial<GradientStop>): void => {
    const source = draggingRef.current?.stops ?? stops
    const previous = source[index]
    if (!previous) return
    const next = source.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop)
    const updated = next[index]
    // At a track endpoint, crossing the other endpoint swaps their positions.
    // This lets a two-color ramp reverse without creating coincident stops.
    if (patch.position !== undefined && (patch.position === 0 || patch.position === 1) && previous.position !== patch.position) {
      const other = next.findIndex((stop, i) => i !== index && stop.position === patch.position)
      if (other >= 0) next[other] = { ...next[other], position: draggingRef.current?.originalPosition ?? previous.position }
    }
    next.sort((a, b) => a.position - b.position)
    if (draggingRef.current) {
      // Pointer events can arrive in one React batch. Keep the array and its
      // sorted index together, rather than applying a new index to old props.
      draggingRef.current.stops = next
      draggingRef.current.index = next.indexOf(updated)
      setDraggingIndex(draggingRef.current.index)
    }
    setSelectedStopKey(gradientStopIdentity(updated))
    onChange(next)
  }
  useEffect(() => {
    const updateDraggedStop = (event: PointerEvent): void => {
      const drag = draggingRef.current
      const bar = barRef.current
      if (!drag || !bar || disabled || event.pointerId !== drag.pointerId) return
      // A click must never turn into a drag after pointer-up. Pointer capture
      // and modal rerenders can deliver a late pointermove, so trust the
      // native button state as the final guard and clear stale drag state.
      if (event.buttons === 0) {
        draggingRef.current = null
        setDraggingIndex(null)
        setPendingDeleteIndex(null)
        return
      }
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return
      drag.moved = true
      setDraggingIndex(drag.index)
      const bounds = bar.getBoundingClientRect()
      if (drag.stops.length > 2 && event.clientY > bounds.bottom + 24) {
        drag.pendingDelete = true
        setPendingDeleteIndex(drag.index)
        return
      }
      drag.pendingDelete = false
      setPendingDeleteIndex(null)
      const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)))
      updateStop(drag.index, { position })
    }
    const finishDragging = (event: PointerEvent): void => {
      const drag = draggingRef.current
      if (!drag || event.pointerId !== drag.pointerId) return
      if (drag.pendingDelete && drag.stops.length > 2) {
        const next = drag.stops.filter((_, stopIndex) => stopIndex !== drag.index)
        const selected = next[Math.max(0, drag.index - 1)]
        if (selected) setSelectedStopKey(gradientStopIdentity(selected))
        onChange(next)
      }
      draggingRef.current = null
      setDraggingIndex(null)
      setPendingDeleteIndex(null)
      window.setTimeout(() => { suppressTrackClickRef.current = false }, 0)
    }
    const cancelDragging = (event: PointerEvent): void => {
      if (draggingRef.current?.pointerId !== event.pointerId) return
      draggingRef.current = null
      setDraggingIndex(null)
      setPendingDeleteIndex(null)
      suppressTrackClickRef.current = false
    }
    window.addEventListener('pointermove', updateDraggedStop)
    window.addEventListener('pointerup', finishDragging)
    window.addEventListener('pointercancel', cancelDragging)
    return () => {
      window.removeEventListener('pointermove', updateDraggedStop)
      window.removeEventListener('pointerup', finishDragging)
      window.removeEventListener('pointercancel', cancelDragging)
    }
  }, [disabled, pendingDeleteIndex, stops])
  useEffect(() => {
    if (stops.length === 0) return
    if (stops.some((stop) => gradientStopIdentity(stop) === selectedStopKey)) return
    const fallbackIndex = Math.min(selectedIndex, stops.length - 1)
    setSelectedStopKey(gradientStopIdentity(stops[fallbackIndex]))
  }, [selectedIndex, selectedStopKey, stops])
  if (!open || !selectedStop) return null
  const orderedStops = [...stops].sort((left, right) => left.position - right.position)
  const gradient = `linear-gradient(90deg, ${orderedStops.map((stop) => `${gradientStopCssColor(stop.color)} ${stop.position * 100}%`).join(', ')})`
  return createPortal(<div className="modal-backdrop gradient-editor-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="gradient-stops-editor" defaultWidth={520} defaultHeight={210} fitContentKey="gradient-editor" minWidth={420} minHeight={180} maxWidth={680} maxHeight={480} resizable={false} className="gradient-stops-modal">
      <DialogHeader eyebrow="GRADIENT" title={t(titleKey)} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body gradient-editor-body component-scrollbar">
        <div className="gradient-editor-track-wrap" onClick={(event) => { if (suppressTrackClickRef.current) { suppressTrackClickRef.current = false; return } if (event.target instanceof Element && event.target.closest('button')) return; const bounds = barRef.current?.getBoundingClientRect(); if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom + 40) return; addStopAtPosition((event.clientX - bounds.left) / Math.max(1, bounds.width)) }}>
          <div className="gradient-editor-scale" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
          <div ref={barRef} className="gradient-editor-track" style={{ background: gradient }} role="group" aria-label={t(titleKey)}>
            {stops.map((stop, index) => <button key={`gradient-stop-${index}`} type="button" className={`gradient-editor-stop ${selectedIndex === index ? 'selected' : ''} ${draggingIndex === index ? 'is-dragging' : ''} ${pendingDeleteIndex === index ? 'pending-delete' : ''}`.trim()} style={{ left: `calc(${stop.position * 100}% - 5.5px)` }} aria-label={`${t('toolOptions.gradientStopColor')} ${index + 1} ${Math.round(stop.position * 100)}%`} aria-pressed={selectedIndex === index} onPointerDown={(event) => { if (event.button !== 0 || draggingRef.current) return; event.preventDefault(); event.stopPropagation(); suppressTrackClickRef.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); setSelectedIndex(index); if (!disabled) draggingRef.current = { index, pointerId: event.pointerId, stops: stops.map(item => ({ ...item, color: { ...item.color } })), pendingDelete: false, startX: event.clientX, startY: event.clientY, originalPosition: stop.position, moved: false } }} onClick={(event) => { event.stopPropagation(); if (!suppressTrackClickRef.current) setSelectedIndex(index) }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedIndex(index); window.setTimeout(() => { document.querySelector<HTMLElement>('[data-gradient-selected-color] .color-value-trigger')?.click() }, 0) }}><GradientStopIcon color={stop.color} /></button>)}</div>
        </div>
        <div className="gradient-editor-controls">
          <div className="gradient-editor-value-controls"><span data-gradient-selected-color="true"><ColorValueControl color={selectedStop.color} density="compact" label={`${t('toolOptions.gradientStopColor')} ${selectedIndex + 1}`} roleLabel={t('toolOptions.gradientStopColor')} onChange={(color) => updateStop(selectedIndex, { color })} disabled={disabled} fillWithColor /></span>
            <NumberInput aria-label={`${t('toolOptions.gradientStopPosition')} ${selectedIndex + 1}`} density="compact" min={0} max={100} step={1} suffix="%" value={Math.round(selectedStop.position * 100)} onValueChange={(position) => updateStop(selectedIndex, { position: Math.max(0, Math.min(100, position)) / 100 })} disabled={disabled} />
          </div>
          <div className="gradient-editor-actions"><button type="button" className="icon-button gradient-stop-reverse" aria-label={t('gradientMap.reverse')} title={t('gradientMap.reverse')} onClick={reverseStops} disabled={disabled}><PixelUtilityIcon kind="swap" /></button><button type="button" className="icon-button gradient-stop-reset" aria-label={t('toolOptions.restoreGradientColors')} title={t('toolOptions.restoreGradientColors')} onClick={restoreColors} disabled={disabled}><PixelUtilityIcon kind="restore" /></button>
            <button type="button" className="icon-button gradient-stop-add" aria-label={t('toolOptions.addGradientStop')} title={t('toolOptions.addGradientStop')} onClick={addStop} disabled={disabled}><PixelUtilityIcon kind="plus" /></button>
            <button type="button" className="icon-button" aria-label={t('toolOptions.removeGradientStop')} title={t('toolOptions.removeGradientStop')} onClick={() => { const next = stops.filter((_, index) => index !== selectedIndex); setSelectedIndex(Math.max(0, selectedIndex - 1)); onChange(next) }} disabled={disabled || stops.length <= 2}><PixelUtilityIcon kind="delete" /></button>
          </div>
        </div>
      </div>
    </ModalShell>
  </div>, document.body)
}

