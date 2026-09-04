import { createPortal } from 'react-dom'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PaletteEntry, RgbaColor, ToolId } from '@shared/types'
import { clampByte } from '@/core/raster'
import { colorFromValues, colorToValues, colorValueFields, colorValueModeLabel, displayRgbaHex, parseRgbaHex, type ColorValueMode } from '@/core/color-values'
import { NumberInput } from './NumberInput'
import { PanelResizeHandles, useFloatingWindowStack, type ResizeDirection } from './floating-panel'
import { useI18n } from '@/components/I18nProvider'
import { loadEditorPreferences } from '@/core/file-preferences'
import { paletteMarkerColor } from '@/core/palette-layout'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { CANVAS_COLOR_SAMPLED_EVENT, CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, type CanvasColorSampledDetail } from './color-sampling-events'
import { normalEditorToolIconFor, PixelAssetIcon, TOOL_DEFINITIONS } from './app/editor-tools'
import { useWorkspace } from '@/store/workspace'
import { PreferenceSearchContext } from './PreferenceSearchContext'

interface ColorValueControlProps {
  color: RgbaColor
  density?: 'compact' | 'regular' | 'emphasized'
  onChange: (color: RgbaColor) => void
  onCommit?: (color: RgbaColor) => void
  label: string
  roleLabel?: string
  className?: string
  storageKey?: string
  inPalette?: boolean
  onAddToPalette?: () => void
  addToPaletteShortcut?: string
  fillWithColor?: boolean
  dismissOnFocusLoss?: boolean
  preserveAnimationSelection?: boolean
  mixed?: boolean
  disabled?: boolean
  preserveEditorOnDisable?: boolean
}

const modeLabels: Array<{ value: ColorValueMode; label: string }> = [
  'hsv', 'rgb', 'lab', 'gray', 'palette', 'hsl', 'cmyk'
].map((value) => ({ value: value as ColorValueMode, label: colorValueModeLabel(value as ColorValueMode) }))

const eyedropperLargeIcon = TOOL_DEFINITIONS.find((tool) => tool.id === 'eyedropper')?.icon ?? ''
const eyedropperIcon = normalEditorToolIconFor(eyedropperLargeIcon) ?? eyedropperLargeIcon

const activePaletteEntries = (): PaletteEntry[] => {
  const workspace = useWorkspace.getState()
  const session = workspace.sessions.find((candidate) => candidate.document.id === workspace.activeId)
  if (!session) return []
  const entries = new Map(session.document.palette.map((entry) => [entry.id, entry]))
  return session.document.paletteOrder.flatMap((id) => {
    const entry = entries.get(id)
    return entry ? [{ ...entry, color: { ...entry.color } }] : []
  })
}

const samePaletteEntries = (left: readonly PaletteEntry[], right: readonly PaletteEntry[]): boolean => left.length === right.length && left.every((entry, index) => {
  const candidate = right[index]
  return candidate?.id === entry.id && candidate.name === entry.name && sameColor(entry.color, candidate.color)
})

const COLOR_EDITOR_MIN_WIDTH = 520
const COLOR_EDITOR_MIN_HEIGHT = 240
const COLOR_EDITOR_CMYK_MIN_HEIGHT = 298
const COLOR_EDITOR_MAX_WIDTH = 720
const COLOR_EDITOR_MAX_HEIGHT = 480

