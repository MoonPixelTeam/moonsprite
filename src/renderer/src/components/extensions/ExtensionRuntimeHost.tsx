import { EXTENSION_EDITOR_EVENTS } from '@/core/extension-editor-events'
import { editorEventSnapshot, changedEditorEvents } from '@/store/workspace-extension-events'
import { CANVAS_COLOR_SAMPLING_COMPLETED_EVENT } from '@/components/color-sampling-events'
import { ExtensionOverlay, type OverlayDefinition } from './ExtensionOverlay'
import { overlayBounds } from './extension-overlay-geometry'
import { recordRuntimeDiagnostic } from '@/core/runtime-diagnostics'
import { ModalShell } from '@/components/ModalShell'
import { DialogHeader } from '@/components/DialogHeader'
import { ExtensionDialogForm } from './ExtensionDialogForm'
import { ExtensionWindow } from './ExtensionWindow'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolId } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { ExtensionPermission, ExtensionRuntimeEvent, ExtensionRuntimeRequest, ExtensionRuntimeResponse } from '@shared/types-extension-runtime'
import { EXTENSION_RUNTIME_API_VERSION } from '@shared/types-extension-runtime'
import type { StoredExtension } from '@shared/types-extensions'
import type { DocumentSession } from '@/store/workspace'
import { useWorkspace } from '@/store/workspace'
import { EXTENSION_RUNTIME_METHOD_PERMISSIONS, executeExtensionCommand, extensionRuntimeAllows, extensionStorage, registerExtensionRuntime } from '@/core/extension-runtime'
import { setExtensionCommandState, clearExtensionCommandState, setExtensionMenuItems } from '@/core/extension-command-state'
import { listenForExtensionRuntimeWindowMessage } from '@/platform/extension-window'

const TOOL_IDS: readonly ToolId[] = ['pencil', 'airbrush', 'eraser', 'fill', 'eyedropper', 'selection', 'shape', 'line', 'text', 'move', 'hand', 'zoom', 'rotate', 'liquify', 'smooth']
const MAX_NETWORK_RESPONSE_BYTES = 2 * 1024 * 1024
const pendingWindowClosures = new Map<string, Promise<void>>()

const runtimeBootstrap = `(() => {
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    const requestId = String(++sequence);
    pending.set(requestId, { resolve, reject });
    parent.postMessage({ type: 'moonsprite-extension-request', requestId, method, params }, '*');
  });
  const on = (type, listener) => {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const values = listeners.get(type) || new Set(); values.add(listener); listeners.set(type, values);
    return () => values.delete(listener);
  };
  const domain = (name, methods) => Object.freeze(Object.fromEntries(methods.map(method => [method, (params) => call(name + '.' + method, params)])));
  const api = Object.freeze({
    apiVersion: '1.0.0', call, on,
    runtime: domain('runtime', ['getCapabilities']), commands: domain('commands', ['execute']), menus: domain('menus', ['setItems']),
    ui: domain('ui', ['notify', 'openSettings']), windows: domain('windows', ['open', 'close', 'postMessage', 'setVisible']), workspace: domain('workspace', ['listProjects', 'getActiveProject', 'activateProject']),
    document: domain('document', ['getSummary', 'getLayers', 'getFrames', 'undo', 'redo']),
    tools: domain('tools', ['getActive', 'setActive']), colors: domain('colors', ['get', 'setPrimary', 'setSecondary']),
    storage: domain('storage', ['get', 'set', 'remove', 'list']), resources: domain('resources', ['read']),
    clipboard: domain('clipboard', ['readText', 'writeText']), notifications: domain('notifications', ['show']),
    network: domain('network', ['fetch']), diagnostics: domain('diagnostics', ['log'])
  });
  Object.defineProperty(window, 'moonsprite', { value: api, configurable: false, writable: false });
  addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'moonsprite-extension-response') {
      const request = pending.get(message.requestId); if (!request) return; pending.delete(message.requestId);
      message.ok ? request.resolve(message.result) : request.reject(new Error(message.error || 'Extension request failed'));
      return;
    }
    if (message?.type !== 'moonsprite-extension-event') return;
    for (const listener of listeners.get(message.event?.type) || []) {
      Promise.resolve().then(() => listener(message.event)).catch(error => {
        console.error(error);
        call('ui.notify', { message: String(error), level: 'error' }).catch(console.error);
      });
    }
    dispatchEvent(new CustomEvent('moonsprite:' + message.event?.type, { detail: message.event }));
  });
})();`

