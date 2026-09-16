import type { RgbaColor } from '@shared/types-color'
import type { SelectionRect } from '@shared/types-selection'

export interface RemotePixelToolConfig {
  endpoint: string
  apiKey: string
  model: string
}

export interface RemotePixelToolPayload {
  toolId: string
  width: number
  height: number
  bounds: SelectionRect
  mode: string
  pixels: number[]
  mask: number[]
}

export interface RemotePixelToolPatch {
  width: number
  height: number
  pixels?: number[]
  edits?: Array<{ index: number; rgba: [number, number, number, number] }>
}

export interface RemotePixelToolConnectionResult {
  status: number
}

const storageKey = (toolId: string): string => `moonsprite.extension-tool-config.v1.${toolId}`
const sessionConfigs = new Map<string, RemotePixelToolConfig>()

export const defaultRemotePixelToolConfig = (): RemotePixelToolConfig => ({ endpoint: '', apiKey: '', model: '' })

export const loadRemotePixelToolConfig = (toolId: string): RemotePixelToolConfig => {
  const sessionConfig = sessionConfigs.get(toolId)
  if (sessionConfig) return { ...sessionConfig }
  try {
    const raw = window.localStorage.getItem(storageKey(toolId))
    if (!raw) return defaultRemotePixelToolConfig()
    const parsed = JSON.parse(raw) as Partial<Pick<RemotePixelToolConfig, 'endpoint' | 'model'>>
    // Remove credentials written by older versions. Secrets are session-only.
    window.localStorage.removeItem(storageKey(toolId))
    return {
      endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint : '',
      apiKey: '',
      model: typeof parsed.model === 'string' ? parsed.model : ''
    }
  } catch {
    return defaultRemotePixelToolConfig()
  }
}

export const saveRemotePixelToolConfig = (toolId: string, config: RemotePixelToolConfig): void => {
  sessionConfigs.set(toolId, { ...config })
  try {
    window.localStorage.setItem(storageKey(toolId), JSON.stringify({ endpoint: config.endpoint, model: config.model }))
  } catch { /* renderer storage may be unavailable */ }
}

export const boundsFromPixelMask = (mask: Iterable<number>, width: number, height: number): SelectionRect | null => {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (const value of mask) {
    const index = Math.round(value)
    if (index < 0 || index >= width * height) continue
    const x = index % width
    const y = Math.floor(index / width)
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  return right < left || bottom < top ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export const normalizeRemotePixelToolPatch = (value: unknown, bounds: SelectionRect): RemotePixelToolPatch | null => {
  const visit = (candidate: unknown, depth: number): RemotePixelToolPatch | null => {
    if (!candidate || typeof candidate !== 'object' || depth > 3) return null
    const source = candidate as Record<string, unknown>
    let pixels: unknown = source.pixels ?? source.rgba ?? source.data
    if (typeof pixels === 'string') {
      try { pixels = JSON.parse(pixels) as unknown } catch { pixels = null }
    }
    const width = Number(source.width ?? bounds.width)
    const height = Number(source.height ?? bounds.height)
    const editsValue = source.edits ?? source.changes
    if (Array.isArray(editsValue) && width === bounds.width && height === bounds.height) {
      const edits: Array<{ index: number; rgba: [number, number, number, number] }> = []
      for (const item of editsValue) {
        if (!item || typeof item !== 'object') continue
        const record = item as Record<string, unknown>
        const index = Number(record.index)
        const rgbaValue = record.rgba ?? record.color
        if (!Number.isInteger(index) || index < 0 || index >= width * height || !Array.isArray(rgbaValue) || rgbaValue.length !== 4 || !rgbaValue.every((channel) => typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255)) continue
        edits.push({ index, rgba: rgbaValue.map((channel) => Math.round(channel as number)) as [number, number, number, number] })
      }
      if (edits.length > 0 || editsValue.length === 0) return { width, height, edits }
    }
    if (Array.isArray(pixels) && pixels.length === bounds.width * bounds.height * 4 && width === bounds.width && height === bounds.height && pixels.every((channel) => typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
      return { width, height, pixels: pixels.map((channel) => Math.round(channel as number)) }
    }
    for (const key of ['patch', 'result', 'output', 'content']) {
      const nested = visit(source[key], depth + 1)
      if (nested) return nested
    }
    return null
  }
  return visit(value, 0)
}

export const chatCompletionsEndpoints = (endpoint: string): string[] => {
  const value = endpoint.trim()
  try {
    const url = new URL(value)
    const path = url.pathname.replace(/\/+$/, '')
    if (path.endsWith('/chat/completions')) return [url.toString()]
    const direct = new URL(url.toString())
    direct.pathname = `${path}/chat/completions`
    const v1 = new URL(url.toString())
    v1.pathname = `${path}/v1/chat/completions`
    return Array.from(new Set([direct.toString(), v1.toString()]))
  } catch {
    return [value]
  }
}

export const chatCompletionsEndpoint = (endpoint: string): string => chatCompletionsEndpoints(endpoint)[0] ?? endpoint.trim()

const chatSystemPrompt = 'You are a pixel-art line repair tool. Return JSON only, with no markdown, prose, or code fences. Preserve every pixel outside the supplied mask exactly. Prefer this compact shape: {"width": NUMBER, "height": NUMBER, "edits":[{"index":NUMBER,"rgba":[R,G,B,A]}]}. Each index is a local zero-based pixel index in the supplied region; include only pixels that should change and only indexes from the mask. width and height must match the input. rgba values are integers from 0 to 255. A full pixels RGBA array is accepted only when necessary. Do not return a description, coordinates, or a base64 image.'

const chatCompletionContent = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return value
  const message = (choices[0] as { message?: unknown }).message
  if (!message || typeof message !== 'object') return value
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => typeof part === 'string' ? part : (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '')).join('')
  return content
}

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  if (!text) return null
  try { return JSON.parse(text) as unknown } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)) as unknown } catch { /* continue with a clear protocol error */ }
    }
    return null
  }
}

