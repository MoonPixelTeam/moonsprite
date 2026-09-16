import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundsFromPixelMask, chatCompletionsEndpoint, chatCompletionsEndpoints, loadRemotePixelToolConfig, normalizeRemotePixelToolPatch, requestRemotePixelToolPatch, saveRemotePixelToolConfig, testRemotePixelToolConnection } from './remote-pixel-tool'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('remote pixel extension tool', () => {
  it('calculates a compact bounds from touched document indexes', () => {
    expect(boundsFromPixelMask([1, 2, 6, 7], 4, 4)).toEqual({ x: 1, y: 0, width: 3, height: 2 })
  })

  it('keeps API keys out of persistent browser storage', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    } })
    saveRemotePixelToolConfig('secure-tool', { endpoint: 'https://api.example.com', apiKey: 'secret', model: 'test' })
    expect([...storage.values()].join('')).not.toContain('secret')
    expect(loadRemotePixelToolConfig('secure-tool')).toMatchObject({ apiKey: 'secret' })
  })

  it('accepts only a complete RGBA patch matching the requested bounds', () => {
    const bounds = { x: 2, y: 3, width: 2, height: 1 }
    expect(normalizeRemotePixelToolPatch({ pixels: Array(8).fill(255) }, bounds)).toEqual({ width: 2, height: 1, pixels: Array(8).fill(255) })
    expect(normalizeRemotePixelToolPatch({ result: { width: 2, height: 1, pixels: JSON.stringify(Array(8).fill(128)) } }, bounds)).toEqual({ width: 2, height: 1, pixels: Array(8).fill(128) })
    expect(normalizeRemotePixelToolPatch({ width: 2, height: 1, edits: [{ index: 1, rgba: [1, 2, 3, 255] }] }, bounds)).toEqual({ width: 2, height: 1, edits: [{ index: 1, rgba: [1, 2, 3, 255] }] })
    expect(normalizeRemotePixelToolPatch({ pixels: [255, 0, 0, 255] }, bounds)).toBeNull()
  })

  it('reports a readable error when the connection endpoint returns HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'text/html' : null },
      text: async () => '<!doctype html><html>登录页</html>'
    })))
    await expect(testRemotePixelToolConnection({ endpoint: 'https://example.com/api', apiKey: 'secret', model: 'deepseek-chat' }))
      .rejects.toThrow('接口返回了 HTML 页面，而不是 JSON')
  })

  it('does not expose a JSON parser error for an HTML patch response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-type' ? 'text/html' : null },
      text: async () => '<!doctype html><html>Not Found</html>'
    })))
    const payload = { toolId: 'tool', width: 1, height: 1, bounds: { x: 0, y: 0, width: 1, height: 1 }, mode: 'default', pixels: [0, 0, 0, 0], mask: [0] }
    await expect(requestRemotePixelToolPatch({ endpoint: 'https://example.com/api', apiKey: 'secret', model: 'deepseek-chat' }, payload))
      .rejects.toThrow('接口返回了 HTML 页面，而不是 JSON')
  })

  it('normalizes an OpenAI-compatible base URL to chat completions', () => {
    expect(chatCompletionsEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/chat/completions')
    expect(chatCompletionsEndpoint('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(chatCompletionsEndpoint('https://api.deepseek.com/chat/completions')).toBe('https://api.deepseek.com/chat/completions')
    expect(chatCompletionsEndpoints('https://proxy.example.com')).toEqual([
      'https://proxy.example.com/chat/completions',
      'https://proxy.example.com/v1/chat/completions'
    ])
  })

  it('pings an OpenAI-compatible chat endpoint with a minimal JSON request', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{"choices":[{"message":{"content":"{\\"ok\\":true}"}}]}'
    }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(testRemotePixelToolConnection({ endpoint: 'https://api.deepseek.com', apiKey: 'secret', model: 'deepseek-chat' })).resolves.toEqual({ status: 200 })
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', expect.objectContaining({ method: 'POST' }))
  })

  it('falls back to the common v1 path used by proxy services', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html>console</html>' })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => '{"choices":[{"message":{"content":"{\\"ok\\":true}"}}]}' })
    vi.stubGlobal('fetch', fetchMock)
    await expect(testRemotePixelToolConnection({ endpoint: 'https://proxy.example.com', apiKey: 'secret', model: 'gpt-test' })).resolves.toEqual({ status: 200 })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://proxy.example.com/v1/chat/completions')
  })
})