const secureRuntimeDocument = (html: string): string => {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const script = parsed.createElement('script')
  script.textContent = runtimeBootstrap
  const policy = parsed.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"
  parsed.head.prepend(script)
  parsed.head.prepend(policy)
  return `<!doctype html>${parsed.documentElement.outerHTML}`
}

const projectSnapshot = (session: DocumentSession | null) => session ? {
  id: session.document.id,
  name: session.document.name,
  width: session.document.width,
  height: session.document.height,
  colorMode: session.document.colorMode,
  layerCount: session.document.layers.length,
  frameCount: session.document.animation?.frames.length ?? 1,
  dirty: session.document.dirty,
  contentRevision: session.contentRevision
} : null

const objectParams = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const stringParam = (params: Record<string, unknown>, key: string): string => {
  const value = params[key]
  if (typeof value !== 'string') throw new Error(`参数 ${key} 必须是字符串。`)
  return value
}
const colorParam = (value: unknown): RgbaColor => {
  if (!value || typeof value !== 'object') throw new Error('颜色参数无效。')
  const input = value as Record<string, unknown>
  const channel = (key: string) => {
    const current = input[key]
    if (typeof current !== 'number' || !Number.isFinite(current)) throw new Error('颜色参数无效。')
    return Math.max(0, Math.min(255, Math.round(current)))
  }
  return { r: channel('r'), g: channel('g'), b: channel('b'), a: channel('a') }
}

interface FrameProps {
  extension: StoredExtension
  session: DocumentSession | null
  homeOpen: boolean
  onRunLuaScript: (scriptId: string) => void
  onOpenSettings: (extensionId: string) => void
}