const cssColor = (color: RgbaColor): string => `rgb(${color.r} ${color.g} ${color.b} / ${color.a / 255})`
const copyColor = (color: RgbaColor): RgbaColor => ({ ...color })
const sameColor = (left: RgbaColor, right: RgbaColor): boolean => left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a
const copyHexToClipboard = async (color: RgbaColor): Promise<void> => {
  const value = displayRgbaHex(color)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
  } catch {
    // Fall through to the WebView-compatible synchronous clipboard fallback.
  }
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  try { document.execCommand('copy') } finally { input.remove() }
}
const colorGradient = (mode: ColorValueMode, values: Record<string, number>, fallback: RgbaColor, field: ReturnType<typeof colorValueFields>[number]): string => {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const color = colorFromValues(mode, { ...values, [field.key]: field.min + (field.max - field.min) * ratio }, fallback)
    return `${cssColor(color)} ${Math.round(ratio * 100)}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export function ColorValueControl({ color, density = 'regular', onChange, onCommit, label, roleLabel, className = '', storageKey, inPalette = true, onAddToPalette, addToPaletteShortcut, fillWithColor = false, dismissOnFocusLoss = false, preserveAnimationSelection = false, mixed = false, disabled = false, preserveEditorOnDisable = false }: ColorValueControlProps) {
  const { locale, t } = useI18n()
  const search = useContext(PreferenceSearchContext)
  const searchUnmatched = Boolean(search?.query && !search.matches([label, roleLabel]))
  const [open, setOpen] = useState(false)
  const [availableModes, setAvailableModes] = useState(() => loadEditorPreferences().colorEditorModes.filter((item) => item.enabled).map((item) => item.mode))
  const [mode, setMode] = useState<ColorValueMode>(() => loadEditorPreferences().colorEditorModes.find((item) => item.enabled)?.mode ?? 'hsv')
  const modeMinHeight = mode === 'cmyk' ? COLOR_EDITOR_CMYK_MIN_HEIGHT : COLOR_EDITOR_MIN_HEIGHT
  const [hexText, setHexText] = useState(() => displayRgbaHex(color))
  const [previousColor, setPreviousColor] = useState<RgbaColor>(() => copyColor(color))
  const [workingColor, setWorkingColor] = useState<RgbaColor>(() => copyColor(color))
  const [confirmedColor, setConfirmedColor] = useState<RgbaColor>(() => copyColor(color))
  const [draftMode, setDraftMode] = useState<ColorValueMode | null>(null)
  const [draftValues, setDraftValues] = useState<Record<string, number> | null>(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const [size, setSize] = useState({ width: 560, height: 264 })
  const [resident, setResident] = useState(false)
  const [copiedSwatch, setCopiedSwatch] = useState<'previous' | 'current' | null>(null)
  const [sampling, setSampling] = useState(false)
  const [paletteEntries, setPaletteEntries] = useState<PaletteEntry[]>(activePaletteEntries)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const editorWindowStack = useFloatingWindowStack(popoverRef, open)
  const dragRef = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(null)
  const resizeRef = useRef<{ direction: ResizeDirection; pointerX: number; pointerY: number; left: number; top: number; width: number; height: number } | null>(null)
  const positionRef = useRef(position)
  const sizeRef = useRef(size)
  const residentRef = useRef(resident)
  const commitHexRef = useRef<() => void>(() => undefined)
  const emittedColorRef = useRef<RgbaColor | null>(null)
  const workingColorRef = useRef<RgbaColor>(copyColor(color))
  const committedColorRef = useRef<RgbaColor>(copyColor(color))
  const sizeKey = storageKey ? `moonsprite.color-editor-size.${storageKey}` : null
  const positionedRef = useRef(false)
  const copyFeedbackTimeoutRef = useRef<number | null>(null)
  const samplingRef = useRef(false)
  const samplingReturnToolRef = useRef<{ documentId: string; tool: ToolId } | null>(null)
  const sampledColorHandlerRef = useRef<(color: RgbaColor) => void>(() => undefined)
  const finishSamplingRef = useRef<(updateState?: boolean) => void>(() => undefined)

  useEffect(() => () => {
    if (copyFeedbackTimeoutRef.current !== null) window.clearTimeout(copyFeedbackTimeoutRef.current)
  }, [])

  useEffect(() => {
    const next = copyColor(color)
    setHexText(displayRgbaHex(next))
    setWorkingColor(next)
    workingColorRef.current = next
    const emitted = emittedColorRef.current
    if (emitted && sameColor(emitted, color)) {
      emittedColorRef.current = null
      return
    }
    emittedColorRef.current = null
    committedColorRef.current = next
    setConfirmedColor(next)
    setDraftMode(null)
    setDraftValues(null)
  }, [color.r, color.g, color.b, color.a])

  useEffect(() => {
    const syncModes = (): void => {
      const next = loadEditorPreferences().colorEditorModes.filter((item) => item.enabled).map((item) => item.mode)
      setAvailableModes(next)
      setMode((current) => next.includes(current) ? current : next[0] ?? 'hsv')
    }
    window.addEventListener('moonsprite:preferences-changed', syncModes)
    return () => window.removeEventListener('moonsprite:preferences-changed', syncModes)
  }, [])

  useEffect(() => {
    if (!open) return
    const syncPalette = (): void => {
      const next = activePaletteEntries()
      setPaletteEntries((current) => samePaletteEntries(current, next) ? current : next)
    }
    syncPalette()
    return useWorkspace.subscribe(syncPalette)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      const popover = popoverRef.current?.getBoundingClientRect()
      if (!trigger || !popover) return
      let nextSize = sizeRef.current
      if (!positionedRef.current && sizeKey) {
        try {
          const stored = JSON.parse(localStorage.getItem(sizeKey) ?? 'null') as { width?: number; height?: number } | null
          if (stored && Number.isFinite(stored.width) && Number.isFinite(stored.height)) {
            nextSize = {
              width: Math.max(COLOR_EDITOR_MIN_WIDTH, Math.min(COLOR_EDITOR_MAX_WIDTH, window.innerWidth - 16, stored.width!)),
              height: Math.max(COLOR_EDITOR_MIN_HEIGHT, Math.min(COLOR_EDITOR_MAX_HEIGHT, window.innerHeight - 16, stored.height!))
            }
            sizeRef.current = nextSize
            setSize(nextSize)
          }
        } catch { localStorage.removeItem(sizeKey) }
      }
      const left = Math.max(8, Math.min(window.innerWidth - nextSize.width - 8, trigger.right - nextSize.width))
      const top = window.innerHeight - trigger.bottom >= nextSize.height + 6
        ? trigger.bottom + 5
        : Math.max(8, trigger.top - nextSize.height - 5)
      positionRef.current = { left, top }
      setPosition(positionRef.current)
      positionedRef.current = true
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, sizeKey])

  useLayoutEffect(() => {
    if (!open || sizeRef.current.height >= modeMinHeight) return
    const height = Math.min(modeMinHeight, COLOR_EDITOR_MAX_HEIGHT, Math.max(COLOR_EDITOR_MIN_HEIGHT, window.innerHeight - 16))
    if (height <= sizeRef.current.height) return
    sizeRef.current = { ...sizeRef.current, height }
    positionRef.current = {
      ...positionRef.current,
      top: Math.max(8, Math.min(positionRef.current.top, window.innerHeight - height - 8))
    }
    setSize(sizeRef.current)
    setPosition(positionRef.current)
  }, [modeMinHeight, open])

  useEffect(() => {
    if (!open) return
    const move = (event: PointerEvent): void => {
      const drag = dragRef.current
      const popover = popoverRef.current
      const resize = resizeRef.current
      if (resize) {
        const deltaX = event.clientX - resize.pointerX
        const deltaY = event.clientY - resize.pointerY
        let left = resize.left
        let top = resize.top
        let width = resize.width
        let height = resize.height
        if (resize.direction.includes('e')) width = Math.max(COLOR_EDITOR_MIN_WIDTH, Math.min(COLOR_EDITOR_MAX_WIDTH, window.innerWidth - resize.left - 8, resize.width + deltaX))
        if (resize.direction.includes('s')) height = Math.max(modeMinHeight, Math.min(COLOR_EDITOR_MAX_HEIGHT, window.innerHeight - resize.top - 8, resize.height + deltaY))
        if (resize.direction.includes('w')) { width = Math.max(COLOR_EDITOR_MIN_WIDTH, Math.min(COLOR_EDITOR_MAX_WIDTH, resize.left + resize.width - 8, resize.width - deltaX)); left = resize.left + resize.width - width }
        if (resize.direction.includes('n')) { height = Math.max(modeMinHeight, Math.min(COLOR_EDITOR_MAX_HEIGHT, resize.top + resize.height - 8, resize.height - deltaY)); top = resize.top + resize.height - height }
        positionRef.current = { left, top }
        sizeRef.current = { width, height }
        setPosition(positionRef.current)
        setSize(sizeRef.current)
        return
      }
      if (!drag || !popover) return
      const bounds = popover.getBoundingClientRect()
      if (!residentRef.current && Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY) >= 3) {
        residentRef.current = true
        setResident(true)
      }
      const next = {
        left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, drag.left + event.clientX - drag.pointerX)),
        top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, drag.top + event.clientY - drag.pointerY))
      }
      positionRef.current = next
      setPosition(next)
    }
    const end = (): void => {
      if (resizeRef.current && sizeKey) localStorage.setItem(sizeKey, JSON.stringify(sizeRef.current))
      dragRef.current = null
      resizeRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [modeMinHeight, open, sizeKey])

  useEffect(() => {
    residentRef.current = resident
  }, [resident])

  useEffect(() => {
    if (!open || sampling || (resident && !dismissOnFocusLoss)) return
    const closeTransient = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        commitHexRef.current()
        positionedRef.current = false
        residentRef.current = false
        setResident(false)
        setOpen(false)
      }
    }
    const closeOnWindowBlur = (): void => {
      if (!dismissOnFocusLoss) return
      commitHexRef.current()
      positionedRef.current = false
      residentRef.current = false
      setResident(false)
      setOpen(false)
    }
    window.addEventListener('pointerdown', closeTransient, true)
    window.addEventListener('blur', closeOnWindowBlur)
    return () => {
      window.removeEventListener('pointerdown', closeTransient, true)
      window.removeEventListener('blur', closeOnWindowBlur)
    }
  }, [dismissOnFocusLoss, open, resident, sampling])

  const commitEditorColor = (nextColor = workingColorRef.current): void => {
    const next = copyColor(nextColor)
    setConfirmedColor(next)
    if (sameColor(committedColorRef.current, next)) return
    committedColorRef.current = next
    onCommit?.(copyColor(next))
  }

  const applyEditorColor = (nextColor: RgbaColor): void => {
    const next = copyColor(nextColor)
    setWorkingColor(next)
    workingColorRef.current = next
    setConfirmedColor(copyColor(next))
    setDraftMode(mode)
    setDraftValues(colorToValues(next, mode))
    emittedColorRef.current = copyColor(next)
    onChange(next)
    commitEditorColor(next)
    setHexText(displayRgbaHex(next))
  }

  const finishSampling = (updateState = true): void => {
    if (!samplingRef.current) return
    samplingRef.current = false
    if (updateState) setSampling(false)
    const returnTarget = samplingReturnToolRef.current
    samplingReturnToolRef.current = null
    if (!returnTarget || returnTarget.tool === 'eyedropper') return
    const workspace = useWorkspace.getState()
    if (workspace.activeId === returnTarget.documentId) workspace.setTool(returnTarget.tool)
  }
  finishSamplingRef.current = finishSampling

  useEffect(() => {
    if (!disabled) return
    finishSamplingRef.current()
    if (preserveEditorOnDisable) return
    positionedRef.current = false
    setOpen(false)
  }, [disabled, preserveEditorOnDisable])
  sampledColorHandlerRef.current = applyEditorColor

  const beginSampling = (): void => {
    if (samplingRef.current) {
      finishSampling()
      return
    }
    const workspace = useWorkspace.getState()
    const session = workspace.sessions.find((candidate) => candidate.document.id === workspace.activeId)
    if (!session) return
    samplingReturnToolRef.current = { documentId: session.document.id, tool: session.tool }
    samplingRef.current = true
    residentRef.current = true
    setResident(true)
    setSampling(true)
    workspace.setTool('eyedropper')
    const active = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session.document.id)
    if (active?.tool !== 'eyedropper') finishSampling()
  }

  useEffect(() => {
    const sampled = (event: Event): void => {
      const sample = (event as CustomEvent<CanvasColorSampledDetail>).detail
      if (samplingRef.current && sample?.color) sampledColorHandlerRef.current(sample.color)
    }
    const completed = (): void => finishSamplingRef.current()
    window.addEventListener(CANVAS_COLOR_SAMPLED_EVENT, sampled)
    window.addEventListener(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, completed)
    return () => {
      window.removeEventListener(CANVAS_COLOR_SAMPLED_EVENT, sampled)
      window.removeEventListener(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, completed)
    }
  }, [])

  useEffect(() => {
    if (!sampling) return
    return useWorkspace.subscribe((workspace) => {
      const returnTarget = samplingReturnToolRef.current
      const session = returnTarget ? workspace.sessions.find((candidate) => candidate.document.id === returnTarget.documentId) : null
      if (returnTarget && workspace.activeId === returnTarget.documentId && session?.tool === 'eyedropper') return
      samplingRef.current = false
      samplingReturnToolRef.current = null
      setSampling(false)
    })
  }, [sampling])

  useEffect(() => () => finishSamplingRef.current(false), [])

  const applyHex = (value: string): boolean => {
    const next = parseRgbaHex(value, workingColor.a)
    if (!next) return false
    applyEditorColor(next)
    return true
  }
  const commitHex = (): void => {
    if (!applyHex(hexText)) setHexText(displayRgbaHex(workingColor))
  }
  const pasteHexFromClipboard = async (): Promise<void> => {
    try {
      const value = await window.moonSprite.readClipboardText()
      if (value) applyHex(value)
    } catch {
      // Clipboard access can be unavailable; preserve the current color.
    }
  }
  commitHexRef.current = commitHex

  const values = draftMode === mode && draftValues ? draftValues : colorToValues(workingColor, mode)
  const fields = colorValueFields(mode)
  const updateValue = (key: string, value: number): RgbaColor => {
    const nextValues = { ...values, [key]: value }
    const next = colorFromValues(mode, nextValues, workingColor)
    setWorkingColor(copyColor(next))
    workingColorRef.current = copyColor(next)
    setDraftMode(mode)
    setDraftValues(nextValues)
    emittedColorRef.current = copyColor(next)
    onChange(next)
    setHexText(displayRgbaHex(next))
    return next
  }

  const confirmWorkingColor = (): void => commitEditorColor()
  const copySwatch = async (kind: 'previous' | 'current', value: RgbaColor): Promise<void> => {
    await copyHexToClipboard(value)
    setCopiedSwatch(kind)
    if (copyFeedbackTimeoutRef.current !== null) window.clearTimeout(copyFeedbackTimeoutRef.current)
    copyFeedbackTimeoutRef.current = window.setTimeout(() => {
      copyFeedbackTimeoutRef.current = null
      setCopiedSwatch(null)
    }, 900)
  }

  const roleTitle = roleLabel ? (locale === 'zh-CN' && !roleLabel.endsWith('色') ? `${roleLabel}色` : roleLabel) : ''
  const editorLabel = `${t('colorEditor.title')}${roleTitle ? ` ${roleTitle}` : ''}`
  const editor = open ? <div ref={popoverRef} className={`color-editor-popover ${resident ? 'resident' : 'transient'}`} data-preserve-animation-selection={preserveAnimationSelection ? '' : undefined} role="dialog" aria-label={editorLabel} style={{ ...position, ...size, zIndex: editorWindowStack.zIndex }} onPointerDownCapture={editorWindowStack.bringToFront} onFocusCapture={editorWindowStack.bringToFront}>
    <header className="color-editor-titlebar" onPointerDown={(event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
      dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, left: position.left, top: position.top }
      event.preventDefault()
    }}><strong>{t('colorEditor.title')}{roleTitle ? ` ${roleTitle}` : ''}</strong><button type="button" className="icon-button" aria-label={t('colorEditor.close')} onClick={() => { commitHexRef.current(); finishSampling(); positionedRef.current = false; setOpen(false) }}><PixelUtilityIcon kind="close" /></button></header>
    <div className="color-editor-toolbar">
      <div className="color-editor-tabs" role="tablist" aria-label={t('colorEditor.modes')}>
        {availableModes.map((value) => modeLabels.find((option) => option.value === value)).filter((option): option is typeof modeLabels[number] => Boolean(option)).map((option) => <button key={option.value} type="button" role="tab" aria-selected={mode === option.value} className={mode === option.value ? 'selected' : ''} disabled={disabled} onClick={() => { setMode(option.value); setDraftMode(option.value); setDraftValues(colorToValues(workingColor, option.value)) }}>{option.label}</button>)}
      </div>
      <label className="color-editor-hex"><span>#</span><input aria-label={`${label} HEX`} value={hexText.replace(/^#/, '')} disabled={disabled} onChange={(event) => setHexText(`#${event.target.value}`)} onBlur={commitHex} onContextMenu={(event) => { event.preventDefault(); void pasteHexFromClipboard() }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitHex() } }} /></label>
      <div className="color-editor-swatch-comparison" role="group" aria-label={`${t('colorEditor.previous')} / ${t('colorEditor.current')}`}><button type="button" className={`color-editor-previous-swatch ${copiedSwatch === 'previous' ? 'copied' : ''}`} title={`${t('colorEditor.previous')} · ${displayRgbaHex(previousColor)}`} aria-label={t('colorEditor.previous')} onClick={() => { void copySwatch('previous', previousColor) }}><i style={{ background: cssColor(previousColor) }} /></button><button type="button" className={`color-editor-current-swatch ${copiedSwatch === 'current' ? 'copied' : ''}`} title={`${t('colorEditor.current')} · ${displayRgbaHex(confirmedColor)}`} aria-label={t('colorEditor.current')} onClick={() => { void copySwatch('current', confirmedColor) }}><i style={{ background: cssColor(confirmedColor) }} /></button>{copiedSwatch && <span className="color-editor-copy-toast" role="status" aria-live="polite">{t('colorEditor.copied', { hex: displayRgbaHex(copiedSwatch === 'previous' ? previousColor : confirmedColor) })}</span>}</div>
      <button type="button" className={`icon-button color-editor-eyedropper ${sampling ? 'selected' : ''}`} title={t('colorEditor.eyedropper')} aria-label={t('colorEditor.eyedropper')} aria-pressed={sampling} disabled={disabled} onClick={beginSampling}><PixelAssetIcon src={eyedropperIcon} /></button>
    </div>
    <div className={`color-editor-fields ${mode === 'palette' ? 'palette-mode' : ''}`} style={{ '--color-field-count': Math.max(1, fields.length) } as React.CSSProperties}>
      {mode === 'palette' ? <div className="color-editor-palette-grid" role="listbox" aria-label={t('colorEditor.palette')}>
        {paletteEntries.length > 0 ? paletteEntries.map((entry) => <button key={entry.id} type="button" role="option" aria-selected={sameColor(entry.color, workingColor)} className={`color-editor-palette-swatch ${sameColor(entry.color, workingColor) ? 'selected' : ''}`} title={`${entry.name} · ${displayRgbaHex(entry.color)}`} aria-label={`${entry.name} ${displayRgbaHex(entry.color)}`} disabled={disabled} onClick={() => applyEditorColor(entry.color)}><i style={{ background: cssColor(entry.color) }} /></button>) : <p className="color-editor-palette-empty">{t('colorEditor.paletteEmpty')}</p>}
      </div> : fields.map((field) => {
        const gradient = colorGradient(mode, values, color, field)
        const background = field.key === 'a' ? `${gradient}, repeating-conic-gradient(var(--theme-checker-dark) 0 25%, var(--theme-checker-light) 0 50%) 50% / 20px 20px` : gradient
        return <label key={field.key} className="color-editor-field"><span className="color-editor-field-label">{field.label}</span><input aria-label={t('colorEditor.slider', { label, field: field.label })} className="color-editor-range" style={{ background }} type="range" min={field.min} max={field.max} step={field.step} value={values[field.key] ?? 0} disabled={disabled} onChange={(event) => updateValue(field.key, Number(event.target.value))} onPointerUp={(event) => { confirmWorkingColor(); event.currentTarget.blur() }} onPointerCancel={(event) => { confirmWorkingColor(); event.currentTarget.blur() }} onBlur={confirmWorkingColor} /><NumberInput aria-label={`${label} ${field.label}`} min={field.min} max={field.max} step={field.step} value={Math.round(values[field.key] ?? 0)} disabled={disabled} onValueChange={(value) => { const next = updateValue(field.key, value); commitEditorColor(next) }} /></label>
      })}
    </div>
    <PanelResizeHandles onResize={(event, direction) => {
      if (event.button !== 0 || !popoverRef.current) return
      const bounds = popoverRef.current.getBoundingClientRect()
      resizeRef.current = { direction, pointerX: event.clientX, pointerY: event.clientY, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
      event.preventDefault()
      event.stopPropagation()
    }} />
  </div> : null

  return <>
    <span className={`color-value-action-row color-value-density-${density} ${onAddToPalette ? 'supports-palette-action' : ''} ${onAddToPalette && !inPalette ? 'has-add-action' : ''} ${searchUnmatched ? 'search-unmatched' : ''}`.trim()}>
      <button ref={triggerRef} type="button" className={`color-value-trigger ${fillWithColor && !mixed ? 'filled-color-trigger' : ''} ${mixed ? 'mixed-color-trigger' : ''} ${className}`.trim()} style={fillWithColor && !mixed ? { '--color-value-fill': cssColor(color), '--color-value-contrast': paletteMarkerColor(color) } as React.CSSProperties : undefined} aria-label={`${label}${roleLabel ? ` ${roleLabel}` : ''}`} aria-expanded={open} disabled={disabled} onClick={() => { if (open) commitHexRef.current(); const next = copyColor(color); setPreviousColor(next); setWorkingColor(next); workingColorRef.current = next; committedColorRef.current = next; setConfirmedColor(next); setDraftMode(mode); setDraftValues(colorToValues(next, mode)); setHexText(displayRgbaHex(next)); if (open) { finishSampling(); positionedRef.current = false } else { residentRef.current = false; setResident(false) }; setOpen((value) => !value) }}>
      {!fillWithColor && <span className="color-value-swatch"><i style={{ background: `rgba(${color.r}, ${color.g}, ${color.b}, ${clampByte(color.a) / 255})` }} /></span>}
      <strong>{mixed ? '' : displayRgbaHex(color)}</strong>
      {roleLabel && <small>{roleLabel}</small>}
      </button>{onAddToPalette && !inPalette && <button type="button" className="color-value-add-button" title={addToPaletteShortcut ? t('palette.addCurrentColorShortcut', { shortcut: addToPaletteShortcut }) : t('palette.addCurrentColor')} aria-label={addToPaletteShortcut ? t('palette.addCurrentColorShortcut', { shortcut: addToPaletteShortcut }) : t('palette.addCurrentColor')} onClick={onAddToPalette}><PixelUtilityIcon kind="plus" /></button>}
    </span>
    {editor && createPortal(editor, document.body)}
  </>
}
