import { pixelSource } from '@/components/pixel-source'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { BrushDitherTemplate, BrushPaintMode, BrushShape, BrushTexture, GradientDither, GradientStop, GradientType, LiquifyMode, ProceduralBrushId, ProceduralBrushSettings, RgbaColor, SelectionMode, SelectionRect } from '@shared/types'
import { BrushThumbnail } from '@/components/BrushThumbnail'
import { NumberInput } from '@/components/NumberInput'
import { ColorValueControl } from '@/components/ColorValueControl'
import { CheckboxField } from '@/components/CheckboxField'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { GradientDitherSelect } from '@/components/GradientDitherSelect'
import { LivePreviewToggle } from '@/components/LivePreviewToggle'
import { ModalShell } from '@/components/ModalShell'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { RangeField } from '@/components/RangeField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { ThemedSelect } from '@/components/ThemedSelect'
import { TextInput } from '@/components/TextInput'
import { Tooltip } from '@/components/Tooltip'
import { useI18n } from '@/components/I18nProvider'
import { toolOptionsRenderKey } from '@/components/app/app-render-keys'
import { createProceduralBrushes, isProceduralBrushId } from '@/core/brushes'
import type { TranslationKey } from '@/core/localization'
import { brushTextureContains } from '@/core/tools'
import { loadEditorPreferences, parseLineDirectionStep, saveEditorPreferences } from '@/core/file-preferences'
import { autoSliceCount, autoSliceRects, MAX_AUTO_SLICES, type AutoSliceSettings } from '@/core/slices'
import { publishSlicePreview } from '@/core/slice-preview'
import { BRUSH_SPEED_INPUT_LIMIT, DEFAULT_PRESSURE_INPUT_RANGE, DEFAULT_SPEED_INPUT_RANGE, type BrushDynamicsCurve, type BrushDynamicsDirection, type BrushDynamicsEffect, type BrushDynamicsMapping, type BrushDynamicsSensor, type BrushDynamicsSettings } from '@/core/pressure'
import { getBrushDynamicsTelemetry, subscribeBrushDynamicsTelemetry, type BrushDynamicsTelemetrySnapshot } from '@/core/brush-dynamics-telemetry'
import { rangeValueWithShiftStep } from '@/core/range-step'
import { MAX_GAP_CLOSING_THRESHOLD, MIN_GAP_CLOSING_THRESHOLD } from '@/core/contiguous-region'
import { BRUSH_DITHER_TEMPLATES, DEFAULT_BRUSH_DITHER_SETTINGS, brushDitherContains, brushDitherSettingsForTemplate, ditherStageCount } from '@/core/gradient-color'
import { interpolateRgbaColor } from '@/core/gradient-color'
import { temporaryLiquifyModeForShift } from '@/core/liquify'
import { EDITOR_SHORTCUT_COMMAND_EVENT, LIQUIFY_RESET_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import { useWorkspace } from '@/store/workspace'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { PixelPressureIcon } from '@/components/PixelPressureIcon'
import { useFloatingWindowStack } from '@/components/floating-panel'
import { GRADIENT_TYPE_ICONS, LIQUIFY_MODE_ICONS, PixelAssetIcon, PixelShapeIcon, selectionModes, temporarySelectionModeForModifiers } from './editor-tools'
import { SelectionPivotControls, selectionPivotControlTarget } from './SelectionPivotControls'
import { SymmetryControls } from './SymmetryControls'
import selectionShrinkIcon from '@/assets/pixel-icons/selection-shrink.svg'
import gradientStopIcon from '@/assets/pixel-icons/gradient-stop.svg?raw'

function BrushTextureThumbnail({ texture }: { texture: BrushTexture }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const size = 16
    const image = context.createImageData(size, size)
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const visible = brushTextureContains(texture, x, y, 1)
      image.data[offset] = 255
      image.data[offset + 1] = 255
      image.data[offset + 2] = 255
      image.data[offset + 3] = visible ? 255 : 0
    }
    context.putImageData(image, 0, 0)
  }, [texture])
  return <canvas ref={canvasRef} className="fill-texture-coverage-thumbnail" width={16} height={16} aria-hidden="true" />
}

function BrushShapePresetButton({ shape, selected, label, onClick, angle = 0, menuItem = false }: { shape: BrushShape; selected: boolean; label: string; onClick: () => void; angle?: number; menuItem?: boolean }) {
  return <button type="button" role={menuItem ? 'menuitemradio' : undefined} className={`icon-button brush-preset ${selected ? 'selected' : ''}`} title={label} aria-label={label} aria-pressed={!menuItem ? selected : undefined} aria-checked={menuItem ? selected : undefined} onClick={onClick}>
    <span className="brush-shape-preview" style={{ transform: `rotate(${angle}deg)` }}><PixelShapeIcon kind={shape} /></span>
  </button>
}

function BrushDitherPreview({ template, stage }: { template: BrushDitherTemplate; stage: number }) {
  const settings = { enabled: true, template, stage }
  return <span className="brush-dither-preview" aria-hidden="true">{Array.from({ length: 64 }, (_, index) => {
    const x = index % 8
    const y = Math.floor(index / 8)
    return <i key={index} className={brushDitherContains(settings, x, y) ? 'filled' : ''} />
  })}</span>
}