function ExtensionRuntimeFrame({ extension, session, homeOpen, onRunLuaScript, onOpenSettings }: FrameProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [document, setDocument] = useState<string | null>(null)
  const overlays = useRef(new Map<string, OverlayDefinition>())
  const [overlayRevision, setOverlayRevision] = useState(0)
  const updateOverlays = () => setOverlayRevision(value => value + 1)
  const [dialog, setDialog] = useState<{ windowId: string; resourceId: string; title: string; component?: string } | null>(null)
  const runtime = extension.runtime
  const permissions = useMemo(() => runtime?.permissions ?? [], [runtime?.permissions])
  const previousDirty = useRef(session?.document.dirty ?? false)
  const [messagesReady, setMessagesReady] = useState(false)
  const loaded = useRef(false)
  const pendingEvents = useRef<ExtensionRuntimeEvent[]>([])

  const send = (event: ExtensionRuntimeEvent): void => {
    if (!loaded.current) {
      if (event.type === 'command' || event.type === 'settings-changed') pendingEvents.current.push(event)
      return
    }
    frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-event', event }, '*')
  }
  const sendAuthorized = (event: ExtensionRuntimeEvent): void => {
    const allowed = event.type === 'activate' || event.type === 'deactivate'
      || (event.type === 'project' && permissions.includes('workspace.read'))
      || (event.type === 'command' && permissions.includes('commands'))
      || (event.type === 'settings-changed' && permissions.includes('storage'))
      || (event.type === 'window-message' && permissions.includes('windows'))
      || (['editor-event', 'interaction', 'clock', 'document-saved', 'export-complete'].includes(event.type) && permissions.includes('events'))
    if (allowed) send(event)
  }

  useEffect(() => {
    let active = true
    loaded.current = false
    setDocument(null)
    setDialog(null)
    void Promise.resolve(pendingWindowClosures.get(extension.id)).then(() => active ? window.moonSprite.readExtensionRuntimeEntry(extension.id) : null).then((html) => {
      if (active && html !== null) setDocument(secureRuntimeDocument(html))
    }).catch((error) => {
      console.error(`[Extension ${extension.id}] failed to load runtime`, error)
    })
    return () => { active = false }
  }, [extension])

  useEffect(() => {
    if (!permissions.includes('events')) return
    const snapshot = () => { const state = useWorkspace.getState(); return editorEventSnapshot(state.sessions ?? [], state.activeId ?? null) }
    let previous = snapshot()
    const unsubscribe = useWorkspace.subscribe?.(() => { const next = snapshot(); const events = changedEditorEvents(previous, next); previous = next; events.forEach(sendAuthorized) })
    const sampled = () => sendAuthorized({ type: 'editor-event', name: 'color.sampled', projectId: useWorkspace.getState().activeId ?? undefined, timestamp: Date.now(), detail: {} })
    window.addEventListener(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, sampled)
    return () => { unsubscribe?.(); window.removeEventListener(CANVAS_COLOR_SAMPLING_COMPLETED_EVENT, sampled) }
  }, [extension.id, permissions])

  useEffect(() => registerExtensionRuntime(extension.id, sendAuthorized), [extension.id, permissions])

  useEffect(() => {
    if (!permissions.includes('windows')) { setMessagesReady(true); return }
    let active = true
    setMessagesReady(false)
    let remove: (() => void) | undefined
    void listenForExtensionRuntimeWindowMessage((message) => {
      if (!active || message.extensionId !== extension.id) return
      const payload = objectParams(message.message)
      if (payload.type === 'diagnostic') recordRuntimeDiagnostic(payload.level === 'error' ? 'error' : 'operation-stage', 'extension.window', { extensionId: extension.id, windowId: message.windowId, message: String(payload.message || '') })
      if (payload.type === 'diagnostic') { if (payload.level === 'error') useWorkspace.getState().setMessage(String(payload.message)); return }
      if (payload.type === 'pointer-enter') { window.dispatchEvent(new Event('moonsprite:extension-pointer-enter')); return }
      if (payload.type === 'command-state' && typeof payload.commandId === 'string' && extension.commands.some(command => command.id === payload.commandId)) {
        const state = objectParams(payload.state)
        setExtensionCommandState(extension.id, payload.commandId, {
          visible: typeof state.visible === 'boolean' ? state.visible : undefined,
          checked: typeof state.checked === 'boolean' ? state.checked : undefined
        })
        return
      }
      sendAuthorized({ type: 'window-message', windowId: message.windowId, message: message.message })
    }).then((unlisten) => {
      if (!active) { unlisten(); return }
      remove = unlisten
      setMessagesReady(true)
    }).catch(error => console.error('无法连接扩展消息通道', error))
    return () => { active = false; remove?.() }
  }, [extension.id, permissions])

  useEffect(() => {
    if (!permissions.includes('events')) return
    const interaction = (kind: 'pointer' | 'keyboard') => send({ type: 'interaction', kind })
    let lastPointer = 0
    const pointer = () => { const now = Date.now(); if (now - lastPointer < 500) return; lastPointer = now; interaction('pointer') }
    const keyboard = () => interaction('keyboard')
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('pointermove', pointer, true)
    window.addEventListener('wheel', pointer, true)
    window.addEventListener('keydown', keyboard, true)
    const timer = window.setInterval(() => send({ type: 'clock', timestamp: Date.now() }), 30_000)
    return () => {
      window.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('pointermove', pointer, true)
      window.removeEventListener('wheel', pointer, true)
      window.removeEventListener('keydown', keyboard, true)
      window.clearInterval(timer)
    }
  }, [permissions])

  useEffect(() => {
    sendAuthorized({ type: 'project', project: projectSnapshot(session), homeOpen })
    const dirty = session?.document.dirty ?? false
    if (permissions.includes('events') && previousDirty.current && !dirty && session) {
      sendAuthorized({ type: 'document-saved', projectId: session.document.id })
    }
    previousDirty.current = dirty
  }, [homeOpen, permissions, session?.contentRevision, session?.document.dirty, session?.document.id, session?.document.name])

  useEffect(() => () => {
    clearExtensionCommandState(extension.id)
    send({ type: 'deactivate' })
    loaded.current = false
    pendingEvents.current = []
    if (permissions.includes('windows')) {
      const close = (pendingWindowClosures.get(extension.id) ?? Promise.resolve())
        .then(() => window.moonSprite.closeExtensionWindows(extension.id))
        .catch(error => console.error('无法关闭扩展窗口', error))
      pendingWindowClosures.set(extension.id, close)
      void close.then(() => { if (pendingWindowClosures.get(extension.id) === close) pendingWindowClosures.delete(extension.id) })
    }
  }, [extension])

  useEffect(() => {
    const onMessage = (event: MessageEvent<ExtensionRuntimeRequest>): void => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'moonsprite-extension-request') return
      const request = event.data
      if (typeof request.requestId !== 'string' || request.requestId.length > 80 || typeof request.method !== 'string') return
      const respond = (response: Omit<ExtensionRuntimeResponse, 'type' | 'requestId'>): void => {
        frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-response', requestId: request.requestId, ...response }, '*')
      }
      const handle = async () => {
        if (!extensionRuntimeAllows(permissions, request.method)) throw new Error(`扩展未获准调用 ${request.method}。`)
        const params = objectParams(request.params)
        if (request.method === 'menus.setItems') {
          const menuId = stringParam(params, 'menuId')
          if (!extension.topMenus.some(menu => menu.id === menuId)) throw new Error('扩展菜单不存在。')
          if (!permissions.includes('commands')) throw new Error('菜单操作需要 commands 权限。')
          setExtensionMenuItems(extension.id, menuId, params.items)
          return null
        }
        if (request.method === 'windows.open' && objectParams(params.options).presentation === 'overlay') {
          const windowId = stringParam(params, 'windowId'), resourceId = stringParam(params, 'resourceId')
          if (!extension.runtime?.resources.includes(resourceId)) throw new Error('扩展覆盖层资源不存在。')
          if (dialog?.windowId === windowId) throw new Error('窗口 ID 已用于弹窗。')
          if (!overlays.current.has(windowId) && overlays.current.size >= 16) throw new Error('覆盖层数量已达上限。')
          const options = objectParams(params.options)
          const bounds = overlayBounds({ x: options.x ?? 32, y: options.y ?? 72, width: options.width ?? 256, height: options.height ?? 256 })
          overlays.current.set(windowId, { windowId, resourceId, bounds, visible: true }); updateOverlays(); return null
        }
        if (request.method === 'windows.open' && overlays.current.has(String(params.windowId))) throw new Error('窗口 ID 已用于覆盖层。')
        const overlay = typeof params.windowId === 'string' ? overlays.current.get(params.windowId) : undefined
        if (overlay && request.method === 'windows.postMessage') {
          window.dispatchEvent(new CustomEvent('moonsprite:dialog-message', { detail: { extensionId: extension.id, windowId: overlay.windowId, message: params.message } })); return null
        }
        if (overlay && request.method === 'windows.setVisible') {
          if (typeof params.visible !== 'boolean') throw new Error('覆盖层显示状态无效。')
          overlays.current.set(overlay.windowId, { ...overlay, visible: params.visible }); updateOverlays(); return null
        }
        if (request.method === 'windows.close') {
          if (overlay) { overlays.current.delete(overlay.windowId); updateOverlays(); return null }
          if (!params.windowId) { overlays.current.clear(); updateOverlays() }
        }
        if (request.method === 'windows.open' && objectParams(params.options).presentation === 'dialog') {
          const windowId = stringParam(params, 'windowId'), resourceId = stringParam(params, 'resourceId')
          if (!extension.runtime?.resources.includes(resourceId)) throw new Error('扩展窗口资源不存在。')
          if (overlays.current.has(windowId)) throw new Error('窗口 ID 已用于覆盖层。')
          setDialog({ windowId, resourceId, title: String(objectParams(params.options).title || extension.name), component: objectParams(params.options).component === 'form' ? 'form' : undefined }); return null
        }
        if (dialog && request.method === 'windows.postMessage' && params.windowId === dialog.windowId) {
          window.dispatchEvent(new CustomEvent('moonsprite:dialog-message', { detail: { extensionId: extension.id, windowId: dialog.windowId, message: params.message } })); return null
        }
        if (request.method === 'windows.close' && dialog && (!params.windowId || params.windowId === dialog.windowId)) {
          setDialog(null); if (params.windowId) return null
        }
        return handleRequest(extension, permissions, request.method, request.params, onRunLuaScript, onOpenSettings)
      }
      void handle()
        .then((result) => respond({ ok: true, result }))
        .catch((error) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [extension, onOpenSettings, onRunLuaScript, permissions, dialog, overlayRevision])

  if (!runtime || !document || !messagesReady) return null
  return <><iframe
    ref={frame}
    title={`${extension.name} Runtime`}
    sandbox="allow-scripts"
    srcDoc={document}
    hidden
    onLoad={() => {
      loaded.current = true
      send({ type: 'activate', apiVersion: EXTENSION_RUNTIME_API_VERSION, extensionId: extension.id })
      sendAuthorized({ type: 'project', project: projectSnapshot(session), homeOpen })
      for (const event of pendingEvents.current.splice(0)) sendAuthorized(event)
    }}
  />
    {Array.from(overlays.current.values()).map(definition => <ExtensionOverlay key={definition.windowId + ':' + definition.resourceId} extensionId={extension.id} definition={definition} onClose={() => { overlays.current.delete(definition.windowId); updateOverlays() }} />)}
    {dialog && <div className="modal-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) setDialog(null) }}>
      <ModalShell storageKey={`extension-dialog:${extension.id}:${dialog.windowId}`} defaultWidth={560} defaultHeight={600} minWidth={360} minHeight={300} role="dialog" aria-modal="true" aria-label={dialog.title} style={{ display: 'flex', flexDirection: 'column' }}>
        <DialogHeader title={dialog.title} closeLabel="关闭" onClose={() => setDialog(null)} />
        <div style={{ flex: 1, minHeight: 0 }}>
          {dialog.component === 'form' ? <ExtensionDialogForm extensionId={extension.id} windowId={dialog.windowId} resourceId={dialog.resourceId} onClose={() => setDialog(null)} /> : <ExtensionWindow key={dialog.windowId + dialog.resourceId} identity={{ extensionId: extension.id, windowId: dialog.windowId, resourceId: dialog.resourceId }} onClose={() => setDialog(null)} />}
        </div>
      </ModalShell>
    </div>}
  </>
}

async function handleRequest(
  extension: StoredExtension,
  permissions: readonly ExtensionPermission[],
  method: string,
  rawParams: unknown,
  onRunLuaScript: (scriptId: string) => void,
  onOpenSettings: (extensionId: string) => void
): Promise<unknown> {
  if (!extensionRuntimeAllows(permissions, method)) throw new Error(`扩展未获准调用 ${method}。`)
  const params = objectParams(rawParams)
  const workspace = useWorkspace.getState()
  const active = workspace.sessions.find((candidate) => candidate.document.id === workspace.activeId) ?? null
  if (method === 'runtime.getCapabilities') return { apiVersion: EXTENSION_RUNTIME_API_VERSION, permissions, editorEvents: permissions.includes('events') ? EXTENSION_EDITOR_EVENTS : [], windowPresentations: permissions.includes('windows') ? ['native', 'dialog', 'overlay'] : [], methods: Object.keys(extension.runtime ? permissions.reduce<Record<string, true>>((result, permission) => {
    for (const [candidate, required] of Object.entries(EXTENSION_RUNTIME_METHOD_PERMISSIONS)) if (required === permission) result[candidate] = true
    return result
  }, {}) : {}) }
  if (method === 'storage.get') return extensionStorage(extension.id).get(params.key)
  if (method === 'storage.set') { extensionStorage(extension.id).set(params.key, params.value); return null }
  if (method === 'storage.remove') { extensionStorage(extension.id).remove(params.key); return null }
  if (method === 'storage.list') return extensionStorage(extension.id).list()
  if (method === 'resources.read') {
    const resourceId = stringParam(params, 'resourceId')
    if (!extension.runtime?.resources.includes(resourceId)) throw new Error('扩展运行时资源不存在。')
    return Array.from(await window.moonSprite.readExtensionRuntimeResource(extension.id, resourceId))
  }
  if (method === 'ui.notify' || method === 'notifications.show') {
    workspace.setMessage(stringParam(params, 'message').slice(0, 500))
    return null
  }
  if (method === 'ui.openSettings') {
    if (!extension.hasSettings) throw new Error('扩展未提供设置页面。')
    onOpenSettings(extension.id)
    return null
  }
  if (method === 'commands.execute') {
    const commandId = stringParam(params, 'commandId')
    const command = extension.commands.find((candidate) => candidate.id === commandId)
    if (!command) throw new Error('扩展命令不存在。')
    return executeExtensionCommand(extension, command, { runLua: onRunLuaScript, openSettings: onOpenSettings })
  }
  if (method === 'windows.open') {
    const windowId = stringParam(params, 'windowId')
    const resourceId = stringParam(params, 'resourceId')
    if (!extension.runtime?.resources.includes(resourceId)) throw new Error('扩展窗口资源不存在。')
    const options = params.options && typeof params.options === 'object' ? params.options as Record<string, unknown> : {}
    await window.moonSprite.showExtensionWindow(extension.id, windowId, resourceId, {
      x: typeof options.x === 'number' ? Math.round(options.x) : 32,
      y: typeof options.y === 'number' ? Math.round(options.y) : 72,
      width: typeof options.width === 'number' ? Math.round(options.width) : 256,
      height: typeof options.height === 'number' ? Math.round(options.height) : 256,
      transparent: options.transparent !== false,
      focusable: options.focusable === true
    })
    return null
  }
  if (method === 'windows.close') {
    await window.moonSprite.closeExtensionWindows(extension.id, typeof params.windowId === 'string' ? params.windowId : undefined)
    return null
  }
  if (method === 'windows.setVisible') {
    if (typeof params.visible !== 'boolean') throw new Error('窗口显示状态无效。')
    await window.moonSprite.setExtensionWindowVisible(extension.id, stringParam(params, 'windowId'), params.visible)
    return null
  }
  if (method === 'windows.postMessage') {
    await window.moonSprite.emitExtensionWindowMessage(extension.id, stringParam(params, 'windowId'), params.message)
    return null
  }
  if (method === 'workspace.listProjects') return workspace.sessions.map(projectSnapshot)
  if (method === 'workspace.getActiveProject' || method === 'document.getSummary') return projectSnapshot(active)
  if (method === 'workspace.activateProject') {
    const projectId = stringParam(params, 'projectId')
    if (!workspace.sessions.some((candidate) => candidate.document.id === projectId)) throw new Error('工程不存在。')
    workspace.setActive(projectId)
    return null
  }
  if (!active && method.startsWith('document.')) throw new Error('当前没有打开的工程。')
  if (method === 'document.getLayers') return active?.document.layers.map((layer) => ({ id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, blendMode: layer.blendMode })) ?? []
  if (method === 'document.getFrames') return active?.document.animation?.frames.map((frame, index) => ({ id: frame.id, index, duration: frame.duration })) ?? []
  if (method === 'document.undo') { workspace.undo(); return null }
  if (method === 'document.redo') { workspace.redo(); return null }
  if (method === 'tools.getActive') return active?.tool ?? null
  if (method === 'tools.setActive') {
    const tool = stringParam(params, 'tool') as ToolId
    if (!TOOL_IDS.includes(tool)) throw new Error('工具 ID 无效。')
    workspace.setTool(tool)
    return null
  }
  if (method === 'colors.get') return active ? { primary: active.primaryColor, secondary: active.secondaryColor } : null
  if (method === 'colors.setPrimary') { workspace.setPrimaryColor(colorParam(params.color)); return null }
  if (method === 'colors.setSecondary') { workspace.setSecondaryColor(colorParam(params.color)); return null }
  if (method === 'clipboard.readText') return navigator.clipboard.readText()
  if (method === 'clipboard.writeText') { await navigator.clipboard.writeText(stringParam(params, 'text')); return null }
  if (method === 'diagnostics.log') {
    recordRuntimeDiagnostic(params.level === 'error' ? 'error' : 'operation-stage', 'extension.runtime', { extensionId: extension.id, message: String(params.message) })
    if (params.level === 'error') workspace.setMessage(String(params.message))
    const level = ['debug', 'info', 'warn', 'error'].includes(String(params.level)) ? String(params.level) : 'info'
    const message = stringParam(params, 'message').slice(0, 2_000)
    console[level as 'debug'](`[Extension ${extension.id}] ${message}`)
    return null
  }
  if (method === 'network.fetch') {
    const url = new URL(stringParam(params, 'url'))
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('扩展网络请求仅支持 HTTP(S)。')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(url, { method: typeof params.method === 'string' ? params.method : 'GET', body: typeof params.body === 'string' ? params.body : undefined, credentials: 'omit', signal: controller.signal })
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > MAX_NETWORK_RESPONSE_BYTES) throw new Error('扩展网络响应超过 2 MiB 限制。')
      return { status: response.status, ok: response.ok, headers: Object.fromEntries(response.headers.entries()), bytes: Array.from(bytes) }
    } finally { window.clearTimeout(timeout) }
  }
  throw new Error(`宿主尚未实现 ${method}。`)
}

export function ExtensionRuntimeHost(props: Omit<FrameProps, 'extension'> & { extensions: readonly StoredExtension[] }) {
  return <>{props.extensions.filter((extension) => extension.enabled && extension.runtime).map((extension) => <ExtensionRuntimeFrame key={extension.id} extension={extension} session={props.session} homeOpen={props.homeOpen} onRunLuaScript={props.onRunLuaScript} onOpenSettings={props.onOpenSettings} />)}</>
}
