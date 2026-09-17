import { useEffect, useRef, useState } from 'react'
import type { ExtensionRuntimeRequest, ExtensionRuntimeResponse } from '@shared/types-extension-runtime'
import type { StoredExtension, StoredExtensionSettingsControl, StoredExtensionSettingsUi } from '@shared/types-extensions'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/Button'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect } from '@/components/ThemedSelect'
import { useI18n } from '@/components/I18nProvider'
import { dispatchExtensionRuntimeCommand, dispatchExtensionRuntimeEvent, extensionStorage } from '@/core/extension-runtime'

const settingsBootstrap = `(()=>{let sequence=0;const pending=new Map();const call=(method,params)=>new Promise((resolve,reject)=>{const requestId=String(++sequence);pending.set(requestId,{resolve,reject});parent.postMessage({type:'moonsprite-extension-request',requestId,method,params},'*')});addEventListener('message',event=>{const message=event.data;if(message?.type!=='moonsprite-extension-response')return;const request=pending.get(message.requestId);if(!request)return;pending.delete(message.requestId);message.ok?request.resolve(message.result):request.reject(new Error(message.error||'Settings request failed'))});const storage=Object.freeze({get:key=>call('storage.get',{key}),set:(key,value)=>call('storage.set',{key,value}),remove:key=>call('storage.remove',{key}),list:()=>call('storage.list')});Object.defineProperty(window,'moonsprite',{value:Object.freeze({storage,settings:Object.freeze({close:()=>call('settings.close')})}),writable:false,configurable:false})})()`

const secureSettingsDocument = (html: string): string => {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const script = parsed.createElement('script')
  script.textContent = settingsBootstrap
  const policy = parsed.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; img-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"
  parsed.head.prepend(script)
  parsed.head.prepend(policy)
  return `<!doctype html>${parsed.documentElement.outerHTML}`
}

type SettingsValue = boolean | number | string
type SettingsValues = Record<string, SettingsValue>

const defaultSettingsValues = (settings: StoredExtensionSettingsUi): SettingsValues => Object.fromEntries(
  settings.controls
    .filter((control) => control.type !== 'button')
    .map((control) => [control.id, control.defaultValue])
)

const normalizeSettingsValue = (control: Exclude<StoredExtensionSettingsControl, { type: 'button' }>, value: unknown): SettingsValue => {
  if (control.type === 'checkbox') return typeof value === 'boolean' ? value : control.defaultValue
  if (control.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return control.defaultValue
    return Math.max(control.min ?? -Number.MAX_VALUE, Math.min(control.max ?? Number.MAX_VALUE, value))
  }
  if (control.type === 'text') return typeof value === 'string' ? value.slice(0, control.maxLength ?? 1024) : control.defaultValue
  return typeof value === 'string' && control.options.some((option) => option.value === value) ? value : control.defaultValue
}

const storedSettingsValues = (settings: StoredExtensionSettingsUi, value: unknown): SettingsValues => {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return Object.fromEntries(settings.controls.flatMap((control) => control.type === 'button'
    ? []
    : [[control.id, normalizeSettingsValue(control, stored[control.id])]]))
}

