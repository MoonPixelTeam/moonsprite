import { extensionAssets } from '@/core/extension-assets'
import { useCallback, useEffect, useRef, useState } from 'react'
import { extensionPointerPosition } from '@/platform/extension-window'
import type { ExtensionRuntimeRequest, ExtensionRuntimeResponse } from '@shared/types-extension-runtime'
import { dispatchExtensionRuntimeEvent, extensionStorage } from '@/core/extension-runtime'
import type { ExtensionCommandState } from '@/core/extension-command-state'
import { setExtensionCommandState } from '@/core/extension-command-state'
import { extensionHostBounds, closeCurrentExtensionWindow, emitExtensionRuntimeWindowMessage, extensionWindowBounds, listenForExtensionHostGeometry, listenForExtensionWindowFocus, listenForExtensionWindowMessage, listenForExtensionWindowMove, setExtensionWindowBounds, setExtensionWindowCursorPolicy, setExtensionWindowHitRegion, startExtensionWindowDrag } from '@/platform/extension-window'
import { loadEditorPreferences } from '@/core/file-preferences'
import { applyThemeToDocument } from '@/core/theme'
import { extensionWindowTheme } from './extension-window-theme'
import cursorDefault from '@/assets/pixel-icons/01-Slice-1.png'
import cursorGrab from '@/assets/pixel-icons/05-Slice-5.png'

interface Identity {
  extensionId: string
  windowId: string
  resourceId: string
}

const identityFromLocation = (): Identity => {
  const search = new URLSearchParams(window.location.search)
  return {
    extensionId: search.get('extensionId') ?? '',
    windowId: search.get('windowId') ?? '',
    resourceId: search.get('resourceId') ?? ''
  }
}

const bootstrap = `(()=>{let sequence=0;const pending=new Map();const listeners=new Set();const overlay=__MOONSPRITE_OVERLAY__;let press=null,drag=null;addEventListener('pointerdown',event=>{press={id:event.pointerId,x:event.screenX,y:event.screenY,target:event.target}},true);addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;call('window.setBounds',{bounds:{...drag.bounds,x:drag.bounds.x+(event.screenX-drag.x)/drag.screenScale,y:drag.bounds.y+(event.screenY-drag.y)/drag.screenScale}}).catch(console.error)});const endDrag=()=>{press=null;drag=null};addEventListener('pointerup',endDrag);addEventListener('pointercancel',endDrag);addEventListener('blur',endDrag);addEventListener('moonsprite:window-host-geometry',endDrag);const startDrag=async()=>{if(!overlay)return call('window.startDrag');const current=press;if(!current)throw new Error('startDrag requires a pointer press');const [bounds,host]=await Promise.all([call('window.getBounds'),call('window.getHostBounds')]);if(press!==current)return;current.target.setPointerCapture(current.id);drag={...current,bounds,screenScale:host.screenScale||1}};const call=(method,params)=>new Promise((resolve,reject)=>{const requestId=String(++sequence);pending.set(requestId,{resolve,reject});parent.postMessage({type:'moonsprite-extension-request',requestId,method,params},'*')});addEventListener('message',event=>{const message=event.data;if(message?.type==='moonsprite-extension-theme'){document.getElementById('moonsprite-host-theme').textContent=message.css;return}if(message?.type==='moonsprite-extension-response'){const request=pending.get(message.requestId);if(!request)return;pending.delete(message.requestId);message.ok?request.resolve(message.result):request.reject(new Error(message.error||'Extension window request failed'));return}if(message?.type==='moonsprite-extension-window-message'){for(const listener of listeners)listener(message.message);dispatchEvent(new CustomEvent('moonsprite:message',{detail:message.message}))}if(message?.type==='moonsprite-extension-window-event')dispatchEvent(new CustomEvent('moonsprite:window-'+message.event.kind,{detail:message.event}))});const api=Object.freeze({assets:Object.freeze({get:key=>call('assets.get',{key}),set:(key,value)=>call('assets.set',{key,value}),remove:key=>call('assets.remove',{key})}),storage:Object.freeze({get:key=>call('storage.get',{key}),set:(key,value)=>call('storage.set',{key,value}),remove:key=>call('storage.remove',{key}),list:()=>call('storage.list')}),resources:Object.freeze({read:resourceId=>call('resources.read',{resourceId})}),window:Object.freeze({id:__MOONSPRITE_WINDOW_ID__,startDrag:()=>startDrag(),getBounds:()=>call('window.getBounds'),getHostBounds:()=>call('window.getHostBounds'),getPointerPosition:()=>call('window.getPointerPosition'),setBounds:bounds=>call('window.setBounds',{bounds}),setHitRegion:(sourceWidth,sourceHeight,spans)=>call('window.setHitRegion',{sourceWidth,sourceHeight,spans}),setCommandState:(commandId,state)=>call('window.setCommandState',{commandId,state}),setCursorPolicy:policy=>call('window.setCursorPolicy',{policy}),postMessage:message=>call('window.postMessage',{message}),close:()=>call('window.close'),onMessage:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}),diagnostics:Object.freeze({log:(message,level='info')=>call('diagnostics.log',{message,level})})});Object.defineProperty(window,'moonsprite',{value:api,writable:false,configurable:false});document.addEventListener('pointerover',event=>{if(!event.relatedTarget)call('window.postMessage',{message:{type:'pointer-enter'}}).catch(console.error)});addEventListener('pointerdown',event=>{if(event.target.closest('[data-ms-drag]')&&!event.target.closest('button,input,select,textarea'))api.window.startDrag().catch(console.error)})})()`

