import { describe, expect, it, vi } from 'vitest'
import type { StoredExtension } from '@shared/types-extensions'
import { executeExtensionCommand, extensionRuntimeAllows, extensionStorage, registerExtensionRuntime } from './extension-runtime'

const memoryStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) }
  }
}

const extension = (): StoredExtension => ({
  id: 'com.example.runtime', name: 'Runtime', version: '1.0.0', description: '', author: '', enabled: true,
  hasLuaEntry: false, hasSettings: false,
  runtime: { permissions: ['runtime', 'commands', 'storage'], resources: [] },
  commands: [{ id: 'event', name: 'Event', description: '', handler: 'runtime', runtimeEvent: 'event' }], panels: [], menuItems: [], topMenus: []
})

describe('extension runtime boundary', () => {
  it('checks every method against its declared permission', () => {
    expect(extensionRuntimeAllows(['runtime'], 'runtime.getCapabilities')).toBe(true)
    expect(extensionRuntimeAllows(['runtime'], 'storage.get')).toBe(false)
    expect(extensionRuntimeAllows(['storage'], 'unknown.method')).toBe(false)
  })

  it('namespaces extension storage', () => {
    const storage = memoryStorage()
    extensionStorage('one', storage).set('value', { count: 1 })
    extensionStorage('two', storage).set('value', { count: 2 })
    expect(extensionStorage('one', storage).get('value')).toEqual({ count: 1 })
    expect(extensionStorage('two', storage).list()).toEqual(['value'])
  })

  it('dispatches runtime commands only while that runtime is registered', () => {
    const dispatch = vi.fn()
    const remove = registerExtensionRuntime('com.example.runtime', dispatch)
    expect(executeExtensionCommand(extension(), extension().commands[0], { runLua: vi.fn(), openSettings: vi.fn() })).toBe(true)
    expect(dispatch).toHaveBeenCalledWith({ type: 'command', commandId: 'event', event: 'event' })
    remove()
    expect(executeExtensionCommand(extension(), extension().commands[0], { runLua: vi.fn(), openSettings: vi.fn() })).toBe(false)
  })
})
