import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { extensionMenuItems, extensionMenuName, setExtensionMenuItems, clearExtensionCommandState } from './extension-command-state'

it('ships installable static menu references and runtime items accepted by the host', async () => {
  const files = unzipSync(readFileSync('output/pet-companion.msext'))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  for (const menu of manifest.topMenus) {
    expect(menu.commands.length).toBeGreaterThan(0)
    expect(menu.commands.length).toBeLessThanOrEqual(32)
    expect(new Set(menu.commands).size).toBe(menu.commands.length)
    for (const id of menu.commands) expect(manifest.commands.some((command: {id: string}) => command.id === id)).toBe(true)
  }
  const handlers: Record<string, (event?: unknown) => Promise<void>> = {}
  const stored = new Map<string, unknown>()
  const errors: unknown[] = []
  let settingsOpened = false
  expect(manifest.commands.find((command: {id: string}) => command.id === 'settings').opensSettings).toBe(true)
  try {
    vm.runInNewContext(strFromU8(files['runtime/index.html']).match(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/i)![1], {
      moonsprite: {
        ui: {openSettings: async () => { settingsOpened = true }},
        on: (name: string, fn: typeof handlers[string]) => { handlers[name] = fn },
        storage: { get: async ({key}: {key: string}) => stored.get(key), set: async ({key,value}: {key: string;value: unknown}) => stored.set(key,value) },
        menus: { setItems: async ({menuId,items,name}: {menuId: string;items: unknown;name: string}) => setExtensionMenuItems(manifest.id,menuId,items,name) },
        windows: { close: async () => {}, open: async () => {}, postMessage: async () => {} },
        diagnostics: { log: async (error: unknown) => errors.push(error) }
      }
    })
    await handlers['locale-changed']({locale:'zh-CN'})
    await handlers.activate()
    expect(extensionMenuName(manifest.id,'pet-menu')).toBe('宠物')
    await handlers.command({event:'settings'})
    expect(settingsOpened).toBe(true)
    const items = extensionMenuItems(manifest.id,'pet-menu')
    expect(items.map(item => item.id)).toEqual(['builtin','manager','settings'])
    expect(items.find(item => item.id === 'manager')?.dividerBefore).toBe(true)
    expect(items.every(item => item.checked === false)).toBe(true)
    await handlers.command({event:'toggle-pet',commandId:'builtin'})
    expect(extensionMenuItems(manifest.id,'pet-menu').find(item => item.id === 'builtin')?.checked).toBe(true)
    await handlers['locale-changed']({locale:'ja-JP'})
    expect(extensionMenuName(manifest.id,'pet-menu')).toBe('ペット')
    expect(errors).toEqual([])
  } finally {
    clearExtensionCommandState(manifest.id)
  }
})