/**
 * The bundled pixel cursors are inlined as `data:` URLs so the extension
 * document's restrictive CSP (`default-src 'none'`) can actually load them, and
 * every fallback keyword is a real platform cursor. Extension windows are
 * separate platform windows, so their cursor must also come from
 * `window.setCursorPolicy` rather than from inheriting the main window's mode.
 */
const CURSOR_VARIABLES: ReadonlyArray<{ variable: string; source: string; hotspot: string; fallback: string }> = [
  { variable: '--cursor-default', source: cursorDefault, hotspot: '9 5', fallback: 'default' },
  { variable: '--cursor-pointer', source: cursorDefault, hotspot: '9 5', fallback: 'pointer' },
  { variable: '--cursor-grab', source: cursorGrab, hotspot: '16 16', fallback: 'grab' },
  { variable: '--cursor-grabbing', source: cursorGrab, hotspot: '16 16', fallback: 'grabbing' }
]

const secureDocument = (html: string, themeCss: string, windowId: string, overlay = false): string => {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const theme = parsed.createElement('style')
  theme.id = 'moonsprite-host-theme'
  theme.textContent = themeCss
  const script = parsed.createElement('script')
  script.textContent = bootstrap.replace('__MOONSPRITE_WINDOW_ID__', JSON.stringify(windowId)).replace('__MOONSPRITE_OVERLAY__', String(overlay))
  const policy = parsed.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"
  parsed.head.append(theme)
  parsed.head.prepend(script)
  parsed.head.prepend(policy)
  return `<!doctype html>${parsed.documentElement.outerHTML}`
}