function HostExtensionSettings({ extension, settings, onClose }: { extension: StoredExtension; settings: StoredExtensionSettingsUi; onClose: () => void }) {
  const { t } = useI18n()
  const storage = extensionStorage(extension.id)
  const [values, setValues] = useState<SettingsValues>(() => storedSettingsValues(settings, storage.get(settings.storageKey)))
  const [error, setError] = useState<string | null>(null)
  const commit = (next: SettingsValues): void => {
    try {
      storage.set(settings.storageKey, next)
      setValues(next)
      setError(null)
      dispatchExtensionRuntimeEvent(extension.id, { type: 'settings-changed', key: settings.storageKey, value: next })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const update = (id: string, value: SettingsValue): void => commit({ ...values, [id]: value })
  const runButton = (control: Extract<StoredExtensionSettingsControl, { type: 'button' }>): void => {
    const command = extension.commands.find((candidate) => candidate.id === control.commandId)
    const dispatched = Boolean(command?.runtimeEvent && dispatchExtensionRuntimeCommand(extension.id, command.id, command.runtimeEvent))
    if (!dispatched) {
      setError('扩展运行时尚未启动，无法执行该操作。')
      return
    }
    setError(null)
    if (control.closeOnRun) onClose()
  }

  return <>
    <div className="modal-body extension-settings-modal-body extension-settings-component-body component-scrollbar">
      {settings.controls.map((control) => {
        if (control.visibleWhen && !Object.entries(control.visibleWhen).every(([id, expected]) => values[id] === expected)) return null
        if (control.type === 'checkbox') return <PreferenceToggle key={control.id} label={control.label} tooltip={control.description} checked={Boolean(values[control.id])} onChange={(checked) => update(control.id, checked)} />
        if (control.type === 'number') return <FormField key={control.id} layout="inline" label={control.label} hint={control.description || undefined}><NumberInput aria-label={control.label} value={typeof values[control.id] === 'number' ? values[control.id] as number : control.defaultValue} live min={control.min} max={control.max} step={control.step} suffix={control.suffix} onValueChange={(value) => update(control.id, value)} /></FormField>
        if (control.type === 'text') return <FormField key={control.id} layout="inline" label={control.label} hint={control.description || undefined}><TextInput aria-label={control.label} value={String(values[control.id] ?? '')} placeholder={control.placeholder} maxLength={control.maxLength} onChange={(event) => update(control.id, event.target.value)} /></FormField>
        if (control.type === 'select') return <FormField key={control.id} layout="inline" label={control.label} hint={control.description || undefined}><ThemedSelect label={control.label} value={String(values[control.id] ?? control.defaultValue)} groups={[{ label: control.label, options: control.options }]} onChange={(value) => update(control.id, value)} /></FormField>
        return <div className={'extension-settings-command'+(control.fullWidth?' extension-settings-command-full':'')} key={control.id}><Button variant={control.variant === 'primary' ? 'primary' : control.variant === 'danger' ? 'danger' : 'quiet'} title={control.description || control.label} onClick={() => runButton(control)}>{control.label}</Button>{control.description && <small>{control.description}</small>}</div>
      })}
      {error && <p className="preference-search-empty">{error}</p>}
    </div>
    <footer><button type="button" className="quiet-button" onClick={() => commit(defaultSettingsValues(settings))}>{t('common.reset')}</button><span className="modal-footer-spacer" /><button type="button" className="primary-button" onClick={onClose}>{t('common.done')}</button></footer>
  </>
}

export function ExtensionSettingsDialog({ extension, onClose }: { extension: StoredExtension; onClose: () => void }) {
  const { t } = useI18n()
  const frame = useRef<HTMLIFrameElement>(null)
  const [document, setDocument] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (extension.settingsUi) return
    let active = true
    void window.moonSprite.readExtensionSettingsEntry(extension.id).then((html) => {
      if (active) setDocument(secureSettingsDocument(html))
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [extension.id, extension.settingsUi])

  useEffect(() => {
    const onMessage = (event: MessageEvent<ExtensionRuntimeRequest>): void => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'moonsprite-extension-request') return
      const request = event.data
      if (typeof request.requestId !== 'string' || typeof request.method !== 'string') return
      const respond = (response: Omit<ExtensionRuntimeResponse, 'type' | 'requestId'>): void => frame.current?.contentWindow?.postMessage({
        type: 'moonsprite-extension-response', requestId: request.requestId, ...response
      }, '*')
      try {
        const params = request.params && typeof request.params === 'object' ? request.params as Record<string, unknown> : {}
        const storage = extensionStorage(extension.id)
        let result: unknown = null
        if (request.method === 'storage.get') result = storage.get(params.key)
        else if (request.method === 'storage.set') {
          storage.set(params.key, params.value)
          if (typeof params.key === 'string') dispatchExtensionRuntimeEvent(extension.id, { type: 'settings-changed', key: params.key, value: params.value })
        } else if (request.method === 'storage.remove') storage.remove(params.key)
        else if (request.method === 'storage.list') result = storage.list()
        else if (request.method === 'settings.close') onClose()
        else throw new Error('设置页请求的方法不受支持。')
        respond({ ok: true, result })
      } catch (reason) {
        respond({ ok: false, error: reason instanceof Error ? reason.message : String(reason) })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [extension.id, onClose])

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey={`extension-settings:${extension.id}`} defaultWidth={440} defaultHeight={460} minWidth={360} minHeight={300} maxWidth={720} maxHeight={720} className="extension-settings-modal" role="dialog" aria-modal="true" aria-labelledby="extension-settings-title">
      <DialogHeader eyebrow="EXTENSION" title={extension.name} titleId="extension-settings-title" closeLabel={t('common.close')} onClose={onClose} />
      {extension.settingsUi
        ? <HostExtensionSettings extension={extension} settings={extension.settingsUi} onClose={onClose} />
        : <div className="modal-body extension-settings-modal-body">
            {error ? <p className="preference-search-empty">{error}</p> : document ? <iframe ref={frame} title={extension.name} sandbox="allow-scripts" srcDoc={document} /> : <p className="preference-search-empty">正在读取扩展设置……</p>}
          </div>}
    </ModalShell>
  </div>
}
