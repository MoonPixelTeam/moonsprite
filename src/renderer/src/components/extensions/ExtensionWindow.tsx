import { useEffect, useRef, useState } from 'react'
import type { ExtensionRuntimeRequest, ExtensionRuntimeResponse } from '@shared/types-extension-runtime'
import { extensionStorage } from '@/core/extension-runtime'
import { closeCurrentExtensionWindow, emitExtensionRuntimeWindowMessage, extensionWindowBounds, listenForExtensionWindowFocus, listenForExtensionWindowMessage, listenForExtensionWindowMove, setExtensionWindowBounds, setExtensionWindowHitRegion, startExtensionWindowDrag } from '@/platform/extension-window'
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

const bootstrap = `(()=>{let sequence=0;const pending=new Map();const listeners=new Set();const call=(method,params)=>new Promise((resolve,reject)=>{const requestId=String(++sequence);pending.set(requestId,{resolve,reject});parent.postMessage({type:'moonsprite-extension-request',requestId,method,params},'*')});addEventListener('message',event=>{const message=event.data;if(message?.type==='moonsprite-extension-response'){const request=pending.get(message.requestId);if(!request)return;pending.delete(message.requestId);message.ok?request.resolve(message.result):request.reject(new Error(message.error||'Extension window request failed'));return}if(message?.type==='moonsprite-extension-window-message'){for(const listener of listeners)listener(message.message);dispatchEvent(new CustomEvent('moonsprite:message',{detail:message.message}))}if(message?.type==='moonsprite-extension-window-event')dispatchEvent(new CustomEvent('moonsprite:window-'+message.event.kind,{detail:message.event}))});const api=Object.freeze({storage:Object.freeze({get:key=>call('storage.get',{key}),set:(key,value)=>call('storage.set',{key,value}),remove:key=>call('storage.remove',{key}),list:()=>call('storage.list')}),resources:Object.freeze({read:resourceId=>call('resources.read',{resourceId})}),window:Object.freeze({startDrag:()=>call('window.startDrag'),getBounds:()=>call('window.getBounds'),setBounds:bounds=>call('window.setBounds',{bounds}),setHitRegion:(sourceWidth,sourceHeight,spans)=>call('window.setHitRegion',{sourceWidth,sourceHeight,spans}),postMessage:message=>call('window.postMessage',{message}),close:()=>call('window.close'),onMessage:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}),diagnostics:Object.freeze({log:(message,level='info')=>call('diagnostics.log',{message,level})})});Object.defineProperty(window,'moonsprite',{value:api,writable:false,configurable:false})})()`

const secureDocument = (html: string): string => {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const theme = parsed.createElement('style')
  theme.textContent = `html,body{background:transparent!important;background-color:transparent!important;color-scheme:normal}:root{--cursor-grab:url('${cursorGrab}') 16 16,grab;--cursor-grabbing:url('${cursorGrab}') 16 16,grabbing}`
  const script = parsed.createElement('script')
  script.textContent = bootstrap
  const policy = parsed.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"
  parsed.head.prepend(theme)
  parsed.head.prepend(script)
  parsed.head.prepend(policy)
  return `<!doctype html>${parsed.documentElement.outerHTML}`
}

export function ExtensionWindow() {
  const identity = useRef(identityFromLocation()).current
  const frame = useRef<HTMLIFrameElement>(null)
  const [document, setDocument] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.moonSprite.readExtensionRuntimeResource(identity.extensionId, identity.resourceId).then((bytes) => {
      const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (active) setDocument(secureDocument(html))
    }).catch((error) => console.error(`[Extension ${identity.extensionId}] failed to load window`, error))
    return () => { active = false }
  }, [identity.extensionId, identity.resourceId])

  useEffect(() => {
    let removeMessage: (() => void) | undefined
    let removeMoved: (() => void) | undefined
    let removeFocus: (() => void) | undefined
    void listenForExtensionWindowMessage((message) => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-message', message }, '*')).then((remove) => { removeMessage = remove })
    void listenForExtensionWindowMove((position) => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-event', event: { kind: 'moved', position } }, '*')).then((remove) => { removeMoved = remove })
    void listenForExtensionWindowFocus((focused) => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-window-event', event: { kind: 'focus', focused } }, '*')).then((remove) => { removeFocus = remove })
    return () => { removeMessage?.(); removeMoved?.(); removeFocus?.() }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<ExtensionRuntimeRequest>): void => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'moonsprite-extension-request') return
      const request = event.data
      if (typeof request.requestId !== 'string' || typeof request.method !== 'string') return
      const respond = (response: Omit<ExtensionRuntimeResponse, 'type' | 'requestId'>): void => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-response', requestId: request.requestId, ...response }, '*')
      void handleWindowRequest(identity, request.method, request.params)
        .then((result) => respond({ ok: true, result }))
        .catch((error) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [identity])

  return document ? <iframe ref={frame} title={identity.windowId} sandbox="allow-scripts" allowTransparency srcDoc={document} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, background: 'transparent', colorScheme: 'normal' }} /> : null
}

async function handleWindowRequest(identity: Identity, method: string, rawParams: unknown): Promise<unknown> {
  const params = rawParams && typeof rawParams === 'object' ? rawParams as Record<string, unknown> : {}
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
  if (method === 'window.postMessage') {
    await emitExtensionRuntimeWindowMessage({ extensionId: identity.extensionId, windowId: identity.windowId, message: params.message })
    return null
  }
  if (method === 'window.close') { await closeCurrentExtensionWindow(); return null }
  if (method === 'diagnostics.log') {
    const message = typeof params.message === 'string' ? params.message.slice(0, 2_000) : ''
    console.info(`[Extension ${identity.extensionId}/${identity.windowId}] ${message}`)
    return null
  }
  throw new Error('扩展窗口请求的方法不受支持。')
}