interface EmbeddedWindowProps {
  identity?: Identity
  onClose?: () => void
  onUiState?: (message: unknown) => void
  onLoadError?: (message: string) => void
  surface?: { request: (method: string, params: unknown) => unknown | Promise<unknown>; subscribe: (send: (event: unknown) => void) => () => void }
}
export function ExtensionWindow({ identity: suppliedIdentity, onClose, onUiState, onLoadError, surface }: EmbeddedWindowProps = {}) {
  const identity = useRef(suppliedIdentity ?? identityFromLocation()).current
  const embedded = Boolean(suppliedIdentity)
  const frame = useRef<HTMLIFrameElement>(null)
  const [document, setDocument] = useState<string | null>(null)
  const [messagesReady, setMessagesReady] = useState(false)
  const loadErrorRef = useRef(onLoadError)
  loadErrorRef.current = onLoadError

  useEffect(() => {
    let active = true
    let generation = 0
    const sync = async () => {
      const current = ++generation
      const preferences = loadEditorPreferences()
      applyThemeToDocument(preferences.theme)
      const css = await extensionWindowTheme(CURSOR_VARIABLES, preferences.useLocalCursors, preferences.cursorScale)
      if (!active || current !== generation) return
      if (!embedded) await setExtensionWindowCursorPolicy(preferences.useLocalCursors)
      frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-theme', css: css + (embedded ? 'body[data-ms-dialog]{height:100%;border:0}body[data-ms-dialog]>h1{display:none}' : '') }, '*')
    }
    const update = () => { void sync().catch(console.error) }
    window.addEventListener('storage', update)
    window.addEventListener('moonsprite:preferences-changed', update)
    return () => { active = false; window.removeEventListener('storage', update); window.removeEventListener('moonsprite:preferences-changed', update) }
  }, [])

  /**
   * A window owns the presentation state of the commands it drives (which pet is
   * active, which mode is on). The manifest cannot express that, so the reported
   * state is mirrored into the host store that the menu bar renders from.
   */
  const onCommandState = useCallback((commandId: string, state: ExtensionCommandState): void => {
    setExtensionCommandState(identity.extensionId, commandId, state)
    const message = { type: 'command-state', commandId, state }
    if (embedded) dispatchExtensionRuntimeEvent(identity.extensionId, { type: 'window-message', windowId: identity.windowId, message })
    else void emitExtensionRuntimeWindowMessage({ extensionId: identity.extensionId, windowId: identity.windowId, message }).catch(console.error)
  }, [identity.extensionId])

  useEffect(() => {
    let active = true
    void window.moonSprite.readExtensionRuntimeResource(identity.extensionId, identity.resourceId).then(async (bytes) => {
      const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const preferences = loadEditorPreferences()
      applyThemeToDocument(preferences.theme)
      const css = await extensionWindowTheme(CURSOR_VARIABLES, preferences.useLocalCursors, preferences.cursorScale)
      if (!embedded) await setExtensionWindowCursorPolicy(preferences.useLocalCursors)
      if (active) setDocument(secureDocument(html, css + (embedded ? 'body[data-ms-dialog]{height:100%;border:0}body[data-ms-dialog]>h1{display:none}' : ''), identity.windowId, Boolean(surface)))
    }).catch((error) => {
      console.error('扩展窗口加载失败', { extensionId: identity.extensionId, error })
      if (active) loadErrorRef.current?.(String(error))
    })
    return () => { active = false }
  }, [identity.extensionId, identity.resourceId])

  useEffect(() => {
    if (embedded) {
      const receive = (event: Event) => {
        const detail = (event as CustomEvent).detail
        if (detail.extensionId === identity.extensionId && detail.windowId === identity.windowId) frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-message', message: detail.message }, '*')
      }
      window.addEventListener('moonsprite:dialog-message', receive)
      setMessagesReady(true)
      return () => window.removeEventListener('moonsprite:dialog-message', receive)
    }
    let active = true
    const removers: (() => void)[] = []
    const keep = (remove: () => void) => { if (active) removers.push(remove); else remove() }
    setMessagesReady(false)
    void Promise.all([
      listenForExtensionWindowMessage((message) => {
        frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-message', message }, '*')
      }).then(keep),
      listenForExtensionWindowMove((position) => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-event', event: { kind: 'moved', position } }, '*')).then(keep),
      listenForExtensionWindowFocus((focused) => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-event', event: { kind: 'focus', focused } }, '*')).then(keep),
      listenForExtensionHostGeometry(() => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-event', event: { kind: 'host-geometry' } }, '*')).then(keep)
    ]).then(() => { if (active) setMessagesReady(true) }).catch(error => {
      active = false
      removers.splice(0).forEach(remove => remove())
      console.error('无法连接扩展窗口消息通道', error)
    })
    return () => { active = false; removers.splice(0).forEach(remove => remove()) }
  }, [])

  useEffect(() => surface?.subscribe(event => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-event', event }, '*')), [surface])

  useEffect(() => {
    const onMessage = (event: MessageEvent<ExtensionRuntimeRequest>): void => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'moonsprite-extension-request') return
      const request = event.data
      if (typeof request.requestId !== 'string' || typeof request.method !== 'string') return
      const respond = (response: Omit<ExtensionRuntimeResponse, 'type' | 'requestId'>): void => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-response', requestId: request.requestId, ...response }, '*')
      const handle = async () => {
        if (embedded) {
          if (request.method === 'window.close') { onClose?.(); return null }
          if (request.method === 'window.setCursorPolicy') return null
          if (surface && ['window.startDrag', 'window.getBounds', 'window.setBounds', 'window.getHostBounds', 'window.getPointerPosition', 'window.setHitRegion'].includes(request.method)) return surface.request(request.method, request.params)
          if (request.method === 'window.startDrag') return null
          if (request.method === 'window.postMessage') {
            const message = (request.params as { message?: { type?: string } })?.message
            if (message?.type === 'ui-state') { onUiState?.(message); return null }
            dispatchExtensionRuntimeEvent(identity.extensionId, { type: 'window-message', windowId: identity.windowId, message: (request.params as { message?: unknown })?.message }); return null
          }
          if (request.method.startsWith('window.') && request.method !== 'window.setCommandState') throw new Error('弹窗尺寸由宿主管理。')
        }
        return handleWindowRequest(identity, request.method, request.params, onCommandState)
      }
      void handle()
        .then((result) => respond({ ok: true, result }))
        .catch((error) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [identity, onCommandState, embedded, onClose, onUiState, surface])

  return document && messagesReady ? <iframe ref={frame} title={surface ? undefined : identity.windowId} aria-label={identity.windowId} sandbox="allow-scripts" allowTransparency srcDoc={document} style={{ position: embedded ? 'relative' : 'fixed', inset: 0, width: '100%', height: '100%', border: 0, background: 'transparent', colorScheme: 'normal' }} /> : null
}

async function handleWindowRequest(identity: Identity, method: string, rawParams: unknown, onCommandState: (commandId: string, state: ExtensionCommandState) => void): Promise<unknown> {
  const params = rawParams && typeof rawParams === 'object' ? rawParams as Record<string, unknown> : {}
  const assets = extensionAssets(identity.extensionId)
  if (method === 'assets.get') return assets.get(params.key)
  if (method === 'assets.set') return assets.set(params.key, params.value)
  if (method === 'assets.remove') return assets.remove(params.key)
  const storage = extensionStorage(identity.extensionId)
  if (method === 'storage.get') return storage.get(params.key)
  if (method === 'storage.set') { storage.set(params.key, params.value); return null }
  if (method === 'storage.remove') { storage.remove(params.key); return null }
  if (method === 'storage.list') return storage.list()
  if (method === 'resources.read') {
    if (typeof params.resourceId !== 'string') throw new Error('资源 ID 无效。')
    return Array.from(await window.moonSprite.readExtensionRuntimeResource(identity.extensionId, params.resourceId))
  }
  if (method === 'window.startDrag') { await startExtensionWindowDrag(); return null }
  if (method === 'window.getHostBounds') return extensionHostBounds()
  if (method === 'window.getPointerPosition') return extensionPointerPosition()
  if (method === 'window.getBounds') return extensionWindowBounds()
  if (method === 'window.setBounds') {
    const bounds = params.bounds
    if (!bounds || typeof bounds !== 'object') throw new Error('窗口边界无效。')
    const value = bounds as Record<string, unknown>
    if (![value.x, value.y, value.width, value.height].every((item) => typeof item === 'number' && Number.isFinite(item))) throw new Error('窗口边界无效。')
    await setExtensionWindowBounds({ x: Math.round(value.x as number), y: Math.round(value.y as number), width: Math.round(value.width as number), height: Math.round(value.height as number) })
    return null
  }
  if (method === 'window.setHitRegion') {
    if (typeof params.sourceWidth !== 'number' || typeof params.sourceHeight !== 'number' || !Array.isArray(params.spans)) throw new Error('窗口命中区域无效。')
    await setExtensionWindowHitRegion(params.sourceWidth, params.sourceHeight, params.spans)
    return null
  }
  if (method === 'window.setCursorPolicy') {
    const policy = params.policy && typeof params.policy === 'object' ? params.policy as Record<string, unknown> : {}
    if (typeof policy.useLocalCursors !== 'boolean') throw new Error('窗口指针策略无效。')
    await setExtensionWindowCursorPolicy(loadEditorPreferences().useLocalCursors)
    return null
  }
  if (method === 'window.setCommandState') {
    const commandId = params.commandId
    if (typeof commandId !== 'string' || commandId.length === 0 || commandId.length > 80) throw new Error('命令 ID 无效。')
    const state = params.state && typeof params.state === 'object' ? params.state as Record<string, unknown> : {}
    if (state.checked !== undefined && typeof state.checked !== 'boolean') throw new Error('命令勾选状态无效。')
    if (state.visible !== undefined && typeof state.visible !== 'boolean') throw new Error('命令可见状态无效。')
    onCommandState(commandId, { checked: state.checked as boolean | undefined, visible: state.visible as boolean | undefined })
    return null
  }
  if (method === 'window.postMessage') {
    await emitExtensionRuntimeWindowMessage({ extensionId: identity.extensionId, windowId: identity.windowId, message: params.message })
    return null
  }
  if (method === 'window.close') { await closeCurrentExtensionWindow(); return null }
  if (method === 'diagnostics.log') {
    const message = typeof params.message === 'string' ? params.message.slice(0, 2_000) : ''
    console.info('[Extension %s/%s] %s', identity.extensionId, identity.windowId, message)
    await emitExtensionRuntimeWindowMessage({ ...identity, message: { type: 'diagnostic', message, level: params.level } })
    return null
  }
  throw new Error('扩展窗口请求的方法不受支持。')
}
