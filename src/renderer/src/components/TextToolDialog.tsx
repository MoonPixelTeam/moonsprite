import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { RgbaColor, SelectionRect, TextAntialiasMode, TextCelData, TextSpacingMode, TextStyleRun } from '@shared/types'
import { ColorValueControl } from './ColorValueControl'
import { DeleteIconButton } from './DeleteIconButton'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { LivePreviewToggle } from './LivePreviewToggle'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { PixelUtilityIcon } from './PixelUtilityIcon'
import { TextAreaInput } from './TextAreaInput'
import { ThemedSelect } from './ThemedSelect'
import { Tooltip } from './Tooltip'
import { useI18n } from './I18nProvider'
import { DEFAULT_TEXT_BOX_HEIGHT, DEFAULT_TEXT_BOX_WIDTH, DEFAULT_TEXT_CONTENT, DEFAULT_TEXT_FONT_FAMILY, DEFAULT_TEXT_FONT_SIZE, TEXT_FONT_FAMILIES, applyTextStyleRun, normalizeTextCelData, rasterizeText, reconcileTextStyleRuns, textFontDefaultSize } from '@/core/text-raster'
import { deleteTextFont, importSystemTextFont, importTextFont, loadLastTextFontSize, loadSystemFontCatalog, loadTextFontCatalog, recordLastTextFontSize, recordTextFontUsage, type TextFontOption } from '@/platform/font-service'

