import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolId } from '@shared/types-brush'
import type { RgbaColor } from '@shared/types-color'
import type { ExtensionPermission, ExtensionRuntimeEvent, ExtensionRuntimeRequest, ExtensionRuntimeResponse } from '@shared/types-extension-runtime'
import { EXTENSION_RUNTIME_API_VERSION } from '@shared/types-extension-runtime'
import type { StoredExtension } from '@shared/types-extensions'
import type { DocumentSession } from '@/store/workspace'
import { useWorkspace } from '@/store/workspace'
import { EXTENSION_RUNTIME_METHOD_PERMISSIONS, executeExtensionCommand, extensionRuntimeAllows, extensionStorage, registerExtensionRuntime } from '@/core/extension-runtime'
import { listenForExtensionRuntimeWindowMessage } from '@/platform/extension-window'

const TOOL_IDS: readonly ToolId[] = ['pencil', 'airbrush', 'eraser', 'fill', 'eyedropper', 'selection', 'shape', 'line', 'text', 'move', 'hand', 'zoom', 'rotate', 'liquify', 'smooth', 'extension']
const MAX_NETWORK_RESPONSE_BYTES = 2 * 1024 * 1024

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
    runtime: domain('runtime', ['getCapabilities']), commands: domain('commands', ['execute']),
    ui: domain('ui', ['notify', 'openSettings']), windows: domain('windows', ['open', 'close', 'postMessage']), workspace: domain('workspace', ['listProjects', 'getActiveProject', 'activateProject']),
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
      try { listener(message.event); } catch (error) { console.error(error); }
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
  const runtime = extension.runtime
  const permissions = useMemo(() => runtime?.permissions ?? [], [runtime?.permissions])
  const previousDirty = useRef(session?.document.dirty ?? false)

  const send = (event: ExtensionRuntimeEvent): void => frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-event', event }, '*')
  const sendAuthorized = (event: ExtensionRuntimeEvent): void => {
    const allowed = event.type === 'activate' || event.type === 'deactivate'
      || (event.type === 'project' && permissions.includes('workspace.read'))
      || (event.type === 'command' && permissions.includes('commands'))
      || (event.type === 'settings-changed' && permissions.includes('storage'))
      || (event.type === 'window-message' && permissions.includes('windows'))
      || (['interaction', 'clock', 'document-saved', 'export-complete'].includes(event.type) && permissions.includes('events'))
    if (allowed) send(event)
  }

  useEffect(() => {
    let active = true
    void window.moonSprite.readExtensionRuntimeEntry(extension.id).then((html) => {
      if (active) setDocument(secureRuntimeDocument(html))
    }).catch((error) => {
      console.error(`[Extension ${extension.id}] failed to load runtime`, error)
    })
    return () => { active = false }
  }, [extension.id])

  useEffect(() => registerExtensionRuntime(extension.id, sendAuthorized), [extension.id, permissions])

  useEffect(() => {
    if (!permissions.includes('windows')) return
    let remove: (() => void) | undefined
    void listenForExtensionRuntimeWindowMessage((message) => {
      if (message.extensionId !== extension.id) return
      sendAuthorized({ type: 'window-message', windowId: message.windowId, message: message.message })
    }).then((unlisten) => { remove = unlisten })
    return () => remove?.()
  }, [extension.id, permissions])

  useEffect(() => {
    if (!permissions.includes('events')) return
    const interaction = (kind: 'pointer' | 'keyboard') => send({ type: 'interaction', kind })
    const pointer = () => interaction('pointer')
    const keyboard = () => interaction('keyboard')
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('keydown', keyboard, true)
    const timer = window.setInterval(() => send({ type: 'clock', timestamp: Date.now() }), 30_000)
    return () => {
      window.removeEventListener('pointerdown', pointer, true)
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
    send({ type: 'deactivate' })
    if (permissions.includes('windows')) void window.moonSprite.closeExtensionWindows(extension.id).catch(() => undefined)
  }, [extension.id, permissions])

  useEffect(() => {
    const onMessage = (event: MessageEvent<ExtensionRuntimeRequest>): void => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'moonsprite-extension-request') return
      const request = event.data
      if (typeof request.requestId !== 'string' || request.requestId.length > 80 || typeof request.method !== 'string') return
      const respond = (response: Omit<ExtensionRuntimeResponse, 'type' | 'requestId'>): void => {
        frame.current?.contentWindow?.postMessage({ type: 'moonsprite-extension-response', requestId: request.requestId, ...response }, '*')
      }
      void handleRequest(extension, permissions, request.method, request.params, onRunLuaScript, onOpenSettings)
        .then((result) => respond({ ok: true, result }))
        .catch((error) => respond({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [extension, onOpenSettings, onRunLuaScript, permissions])

  if (!runtime || !document) return null
  return <iframe
    ref={frame}
    title={`${extension.name} Runtime`}
    sandbox="allow-scripts"
    srcDoc={document}
    hidden
    onLoad={() => {
      send({ type: 'activate', apiVersion: EXTENSION_RUNTIME_API_VERSION, extensionId: extension.id })
      sendAuthorized({ type: 'project', project: projectSnapshot(session), homeOpen })
    }}
  />
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
  if (method === 'runtime.getCapabilities') return { apiVersion: EXTENSION_RUNTIME_API_VERSION, permissions, methods: Object.keys(extension.runtime ? permissions.reduce<Record<string, true>>((result, permission) => {
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
