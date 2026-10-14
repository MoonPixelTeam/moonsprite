import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { readBuiltinPetPackage } from './browser-builtin-extensions'
import { emitExtensionRuntimeWindowMessage, extensionHostBounds, listenForExtensionRuntimeWindowMessage } from './extension-window'
import { saveExtensionFile } from './extension-file'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('exposes the bundled pet runtime and only declared resources', () => {
  const pet = readBuiltinPetPackage(readFileSync('src-tauri/resources/bundled-extensions/pet-companion.msext'))
  expect(pet.extension.enabled).toBe(true)
  expect(pet.extension.commands.find(command => command.id === 'manager')?.handler).toBe('runtime')
  expect(pet.entry(pet.extension.id)).toContain('moonsprite')
  expect(pet.resource(pet.extension.id, 'sprite').slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]))
  expect(() => pet.resource(pet.extension.id, '../manifest.json')).toThrow('未注册')
  expect(() => pet.entry('untrusted')).toThrow('仅支持内置')
})

it('routes browser messages and removes the subscription without native APIs', async () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'web-trial')
  const receive = vi.fn()
  const stop = await listenForExtensionRuntimeWindowMessage(receive)
  const message = { extensionId: 'pet', windowId: 'manager', message: { type: 'ready' } }
  await emitExtensionRuntimeWindowMessage(message)
  expect(receive).toHaveBeenCalledWith(message)
  stop()
  await emitExtensionRuntimeWindowMessage(message)
  expect(receive).toHaveBeenCalledOnce()
  expect(await extensionHostBounds()).toEqual({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight })
})

it('downloads pet packages without allowing other trial exports', async () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'web-trial')
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:pet', revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  expect(await saveExtensionFile({ name: '月猫.mspet', bytes: [123, 125] })).toBe(true)
  expect(click).toHaveBeenCalledOnce()
  await expect(saveExtensionFile({ name: 'drawing.png', bytes: [1] })).rejects.toThrow('仅支持下载宠物包')
})
