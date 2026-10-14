import { useEffect, useMemo, useRef, useState } from 'react'
import type { LuaScriptDialog as LuaDialogModel, LuaScriptDialogAction, LuaScriptDialogControl, LuaScriptDialogValue } from '@shared/types-scripting'
import type { RgbaColor } from '@shared/types-color'
import { ColorValueControl } from './ColorValueControl'
import { DialogHeader } from './DialogHeader'
import { FormField } from './FormField'
import { useI18n } from './I18nProvider'
import { ModalShell } from './ModalShell'
import { NumberInput } from './NumberInput'
import { PixelCheckbox } from './PixelCheckbox'
import { RangeField } from './RangeField'
import { TextInput } from './TextInput'
import { ThemedSelect } from './ThemedSelect'

interface LuaScriptDialogProps {
  busy: boolean
  dialog: LuaDialogModel
  sessionId: string
  onAction: (action: LuaScriptDialogAction) => void
}

const valuesForDialog = (dialog: LuaDialogModel): Record<string, LuaScriptDialogValue> => Object.fromEntries(
  dialog.controls.flatMap((control) => control.dataKey ? [[control.dataKey, control.value]] : [])
)

const numericValue = (value: LuaScriptDialogValue, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
)

const isRgbaColor = (value: LuaScriptDialogValue): value is RgbaColor => (
  typeof value === 'object'
  && value !== null
  && ['r', 'g', 'b', 'a'].every((key) => Number.isFinite(value[key as keyof RgbaColor]))
)

function ScriptControl({
  busy,
  control,
  controls,
  values,
  updateValue,
  updateValues,
  send
}: {
  busy: boolean
  control: LuaScriptDialogControl
  controls: LuaScriptDialogControl[]
  values: Record<string, LuaScriptDialogValue>
  updateValue: (control: LuaScriptDialogControl, value: LuaScriptDialogValue) => Record<string, LuaScriptDialogValue>
  updateValues: (updates: Record<string, LuaScriptDialogValue>) => Record<string, LuaScriptDialogValue>
  send: (control: LuaScriptDialogControl, event: LuaScriptDialogAction['event'], nextValues?: Record<string, LuaScriptDialogValue>) => void
}) {
  if (!control.visible) return null
  const disabled = busy || !control.enabled
  const value = control.dataKey ? values[control.dataKey] : control.value
  const label = control.label || control.text

  if (control.kind === 'separator') {
    return <div className="lua-script-separator"><span />{control.text && <strong>{control.text}</strong>}<span /></div>
  }
  if (control.kind === 'label') {
    return <div className="lua-script-label-row">{control.label && <span>{control.label}</span>}<strong>{control.text}</strong></div>
  }
  if (control.kind === 'button') {
    return <div className="lua-script-button-row">
      <span>{control.label}</span>
      <button type="button" className="quiet-button" disabled={disabled} onClick={() => send(control, 'click')}>{control.text || control.id}</button>
    </div>
  }
  if (control.kind === 'check') {
    const checked = value === true
    return <label className="lua-script-check-row">
      <span>{control.label}</span>
      <span className="lua-script-check-control"><PixelCheckbox disabled={disabled} checked={checked} onChange={(event) => {
        const nextValues = updateValue(control, event.target.checked)
        send(control, 'click', nextValues)
      }} /><span>{control.text || control.id}</span></span>
    </label>
  }
  if (control.kind === 'radio') {
    const checked = value === true
    return <div className="lua-script-radio-row">
      <span>{control.label}</span>
      <button type="button" role="radio" aria-checked={checked} className={checked ? 'selected' : ''} disabled={disabled} onClick={() => {
        const index = controls.indexOf(control)
        let start = index
        let end = index
        while (start > 0 && controls[start - 1]?.kind === 'radio') start -= 1
        while (end + 1 < controls.length && controls[end + 1]?.kind === 'radio') end += 1
        const updates = Object.fromEntries(controls.slice(start, end + 1).flatMap((candidate) => candidate.dataKey ? [[candidate.dataKey, candidate === control]] : []))
        const nextValues = updateValues(updates)
        send(control, 'click', nextValues)
      }}><i aria-hidden="true" /><span>{control.text || control.id}</span></button>
    </div>
  }
  if (control.kind === 'color') {
    const color = isRgbaColor(value) ? value : { r: 0, g: 0, b: 0, a: 255 }
    return <FormField className="lua-script-field" layout="inline" label={label || control.id}>
      <ColorValueControl color={color} density="regular" fillWithColor inPalette={false} disabled={disabled} preserveEditorOnDisable={busy && control.enabled} label={label || control.id} onChange={(next) => { updateValue(control, next) }} onCommit={(next) => {
        const nextValues = updateValue(control, next)
        send(control, 'change', nextValues)
      }} />
    </FormField>
  }
  if (control.kind === 'combobox') {
    const selected = typeof value === 'string' ? value : (control.options[0] ?? '')
    return <FormField className="lua-script-field" layout="inline" label={label || control.id}>
      <ThemedSelect value={selected} disabled={disabled} label={label || control.id} groups={[{ label: label || control.id, options: control.options.map((option) => ({ value: option, label: option })) }]} onChange={(next) => {
        const nextValues = updateValue(control, next)
        send(control, 'change', nextValues)
      }} />
    </FormField>
  }
  if (control.kind === 'entry') {
    return <FormField className="lua-script-field" layout="inline" label={label || control.id}>
      <TextInput disabled={disabled} value={typeof value === 'string' ? value : ''} onChange={(event) => { updateValue(control, event.target.value) }} onBlur={() => send(control, 'change')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); send(control, 'change') } }} />
    </FormField>
  }
  if (control.kind === 'number') {
    return <FormField className="lua-script-field" layout="inline" label={label || control.id}>
      <NumberInput disabled={disabled} min={control.min ?? undefined} max={control.max ?? undefined} step={control.step ?? 1} value={numericValue(value)} onValueChange={(next) => { updateValue(control, next) }} onBlur={() => send(control, 'change')} />
    </FormField>
  }
  const min = control.min ?? 0
  const max = control.max ?? Math.max(min + 1, 100)
  return <div className="lua-script-slider-wrap" onPointerUp={() => send(control, 'release')}>
    <RangeField disabled={disabled} label={label || control.id} min={min} max={max} step={control.step ?? 1} value={numericValue(value, min)} onChange={(next) => { updateValue(control, next) }} onBlur={() => send(control, 'release')} />
  </div>
}