const responseBodyError = (status: number, body: string): Error => {
  const trimmed = body.trim()
  if (status === 401 || status === 403) return new Error('接口可访问，但 API 密钥无效或没有权限。')
  if (status === 405) return new Error('接口可访问，但不支持当前测试请求方法，请填写实际 API 地址。')
  if (/^</.test(trimmed) || /text\/html/i.test(trimmed)) return new Error(`接口返回了 HTML 页面（HTTP ${status}），当前地址可能是网页而不是 API 接口。`)
  return new Error(`扩展工具接口返回 HTTP ${status}。`)
}

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const body = await response.text()
  if (!body.trim()) return null
  try {
    return JSON.parse(body) as unknown
  } catch {
    if (/^</.test(body.trim()) || /text\/html/i.test(response.headers.get('content-type') ?? '')) {
      throw new Error('接口返回了 HTML 页面，而不是 JSON。请检查接口地址是否填写正确。')
    }
    throw new Error('接口返回的内容不是有效 JSON，请检查接口协议。')
  }
}

export const testRemotePixelToolConnection = async (config: RemotePixelToolConfig, signal?: AbortSignal): Promise<RemotePixelToolConnectionResult> => {
  const endpoint = config.endpoint.trim()
  if (!/^https?:\/\//i.test(endpoint)) throw new Error('请先配置扩展工具的 http(s) 接口地址。')
  if (!config.apiKey.trim()) throw new Error('请先配置扩展工具的密钥。')
  if (!config.model.trim()) throw new Error('请先填写模型名称，例如 deepseek-chat。')
  const model = config.model.trim()
  const modelOptions = /deepseek/i.test(model) ? { thinking: { type: 'disabled' } } : {}
  let lastError: Error | null = null
  for (const target of chatCompletionsEndpoints(endpoint)) {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Return JSON: {"ok":true}' }], response_format: { type: 'json_object' }, max_tokens: 8, stream: false, ...modelOptions }),
      signal
    })
    const body = await response.text()
    const html = /^</.test(body.trim()) || /text\/html/i.test(response.headers.get('content-type') ?? '')
    if (!response.ok) {
      lastError = responseBodyError(response.status, body)
      if ((response.status === 404 || response.status === 405 || html) && target !== chatCompletionsEndpoints(endpoint).at(-1)) continue
      throw lastError
    }
    if (html) {
      lastError = new Error('接口返回了 HTML 页面，而不是 JSON。请检查接口地址是否填写正确。')
      if (target !== chatCompletionsEndpoints(endpoint).at(-1)) continue
      throw lastError
    }
    const completion = parseJsonValue(body)
    if (!completion || !Array.isArray((completion as { choices?: unknown }).choices)) throw new Error('接口已响应，但不是有效的 Chat Completions 返回格式。')
    return { status: response.status }
  }
  throw lastError ?? new Error('无法连接到 AI 接口。')
}

export const requestRemotePixelToolPatch = async (config: RemotePixelToolConfig, payload: RemotePixelToolPayload, signal?: AbortSignal): Promise<RemotePixelToolPatch> => {
  const endpoint = config.endpoint.trim()
  if (!/^https?:\/\//i.test(endpoint)) throw new Error('请先配置扩展工具的 http(s) 接口地址。')
  if (!config.apiKey.trim()) throw new Error('请先配置扩展工具的密钥。')
  if (!config.model.trim()) throw new Error('请先填写模型名称，例如 deepseek-chat。')
  const model = config.model.trim()
  const modelOptions = /deepseek/i.test(model) ? { thinking: { type: 'disabled' } } : {}
  let lastError: Error | null = null
  const targets = chatCompletionsEndpoints(endpoint)
  for (const target of targets) {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: chatSystemPrompt },
          { role: 'user', content: JSON.stringify({ mode: payload.mode, width: payload.width, height: payload.height, pixels: payload.pixels, mask: payload.mask }) }
        ],
        response_format: { type: 'json_object' },
        stream: false,
        max_tokens: 2048,
        temperature: 0,
        ...modelOptions
      }),
      signal
    })
    const body = await response.text()
    if (!response.ok) {
      lastError = responseBodyError(response.status, body)
      if ((response.status === 404 || response.status === 405 || /^</.test(body.trim())) && target !== targets.at(-1)) continue
      throw lastError
    }
    if (/^</.test(body.trim()) || /text\/html/i.test(response.headers.get('content-type') ?? '')) {
      lastError = new Error('接口返回了 HTML 页面，而不是 JSON。请检查接口地址是否填写正确。')
      if (target !== targets.at(-1)) continue
      throw lastError
    }
    const completion = parseJsonValue(body)
    const result = normalizeRemotePixelToolPatch(parseJsonValue(chatCompletionContent(completion)), payload.bounds)
    if (!result) {
      lastError = new Error(`接口已响应，但 AI 返回的像素修线 JSON 无效；需要 ${payload.width}×${payload.height} 区域、${payload.width * payload.height * 4} 个 RGBA 数值。`)
      if (target !== targets.at(-1)) continue
      throw lastError
    }
    return result
  }
  throw lastError ?? new Error('无法连接到 AI 接口。')
}

export const rgbaArrayAt = (pixels: readonly number[], width: number, x: number, y: number): RgbaColor => {
  const offset = (y * width + x) * 4
  return { r: pixels[offset] ?? 0, g: pixels[offset + 1] ?? 0, b: pixels[offset + 2] ?? 0, a: pixels[offset + 3] ?? 0 }
}