const gradientStopCssColor = (color: RgbaColor): string => `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
const gradientStopIconContent = gradientStopIcon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const gradientStopIdentity = (stop: GradientStop): string => `${stop.position.toFixed(6)}:${stop.color.r},${stop.color.g},${stop.color.b},${stop.color.a}`

function GradientStopIcon({ color }: { color: RgbaColor }) {
  return <svg className="gradient-editor-stop-icon" width={11} height={16} viewBox="0 0 11 16" style={{ '--gradient-stop-color': gradientStopCssColor(color) } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: gradientStopIconContent }} aria-hidden="true" />
}

function GradientStopsEditor({ open, stops, disabled, primaryColor, secondaryColor, onChange, onClose, t }: { open: boolean; stops: GradientStop[]; disabled: boolean; primaryColor: RgbaColor; secondaryColor: RgbaColor; onChange: (stops: GradientStop[]) => void; onClose: () => void; t: (key: TranslationKey, params?: Record<string, string | number>) => string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ index: number; startX: number; startY: number; moved: boolean } | null>(null)
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
  const updateStop = (index: number, patch: Partial<GradientStop>): void => {
    const next = stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop)
    const updated = next[index]
    if (updated) setSelectedStopKey(gradientStopIdentity(updated))
    onChange(next)
  }
  useEffect(() => {
    const updateDraggedStop = (event: PointerEvent): void => {
      const drag = draggingRef.current
      const bar = barRef.current
      if (!drag || !bar || stops.length <= 2) return
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
      if (event.clientY > bounds.bottom + 24) {
        setPendingDeleteIndex(drag.index)
        return
      }
      setPendingDeleteIndex(null)
      const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)))
      updateStop(drag.index, { position })
    }
    const finishDragging = (): void => {
      const drag = draggingRef.current
      if (drag && pendingDeleteIndex === drag.index && stops.length > 2) {
        const next = stops.filter((_, stopIndex) => stopIndex !== drag.index)
        selectStop(Math.max(0, drag.index - 1))
        onChange(next)
      }
      draggingRef.current = null
      setDraggingIndex(null)
      setPendingDeleteIndex(null)
      window.setTimeout(() => { suppressTrackClickRef.current = false }, 0)
    }
    const cancelDragging = (): void => {
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
  }, [pendingDeleteIndex, stops])
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
      <DialogHeader eyebrow="GRADIENT" title={t('toolOptions.gradientFreeform')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="modal-body gradient-editor-body">
        <div className="gradient-editor-track-wrap" onClick={(event) => { if (suppressTrackClickRef.current) { suppressTrackClickRef.current = false; return } if (event.target instanceof Element && event.target.closest('button')) return; const bounds = barRef.current?.getBoundingClientRect(); if (!bounds || event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom + 40) return; addStopAtPosition((event.clientX - bounds.left) / Math.max(1, bounds.width)) }}>
          <div className="gradient-editor-scale" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
          <div ref={barRef} className="gradient-editor-track" style={{ background: gradient }} role="group" aria-label={t('toolOptions.gradientFreeform')}>
            {stops.map((stop, index) => <button key={`gradient-stop-${index}`} type="button" className={`gradient-editor-stop ${selectedIndex === index ? 'selected' : ''} ${draggingIndex === index ? 'is-dragging' : ''} ${pendingDeleteIndex === index ? 'pending-delete' : ''}`.trim()} style={{ left: `calc(${stop.position * 100}% - 5.5px)` }} aria-label={`${t('toolOptions.gradientStopColor')} ${index + 1} ${Math.round(stop.position * 100)}%`} aria-pressed={selectedIndex === index} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); suppressTrackClickRef.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); setSelectedIndex(index); if (!disabled && stops.length > 2) draggingRef.current = { index, startX: event.clientX, startY: event.clientY, moved: false } }} onClick={(event) => { event.stopPropagation(); setSelectedIndex(index) }} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedIndex(index); window.setTimeout(() => { document.querySelector<HTMLElement>('[data-gradient-selected-color] .color-value-trigger')?.click() }, 0) }}><GradientStopIcon color={stop.color} /></button>)}</div>
        </div>
        <div className="gradient-editor-controls">
          <div className="gradient-editor-value-controls"><span data-gradient-selected-color="true"><ColorValueControl color={selectedStop.color} density="compact" label={`${t('toolOptions.gradientStopColor')} ${selectedIndex + 1}`} roleLabel={t('toolOptions.gradientStopColor')} onChange={(color) => updateStop(selectedIndex, { color })} disabled={disabled} fillWithColor /></span>
            <NumberInput aria-label={`${t('toolOptions.gradientStopPosition')} ${selectedIndex + 1}`} density="compact" min={0} max={100} step={1} suffix="%" value={Math.round(selectedStop.position * 100)} onValueChange={(position) => updateStop(selectedIndex, { position: Math.max(0, Math.min(100, position)) / 100 })} disabled={disabled} />
          </div>
          <div className="gradient-editor-actions"><button type="button" className="icon-button gradient-stop-reset" aria-label={t('toolOptions.restoreGradientColors')} title={t('toolOptions.restoreGradientColors')} onClick={restoreColors} disabled={disabled}><PixelUtilityIcon kind="restore" /></button>
            <button type="button" className="icon-button gradient-stop-add" aria-label={t('toolOptions.addGradientStop')} title={t('toolOptions.addGradientStop')} onClick={addStop} disabled={disabled}><PixelUtilityIcon kind="plus" /></button>
            <button type="button" className="icon-button" aria-label={t('toolOptions.removeGradientStop')} title={t('toolOptions.removeGradientStop')} onClick={() => { const next = stops.filter((_, index) => index !== selectedIndex); setSelectedIndex(Math.max(0, selectedIndex - 1)); onChange(next) }} disabled={disabled || stops.length <= 2}><PixelUtilityIcon kind="delete" /></button>
          </div>
        </div>
      </div>
    </ModalShell>
  </div>, document.body)
}

type ProceduralControl = { key: keyof ProceduralBrushSettings; label: TranslationKey; min: number; max: number; suffix?: string }
const proceduralControls: Record<ProceduralBrushId, ProceduralControl[]> = {
  'procedural:noise': [
    { key: 'scale', label: 'toolOptions.parameter.grain', min: 1, max: 12, suffix: 'px' },
    { key: 'detail', label: 'toolOptions.parameter.density', min: 5, max: 95, suffix: '%' },
    { key: 'variation', label: 'toolOptions.parameter.contrast', min: 0, max: 100, suffix: '%' }
  ],
  'procedural:clouds': [
    { key: 'scale', label: 'toolOptions.parameter.scale', min: 4, max: 64, suffix: 'px' },
    { key: 'detail', label: 'toolOptions.parameter.detail', min: 1, max: 5 },
    { key: 'variation', label: 'toolOptions.parameter.contrast', min: 0, max: 100, suffix: '%' }
  ],
  'procedural:cells': [
    { key: 'scale', label: 'toolOptions.parameter.size', min: 4, max: 40, suffix: 'px' },
    { key: 'detail', label: 'toolOptions.parameter.edge', min: 0, max: 100, suffix: '%' },
    { key: 'variation', label: 'toolOptions.parameter.random', min: 0, max: 100, suffix: '%' }
  ],
  'procedural:fibers': [
    { key: 'scale', label: 'toolOptions.parameter.spacing', min: 2, max: 32, suffix: 'px' },
    { key: 'angle', label: 'toolOptions.parameter.direction', min: 0, max: 180, suffix: '°' },
    { key: 'detail', label: 'toolOptions.parameter.curvature', min: 0, max: 100, suffix: '%' },
    { key: 'variation', label: 'toolOptions.parameter.disorder', min: 0, max: 100, suffix: '%' }
  ]
}

const proceduralPresets: Record<ProceduralBrushId, Array<{ label: TranslationKey; values: Partial<ProceduralBrushSettings> }>> = {
  'procedural:noise': [
    { label: 'toolOptions.preset.fine', values: { scale: 1, detail: 42, variation: 30 } },
    { label: 'toolOptions.preset.standard', values: { scale: 2, detail: 50, variation: 50 } },
    { label: 'toolOptions.preset.coarse', values: { scale: 6, detail: 60, variation: 75 } }
  ],
  'procedural:clouds': [
    { label: 'toolOptions.preset.soft', values: { scale: 12, detail: 4, variation: 25 } },
    { label: 'toolOptions.preset.standard', values: { scale: 18, detail: 3, variation: 45 } },
    { label: 'toolOptions.preset.surging', values: { scale: 38, detail: 2, variation: 80 } }
  ],
  'procedural:cells': [
    { label: 'toolOptions.preset.cells', values: { scale: 7, detail: 25, variation: 35 } },
    { label: 'toolOptions.preset.standard', values: { scale: 12, detail: 38, variation: 70 } },
    { label: 'toolOptions.preset.rocks', values: { scale: 25, detail: 62, variation: 95 } }
  ],
  'procedural:fibers': [
    { label: 'toolOptions.preset.fineFibers', values: { scale: 5, detail: 18, variation: 12 } },
    { label: 'toolOptions.preset.standard', values: { scale: 9, detail: 35, variation: 28 } },
    { label: 'toolOptions.preset.woodGrain', values: { scale: 17, detail: 72, variation: 58 } }
  ]
}

function ProceduralBrushControls({ brushId, settings, onChange }: {
  brushId: ProceduralBrushId
  settings: ProceduralBrushSettings
  onChange: (settings: Partial<ProceduralBrushSettings>) => void
}) {
  const { t } = useI18n()
  return <>
    <div className="procedural-preset-row">{proceduralPresets[brushId].map((preset) => <button type="button" key={preset.label} onClick={() => onChange(preset.values)}>{t(preset.label)}</button>)}</div>
    <div className="procedural-parameter-list">
      {proceduralControls[brushId].map((control) => <RangeField className="procedural-parameter" density="compact" key={control.key} label={t(control.label)} min={control.min} max={control.max} suffix={control.suffix} value={settings[control.key]} onChange={(value) => onChange({ [control.key]: value })} />)}
      <FormField className="procedural-seed" layout="inline" label={t('toolOptions.parameter.seed')}><div className="procedural-seed-control"><NumberInput density="compact" min={0} max={9999} value={settings.seed} onValueChange={(seed) => onChange({ seed })} /><button className="icon-button" type="button" title={t('toolOptions.randomizeSeed')} aria-label={t('toolOptions.randomizeSeed')} onClick={() => onChange({ seed: Math.floor(Math.random() * 10000) })}><PixelUtilityIcon kind="refresh" /></button></div></FormField>
    </div>
  </>
}

function ToleranceControl({ value, open, label, inputLabel, sliderLabel, className = '', min = 0, max = 255, suffix, tooltip, onOpen, onChange }: {
  value: number
  open: boolean
  label: string
  inputLabel: string
  sliderLabel: string
  className?: string
  min?: number
  max?: number
  suffix?: string
  tooltip?: string
  onOpen: () => void
  onChange: (value: number) => void
}) {
  return <div className={`tolerance-control ${className}`.trim()} onPointerDown={onOpen}>
    <FormField className="tool-inline-field" layout="inline" label={label} tooltip={tooltip}><NumberInput aria-label={inputLabel} density="compact" min={min} max={max} suffix={suffix} value={value} onValueChange={onChange} onFocus={onOpen} /></FormField>
    {open && <div className="brush-size-popover tolerance-popover" role="dialog" aria-label={inputLabel}>
      <RangeField ariaLabel={sliderLabel} density="compact" min={min} max={max} suffix={suffix} value={value} onChange={onChange} />
    </div>}
  </div>
}

function SelectionAngleControl({ value, inputLabel, sliderLabel, min, max, onChange }: {
  value: number
  inputLabel: string
  sliderLabel: string
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [])
  return <div ref={controlRef} className="selection-angle-control" onPointerDown={() => setOpen(true)}>
    <NumberInput aria-label={inputLabel} density="compact" min={min} max={max} step={0.1} suffix="°" value={value} onValueChange={onChange} onFocus={() => setOpen(true)} />
    {open && <div className="brush-size-popover selection-angle-popover" role="dialog" aria-label={sliderLabel}>
      <RangeField ariaLabel={sliderLabel} density="compact" min={min} max={max} step={0.1} suffix="°" value={Math.max(min, Math.min(max, value))} onChange={onChange} />
    </div>}
  </div>
}

function GapClosingControls({ enabled, threshold, open, onEnabledChange, onThresholdChange, onOpen }: {
  enabled: boolean
  threshold: number
  open: boolean
  onEnabledChange: (enabled: boolean) => void
  onThresholdChange: (threshold: number) => void
  onOpen: () => void
}) {
  const { t } = useI18n()
  return <>
    <CheckboxField className="tool-checkbox" checked={enabled} label={t('toolOptions.smartClosure')} tooltip={t('toolOptions.smartClosureHint')} onChange={onEnabledChange} />
    {enabled && <ToleranceControl className="gap-closing-threshold-control" value={threshold} open={open} label={t('toolOptions.closureThreshold')} inputLabel={t('toolOptions.closureThreshold')} sliderLabel={t('toolOptions.closureThresholdSlider')} min={MIN_GAP_CLOSING_THRESHOLD} max={MAX_GAP_CLOSING_THRESHOLD} suffix="px" tooltip={t('toolOptions.closureThresholdHint')} onOpen={onOpen} onChange={onThresholdChange} />}
  </>
}

const pressureSensorBounds: Record<BrushDynamicsSensor, { max: number; defaultMin: number; defaultMax: number; defaultCurve: BrushDynamicsCurve; step: number; suffix: string }> = {
  pressure: { max: 100, defaultMin: DEFAULT_PRESSURE_INPUT_RANGE.inputMin, defaultMax: DEFAULT_PRESSURE_INPUT_RANGE.inputMax, defaultCurve: DEFAULT_PRESSURE_INPUT_RANGE.curve, step: 1, suffix: '%' },
  speed: { max: BRUSH_SPEED_INPUT_LIMIT, defaultMin: DEFAULT_SPEED_INPUT_RANGE.inputMin, defaultMax: DEFAULT_SPEED_INPUT_RANGE.inputMax, defaultCurve: DEFAULT_SPEED_INPUT_RANGE.curve, step: 10, suffix: 'px/s' }
}

const brushDynamicsEffects: BrushDynamicsEffect[] = ['size', 'strength', 'gradient', 'angle']

type BrushDynamicsRangeEndpoint = 'min' | 'max'

export const nearestBrushDynamicsRangeEndpoint = (
  value: number,
  minimum: number,
  maximum: number,
  previous: BrushDynamicsRangeEndpoint
): BrushDynamicsRangeEndpoint => {
  const minimumDistance = Math.abs(value - minimum)
  const maximumDistance = Math.abs(value - maximum)
  if (minimumDistance === maximumDistance) return previous === 'min' ? 'max' : 'min'
  return minimumDistance < maximumDistance ? 'min' : 'max'
}

function BrushDynamicsRangeControl({ minimum, maximum, limit, step, percentage, rangeStart, rangeEnd, liveSensorPosition, liveSensorValue, liveActive, minimumLabel, maximumLabel, onChange }: {
  minimum: number
  maximum: number
  limit: number
  step: number
  percentage: boolean
  rangeStart: number
  rangeEnd: number
  liveSensorPosition: number
  liveSensorValue: number | null
  liveActive: boolean
  minimumLabel: string
  maximumLabel: string
  onChange: (endpoint: BrushDynamicsRangeEndpoint, value: number) => void
}) {
  const minimumRef = useRef<HTMLInputElement>(null)
  const maximumRef = useRef<HTMLInputElement>(null)
  const draggedEndpointRef = useRef<BrushDynamicsRangeEndpoint | null>(null)
  const shiftHeldRef = useRef(false)
  const lastEndpointRef = useRef<BrushDynamicsRangeEndpoint>('max')
  const [activeEndpoint, setActiveEndpoint] = useState<BrushDynamicsRangeEndpoint>('max')
  const valueAtClientX = (clientX: number, surface: HTMLDivElement, shiftKey: boolean): number => {
    const bounds = surface.getBoundingClientRect()
    const progress = bounds.width > 0 ? Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) : 0
    const rawValue = progress * limit
    const nativeValue = Math.max(0, Math.min(limit, Math.round(rawValue / step) * step))
    return rangeValueWithShiftStep(nativeValue, 0, limit, step, percentage ? 'percentage' : 'number', shiftKey)
  }
  const selectEndpoint = (endpoint: BrushDynamicsRangeEndpoint): void => {
    lastEndpointRef.current = endpoint
    setActiveEndpoint(endpoint)
    const input = endpoint === 'min' ? minimumRef.current : maximumRef.current
    window.requestAnimationFrame(() => input?.focus({ preventScroll: true }))
  }
  const updateEndpoint = (endpoint: BrushDynamicsRangeEndpoint, value: number): void => {
    onChange(endpoint, endpoint === 'min' ? Math.min(value, maximum) : Math.max(value, minimum))
  }
  const handleSurfacePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const value = valueAtClientX(event.clientX, event.currentTarget, event.shiftKey)
    const endpoint = nearestBrushDynamicsRangeEndpoint(value, minimum, maximum, lastEndpointRef.current)
    draggedEndpointRef.current = endpoint
    selectEndpoint(endpoint)
    updateEndpoint(endpoint, value)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const handleSurfacePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const endpoint = draggedEndpointRef.current
    if (!endpoint || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    updateEndpoint(endpoint, valueAtClientX(event.clientX, event.currentTarget, event.shiftKey))
  }
  const finishSurfaceDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    draggedEndpointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <div className="pressure-range-stack">
    <span className="pressure-range-track" aria-hidden="true">
      <span className={`pressure-range-live ${liveSensorValue === null ? 'is-empty' : liveActive ? 'is-active' : 'is-inactive'}`} style={{ width: `${liveSensorPosition}%` }} />
      <span className="pressure-range-selection" style={{ left: `${rangeStart}%`, right: `${100 - rangeEnd}%` }} />
      <span className={`pressure-range-live-marker ${liveSensorValue === null ? 'is-empty' : liveActive ? 'is-active' : 'is-inactive'}`} style={{ left: `${liveSensorPosition}%` }} />
    </span>
    <div className="pressure-range-hit-surface" aria-hidden="true" onPointerDown={handleSurfacePointerDown} onPointerMove={handleSurfacePointerMove} onPointerUp={finishSurfaceDrag} onPointerCancel={finishSurfaceDrag} />
    <input ref={minimumRef} className={`pressure-range-min ${activeEndpoint === 'min' ? 'is-active' : ''}`} aria-label={minimumLabel} type="range" min={0} max={limit} step={step} value={minimum} onFocus={() => selectEndpoint('min')} onPointerDown={(event) => { shiftHeldRef.current = event.shiftKey; selectEndpoint('min') }} onPointerMove={(event) => { shiftHeldRef.current = event.shiftKey }} onPointerUp={() => { shiftHeldRef.current = false }} onPointerCancel={() => { shiftHeldRef.current = false }} onChange={(event) => updateEndpoint('min', rangeValueWithShiftStep(Number(event.target.value), 0, limit, step, percentage ? 'percentage' : 'number', shiftHeldRef.current))} />
    <input ref={maximumRef} className={`pressure-range-max ${activeEndpoint === 'max' ? 'is-active' : ''}`} aria-label={maximumLabel} type="range" min={0} max={limit} step={step} value={maximum} onFocus={() => selectEndpoint('max')} onPointerDown={(event) => { shiftHeldRef.current = event.shiftKey; selectEndpoint('max') }} onPointerMove={(event) => { shiftHeldRef.current = event.shiftKey }} onPointerUp={() => { shiftHeldRef.current = false }} onPointerCancel={() => { shiftHeldRef.current = false }} onChange={(event) => updateEndpoint('max', rangeValueWithShiftStep(Number(event.target.value), 0, limit, step, percentage ? 'percentage' : 'number', shiftHeldRef.current))} />
  </div>
}

export function BrushDynamicsSettingsPanel({ settings, tool, intrinsicSize, brushSize, documentId, primaryColor, secondaryColor, telemetryPreview, onChange, onGradientDitherChange, availableEffects = brushDynamicsEffects }: {
  settings: BrushDynamicsSettings
  tool: 'pencil' | 'eraser' | 'smooth'
  intrinsicSize: boolean
  brushSize: number
  documentId: string | null
  primaryColor: RgbaColor
  secondaryColor: RgbaColor
  telemetryPreview?: BrushDynamicsTelemetrySnapshot
  onChange: (effect: BrushDynamicsEffect, patch: Partial<BrushDynamicsMapping>) => void
  onGradientDitherChange: (dither: GradientDither) => void
  availableEffects?: readonly BrushDynamicsEffect[]
}) {
  const { t } = useI18n()
  const telemetry = useSyncExternalStore(
    subscribeBrushDynamicsTelemetry,
    getBrushDynamicsTelemetry,
    () => null
  )
  const liveTelemetry = telemetryPreview ?? telemetry
  const effectDisabled = (effect: BrushDynamicsEffect): boolean => !availableEffects.includes(effect) || (effect === 'size' && intrinsicSize) || (effect === 'gradient' && tool === 'eraser')
  const firstAvailableMapping = (): BrushDynamicsEffect | null => availableEffects.find((effect) => !effectDisabled(effect) && settings.effects[effect].sensor) ?? null
  const [activeEffect, setActiveEffect] = useState<BrushDynamicsEffect | null>(firstAvailableMapping)
  const effectLabel = (effect: BrushDynamicsEffect): string => effect === 'size'
    ? t('toolOptions.pressureEffectSize')
    : effect === 'gradient'
      ? t('toolOptions.pressureEffectGradient')
      : effect === 'angle'
        ? t('toolOptions.pressureEffectAngle')
        : t('toolOptions.pressureEffectStrength')
  const sensorLabel = (sensor: BrushDynamicsSensor): string => sensor === 'pressure'
    ? t('toolOptions.pressureSensorPressure')
    : t('toolOptions.pressureSensorSpeed')
  useEffect(() => {
    if (!activeEffect) return
    const activeDisabled = (activeEffect === 'size' && intrinsicSize) || (activeEffect === 'gradient' && tool === 'eraser')
    if (!activeDisabled) return
    const fallback = availableEffects.find((effect) => !effectDisabled(effect) && settings.effects[effect].sensor)
    setActiveEffect(fallback ?? null)
  }, [activeEffect, availableEffects, intrinsicSize, settings.effects.angle.sensor, settings.effects.gradient.sensor, settings.effects.size.sensor, settings.effects.strength.sensor, tool])
  const selectMapping = (effect: BrushDynamicsEffect, sensor: BrushDynamicsSensor): void => {
    if (effectDisabled(effect)) return
    const mapping = settings.effects[effect]
    if (mapping.sensor === sensor) {
      if (activeEffect !== effect) {
        setActiveEffect(effect)
        return
      }
      onChange(effect, { sensor: null })
      setActiveEffect(null)
      return
    }
    const defaults = pressureSensorBounds[sensor]
    onChange(effect, { sensor, inputMin: defaults.defaultMin, inputMax: defaults.defaultMax, curve: defaults.defaultCurve })
    setActiveEffect(effect)
  }
  const renderEffectRow = (effect: BrushDynamicsEffect) => {
    const disabled = effectDisabled(effect)
    const mapping = settings.effects[effect]
    return <div className={`pressure-matrix-row ${disabled ? 'disabled' : ''}`} role="row" aria-disabled={disabled || undefined}>
      <span className="pressure-effect-label" role="rowheader">{effectLabel(effect)}</span>
      {(['pressure', 'speed'] as const).map((sensor) => {
        const enabled = mapping.sensor === sensor
        const selected = enabled && activeEffect === effect && !disabled
        const label = t('toolOptions.pressureMappingToggle', { effect: effectLabel(effect), sensor: sensorLabel(sensor) })
        return <button className={`pressure-matrix-cell ${enabled ? 'enabled' : ''} ${selected ? 'selected' : ''}`} type="button" role="gridcell" aria-label={label} aria-pressed={enabled} disabled={disabled} key={sensor} onClick={() => selectMapping(effect, sensor)}>
          <span className="pressure-matrix-check" aria-hidden="true">{enabled && <PixelUtilityIcon kind="check" scale={2} />}</span>
        </button>
      })}
    </div>
  }
  const activeMapping = activeEffect && !effectDisabled(activeEffect) && settings.effects[activeEffect].sensor ? settings.effects[activeEffect] : null
  const activeSensor = activeMapping?.sensor ?? null
  const sensorBounds = activeSensor ? pressureSensorBounds[activeSensor] : null
  const rangeStart = activeMapping && sensorBounds ? activeMapping.inputMin / sensorBounds.max * 100 : 0
  const rangeEnd = activeMapping && sensorBounds ? activeMapping.inputMax / sensorBounds.max * 100 : 100
  const telemetryMatchesDocument = Boolean(documentId && liveTelemetry?.documentId === documentId)
  const liveSensorValue = activeSensor && telemetryMatchesDocument ? liveTelemetry![activeSensor] : null
  const liveSensorPosition = liveSensorValue !== null && sensorBounds ? Math.max(0, Math.min(100, liveSensorValue / sensorBounds.max * 100)) : 0
  const liveSensorText = liveSensorValue === null || !sensorBounds
    ? t('toolOptions.pressureSensorInactive')
    : `${Math.round(liveSensorValue)}${sensorBounds.suffix === '%' ? '%' : ` ${sensorBounds.suffix}`}`
  const sizeRange = activeEffect === 'size' && activeMapping
    ? t('toolOptions.pressureSizeRangePixels', {
      min: Math.max(1, Math.round(brushSize * activeMapping.outputMin / 100)),
      max: Math.max(1, Math.round(brushSize * activeMapping.outputMax / 100))
    })
    : null
  const curveOptions: Array<{ value: BrushDynamicsCurve; label: string; description: string }> = [
    { value: 'soft', label: t('toolOptions.pressureCurve.soft'), description: t('toolOptions.pressureCurve.softDescription') },
    { value: 'linear', label: t('toolOptions.pressureCurve.linear'), description: t('toolOptions.pressureCurve.linearDescription') },
    { value: 'hard', label: t('toolOptions.pressureCurve.hard'), description: t('toolOptions.pressureCurve.hardDescription') }
  ]
  const directionOptions: Array<{ value: BrushDynamicsDirection; label: string }> = [
    { value: 'direct', label: t('toolOptions.pressureDirection.direct') },
    { value: 'inverse', label: t('toolOptions.pressureDirection.inverse') }
  ]
  return <div className="pressure-settings-panel">
    <div className="pressure-matrix-section">
      <div className="pressure-section-title">{t('toolOptions.pressureMappingMatrix')}</div>
      <div className="pressure-matrix" role="grid" aria-label={t('toolOptions.pressureMappingMatrix')}>
        <div className="pressure-matrix-header" role="row"><span aria-hidden="true" /><span role="columnheader">{sensorLabel('pressure')}</span><span role="columnheader">{sensorLabel('speed')}</span></div>
        {availableEffects.includes('size') && (intrinsicSize ? <Tooltip className="pressure-matrix-tooltip" content={t('toolOptions.pressureIntrinsicSizeHint')}>{renderEffectRow('size')}</Tooltip> : renderEffectRow('size'))}
        {availableEffects.includes('strength') && renderEffectRow('strength')}
        {availableEffects.includes('gradient') && (tool === 'eraser' ? <Tooltip className="pressure-matrix-tooltip" content={t('toolOptions.pressureEraserGradientHint')}>{renderEffectRow('gradient')}</Tooltip> : renderEffectRow('gradient'))}
        {availableEffects.includes('angle') && renderEffectRow('angle')}
      </div>
    </div>
    {activeMapping && activeSensor && sensorBounds ? <section className="pressure-mapping-details">
      <header><strong>{effectLabel(activeEffect!)} <span className="pressure-mapping-separator" aria-hidden="true">×</span> {sensorLabel(activeSensor)}</strong>{sizeRange && <small>{sizeRange}</small>}</header>
      <div className="pressure-mapping-body">
        {activeEffect === 'gradient' && <div className="pressure-detail-section pressure-gradient-preview">
          <span className="pressure-detail-label">{t('toolOptions.pressureGradientColors')}</span>
          <div className="pressure-gradient-band" role="img" aria-label={t('toolOptions.pressureGradientColors')}>
            <span className="pressure-gradient-swatch" title={t('toolOptions.pressureBackgroundColor')} style={{ background: `rgba(${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b}, ${secondaryColor.a / 255})` }} />
            <span className="pressure-gradient-strip" style={{ background: `linear-gradient(to right, rgba(${secondaryColor.r}, ${secondaryColor.g}, ${secondaryColor.b}, ${secondaryColor.a / 255}), rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, ${primaryColor.a / 255}))` }} />
            <span className="pressure-gradient-swatch" title={t('toolOptions.pressureForegroundColor')} style={{ background: `rgba(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b}, ${primaryColor.a / 255})` }} />
          </div>
          <FormField className="pressure-gradient-dither-select" layout="inline" label={t('toolOptions.pressureGradientDither')}><GradientDitherSelect value={settings.gradientDither} label={t('toolOptions.pressureGradientDither')} density="compact" onChange={onGradientDitherChange} popoverClassName="pressure-gradient-dither-popover" /></FormField>
        </div>}
        <div className="pressure-detail-section pressure-detail-group">
          <span className="pressure-detail-label">{t('toolOptions.pressureOutputRange')}</span>
          <RangeField className="pressure-slider-row" density="compact" label={t('toolOptions.pressureOutputMin')} value={activeMapping.outputMin} min={activeEffect === 'angle' ? -180 : 0} max={activeMapping.outputMax} suffix={activeEffect === 'angle' ? '°' : '%'} onChange={(outputMin) => onChange(activeEffect!, { outputMin })} />
          <RangeField className="pressure-slider-row" density="compact" label={t('toolOptions.pressureOutputMax')} value={activeMapping.outputMax} min={activeMapping.outputMin} max={activeEffect === 'angle' ? 180 : 100} suffix={activeEffect === 'angle' ? '°' : '%'} onChange={(outputMax) => onChange(activeEffect!, { outputMax })} />
        </div>
        <div className="pressure-detail-section pressure-detail-group">
          <div className="pressure-detail-heading"><span className="pressure-detail-label">{t('toolOptions.pressureSensorRange')}</span><span className={`pressure-live-value ${liveSensorValue === null ? 'is-empty' : liveTelemetry?.active ? 'is-active' : 'is-inactive'}`}>{t('toolOptions.pressureSensorLive')}: {liveSensorText}</span></div>
          <BrushDynamicsRangeControl minimum={activeMapping.inputMin} maximum={activeMapping.inputMax} limit={sensorBounds.max} step={sensorBounds.step} percentage={sensorBounds.suffix === '%'} rangeStart={rangeStart} rangeEnd={rangeEnd} liveSensorPosition={liveSensorPosition} liveSensorValue={liveSensorValue} liveActive={Boolean(liveTelemetry?.active)} minimumLabel={t('toolOptions.pressureSensorMin')} maximumLabel={t('toolOptions.pressureSensorMax')} onChange={(endpoint, value) => onChange(activeEffect!, endpoint === 'min' ? { inputMin: value } : { inputMax: value })} />
          <div className="pressure-range-values">
            <FormField layout="inline" label={t('toolOptions.pressureSensorMin')}><NumberInput density="compact" min={0} max={activeMapping.inputMax} step={sensorBounds.step} suffix={sensorBounds.suffix} value={activeMapping.inputMin} onValueChange={(inputMin) => onChange(activeEffect!, { inputMin })} /></FormField>
            <FormField layout="inline" label={t('toolOptions.pressureSensorMax')}><NumberInput density="compact" min={activeMapping.inputMin} max={sensorBounds.max} step={sensorBounds.step} suffix={sensorBounds.suffix} value={activeMapping.inputMax} onValueChange={(inputMax) => onChange(activeEffect!, { inputMax })} /></FormField>
          </div>
        </div>
        <div className="pressure-options-grid">
          <div className="pressure-option-group"><span>{t('toolOptions.pressureCurve')}</span><SegmentedControl className="pressure-segmented-control pressure-curve-control" label={t('toolOptions.pressureCurve')} options={curveOptions} value={activeMapping.curve} onChange={(curve) => onChange(activeEffect!, { curve })} /></div>
          <div className="pressure-option-group"><span>{t('toolOptions.pressureDirection')}</span><SegmentedControl className="pressure-segmented-control pressure-direction-control" label={t('toolOptions.pressureDirection')} options={directionOptions} value={activeMapping.direction} onChange={(direction) => onChange(activeEffect!, { direction })} /></div>
        </div>
      </div>
    </section> : <p className="pressure-empty-state">{t('toolOptions.pressureSelectMapping')}</p>}
  </div>
}

export const EditorToolOptions = memo(function EditorToolOptions({ onOpenColorReplacement }: { onOpenColorReplacement: () => void }) {
  const { locale, t } = useI18n()
  const renderKey = useWorkspace((state) => toolOptionsRenderKey(
    state.sessions.find((item) => item.document.id === state.activeId) ?? null
  ))
  const [brushSizeFlyoutOpen, setBrushSizeFlyoutOpen] = useState(false)
  const [smoothStrengthFlyoutOpen, setSmoothStrengthFlyoutOpen] = useState(false)
  const [liquifyFlyoutOpen, setLiquifyFlyoutOpen] = useState<'radius' | 'strength' | 'smoothing-strength' | null>(null)
  const [brushAngleFlyoutOpen, setBrushAngleFlyoutOpen] = useState(false)
  const [basicBrushFlyoutOpen, setBasicBrushFlyoutOpen] = useState(false)
  const [brushDitherFlyoutOpen, setBrushDitherFlyoutOpen] = useState(false)
  const [brushDitherResident, setBrushDitherResident] = useState(false)
  const [brushDitherPopoverPosition, setBrushDitherPopoverPosition] = useState({ left: 8, top: 8, maxHeight: 320 })
  const [fillTextureOpen, setFillTextureOpen] = useState(false)
  const [gradientStopsOpen, setGradientStopsOpen] = useState(false)
  const [toleranceFlyoutOpen, setToleranceFlyoutOpen] = useState<'wand' | 'wand-gap' | 'fill' | 'fill-gap' | 'gradient' | null>(null)
  const [temporarySelectionMode, setTemporarySelectionMode] = useState<SelectionMode | null>(null)
  const [temporaryLiquifyMode, setTemporaryLiquifyMode] = useState<LiquifyMode | null>(null)
  const [pressureFlyoutOpen, setPressureFlyoutOpen] = useState(false)
  const [sliceProperties, setSliceProperties] = useState<(SelectionRect & { id: string }) | null>(null)
  const [autoSliceSettings, setAutoSliceSettings] = useState<AutoSliceSettings | null>(null)
  const [autoSlicePreviewEnabled, setAutoSlicePreviewEnabled] = useState(true)
  const [pressurePopoverPosition, setPressurePopoverPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  const pressureControlRef = useRef<HTMLDivElement>(null)
  const brushDitherTriggerRef = useRef<HTMLButtonElement>(null)
  const brushDitherPopoverRef = useRef<HTMLDivElement>(null)
  const brushDitherWindowStack = useFloatingWindowStack(brushDitherPopoverRef, brushDitherFlyoutOpen)
  const brushDitherDragRef = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(null)
  const brushDitherResidentRef = useRef(false)
  const brushDitherPositionedRef = useRef(false)
  const [lineDirectionStep, setLineDirectionStep] = useState(() => loadEditorPreferences().lineDirectionStep)
  const closeBrushDitherFlyout = useCallback((): void => {
    brushDitherDragRef.current = null
    brushDitherResidentRef.current = false
    brushDitherPositionedRef.current = false
    setBrushDitherResident(false)
    setBrushDitherFlyoutOpen(false)
  }, [])
  const state = useWorkspace.getState()
  const session = state.sessions.find((item) => item.document.id === state.activeId) ?? null
  const proceduralBrushes = useMemo(() => session ? createProceduralBrushes(session.proceduralBrushSettings) : [], [renderKey, session?.document.id])
  const autoSlicePlan = useMemo(() => {
    if (!session || !autoSliceSettings) return { count: 0, rects: [] as SelectionRect[] }
    const count = autoSliceCount(session.document.width, session.document.height, autoSliceSettings)
    return {
      count,
      rects: count <= MAX_AUTO_SLICES ? autoSliceRects(session.document.width, session.document.height, autoSliceSettings) : []
    }
  }, [autoSliceSettings, session?.document.height, session?.document.id, session?.document.width])
  const autoSliceTotal = autoSlicePlan.count
  const autoSlicePreview = autoSlicePlan.rects

  useEffect(() => {
    const documentId = session?.document.id
    if (!autoSliceSettings || !documentId) return
    publishSlicePreview(documentId, autoSlicePreviewEnabled ? autoSlicePreview : null)
    return () => publishSlicePreview(documentId, null)
  }, [autoSlicePreview, autoSlicePreviewEnabled, autoSliceSettings, session?.document.id])

  useEffect(() => {
    const syncPreferences = (): void => setLineDirectionStep(loadEditorPreferences().lineDirectionStep)
    window.addEventListener('moonsprite:preferences-changed', syncPreferences)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncPreferences)
  }, [])

  useEffect(() => {
    const handleShortcutCommand = (event: Event): void => {
      const detail = (event as CustomEvent<EditorShortcutCommandDetail>).detail
      const active = detail ? useWorkspace.getState().sessions.find((item) => item.document.id === detail.documentId) : null
      if (!active) return
      if (detail.id === 'openAutoSlice') {
        setAutoSlicePreviewEnabled(true)
        setAutoSliceSettings({ width: Math.min(16, active.document.width), height: Math.min(16, active.document.height), gapX: 0, gapY: 0, startX: 0, startY: 0 })
        return
      }
      if (detail.id !== 'openSliceProperties') return
      const selectedSliceIds = active.selectedSliceIds?.length ? active.selectedSliceIds : active.selectedSliceId ? [active.selectedSliceId] : []
      const selectedSlice = selectedSliceIds.length === 1 ? active.document.slices?.find((slice) => slice.id === selectedSliceIds[0]) : null
      if (selectedSlice) setSliceProperties({ id: selectedSlice.id, x: selectedSlice.x, y: selectedSlice.y, width: selectedSlice.width, height: selectedSlice.height })
    }
    window.addEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
    return () => window.removeEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
  }, [])

  useEffect(() => {
    const keepsBrushDynamicsOpen = (target: Element): boolean => Boolean(target.closest('.pressure-control, .pressure-popover, .themed-select-popover, .stage-canvas, .stage-surface'))
    const closeOutside = (event: PointerEvent): void => {
      if (!(event.target instanceof Element)) return
      if (!event.target.closest('.brush-size-control')) setBrushSizeFlyoutOpen(false)
      if (!event.target.closest('.smooth-strength-control')) setSmoothStrengthFlyoutOpen(false)
      if (!event.target.closest('.liquify-value-control')) setLiquifyFlyoutOpen(null)
      if (!event.target.closest('.brush-angle-control')) setBrushAngleFlyoutOpen(false)
      if (!event.target.closest('.brush-shape-selector')) setBasicBrushFlyoutOpen(false)
      if (!brushDitherResidentRef.current && !event.target.closest('.brush-dither-control, .brush-dither-popover')) closeBrushDitherFlyout()
      if (!event.target.closest('.fill-texture-control')) setFillTextureOpen(false)
      if (!event.target.closest('.tolerance-control')) setToleranceFlyoutOpen(null)
      if (!keepsBrushDynamicsOpen(event.target)) setPressureFlyoutOpen(false)
    }
    const closeOnFocusOutside = (event: FocusEvent): void => {
      if (!(event.target instanceof Element)) return
      if (!keepsBrushDynamicsOpen(event.target)) setPressureFlyoutOpen(false)
    }
    const closeOnBlur = (): void => { setBasicBrushFlyoutOpen(false); if (!brushDitherResidentRef.current) closeBrushDitherFlyout(); setFillTextureOpen(false); setToleranceFlyoutOpen(null); setPressureFlyoutOpen(false); setBrushAngleFlyoutOpen(false); setSmoothStrengthFlyoutOpen(false); setLiquifyFlyoutOpen(null) }
    const closeOnEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') { setBasicBrushFlyoutOpen(false); closeBrushDitherFlyout(); setPressureFlyoutOpen(false); setBrushAngleFlyoutOpen(false); setSmoothStrengthFlyoutOpen(false); setLiquifyFlyoutOpen(null) } }
    const closeAll = (event: Event): void => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (target && target !== 'popover') return
      setBrushSizeFlyoutOpen(false)
      setSmoothStrengthFlyoutOpen(false)
      setLiquifyFlyoutOpen(null)
      setBrushAngleFlyoutOpen(false)
      setBasicBrushFlyoutOpen(false)
      closeBrushDitherFlyout()
      setFillTextureOpen(false)
      setToleranceFlyoutOpen(null)
      setPressureFlyoutOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('focusin', closeOnFocusOutside, true)
    window.addEventListener('blur', closeOnBlur)
    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('moonsprite:close-dialog', closeAll)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('focusin', closeOnFocusOutside, true)
      window.removeEventListener('blur', closeOnBlur)
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('moonsprite:close-dialog', closeAll)
    }
  }, [closeBrushDitherFlyout])

  useLayoutEffect(() => {
    if (!brushDitherFlyoutOpen) return
    const placePopover = (): void => {
      const popover = brushDitherPopoverRef.current
      if (!popover) return
      const bounds = popover.getBoundingClientRect()
      const safeTop = (document.querySelector<HTMLElement>('.app-window-titlebar')?.getBoundingClientRect().bottom ?? 0) + 8
      const safeBottom = window.innerHeight - 8
      if (brushDitherResidentRef.current && brushDitherPositionedRef.current) {
        setBrushDitherPopoverPosition((current) => {
          const top = Math.max(safeTop, Math.min(safeBottom - Math.min(bounds.height, current.maxHeight), current.top))
          return {
            left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, current.left)),
            top,
            maxHeight: Math.max(1, safeBottom - top)
          }
        })
        return
      }
      const trigger = brushDitherTriggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const left = Math.max(8, Math.min(window.innerWidth - bounds.width - 8, trigger.left))
      const belowTop = trigger.bottom + 5
      const aboveBottom = trigger.top - 5
      const availableBelow = Math.max(1, safeBottom - belowTop)
      const availableAbove = Math.max(1, aboveBottom - safeTop)
      const opensBelow = availableBelow >= bounds.height || availableBelow >= availableAbove
      const maxHeight = opensBelow ? availableBelow : availableAbove
      const top = opensBelow ? belowTop : Math.max(safeTop, aboveBottom - Math.min(bounds.height, maxHeight))
      brushDitherPositionedRef.current = true
      setBrushDitherPopoverPosition({ left, top, maxHeight })
    }
    placePopover()
    window.addEventListener('resize', placePopover)
    window.addEventListener('scroll', placePopover, true)
    return () => {
      window.removeEventListener('resize', placePopover)
      window.removeEventListener('scroll', placePopover, true)
    }
  }, [brushDitherFlyoutOpen])

  useEffect(() => {
    if (!brushDitherFlyoutOpen) return
    const move = (event: PointerEvent): void => {
      const drag = brushDitherDragRef.current
      const popover = brushDitherPopoverRef.current
      if (!drag || !popover) return
      const bounds = popover.getBoundingClientRect()
      if (!brushDitherResidentRef.current && Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY) >= 3) {
        brushDitherResidentRef.current = true
        setBrushDitherResident(true)
      }
      const safeTop = (document.querySelector<HTMLElement>('.app-window-titlebar')?.getBoundingClientRect().bottom ?? 0) + 8
      const safeBottom = window.innerHeight - 8
      const availableHeight = Math.max(1, safeBottom - safeTop)
      const top = Math.max(safeTop, Math.min(safeBottom - Math.min(bounds.height, availableHeight), drag.top + event.clientY - drag.pointerY))
      setBrushDitherPopoverPosition({
        left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, drag.left + event.clientX - drag.pointerX)),
        top,
        maxHeight: Math.max(1, safeBottom - top)
      })
    }
    const end = (): void => { brushDitherDragRef.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [brushDitherFlyoutOpen])

  useLayoutEffect(() => {
    if (!pressureFlyoutOpen) return
    const placePopover = (): void => {
      const trigger = pressureControlRef.current?.getBoundingClientRect()
      if (!trigger) return
      const viewportInset = 6
      const width = Math.min(392, Math.max(1, window.innerWidth - viewportInset * 2))
      const left = Math.max(viewportInset, Math.min(window.innerWidth - width - viewportInset, trigger.left))
      const top = trigger.bottom + 5
      const maxHeight = Math.max(1, window.innerHeight - top - viewportInset)
      setPressurePopoverPosition({ left, top, width, maxHeight })
    }
    placePopover()
    window.addEventListener('resize', placePopover)
    window.addEventListener('scroll', placePopover, true)
    return () => {
      window.removeEventListener('resize', placePopover)
      window.removeEventListener('scroll', placePopover, true)
    }
  }, [pressureFlyoutOpen])

  useEffect(() => {
    const supportsBrushLibrary = session?.tool === 'pencil' || session?.tool === 'eraser' || session?.tool === 'line' || (session?.tool === 'fill' && (session.fillKind ?? 'bucket') === 'bucket')
    if (!supportsBrushLibrary && session?.tool !== 'airbrush' && session?.tool !== 'smooth') setBrushSizeFlyoutOpen(false)
    if (session?.tool !== 'pencil' && session?.tool !== 'eraser' && session?.tool !== 'line' && session?.tool !== 'smooth' && session?.tool !== 'airbrush') {
      setBasicBrushFlyoutOpen(false)
      closeBrushDitherFlyout()
    }
    if (session?.brushImage && !isProceduralBrushId(session.brushImage.id)) closeBrushDitherFlyout()
    if (session?.tool !== 'fill' || (session.fillKind ?? 'bucket') !== 'bucket') setFillTextureOpen(false)
    if (session?.tool !== 'pencil' && session?.tool !== 'eraser') setPressureFlyoutOpen(false)
    if (session?.tool !== 'smooth') setSmoothStrengthFlyoutOpen(false)
  }, [closeBrushDitherFlyout, renderKey, session?.tool, session?.fillKind])

  useEffect(() => {
    const supportsTolerance = (session?.tool === 'selection' && session.selectionKind === 'magic')
      || session?.tool === 'fill'
    if (!supportsTolerance) setToleranceFlyoutOpen(null)
  }, [session?.tool, session?.selectionKind, session?.fillKind])

  useEffect(() => {
    if (session?.tool !== 'selection') {
      setTemporarySelectionMode(null)
      return
    }
    let shiftHeld = false
    let secondaryHeld = false
    const refresh = (): void => setTemporarySelectionMode(temporarySelectionModeForModifiers(shiftHeld, secondaryHeld))
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Shift') return
      shiftHeld = true
      refresh()
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Shift') return
      shiftHeld = false
      refresh()
    }
    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 2 || !(event.target instanceof Element) || !event.target.closest('.stage-canvas')) return
      secondaryHeld = true
      refresh()
    }
    const pointerUp = (event: PointerEvent): void => {
      if (event.button !== 2) return
      secondaryHeld = false
      refresh()
    }
    const reset = (): void => {
      shiftHeld = false
      secondaryHeld = false
      refresh()
    }
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointerup', pointerUp, true)
    window.addEventListener('pointercancel', reset, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('keyup', keyUp, true)
      window.removeEventListener('pointerdown', pointerDown, true)
      window.removeEventListener('pointerup', pointerUp, true)
      window.removeEventListener('pointercancel', reset, true)
      window.removeEventListener('blur', reset)
    }
  }, [session?.tool])

  useEffect(() => {
    if (session?.tool !== 'liquify') {
      setTemporaryLiquifyMode(null)
      return
    }
    let shiftHeld = false
    const refresh = (): void => setTemporaryLiquifyMode(shiftHeld ? temporaryLiquifyModeForShift(session.liquifyMode, true) : null)
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Shift') return
      shiftHeld = true
      refresh()
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Shift') return
      shiftHeld = false
      refresh()
    }
    const reset = (): void => {
      shiftHeld = false
      refresh()
    }
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('keyup', keyUp, true)
      window.removeEventListener('blur', reset)
    }
  }, [session?.tool, session?.liquifyMode])

  useEffect(() => {
    if (!session || session.tool !== 'pencil' && session.tool !== 'eraser' && session.tool !== 'line' && session.tool !== 'smooth' || session.brushShape !== 'square' && session.brushShape !== 'line' || session.brushImage?.intrinsicSize) setBrushAngleFlyoutOpen(false)
  }, [session?.tool, session?.brushShape, session?.brushImage?.intrinsicSize])

  useEffect(() => {
    const mode = temporaryLiquifyMode ?? session?.liquifyMode
    if (session?.tool !== 'liquify' || mode !== 'push') {
      setLiquifyFlyoutOpen((open) => open === 'smoothing-strength' ? null : open)
    }
  }, [session?.tool, session?.liquifyMode, temporaryLiquifyMode])

  if (!session) return null
  const workspace = useWorkspace.getState()
  const displayedLiquifyMode = temporaryLiquifyMode ?? session.liquifyMode
  const fillKind = session.fillKind ?? 'bucket'
  const gradientDither = session.gradientDither ?? 'none'
  const gradientStops = session.gradientStops ?? [{ position: 0, color: { ...session.primaryColor } }, { position: 1, color: { ...session.secondaryColor } }]
  // Smooth uses the same basic stamp controls as Pencil. Its smoothing
  // algorithm remains distinct, but size, round/square/line stamp choice,
  // pixel cleanup and symmetry must describe one shared brush state.
  const isStrokeBrushTool = session.tool === 'pencil' || session.tool === 'eraser' || session.tool === 'line' || session.tool === 'smooth'
  const isSmoothBrushTool = session.tool === 'smooth'
  const isBucketBrushTool = session.tool === 'fill' && fillKind === 'bucket'
  const isBrushTool = isStrokeBrushTool || isBucketBrushTool
  const activeProceduralBrush = session.brushImage && isProceduralBrushId(session.brushImage.id) ? session.brushImage : null
  const activeLibraryBrush = !isSmoothBrushTool && session.brushImage && !activeProceduralBrush ? session.brushImage : null
  const showBrushAngle = isStrokeBrushTool && session.brushSize > 1 && !activeLibraryBrush?.intrinsicSize && (session.brushShape === 'square' || session.brushShape === 'line')
  const brushDither = session.brushDither ?? DEFAULT_BRUSH_DITHER_SETTINGS
  const brushDitherMaximumStage = ditherStageCount(brushDither.template)
  const supportsSymmetry = session.tool === 'pencil' || session.tool === 'smooth' || session.tool === 'airbrush' || session.tool === 'eraser' || session.tool === 'selection' || session.tool === 'shape' || session.tool === 'line' || (session.tool === 'fill' && fillKind === 'bucket')
  const selectionModeItems = selectionModes(locale)
  const brushPaintModeGroups = [{
    label: t('toolOptions.brushMode'),
    options: [
      { value: 'paint' as const, label: t('toolOptions.brushMode.paint'), description: t('toolOptions.brushMode.paintDescription') },
      { value: 'pattern-source' as const, label: t('toolOptions.brushMode.patternSource'), description: t('toolOptions.brushMode.patternSourceDescription') },
      { value: 'pattern-target' as const, label: t('toolOptions.brushMode.patternTarget'), description: t('toolOptions.brushMode.patternTargetDescription') }
    ]
  }]
  const selectionRotationAlgorithmGroups = [{
    label: t('toolOptions.selectionRotationAlgorithm'),
    options: [
      { value: 'fast' as const, label: t('toolOptions.selectionRotationAlgorithm.fast') },
      { value: 'rotsprite' as const, label: t('toolOptions.selectionRotationAlgorithm.rotsprite') }
    ]
  }]
  const selectionRotationAlgorithmControl = <FormField className="selection-algorithm-control" layout="inline" label={t('toolOptions.selectionRotationAlgorithm')}><ThemedSelect<'fast' | 'rotsprite'> density="compact" value={session.selectionRotationAlgorithm} groups={selectionRotationAlgorithmGroups} label={t('toolOptions.selectionRotationAlgorithm')} popoverWidth={190} onChange={workspace.setSelectionRotationAlgorithm} /></FormField>
  const selectedSliceIds = session.selectedSliceIds?.length ? session.selectedSliceIds : session.selectedSliceId ? [session.selectedSliceId] : []
  const selectedSlice = selectedSliceIds.length === 1 ? session.document.slices?.find((slice) => slice.id === selectedSliceIds[0]) ?? null : null
  const openSliceProperties = (): void => {
    if (selectedSlice) setSliceProperties({ id: selectedSlice.id, x: selectedSlice.x, y: selectedSlice.y, width: selectedSlice.width, height: selectedSlice.height })
  }
  const saveSliceProperties = (): void => {
    if (!sliceProperties) return
    workspace.updateSlice(sliceProperties.id, sliceProperties)
    setSliceProperties(null)
  }
  const closeAutoSlice = (): void => {
    if (autoSliceSettings) publishSlicePreview(session.document.id, null)
    setAutoSliceSettings(null)
  }
  const openAutoSlice = (): void => {
    const settings = { width: Math.min(16, session.document.width), height: Math.min(16, session.document.height), gapX: 0, gapY: 0, startX: 0, startY: 0 }
    setAutoSlicePreviewEnabled(true)
    setAutoSliceSettings(settings)
  }
  const createAutomaticSlices = (): void => {
    if (autoSlicePreview.length === 0 || autoSliceTotal > MAX_AUTO_SLICES) return
    workspace.createSlices(autoSlicePreview)
    closeAutoSlice()
  }
  const updateLineDirectionStep = (value: number): void => {
    const nextValue = parseLineDirectionStep(String(value))
    setLineDirectionStep(nextValue)
    saveEditorPreferences({ ...loadEditorPreferences(), lineDirectionStep: nextValue })
    window.dispatchEvent(new Event('moonsprite:preferences-changed'))
  }
  const toggleBrushLibrary = (): void => {
    window.dispatchEvent(new CustomEvent('moonsprite:toggle-workspace-panel', { detail: { id: 'brushes' } }))
  }
  const chooseBasicBrush = (shape: BrushShape): void => {
    workspace.setBrushImage(null)
    workspace.setBrushTexture('solid')
    workspace.setBrushShape(shape)
    setBasicBrushFlyoutOpen(false)
  }
  const chooseAirbrushShape = (shape: BrushShape): void => {
    workspace.setAirbrushParticleShape(shape)
    setBasicBrushFlyoutOpen(false)
  }
  const chooseStaticTexture = (texture: BrushTexture): void => {
    workspace.setBrushImage(null)
    workspace.setBrushTexture(texture)
  }
  const chooseProceduralTexture = (brushId: ProceduralBrushId): void => {
    const brush = proceduralBrushes.find((item) => item.id === brushId)
    if (!brush) return
    workspace.setBrushTexture('solid')
    workspace.setBrushImage(brush)
  }
  return <PerformanceProfiler id="EditorToolOptions"><div className="tool-options">
    {session.tool === 'eyedropper' && <>
      <div className="eyedropper-current-colors" aria-label={t('toolOptions.eyedropperColors')}>
        <ColorValueControl color={session.primaryColor} density="compact" onChange={workspace.setPrimaryColor} label={t('toolOptions.eyedropperForeground')} roleLabel={t('toolOptions.eyedropperForeground')} className="eyedropper-color-control" storageKey="eyedropper-foreground" fillWithColor />
        <ColorValueControl color={session.secondaryColor} density="compact" onChange={workspace.setSecondaryColor} label={t('toolOptions.eyedropperBackground')} roleLabel={t('toolOptions.eyedropperBackground')} className="eyedropper-color-control" storageKey="eyedropper-background" fillWithColor />
      </div>
      <div className="eyedropper-replace-control">
        <Tooltip content={t('toolOptions.replaceColorHint')}><button type="button" className="tool-text-button eyedropper-replace-trigger" onClick={onOpenColorReplacement}><PixelUtilityIcon kind="refresh" />{t('toolOptions.replaceColor')}</button></Tooltip>
      </div>
    </>}
    {session.tool === 'airbrush' && <div className="airbrush-options">
      <div className="brush-shape-selector">
        <button type="button" className="icon-button brush-preset brush-shape-trigger selected" title={t('toolOptions.airbrushParticleShape')} aria-label={t('toolOptions.airbrushParticleShape')} aria-haspopup="menu" aria-expanded={basicBrushFlyoutOpen} onClick={() => setBasicBrushFlyoutOpen((open) => !open)}><span className="brush-shape-preview"><PixelShapeIcon kind={session.airbrushParticleShape} /></span></button>
        {basicBrushFlyoutOpen && <div className="brush-shape-popover" role="menu" aria-label={t('toolOptions.airbrushParticleShape')}>
          {(['round', 'square', 'line'] as BrushShape[]).map((shape) => <BrushShapePresetButton key={shape} shape={shape} selected={session.airbrushParticleShape === shape} label={t(shape === 'round' ? 'toolOptions.roundBrush' : shape === 'square' ? 'toolOptions.squareBrush' : 'toolOptions.lineBrush')} menuItem onClick={() => chooseAirbrushShape(shape)} />)}
        </div>}
      </div>
      <div className="brush-size-control airbrush-radius-control" onPointerDown={() => setBrushSizeFlyoutOpen(true)}><NumberInput aria-label={t('toolOptions.airbrushScatterRadius')} density="compact" min={1} max={64} suffix="px" value={session.airbrushScatterRadius} onValueChange={workspace.setAirbrushScatterRadius} onFocus={() => setBrushSizeFlyoutOpen(true)} />{brushSizeFlyoutOpen && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.airbrushScatterRadius')}><RangeField ariaLabel={t('toolOptions.airbrushScatterRadius')} density="compact" min={1} max={64} suffix="px" value={session.airbrushScatterRadius} onChange={workspace.setAirbrushScatterRadius} /></div>}</div>
      <FormField className="airbrush-number-field" layout="inline" label={t('toolOptions.airbrushParticleRadius')} tooltip={t('toolOptions.airbrushParticleRadiusHint')}><NumberInput aria-label={t('toolOptions.airbrushParticleRadius')} density="compact" min={1} max={16} suffix="px" value={session.airbrushParticleRadius} onValueChange={workspace.setAirbrushParticleRadius} /></FormField>
      <FormField className="airbrush-number-field" layout="inline" label={t('toolOptions.airbrushDensity')} tooltip={t('toolOptions.airbrushDensityHint')}><NumberInput aria-label={t('toolOptions.airbrushDensity')} density="compact" min={1} max={128} value={session.airbrushDensity} onValueChange={workspace.setAirbrushDensity} /></FormField>
      <FormField className="airbrush-number-field" layout="inline" label={t('toolOptions.airbrushInterval')} tooltip={t('toolOptions.airbrushIntervalHint')}><NumberInput aria-label={t('toolOptions.airbrushInterval')} density="compact" min={16} max={1000} suffix="ms" value={session.airbrushIntervalMs} onValueChange={workspace.setAirbrushIntervalMs} /></FormField>
    </div>}
    {session.tool === 'liquify' && <div className="airbrush-options">
      <div className="selection-mode-control liquify-mode-control" data-temporary={temporaryLiquifyMode !== null && temporaryLiquifyMode !== session.liquifyMode ? 'true' : undefined} role="group" aria-label={t('toolOptions.liquifyMode')}>
        {([
          ['push', 'toolOptions.liquifyPush'],
          ['inflate', 'toolOptions.liquifyInflate'],
          ['deflate', 'toolOptions.liquifyDeflate'],
          ['twist-clockwise', 'toolOptions.liquifyTwistClockwise'],
          ['twist-counter-clockwise', 'toolOptions.liquifyTwistCounterClockwise']
        ] as const).map(([value, labelKey]) => {
          const label = t(labelKey)
          return <button key={value} type="button" className={`icon-button ${displayedLiquifyMode === value ? 'selected' : ''}`} title={label} aria-label={label} aria-pressed={displayedLiquifyMode === value} onPointerDown={(event) => { if (event.pointerType === 'mouse') event.preventDefault() }} onClick={() => workspace.setLiquifyMode(value)}><PixelAssetIcon src={LIQUIFY_MODE_ICONS[value]} /></button>
        })}
      </div>
      <FormField className="airbrush-number-field" layout="inline" label={t('toolOptions.liquifyRadius')}><div className="brush-size-control liquify-value-control" onPointerDown={() => setLiquifyFlyoutOpen('radius')}><NumberInput aria-label={t('toolOptions.liquifyRadius')} density="compact" min={1} max={128} suffix="px" value={session.liquifyRadius} onValueChange={workspace.setLiquifyRadius} onFocus={() => setLiquifyFlyoutOpen('radius')} />{liquifyFlyoutOpen === 'radius' && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.liquifyRadius')}><RangeField ariaLabel={t('toolOptions.liquifyRadius')} density="compact" min={1} max={128} suffix="px" value={session.liquifyRadius} onChange={workspace.setLiquifyRadius} /></div>}</div></FormField>
      <FormField className="airbrush-number-field" layout="inline" label={t('toolOptions.pressureEffectStrength')}><div className="brush-size-control liquify-value-control" onPointerDown={() => setLiquifyFlyoutOpen('strength')}><NumberInput aria-label={t('toolOptions.pressureEffectStrength')} density="compact" min={1} max={100} suffix="%" value={session.liquifyStrength} onValueChange={workspace.setLiquifyStrength} onFocus={() => setLiquifyFlyoutOpen('strength')} />{liquifyFlyoutOpen === 'strength' && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.pressureEffectStrength')}><RangeField ariaLabel={t('toolOptions.pressureEffectStrength')} density="compact" min={1} max={100} suffix="%" value={session.liquifyStrength} onChange={workspace.setLiquifyStrength} /></div>}</div></FormField>
      {displayedLiquifyMode === 'push' && <>
        <CheckboxField className="tool-checkbox" checked={session.liquifySmoothing} label={t('toolOptions.liquifySmoothing')} tooltip={t('toolOptions.liquifySmoothingHint')} onChange={workspace.setLiquifySmoothing} />
        {session.liquifySmoothing && <FormField className="airbrush-number-field" layout="inline" label={t('toolOptions.pressureEffectStrength')}><div className="brush-size-control liquify-value-control" onPointerDown={() => setLiquifyFlyoutOpen('smoothing-strength')}><NumberInput aria-label={t('toolOptions.pressureEffectStrength')} density="compact" min={0} max={100} suffix="%" value={session.liquifySmoothingStrength} onValueChange={workspace.setLiquifySmoothingStrength} onFocus={() => setLiquifyFlyoutOpen('smoothing-strength')} />{liquifyFlyoutOpen === 'smoothing-strength' && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.pressureEffectStrength')}><RangeField ariaLabel={t('toolOptions.pressureEffectStrength')} density="compact" min={0} max={100} suffix="%" value={session.liquifySmoothingStrength} onChange={workspace.setLiquifySmoothingStrength} /></div>}</div></FormField>}
      </>}
      <button type="button" className="quiet-button" disabled={session.liquifyResetHistoryPosition == null || session.history.position <= session.liquifyResetHistoryPosition} onClick={() => window.dispatchEvent(new CustomEvent(LIQUIFY_RESET_COMMAND_EVENT, { detail: { documentId: session.document.id } }))}>{t('common.reset')}</button>
    </div>}
    {isBrushTool && <>
      {isStrokeBrushTool && <div className="brush-shape-selector">
        <button type="button" className={`icon-button brush-preset brush-shape-trigger ${!activeLibraryBrush ? 'selected' : ''}`} title={t('toolOptions.basicBrushes')} aria-label={t('toolOptions.basicBrushes')} aria-haspopup="menu" aria-expanded={basicBrushFlyoutOpen} onClick={() => setBasicBrushFlyoutOpen((open) => !open)}><span className="brush-shape-preview" style={{ transform: `rotate(${showBrushAngle ? session.brushAngle : 0}deg)` }}><PixelShapeIcon kind={session.brushShape} /></span></button>
        {basicBrushFlyoutOpen && <div className="brush-shape-popover" role="menu" aria-label={t('toolOptions.basicBrushes')}>
          {(['round', 'square', 'line'] as BrushShape[]).map((shape) => <BrushShapePresetButton key={shape} shape={shape} selected={!activeLibraryBrush && session.brushShape === shape} label={t(shape === 'round' ? 'toolOptions.roundBrush' : shape === 'square' ? 'toolOptions.squareBrush' : 'toolOptions.lineBrush')} angle={shape === 'square' || shape === 'line' ? session.brushAngle : 0} menuItem onClick={() => chooseBasicBrush(shape)} />)}
        </div>}
      </div>}
      {isStrokeBrushTool && !isSmoothBrushTool && <>
        <div className="brush-dither-control">
          <button ref={brushDitherTriggerRef} type="button" className={`icon-button brush-dither-trigger ${brushDither.enabled && !activeLibraryBrush ? 'selected' : ''}`} title={t('toolOptions.brushDither')} aria-label={t('toolOptions.brushDither')} aria-haspopup="dialog" aria-expanded={brushDitherFlyoutOpen} aria-pressed={brushDither.enabled && !activeLibraryBrush} disabled={Boolean(activeLibraryBrush)} onClick={() => {
            if (brushDitherFlyoutOpen) closeBrushDitherFlyout()
            else {
              brushDitherResidentRef.current = false
              brushDitherPositionedRef.current = false
              setBrushDitherResident(false)
              setBrushDitherFlyoutOpen(true)
            }
          }}><PixelUtilityIcon kind="dither" /></button>
        </div>
        {brushDitherFlyoutOpen && createPortal(<div ref={brushDitherPopoverRef} className={`brush-dither-popover ${brushDitherResident ? 'resident' : 'transient'}`} role="dialog" aria-label={t('toolOptions.brushDither')} style={{ ...brushDitherPopoverPosition, zIndex: brushDitherWindowStack.zIndex }} onPointerDownCapture={brushDitherWindowStack.bringToFront} onFocusCapture={brushDitherWindowStack.bringToFront}>
          <header className="brush-dither-titlebar" onPointerDown={(event) => {
            if (event.button !== 0 || (event.target as HTMLElement).closest('button') || !brushDitherPopoverRef.current) return
            const bounds = brushDitherPopoverRef.current.getBoundingClientRect()
            brushDitherDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, left: bounds.left, top: bounds.top }
            event.preventDefault()
          }}><strong>{t('toolOptions.brushDither')}</strong><button type="button" className="icon-button" aria-label={`${t('common.close')} ${t('toolOptions.brushDither')}`} onClick={closeBrushDitherFlyout}><PixelUtilityIcon kind="close" /></button></header>
          <div className="brush-dither-template-grid" role="group" aria-label={t('toolOptions.brushDitherTemplate')}>
            {BRUSH_DITHER_TEMPLATES.map((template) => {
              const previewSettings = brushDitherSettingsForTemplate(brushDither, template)
              const label = t(template === 'bayer-2'
                ? 'toolOptions.gradientDither.bayer2'
                : template === 'bayer-4'
                  ? 'toolOptions.gradientDither.bayer4'
                  : template === 'bayer-8'
                    ? 'toolOptions.gradientDither.bayer8'
                    : template === 'diagonal'
                      ? 'toolOptions.gradientDither.diagonalLeft'
                      : template === 'diagonal-reverse'
                        ? 'toolOptions.gradientDither.diagonalRight'
                        : `toolOptions.gradientDither.${template}` as TranslationKey)
              const selected = brushDither.enabled && brushDither.template === template
              return <button key={template} type="button" className={selected ? 'selected' : ''} aria-pressed={selected} title={label} onClick={() => workspace.setBrushDither(selected ? { ...brushDither, enabled: false } : previewSettings)}><BrushDitherPreview template={template} stage={previewSettings.stage} /><span>{label}</span></button>
            })}
          </div>
          <div className="brush-dither-stage">
            <span>{t('toolOptions.brushDitherStage')}</span>
            <span className="brush-dither-stage-stepper" role="group" aria-label={t('toolOptions.brushDitherStage')}>
              <button type="button" aria-label={t('toolOptions.brushDitherPreviousStage')} disabled={!brushDither.enabled} onClick={() => workspace.setBrushDither({ ...brushDither, stage: Math.max(1, brushDither.stage - 1) })}><PixelUtilityIcon kind="left" /></button>
              <output aria-live="polite">{brushDither.stage}/{brushDitherMaximumStage}</output>
              <button type="button" aria-label={t('toolOptions.brushDitherNextStage')} disabled={!brushDither.enabled} onClick={() => workspace.setBrushDither({ ...brushDither, stage: Math.min(brushDitherMaximumStage, brushDither.stage + 1) })}><PixelUtilityIcon kind="right" /></button>
            </span>
          </div>
        </div>, document.body)}
      </>}
      {isBucketBrushTool && <div className="fill-texture-control">
        <button type="button" className={`fill-texture-trigger ${fillTextureOpen ? 'selected' : ''}`} title={t('toolOptions.fillTexture')} aria-label={t('toolOptions.fillTexture')} aria-expanded={fillTextureOpen} onClick={() => setFillTextureOpen((open) => !open)}>{activeProceduralBrush ? <BrushThumbnail source={pixelSource(activeProceduralBrush)} className="fill-texture-coverage-thumbnail" /> : <BrushTextureThumbnail texture={activeLibraryBrush ? 'solid' : session.brushTexture} />}</button>
        {fillTextureOpen && <div className="fill-texture-popover" role="dialog" aria-label={t('toolOptions.fillTexture')}>
          <header><strong>{t('toolOptions.systemTextures')}</strong><small>{t('toolOptions.fillOnly')}</small></header>
          <div className="fill-texture-grid">
            {(['solid', 'cracks', 'wood', 'grain'] as BrushTexture[]).map((texture) => <button key={texture} type="button" className={!activeLibraryBrush && !activeProceduralBrush && session.brushTexture === texture ? 'selected' : ''} title={t(`toolOptions.texture.${texture}`)} aria-label={t(`toolOptions.texture.${texture}`)} onClick={() => chooseStaticTexture(texture)}><BrushTextureThumbnail texture={texture} /><span>{t(`toolOptions.texture.${texture}`)}</span></button>)}
            {proceduralBrushes.map((brush) => <button key={brush.id} type="button" className={activeProceduralBrush?.id === brush.id ? 'selected' : ''} title={brush.name} aria-label={brush.name} onClick={() => chooseProceduralTexture(brush.id as ProceduralBrushId)}><BrushThumbnail source={pixelSource(brush)} className="fill-texture-coverage-thumbnail" /><span>{brush.name}</span></button>)}
          </div>
          {!activeLibraryBrush && !activeProceduralBrush && session.brushTexture !== 'solid' && <RangeField className="fill-texture-scale" density="compact" label={t('toolOptions.textureScale')} min={1} max={16} suffix="px" value={session.brushTextureScale} onChange={workspace.setBrushTextureScale} />}
          {activeProceduralBrush && <div className="fill-procedural-settings"><ProceduralBrushControls brushId={activeProceduralBrush.id as ProceduralBrushId} settings={session.proceduralBrushSettings[activeProceduralBrush.id as ProceduralBrushId]} onChange={workspace.setProceduralBrushSettings} /><div className="procedural-output-controls"><PreferenceToggle className="procedural-dither-toggle" checked={session.brushImageSettings.mode === 'dither'} label={t('toolOptions.textureDither')} tooltip={t('toolOptions.textureDitherHint')} onChange={(enabled) => workspace.setBrushImageSettings({ mode: enabled ? 'dither' : 'threshold' })} /><div className="procedural-antialias-control"><CheckboxField className="tool-checkbox" checked={session.proceduralAntialias} label={t('toolOptions.textureAntialiasing')} onChange={workspace.setProceduralAntialias} />{session.proceduralAntialias && <RangeField className="procedural-antialias-strength" density="compact" label={t('toolOptions.amount')} min={1} max={100} suffix="%" value={session.proceduralAntialiasStrength} onChange={workspace.setProceduralAntialiasStrength} />}</div></div></div>}
        </div>}
      </div>}
      {!isSmoothBrushTool && <button type="button" className={`brush-library-trigger ${activeLibraryBrush ? 'selected' : ''}`} title={t('toolOptions.openBrushLibrary')} aria-label={t('toolOptions.openBrushLibrary')} onClick={toggleBrushLibrary}>{activeLibraryBrush ? <BrushThumbnail source={pixelSource(activeLibraryBrush)} /> : <PixelUtilityIcon kind="image" />}</button>}
      {isStrokeBrushTool && !activeLibraryBrush?.intrinsicSize && <div className="brush-size-control" onPointerDown={() => setBrushSizeFlyoutOpen(true)}><NumberInput aria-label={t('toolOptions.brushSizeValue')} density="compact" min={1} max={128} suffix="px" value={session.brushSize} onValueChange={workspace.setBrushSize} onFocus={() => setBrushSizeFlyoutOpen(true)} />{brushSizeFlyoutOpen && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.adjustBrushSize')}><RangeField ariaLabel={t('toolOptions.brushSizeSlider')} density="compact" min={1} max={128} suffix="px" value={session.brushSize} onChange={workspace.setBrushSize} /></div>}</div>}
      {isSmoothBrushTool && <FormField className="smooth-strength-field" layout="inline" label={t('toolOptions.pressureEffectStrength')}><div className="brush-size-control smooth-strength-control" onPointerDown={() => setSmoothStrengthFlyoutOpen(true)}><NumberInput aria-label={t('toolOptions.pressureEffectStrength')} density="compact" min={0} max={100} suffix="%" value={session.smoothStrength} onValueChange={workspace.setSmoothStrength} onFocus={() => setSmoothStrengthFlyoutOpen(true)} />{smoothStrengthFlyoutOpen && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.pressureEffectStrength')}><RangeField ariaLabel={t('toolOptions.pressureEffectStrength')} density="compact" min={0} max={100} suffix="%" value={session.smoothStrength} onChange={workspace.setSmoothStrength} /></div>}</div></FormField>}
      {showBrushAngle && <div className="brush-size-control brush-angle-control" title={t('toolOptions.brushRotation')} onPointerDown={() => setBrushAngleFlyoutOpen(true)}><NumberInput aria-label={t('toolOptions.brushRotationValue')} density="compact" min={-180} max={180} step={1} suffix="°" value={Math.round(session.brushAngle)} onValueChange={workspace.setBrushAngle} onFocus={() => setBrushAngleFlyoutOpen(true)} />{brushAngleFlyoutOpen && <div className="brush-size-popover" role="dialog" aria-label={t('toolOptions.adjustBrushRotation')}><RangeField ariaLabel={t('toolOptions.brushRotationSlider')} density="compact" min={-180} max={180} step={1} suffix="°" value={Math.round(session.brushAngle)} onChange={workspace.setBrushAngle} /></div>}</div>}
      {activeLibraryBrush?.intrinsicSize && <span className="brush-paint-mode-select" title={t('toolOptions.brushModeHint')}><ThemedSelect<BrushPaintMode> density="compact" value={session.brushPaintMode} groups={brushPaintModeGroups} label={t('toolOptions.brushMode')} popoverWidth={148} onChange={workspace.setBrushPaintMode} /></span>}
      {session.tool === 'pencil' && <FormField className="line-direction-step-control" layout="inline" label={t('toolOptions.lineDirectionStep')} tooltip={t('toolOptions.lineDirectionStepHint')}><NumberInput aria-label={t('toolOptions.lineDirectionStep')} density="compact" min={1} max={16} value={lineDirectionStep} onValueChange={updateLineDirectionStep} /></FormField>}
      {(session.tool === 'pencil' || session.tool === 'smooth' || session.tool === 'eraser' || session.tool === 'line') && <CheckboxField className="tool-checkbox" checked={session.perfectPixels} label={t('toolOptions.perfectPixels')} onChange={workspace.setPerfectPixels} />}
      {(session.tool === 'pencil' || session.tool === 'smooth' || session.tool === 'eraser') && <div ref={pressureControlRef} className="pressure-control">
      <Tooltip content={t('toolOptions.brushDynamicsDescription')}><button className={`pressure-trigger icon-button ${session.brushDynamics.effects.size.sensor || session.brushDynamics.effects.strength.sensor || session.brushDynamics.effects.gradient.sensor || session.brushDynamics.effects.angle.sensor ? 'selected' : ''}`} type="button" aria-label={t('toolOptions.brushDynamics')} title={t('toolOptions.brushDynamics')} aria-expanded={pressureFlyoutOpen} onClick={() => setPressureFlyoutOpen((open) => !open)}><PixelPressureIcon /></button></Tooltip>
        {pressureFlyoutOpen && pressurePopoverPosition && createPortal(<div className="pressure-popover" role="dialog" aria-label={t('toolOptions.brushDynamicsSettings')} style={pressurePopoverPosition}><BrushDynamicsSettingsPanel settings={session.brushDynamics} tool={session.tool} intrinsicSize={Boolean(session.brushImage?.intrinsicSize)} brushSize={session.brushSize} documentId={session.document.id} primaryColor={session.primaryColor} secondaryColor={session.secondaryColor} onChange={workspace.setBrushDynamicsMapping} onGradientDitherChange={workspace.setBrushDynamicsGradientDither} availableEffects={session.tool === 'smooth' ? ['size', 'angle'] : undefined} /></div>, document.body)}
      </div>}
    </>}
    {session.tool === 'selection' && (session.selectionPropertiesActive || session.freeTransformActive) && session.selection ? (() => {
      const target = session.pendingPaste?.transformTarget ?? session.selection
      const angle = session.pendingPaste?.transformAngle ?? session.selectionAngle ?? 0
      const shear = session.pendingPaste?.transformShear
      const shearReference = shear?.axis === 'x' ? Math.max(1, target.height) : Math.max(1, target.width)
      const shearAngle = shear ? Math.round(Math.atan(shear.amount / shearReference) * 1800 / Math.PI) / 10 : 0
      return <div className="selection-properties" aria-label={t('toolOptions.selectionProperties')}>
        <FormField className="selection-properties-field" layout="inline" label="X"><NumberInput aria-label="X" density="compact" value={target.x} onValueChange={(x) => workspace.updateSelectionProperties({ x })} /></FormField>
        <FormField className="selection-properties-field" layout="inline" label="Y"><NumberInput aria-label="Y" density="compact" value={target.y} onValueChange={(y) => workspace.updateSelectionProperties({ y })} /></FormField>
        <FormField className="selection-properties-field" layout="inline" label={t('common.width')}><NumberInput aria-label={t('common.width')} density="compact" min={1} value={target.width} onValueChange={(width) => workspace.updateSelectionProperties(session.selectionAspectRatio == null ? { width } : { width, height: Math.max(1, Math.round(width / session.selectionAspectRatio)) })} /></FormField>
        <button type="button" className={`icon-button selection-aspect-link ${session.selectionAspectRatio != null && !session.freeTransformActive ? 'selected' : ''}`.trim()} title={t(session.selectionAspectRatio != null ? 'imageResize.unlockRatio' : 'imageResize.lockRatio')} aria-label={t(session.freeTransformActive ? 'imageResize.lockRatio' : session.selectionAspectRatio != null ? 'imageResize.unlockRatio' : 'imageResize.lockRatio')} aria-pressed={session.selectionAspectRatio != null && !session.freeTransformActive} disabled={session.freeTransformActive} onClick={() => workspace.setSelectionAspectRatio(session.selectionAspectRatio == null ? target.width / Math.max(1, target.height) : null)}><PixelUtilityIcon kind="aspectLink" /></button>
        <FormField className="selection-properties-field" layout="inline" label={t('common.height')}><NumberInput aria-label={t('common.height')} density="compact" min={1} value={target.height} onValueChange={(height) => workspace.updateSelectionProperties(session.selectionAspectRatio == null ? { height } : { width: Math.max(1, Math.round(height * session.selectionAspectRatio)), height })} /></FormField>
        <FormField className="selection-properties-field selection-angle-field" layout="inline" label={t('toolOptions.selectionRotation')}><SelectionAngleControl value={angle} inputLabel={t('toolOptions.selectionRotation')} sliderLabel={t('toolOptions.selectionRotation')} min={-180} max={180} onChange={(nextAngle) => workspace.updateSelectionProperties({ angle: nextAngle })} /></FormField>
        <FormField className="selection-properties-field selection-angle-field" layout="inline" label={t('toolOptions.selectionShearAngle')}><SelectionAngleControl value={shearAngle} inputLabel={t('toolOptions.selectionShearAngle')} sliderLabel={t('toolOptions.selectionShearAngle')} min={-89} max={89} onChange={(nextAngle) => workspace.updateSelectionProperties({ shearAngle: nextAngle })} /></FormField>
        <SelectionPivotControls
          target={selectionPivotControlTarget(target)}
          angle={angle}
          shear={shear}
          pivot={session.selectionPivot ?? null}
          visible={session.view.showSelectionPivot !== false}
          onPivotChange={workspace.setSelectionPivot}
          onVisibleChange={(showSelectionPivot) => workspace.setView({ showSelectionPivot })}
        />
        <button type="button" className="icon-button selection-shrink-button" title={t('toolOptions.shrinkSelection')} aria-label={t('toolOptions.shrinkSelection')} onClick={workspace.shrinkSelectionToContent}><PixelAssetIcon src={selectionShrinkIcon} /></button>
        {selectionRotationAlgorithmControl}
      </div>
    })() : session.tool === 'selection' && <>
      <div className="selection-mode-control" aria-label={t('toolOptions.selectionMode')}>{selectionModeItems.map((mode) => <button key={mode.id} title={mode.label} aria-label={mode.label} className={`icon-button ${(temporarySelectionMode ?? session.selectionMode) === mode.id ? 'selected' : ''}`} onClick={() => workspace.setSelectionMode(mode.id)}><PixelAssetIcon src={mode.icon} /></button>)}</div>
      <SelectionPivotControls
        target={selectionPivotControlTarget(session.pendingPaste?.transformTarget ?? session.selection)}
        angle={session.pendingPaste?.transformAngle ?? 0}
        shear={session.pendingPaste?.transformShear}
        pivot={session.selectionPivot ?? null}
        visible={session.view.showSelectionPivot !== false}
        onPivotChange={workspace.setSelectionPivot}
        onVisibleChange={(showSelectionPivot) => workspace.setView({ showSelectionPivot })}
      />
      <button
        type="button"
        className="icon-button selection-shrink-button"
        title={t('toolOptions.shrinkSelection')}
        aria-label={t('toolOptions.shrinkSelection')}
        disabled={!session.selection}
        onClick={workspace.shrinkSelectionToContent}
      ><PixelAssetIcon src={selectionShrinkIcon} /></button>
      {session.selectionKind === 'rectangle' && <div className="corner-radius-control"><CheckboxField className="tool-checkbox" checked={session.selectionRounded} label={t('toolOptions.roundedCorners')} onChange={workspace.setSelectionRounded} />{session.selectionRounded && <NumberInput aria-label={t('toolOptions.cornerRadius')} density="compact" min={0} max={256} suffix="px" value={session.selectionCornerRadius} onValueChange={workspace.setSelectionCornerRadius} />}</div>}
      {session.selectionKind === 'magic' && <><ToleranceControl value={session.wandTolerance} open={toleranceFlyoutOpen === 'wand'} label={t('toolOptions.tolerance')} inputLabel={t('toolOptions.magicWandTolerance')} sliderLabel={t('toolOptions.magicWandToleranceSlider')} onOpen={() => setToleranceFlyoutOpen('wand')} onChange={workspace.setWandTolerance} /><CheckboxField className="tool-checkbox" aria-label={t('toolOptions.contiguousSelection')} checked={session.wandContiguous} label={t('toolOptions.contiguous')} onChange={workspace.setWandContiguous} />{session.wandContiguous && <GapClosingControls enabled={session.wandGapClosing} threshold={session.wandGapThreshold} open={toleranceFlyoutOpen === 'wand-gap'} onEnabledChange={workspace.setWandGapClosing} onThresholdChange={workspace.setWandGapThreshold} onOpen={() => setToleranceFlyoutOpen('wand-gap')} />}</>}
      {selectionRotationAlgorithmControl}
    </>}
    {session.tool === 'shape' && (session.shapeKind === 'rectangle' || session.shapeKind === 'rectangle-outline') && <div className="corner-radius-control"><CheckboxField className="tool-checkbox" checked={session.shapeRounded} label={t('toolOptions.roundedCorners')} onChange={workspace.setShapeRounded} />{session.shapeRounded && <NumberInput aria-label={t('toolOptions.cornerRadius')} density="compact" min={0} max={256} suffix="px" value={session.shapeCornerRadius} onValueChange={workspace.setShapeCornerRadius} />}</div>}
    {session.tool === 'shape' && (session.shapeKind === 'rectangle' || session.shapeKind === 'rectangle-outline' || session.shapeKind === 'ellipse' || session.shapeKind === 'ellipse-outline') && <div className="shape-ratio-control"><CheckboxField className="tool-checkbox" checked={session.shapeRatio !== null} label={t('toolOptions.fixedRatio')} onChange={(checked) => workspace.setShapeRatio(checked ? { width: 1, height: 1 } : null)} />{session.shapeRatio !== null && <div className="shape-ratio-inputs"><NumberInput aria-label={t('toolOptions.shapeWidthRatio')} density="compact" min={0.1} max={100} step={0.1} value={session.shapeRatio.width} onValueChange={(width) => workspace.setShapeRatio({ ...session.shapeRatio!, width })} /><span>:</span><NumberInput aria-label={t('toolOptions.shapeHeightRatio')} density="compact" min={0.1} max={100} step={0.1} value={session.shapeRatio.height} onValueChange={(height) => workspace.setShapeRatio({ ...session.shapeRatio!, height })} /><button type="button" className="icon-button shape-ratio-swap" title={t('toolOptions.swapRatio')} aria-label={t('toolOptions.swapRatio')} onClick={() => workspace.setShapeRatio({ width: session.shapeRatio!.height, height: session.shapeRatio!.width })}><PixelUtilityIcon kind="swap" /></button></div>}</div>}
    {session.tool === 'line' && session.lineKind === 'curve' && <FormField className="curve-anchor-count-control" layout="inline" label={t('toolOptions.curveAnchorCount')} tooltip={t('toolOptions.curveAnchorCountHint')}><NumberInput aria-label={t('toolOptions.curveAnchorCount')} density="compact" min={1} max={8} value={session.curveAnchorCount} onValueChange={workspace.setCurveAnchorCount} /></FormField>}
    {session.tool === 'fill' && fillKind === 'bucket' && <><ToleranceControl value={session.fillTolerance} open={toleranceFlyoutOpen === 'fill'} label={t('toolOptions.tolerance')} inputLabel={t('toolOptions.fillTolerance')} sliderLabel={t('toolOptions.fillToleranceSlider')} onOpen={() => setToleranceFlyoutOpen('fill')} onChange={workspace.setFillTolerance} /><CheckboxField className="tool-checkbox" aria-label={t('toolOptions.contiguousFill')} checked={session.fillMode === 'contiguous'} label={t('toolOptions.contiguous')} onChange={(checked) => workspace.setFillMode(checked ? 'contiguous' : 'global')} />{session.fillMode === 'contiguous' && <GapClosingControls enabled={session.fillGapClosing} threshold={session.fillGapThreshold} open={toleranceFlyoutOpen === 'fill-gap'} onEnabledChange={workspace.setFillGapClosing} onThresholdChange={workspace.setFillGapThreshold} onOpen={() => setToleranceFlyoutOpen('fill-gap')} />}</>}
    {session.tool === 'fill' && fillKind === 'gradient' && <>
      <div className="gradient-type-control" role="group" aria-label={t('toolOptions.gradientType')}>{([
        { value: 'linear', label: t('toolOptions.gradientLinear') },
        { value: 'radial', label: t('toolOptions.gradientRadial') }
      ] as const).map((option) => <Tooltip key={option.value} className="gradient-type-button-tooltip" content={option.label}><button type="button" className={`icon-button ${session.gradientType === option.value ? 'selected' : ''}`.trim()} aria-label={option.label} aria-pressed={session.gradientType === option.value} onClick={() => workspace.setGradientType(option.value)}><PixelAssetIcon src={GRADIENT_TYPE_ICONS[option.value]} /></button></Tooltip>)}</div>
      <ToleranceControl value={session.gradientTolerance} open={toleranceFlyoutOpen === 'gradient'} label={t('toolOptions.tolerance')} inputLabel={t('toolOptions.gradientTolerance')} sliderLabel={t('toolOptions.gradientToleranceSlider')} onOpen={() => setToleranceFlyoutOpen('gradient')} onChange={workspace.setGradientTolerance} />
      <CheckboxField className="tool-checkbox" aria-label={t('toolOptions.contiguousGradient')} checked={session.gradientContiguous} label={t('toolOptions.contiguous')} onChange={workspace.setGradientContiguous} />
      <GradientDitherSelect className="gradient-dither-select" value={gradientDither} density="compact" onChange={workspace.setGradientDither} />
      <div className="gradient-freeform-control"><button type="button" className="tool-text-button gradient-freeform-open" onClick={() => { if (!session.gradientFreeform) workspace.setGradientFreeform(true); setGradientStopsOpen(true) }}>{t('toolOptions.gradientFreeform')}</button></div>
      <GradientStopsEditor open={gradientStopsOpen && Boolean(session.gradientFreeform)} stops={gradientStops} disabled={false} primaryColor={session.primaryColor} secondaryColor={session.secondaryColor} onChange={workspace.setGradientStops} onClose={() => setGradientStopsOpen(false)} t={t} />
    </>}
    {supportsSymmetry && <SymmetryControls key={session.tool} axes={session.symmetryAxes} onAxisToggle={workspace.setSymmetryAxis} onResetCenter={workspace.resetSymmetryCenter} />}
    {session.tool === 'move' && session.moveKind === 'move' && <CheckboxField className="tool-checkbox" checked={session.moveAutoSelect} label={t('toolOptions.autoSelectLayer')} onChange={workspace.setMoveAutoSelect} />}
    {session.tool === 'move' && session.moveKind === 'slice' && <><FormField className="slice-name-control" layout="inline" label={t('toolOptions.sliceName')}><TextInput density="compact" disabled={!selectedSlice} placeholder={t('toolOptions.sliceNamePlaceholder')} value={selectedSlice?.name ?? ''} onChange={(event) => { if (selectedSlice) workspace.updateSlice(selectedSlice.id, { name: event.target.value }) }} /></FormField><span className="slice-tool-actions"><button type="button" className="icon-button" title={t('toolOptions.autoSlice')} aria-label={t('toolOptions.autoSlice')} onClick={openAutoSlice}><PixelUtilityIcon kind="autoSlice" /></button><button type="button" className="tool-text-button" disabled={!session.document.slices?.length} onClick={workspace.selectAllSlices}>{t('toolOptions.sliceSelectAll')}</button><button type="button" className="icon-button" title={t('toolOptions.sliceProperties')} aria-label={t('toolOptions.sliceProperties')} disabled={!selectedSlice} onClick={openSliceProperties}><PixelUtilityIcon kind="properties" /></button><button type="button" className="icon-button" title={t('common.delete')} aria-label={t('common.delete')} disabled={selectedSliceIds.length === 0} onClick={() => workspace.deleteSlices(selectedSliceIds)}><PixelUtilityIcon kind="delete" /></button></span></>}
    {session.tool === 'rotate' && <div className="rotate-view-options"><FormField className="tool-inline-field" layout="inline" label={t('toolOptions.rotation')}><NumberInput aria-label={t('toolOptions.rotation')} density="compact" min={0} max={359.9} step={0.1} value={Math.round(session.view.rotation * 10) / 10} onValueChange={(rotation) => workspace.setView({ rotation: ((rotation % 360) + 360) % 360 })} /></FormField><button type="button" className="tool-text-button" onClick={() => workspace.setView({ rotation: 0 })}>{t('toolOptions.resetView')}</button></div>}
    <span className="tool-options-spacer" />
    <span className="tool-history-actions"><button className="tool-text-button" onClick={() => workspace.undo()} disabled={!session.history.canUndo}><PixelUtilityIcon kind="undo" />{t('common.undo')}</button><button className="tool-text-button" onClick={() => workspace.redo()} disabled={!session.history.canRedo}><PixelUtilityIcon kind="redo" />{t('common.redo')}</button></span>
    {sliceProperties && createPortal(<div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setSliceProperties(null) }}><ModalShell as="form" storageKey="slice-properties" defaultWidth={360} defaultHeight={270} minWidth={320} minHeight={250} maxWidth={440} maxHeight={340} resizable={false} className="slice-properties-modal" onSubmit={(event) => { event.preventDefault(); saveSliceProperties() }}><DialogHeader eyebrow="SLICE PROPERTIES" title={t('toolOptions.sliceProperties')} closeLabel={t('common.close')} onClose={() => setSliceProperties(null)} /><div className="modal-body slice-properties-grid"><FormField label="X"><NumberInput autoFocus min={0} max={Math.max(0, session.document.width - 1)} value={sliceProperties.x} onValueChange={(x) => setSliceProperties({ ...sliceProperties, x })} /></FormField><FormField label="Y"><NumberInput min={0} max={Math.max(0, session.document.height - 1)} value={sliceProperties.y} onValueChange={(y) => setSliceProperties({ ...sliceProperties, y })} /></FormField><FormField label={t('common.width')}><NumberInput min={1} max={session.document.width} suffix="px" value={sliceProperties.width} onValueChange={(width) => setSliceProperties({ ...sliceProperties, width })} /></FormField><FormField label={t('common.height')}><NumberInput min={1} max={session.document.height} suffix="px" value={sliceProperties.height} onValueChange={(height) => setSliceProperties({ ...sliceProperties, height })} /></FormField></div><footer><button type="button" className="quiet-button" onClick={() => setSliceProperties(null)}>{t('common.cancel')}</button><button type="submit" className="primary-button">{t('common.apply')}</button></footer></ModalShell></div>, document.body)}
    {autoSliceSettings && createPortal(<div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closeAutoSlice() }}><ModalShell as="form" storageKey="auto-slice-v2" defaultWidth={420} defaultHeight={300} minWidth={380} minHeight={280} maxWidth={500} maxHeight={380} resizable={false} className="auto-slice-modal" onSubmit={(event) => { event.preventDefault(); createAutomaticSlices() }}><DialogHeader eyebrow="AUTO SLICE" title={t('toolOptions.autoSlice')} closeLabel={t('common.close')} onClose={closeAutoSlice} /><div className="modal-body auto-slice-body"><div className="auto-slice-grid"><FormField label={t('common.width')}><NumberInput autoFocus min={1} max={session.document.width} suffix="px" value={autoSliceSettings.width} onValueChange={(width) => setAutoSliceSettings({ ...autoSliceSettings, width })} /></FormField><FormField label={t('common.height')}><NumberInput min={1} max={session.document.height} suffix="px" value={autoSliceSettings.height} onValueChange={(height) => setAutoSliceSettings({ ...autoSliceSettings, height })} /></FormField><FormField label={t('toolOptions.autoSliceGapX')}><NumberInput min={0} max={session.document.width} suffix="px" value={autoSliceSettings.gapX} onValueChange={(gapX) => setAutoSliceSettings({ ...autoSliceSettings, gapX })} /></FormField><FormField label={t('toolOptions.autoSliceGapY')}><NumberInput min={0} max={session.document.height} suffix="px" value={autoSliceSettings.gapY} onValueChange={(gapY) => setAutoSliceSettings({ ...autoSliceSettings, gapY })} /></FormField><FormField label={t('toolOptions.autoSliceStartX')}><NumberInput min={0} max={Math.max(0, session.document.width - 1)} suffix="px" value={autoSliceSettings.startX} onValueChange={(startX) => setAutoSliceSettings({ ...autoSliceSettings, startX })} /></FormField><FormField label={t('toolOptions.autoSliceStartY')}><NumberInput min={0} max={Math.max(0, session.document.height - 1)} suffix="px" value={autoSliceSettings.startY} onValueChange={(startY) => setAutoSliceSettings({ ...autoSliceSettings, startY })} /></FormField></div><div className="auto-slice-status"><p className={`auto-slice-count ${autoSliceTotal > MAX_AUTO_SLICES ? 'is-error' : ''}`}>{autoSliceTotal > MAX_AUTO_SLICES ? t('toolOptions.autoSliceTooMany', { count: autoSliceTotal, limit: MAX_AUTO_SLICES }) : t('toolOptions.autoSliceCount', { count: autoSliceTotal })}</p><LivePreviewToggle className="auto-slice-preview-toggle" checked={autoSlicePreviewEnabled} onChange={setAutoSlicePreviewEnabled} /></div></div><footer><button type="button" className="quiet-button" onClick={closeAutoSlice}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={autoSlicePreview.length === 0 || autoSliceTotal > MAX_AUTO_SLICES}>{t('toolOptions.autoSliceCreate')}</button></footer></ModalShell></div>, document.body)}
  </div></PerformanceProfiler>
})