function LuaScriptDialogWindow({ busy, dialog, sessionId, onAction }: LuaScriptDialogProps) {
  const { t } = useI18n()
  const initialValues = useMemo(() => valuesForDialog(dialog), [dialog])
  const [values, setValues] = useState<Record<string, LuaScriptDialogValue>>(initialValues)
  const valuesRef = useRef(initialValues)
  useEffect(() => {
    valuesRef.current = initialValues
    setValues(initialValues)
  }, [initialValues])

  const updateValue = (control: LuaScriptDialogControl, value: LuaScriptDialogValue) => {
    if (!control.dataKey) return valuesRef.current
    const next = { ...valuesRef.current, [control.dataKey]: value }
    valuesRef.current = next
    setValues(next)
    return next
  }
  const updateValues = (updates: Record<string, LuaScriptDialogValue>) => {
    const next = { ...valuesRef.current, ...updates }
    valuesRef.current = next
    setValues(next)
    return next
  }
  const send = (control: LuaScriptDialogControl, event: LuaScriptDialogAction['event'], nextValues?: Record<string, LuaScriptDialogValue>) => {
    onAction({ dialogId: dialog.id, controlId: control.id, event, values: nextValues ?? valuesRef.current })
  }
  const close = () => onAction({ dialogId: dialog.id, controlId: null, event: 'close', values: valuesRef.current })

  return <ModalShell storageKey={`lua-script-${sessionId}-${dialog.id}`} defaultWidth={420} defaultHeight={320} minWidth={320} minHeight={180} maxWidth={680} maxHeight={720} fitContent className="lua-script-api-modal" role="dialog" aria-modal="false" aria-labelledby={`${dialog.id}-title`}>
    <DialogHeader eyebrow="LUA SCRIPT" title={dialog.title || 'Lua Script'} titleId={`${dialog.id}-title`} closeLabel={t('common.close')} onClose={close} />
    <div className="lua-script-api-body component-scrollbar">
      {dialog.controls.map((control) => <ScriptControl key={control.id} busy={busy} control={control} controls={dialog.controls} values={values} updateValue={updateValue} updateValues={updateValues} send={send} />)}
    </div>
  </ModalShell>
}

export function LuaScriptDialogs({ busy, dialogs, sessionId, onAction }: {
  busy: boolean
  dialogs: LuaDialogModel[]
  sessionId: string
  onAction: (action: LuaScriptDialogAction) => void
}) {
  return <div className="lua-script-dialog-layer" aria-live="polite">
    {dialogs.map((dialog) => <LuaScriptDialogWindow key={dialog.id} busy={busy} dialog={dialog} sessionId={sessionId} onAction={onAction} />)}
  </div>
}