export function TextToolDialog({ initial, editing, box, onClose, onChange, onPreview, onSubmit }: {
  initial?: Partial<TextCelData>
  editing: boolean
  box?: SelectionRect | null
  onClose: () => void
  onChange?: (value: TextCelData) => void
  onPreview: (value: TextCelData | null) => void
  onSubmit: (value: TextCelData) => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState<TextCelData>(() => normalizeTextCelData(editing ? initial : {
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontSize: loadLastTextFontSize() ?? DEFAULT_TEXT_FONT_SIZE,
    lineSpacing: 1,
    letterSpacing: 1,
    spacingMode: 'actual',
    antialias: 'pixel',
    ...initial,
    text: initial?.text || DEFAULT_TEXT_CONTENT
  }))
  const [previewEnabled, setPreviewEnabled] = useState(true)
  const [fonts, setFonts] = useState<TextFontOption[]>(() => TEXT_FONT_FAMILIES.map((family) => ({ family, source: 'built-in' })))
  const [systemFonts, setSystemFonts] = useState<TextFontOption[]>([])
  const [initialFontFamily] = useState(value.fontFamily)
  const [fontBusy, setFontBusy] = useState(false)
  const [fontMessage, setFontMessage] = useState('')
  const [selection, setSelection] = useState({ start: 0, end: 0 })
  const [textAreaFocused, setTextAreaFocused] = useState(false)
  const [selectionMirror, setSelectionMirror] = useState({ width: 0, height: 0, scrollLeft: 0, scrollTop: 0 })
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!box) return
    setValue((current) => current.originX === box.x && current.originY === box.y && current.boxWidth === box.width && current.boxHeight === box.height
      ? current
      : { ...current, originX: box.x, originY: box.y, layoutMode: 'box', boxWidth: box.width, boxHeight: box.height })
  }, [box?.height, box?.width, box?.x, box?.y])
  const antialiasGroups = useMemo(() => [{ label: t('textTool.rendering'), options: [
    { value: 'pixel' as const, label: t('textTool.pixel') },
    { value: 'smooth' as const, label: t('textTool.smooth') }
  ] }], [t])
  const layoutModeGroups = useMemo(() => [{ label: t('textTool.layoutMode'), options: [
    { value: 'free' as const, label: t('textTool.layoutFree') },
    { value: 'box' as const, label: t('textTool.layoutBox') }
  ] }], [t])
  const textAlignGroups = useMemo(() => [{ label: t('textTool.textAlign'), options: [
    { value: 'left' as const, label: t('textTool.alignLeft') },
    { value: 'center' as const, label: t('textTool.alignCenter') },
    { value: 'right' as const, label: t('textTool.alignRight') }
  ] }], [t])
  const boxedLayout = value.layoutMode === 'box'
  const setLayoutMode = (layoutMode: 'free' | 'box'): void => setValue((current) => {
    if (layoutMode === 'free') return { ...current, layoutMode, boxWidth: undefined, boxHeight: undefined }
    if (current.layoutMode === 'box' && current.boxWidth && current.boxHeight) return current
    // A newly boxed text starts at its current visual size. This keeps selecting
    // center/right alignment from appearing to move the text or its frame.
    const free = { ...current, layoutMode: 'free' as const, boxWidth: undefined, boxHeight: undefined }
    const surface = rasterizeText(free, current.originX ?? 0, current.originY ?? 0).rgba
    return {
      ...current,
      layoutMode,
      boxWidth: Math.max(1, surface.width || DEFAULT_TEXT_BOX_WIDTH),
      boxHeight: Math.max(1, surface.height || DEFAULT_TEXT_BOX_HEIGHT)
    }
  })
  const spacingModeGroups = useMemo(() => [{ label: t('textTool.spacingMode'), options: [
    { value: 'actual' as const, label: t('textTool.actualSpacing'), description: t('textTool.actualSpacingDescription') },
    { value: 'font' as const, label: t('textTool.fontSpacing'), description: t('textTool.fontSpacingDescription') }
  ] }], [t])
  const systemFontGroups = useMemo(() => [{ label: t('textTool.systemFonts'), options: systemFonts.map((font) => ({ value: font.family, label: font.family })) }], [systemFonts, t])
  const builtInFontDescription = (family: string): string | undefined => {
    if (family === 'Fusion Pixel 10px Prop Zh_hans') return t('textTool.fontDescription.fusionPixel')
    if (family === 'Silkscreen') return t('textTool.fontDescription.silkscreen')
    if (family === 'Tiny5') return t('textTool.fontDescription.tiny5')
    if (family === 'Noto Sans SC') return t('textTool.fontDescription.notoSansSc')
    return undefined
  }
  useEffect(() => {
    onChange?.(normalizeTextCelData(value))
  }, [onChange, value])
  useEffect(() => {
    onPreview(previewEnabled && value.text.length > 0 ? normalizeTextCelData(value) : null)
  }, [onPreview, previewEnabled, value])
  useEffect(() => {
    let active = true
    void loadTextFontCatalog().then((catalog) => {
      if (!active) return
      setFonts(catalog.some((font) => font.family === initialFontFamily) ? catalog : [{ family: initialFontFamily, source: 'local' }, ...catalog])
    }).catch(() => {
      if (active) setFontMessage(t('textTool.fontLoadFailed'))
    })
    return () => { active = false }
  }, [initialFontFamily, t])
  useEffect(() => {
    let active = true
    void loadSystemFontCatalog().then((catalog) => {
      if (active) setSystemFonts(catalog)
    }).catch(() => {
      if (active) setFontMessage(t('textTool.fontLoadFailed'))
    })
    return () => { active = false }
  }, [t])
  const addFont = async (action: () => Promise<TextFontOption | null>): Promise<void> => {
    setFontBusy(true)
    setFontMessage('')
    try {
      const font = await action()
      if (!font) return
      setFonts((current) => [font, ...current.filter((item) => item.family.toLocaleLowerCase() !== font.family.toLocaleLowerCase())])
      setValue((current) => {
        const fontSize = textFontDefaultSize(font.family) ?? current.fontSize
        recordLastTextFontSize(fontSize)
        return { ...current, fontFamily: font.family, fontSize }
      })
      setFontMessage(t(font.source === 'imported' ? 'textTool.fontImported' : 'textTool.fontSelected', { name: font.family }))
    } catch {
      setFontMessage(t('textTool.fontLoadFailed'))
    } finally {
      setFontBusy(false)
    }
  }
  const useSystemFont = (family: string): void => {
    const font = systemFonts.find((candidate) => candidate.family === family)
    if (!font) return
    void addFont(() => importSystemTextFont(font))
  }
  const selectedFont = fonts.find((font) => font.family === value.fontFamily)
  const selectFont = (font: TextFontOption): void => {
    setValue((current) => {
      const fontSize = textFontDefaultSize(font.family) ?? current.fontSize
      recordLastTextFontSize(fontSize)
      return { ...current, fontFamily: font.family, fontSize }
    })
  }
  const hasTextSelection = selection.end > selection.start
  const styleAt = (index: number): Required<Pick<TextStyleRun, 'fontSize' | 'lineSpacing' | 'letterSpacing' | 'color'>> => {
    const resolvedIndex = index >= value.text.length && value.text.length > 0 ? value.text.length - 1 : index
    const run = value.styleRuns?.find((candidate) => candidate.start <= resolvedIndex && candidate.end > resolvedIndex)
    return {
      fontSize: run?.fontSize ?? value.fontSize,
      lineSpacing: run?.lineSpacing ?? value.lineSpacing,
      letterSpacing: run?.letterSpacing ?? value.letterSpacing,
      color: run?.color ? { ...run.color } : { ...value.color }
    }
  }
  const selectionValues = <K extends 'fontSize' | 'lineSpacing' | 'letterSpacing'>(key: K): number | '' => {
    if (!hasTextSelection) return styleAt(selection.start)[key]
    const values = new Set<number>()
    for (let index = selection.start; index < selection.end; index += 1) values.add(styleAt(index)[key])
    return values.size === 1 ? [...values][0] : ''
  }
  const selectionColor = (): RgbaColor | null => {
    if (!hasTextSelection) return styleAt(selection.start).color
    let selected: RgbaColor | null = null
    for (let index = selection.start; index < selection.end; index += 1) {
      const color = styleAt(index).color
      if (!selected) selected = color
      else if (selected.r !== color.r || selected.g !== color.g || selected.b !== color.b || selected.a !== color.a) return null
    }
    return selected
  }
  const updateRangeStyle = (patch: Omit<TextStyleRun, 'start' | 'end'>): void => {
    setValue((current) => {
      if (!hasTextSelection) return { ...current, ...patch, color: patch.color ? { ...patch.color } : current.color }
      return { ...current, styleRuns: applyTextStyleRun(current.styleRuns ?? [], selection.start, selection.end, patch, current.text.length) }
    })
  }
  const updateSpacingMode = (spacingMode: TextSpacingMode): void => {
    setValue((current) => {
      if (spacingMode !== 'actual' || current.spacingMode === 'actual') return { ...current, spacingMode }
      return {
        ...current,
        spacingMode,
        lineSpacing: current.lineSpacing === 0 ? 1 : current.lineSpacing,
        letterSpacing: current.letterSpacing === 0 ? 1 : current.letterSpacing,
        styleRuns: current.styleRuns?.map((run) => ({
          ...run,
          ...(run.lineSpacing === 0 ? { lineSpacing: 1 } : {}),
          ...(run.letterSpacing === 0 ? { letterSpacing: 1 } : {})
        }))
      }
    })
  }
  const syncSelection = (): void => {
    const target = textAreaRef.current
    if (!target) return
    setSelection({ start: Math.min(target.selectionStart, target.selectionEnd), end: Math.max(target.selectionStart, target.selectionEnd) })
  }
  const syncSelectionMirror = (): void => {
    const target = textAreaRef.current
    if (!target) return
    setSelectionMirror({ width: target.clientWidth, height: target.clientHeight, scrollLeft: target.scrollLeft, scrollTop: target.scrollTop })
  }
  useLayoutEffect(() => {
    const target = textAreaRef.current
    if (!target) return
    syncSelectionMirror()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncSelectionMirror)
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const target = textAreaRef.current
    if (!target || target.selectionStart === selection.start && target.selectionEnd === selection.end) return
    target.setSelectionRange(selection.start, selection.end)
  }, [selection.end, selection.start, value.styleRuns])
  const removeSelectedFont = async (): Promise<void> => {
    if (!selectedFont || selectedFont.source !== 'imported') return
    setFontBusy(true)
    setFontMessage('')
    try {
      await deleteTextFont(selectedFont)
      const catalog = await loadTextFontCatalog()
      const fallback = catalog[0] ?? { family: DEFAULT_TEXT_FONT_FAMILY, source: 'built-in' as const }
      setFonts(catalog)
      setValue((current) => ({ ...current, fontFamily: fallback.family }))
      setFontMessage(t('textTool.fontDeleted', { name: selectedFont.family }))
    } catch {
      setFontMessage(t('textTool.fontDeleteFailed'))
    } finally {
      setFontBusy(false)
    }
  }
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell as="form" storageKey="text-tool" defaultWidth={780} defaultHeight={520} minWidth={680} minHeight={450} maxWidth={980} maxHeight={760} className="text-tool-modal" onSubmit={(event) => {
      event.preventDefault()
      if (value.text.length === 0) return
      onSubmit(normalizeTextCelData(value))
      recordTextFontUsage(value.fontFamily)
    }}>
      <DialogHeader eyebrow="TEXT" title={t(editing ? 'textTool.editTitle' : 'textTool.createTitle')} closeLabel={t('common.close')} onClose={onClose} />
      <div className="text-tool-body">
        <aside className="text-tool-font-panel" aria-label={t('textTool.font')}>
          <div className="text-tool-font-heading">{t('textTool.font')}</div>
          <div className="text-tool-font-list component-scrollbar" role="listbox" aria-label={t('textTool.font')}>
            {fonts.map((font) => {
              const description = font.source === 'built-in' ? builtInFontDescription(font.family) : undefined
              return <button type="button" role="option" aria-selected={font.family === value.fontFamily} className={font.family === value.fontFamily ? 'selected' : ''} key={`${font.source}:${font.family}`} style={{ fontFamily: `"${font.family.replaceAll('"', '')}"` }} onClick={() => selectFont(font)}>
                {description
                  ? <Tooltip className="text-tool-font-title-tooltip" content={<><strong>{font.family}</strong><span>{description}</span></>}><span>{font.family}</span></Tooltip>
                  : <span>{font.family}</span>}
                {font.source !== 'built-in' && <small>{t(font.source === 'imported' ? 'textTool.importedFont' : 'textTool.localFont')}</small>}
              </button>
            })}
          </div>
          <div className="text-tool-font-actions">
            {systemFonts.length > 0 ? <ThemedSelect value={systemFonts[0].family} groups={systemFontGroups} label={t('textTool.importFont')} onChange={useSystemFont} popoverWidth={420} popoverClassName="text-tool-system-font-popover" showCheck={false} showOptionTooltips={false} searchable searchPlaceholder={t('textTool.searchFonts')} renderSelected={() => <span className="text-tool-font-action-copy"><PixelUtilityIcon kind="import" />{t('textTool.importFont')}</span>} renderOption={(option) => <strong style={{ fontFamily: `"${option.value.replaceAll('"', '')}"` }}>{option.label}</strong>} /> : <button type="button" className="quiet-button" disabled><PixelUtilityIcon kind="import" />{t('textTool.importFont')}</button>}
            <button type="button" className="icon-button text-tool-local-font-button" disabled={fontBusy} title={t('textTool.selectLocalFont')} aria-label={t('textTool.selectLocalFont')} onClick={() => void addFont(importTextFont)}><PixelUtilityIcon kind="folderOpen" /></button>
            {selectedFont?.source === 'imported' && <DeleteIconButton className="text-tool-delete-font-button" disabled={fontBusy} title={t('textTool.deleteFont', { name: selectedFont.family })} aria-label={t('textTool.deleteFont', { name: selectedFont.family })} onClick={() => void removeSelectedFont()} />}
          </div>
          {fontMessage && <p className="text-tool-font-message" role="status">{fontMessage}</p>}
        </aside>
        <div className="text-tool-settings component-scrollbar">
          <FormField label={t('textTool.content')}><div className="text-tool-text-editor"><TextAreaInput ref={textAreaRef} autoFocus rows={4} value={value.text} placeholder={t('textTool.placeholder')} onFocus={() => setTextAreaFocused(true)} onBlur={() => { setTextAreaFocused(false); syncSelection(); syncSelectionMirror() }} onScroll={syncSelectionMirror} onSelect={syncSelection} onKeyUp={syncSelection} onPointerUp={syncSelection} onChange={(event) => {
            const text = event.target.value
            const nextSelection = { start: Math.min(event.target.selectionStart, event.target.selectionEnd), end: Math.max(event.target.selectionStart, event.target.selectionEnd) }
            setValue((current) => ({ ...current, text, styleRuns: reconcileTextStyleRuns(current.styleRuns ?? [], current.text, text) }))
            setSelection(nextSelection)
            window.queueMicrotask(syncSelectionMirror)
          }} />{!textAreaFocused && hasTextSelection && <div className="text-tool-selection-mirror" aria-hidden="true" style={{ width: selectionMirror.width, height: selectionMirror.height, '--text-selection-scroll-x': `${selectionMirror.scrollLeft}px`, '--text-selection-scroll-y': `${selectionMirror.scrollTop}px` } as CSSProperties}><div><span>{value.text.slice(0, selection.start)}</span><mark>{value.text.slice(selection.start, selection.end)}</mark><span>{value.text.slice(selection.end)}</span></div></div>}</div></FormField>
          <div className="text-tool-number-grid">
            <FormField label={t('textTool.layoutMode')}><ThemedSelect<'free' | 'box'> value={value.layoutMode ?? 'free'} groups={layoutModeGroups} label={t('textTool.layoutMode')} onChange={setLayoutMode} /></FormField>
            <FormField label={t('textTool.textAlign')}><ThemedSelect<'left' | 'center' | 'right'> value={value.textAlign ?? 'left'} groups={textAlignGroups} label={t('textTool.textAlign')} disabled={!boxedLayout} onChange={(textAlign) => setValue((current) => ({ ...current, textAlign }))} /></FormField>
            <FormField label={t('textTool.fontSize')}><NumberInput min={1} max={512} suffix="px" value={selectionValues('fontSize')} onValueChange={(fontSize) => { recordLastTextFontSize(fontSize); updateRangeStyle({ fontSize }) }} /></FormField>
            <FormField label={t('textTool.lineSpacing')}><NumberInput min={-256} max={512} suffix="px" value={selectionValues('lineSpacing')} onValueChange={(lineSpacing) => updateRangeStyle({ lineSpacing })} /></FormField>
            <FormField label={t('textTool.letterSpacing')}><NumberInput min={-64} max={256} suffix="px" value={selectionValues('letterSpacing')} onValueChange={(letterSpacing) => updateRangeStyle({ letterSpacing })} /></FormField>
            <FormField label={t('textTool.spacingMode')}><ThemedSelect<TextSpacingMode> value={value.spacingMode} groups={spacingModeGroups} label={t('textTool.spacingMode')} onChange={updateSpacingMode} /></FormField>
            <FormField label={t('textTool.rendering')}><ThemedSelect<TextAntialiasMode> value={value.antialias} groups={antialiasGroups} label={t('textTool.rendering')} onChange={(antialias) => setValue({ ...value, antialias })} /></FormField>
            <FormField label={t('textTool.color')}><ColorValueControl color={selectionColor() ?? value.color} mixed={!selectionColor()} label={t('textTool.color')} storageKey="text-color" inPalette={false} fillWithColor onChange={(color) => updateRangeStyle({ color })} /></FormField>
          </div>
          <LivePreviewToggle checked={previewEnabled} onChange={setPreviewEnabled} />
        </div>
      </div>
      <footer><button type="button" className="quiet-button" onClick={onClose}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={!value.text.length}>{t(editing ? 'common.save' : 'textTool.insert')}</button></footer>
    </ModalShell>
  </div>
}
