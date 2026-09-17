import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import vm from 'node:vm'
import { extractInlineScripts } from './inline-scripts.mjs'

/**
 * Structural verification for a generated `.msext` pet package.
 *
 * This is a build-time guard, not a runtime test: it parses every generated
 * inline script with the V8 parser and replays the manifest rules the Rust
 * installer enforces, so a broken page or an invalid manifest fails here instead
 * of silently doing nothing inside the app.
 */
const PET_SLOT_COUNT = 8
const [packagePath, extractionDir] = process.argv.slice(2)
if (!packagePath) throw new Error('用法：node scripts/verify-pet-package.mjs <包.msext> [解压目录]')

const files = unzipSync(readFileSync(resolve(packagePath)))
const names = Object.keys(files).sort()
const failures = []
const notes = []

const text = (name) => {
  const entry = files[name]
  if (!entry) throw new Error(`缺少文件 ${name}`)
  return strFromU8(entry)
}

// 1. Required entries.
for (const name of ['manifest.json', 'runtime/index.html', 'ui/pet.html', 'ui/manager.html', 'assets/companion.png']) {
  if (!files[name]) failures.push(`缺少必需文件：${name}`)
}

// 2. Every inline script must parse.
const inlineScripts = (name) => {
  const html = text(name)
  const scripts = extractInlineScripts(html)
  if (scripts.length === 0) failures.push(`${name} 没有内联脚本`)
  return scripts
}
const parse = (name, source) => {
  try {
    new vm.Script(source, { filename: name })
  } catch (error) {
    failures.push(`${name} 脚本语法错误：${error.message}`)
  }
}
for (const name of ['runtime/index.html', 'ui/pet.html', 'ui/manager.html']) {
  inlineScripts(name).forEach((source, index) => parse(`${name}#script${index}`, source))
}

// 3. Manifest rules mirrored from platform_extensions.rs.
const manifest = JSON.parse(text('manifest.json'))
const validId = (value) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 80
  && /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.') && !value.includes('..')
if (manifest.schemaVersion !== 2) failures.push('schemaVersion 必须是 2')
if (manifest.apiVersion !== '1.0.0') failures.push('apiVersion 必须是 1.0.0')
if (!validId(manifest.id)) failures.push(`扩展 ID 非法：${manifest.id}`)
const knownPermissions = new Set(['runtime', 'commands', 'menus', 'ui', 'windows', 'workspace.read', 'workspace.write', 'document.read', 'document.write', 'events', 'storage', 'resources', 'tools', 'io', 'clipboard', 'notifications', 'network', 'diagnostics'])
for (const permission of manifest.runtime?.permissions ?? []) {
  if (!knownPermissions.has(permission)) failures.push(`未知权限：${permission}`)
}
if (!(manifest.runtime?.permissions ?? []).includes('runtime')) failures.push('必须声明 runtime 权限')
if ((manifest.runtime?.permissions ?? []).filter((item) => item === 'commands').length === 0) failures.push('runtimeEvent 命令需要 commands 权限')

const commandIds = new Set()
const lowered = new Set()
for (const command of manifest.commands ?? []) {
  if (!validId(command.id)) failures.push(`命令 ID 非法：${command.id}`)
  if (lowered.has(command.id.toLowerCase())) failures.push(`命令 ID 重复：${command.id}`)
  lowered.add(command.id.toLowerCase())
  commandIds.add(command.id)
  const handlers = [command.entry, command.runtimeEvent, command.opensSettings].filter((value) => value !== undefined && value !== false)
  if (handlers.length !== 1) failures.push(`命令 ${command.id} 必须且只能有一种处理方式`)
  if (command.runtimeEvent && !validId(command.runtimeEvent)) failures.push(`命令 ${command.id} 的 runtimeEvent 非法`)
  if (command.opensSettings && !manifest.settingsUi && !manifest.settingsEntry) failures.push(`命令 ${command.id} 需要 settingsUi 或 settingsEntry`)
}
if ((manifest.commands ?? []).length > 64) failures.push('命令超过 64 个')
if ((manifest.panels ?? []).length > 16) failures.push('栏目超过 16 个')
if ((manifest.topMenus ?? []).length > 16) failures.push('顶层菜单超过 16 个')
const builtInMenus = new Set(['file', 'edit', 'select', 'canvas', 'layer', 'window', 'help'])
for (const item of manifest.menuItems ?? []) {
  if (!builtInMenus.has(item.menu)) failures.push(`menuItems 目标菜单非法：${item.menu}`)
  if (!['start', 'end'].includes(item.position)) failures.push(`menuItems position 非法：${item.position}`)
  for (const id of item.commands ?? []) if (!commandIds.has(id)) failures.push(`menuItems 引用了不存在的命令：${id}`)
}
const topPositions = (value) => value === 'start' || value === 'end' || /^(before|after):(file|edit|select|canvas|layer|window|help)$/.test(value)
for (const topMenu of manifest.topMenus ?? []) {
  if (!validId(topMenu.id)) failures.push(`顶层菜单 ID 非法：${topMenu.id}`)
  if (!topPositions(topMenu.position)) failures.push(`顶层菜单 position 非法：${topMenu.position}`)
  for (const id of topMenu.commands ?? []) if (!commandIds.has(id)) failures.push(`顶层菜单引用了不存在的命令：${id}`)
}
const options = new Set(['checkbox', 'number', 'text', 'select', 'button'])
for (const control of manifest.settingsUi?.controls ?? []) {
  if (!options.has(control.type)) failures.push(`设置控件类型非法：${control.type}`)
  if (control.type === 'button' && !(manifest.commands ?? []).some((command) => command.id === control.commandId && command.runtimeEvent)) {
    failures.push(`设置按钮 ${control.id} 必须引用 runtimeEvent 命令`)
  }
}
if ((manifest.settingsUi?.controls ?? []).length > 64) failures.push('设置控件超过 64 个')

// 4. Resource mapping and API surface actually used by the generated pages.
for (const [resourceId, path] of Object.entries(manifest.runtime?.resources ?? {})) {
  if (!validId(resourceId)) failures.push(`资源 ID 非法：${resourceId}`)
  if (!files[path]) failures.push(`资源 ${resourceId} 指向的文件不存在：${path}`)
}
const bridge = text('runtime/index.html')
for (const method of ['windows.open', 'windows.close', 'windows.postMessage', 'storage.get', 'storage.set']) {
  if (!bridge.includes(`'${method}'`) && !bridge.includes(method)) notes.push(`运行时未使用 ${method}`)
}
const petHtml = text('ui/pet.html')
for (const method of ['window.setHitRegion', 'window.setBounds', 'window.getBounds', 'window.setCursorPolicy', 'window.setCommandState', 'window.startDrag', 'resources.read']) {
  if (!petHtml.includes(method.replace('window.', ''))) notes.push(`宠物窗口未使用 ${method}`)
}
if (!petHtml.includes('setCursorPolicy')) failures.push('宠物窗口没有同步宿主指针策略')


// Menu entries must point to real commands, without empty reserved slots.
for (const menu of manifest.topMenus ?? []) {
  for (const id of menu.commands) if (!commandIds.has(id)) failures.push(`菜单命令不存在：${id}`)
}
if ((manifest.commands ?? []).some(command => /^pet\.\d+$/.test(command.id))) failures.push('不应声明空宠物槽位')

if (extractionDir) {
  const target = resolve(extractionDir)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const [name, bytes] of Object.entries(files)) {
    const output = resolve(target, name)
    mkdirSync(resolve(output, '..'), { recursive: true })
    writeFileSync(output, bytes)
  }
  notes.push(`已解压到 ${target}`)
}

console.log(`包内文件：${names.join(', ')}`)
for (const note of notes) console.log(`· ${note}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`)
  process.exitCode = 1
} else {
  console.log(`✓ ${packagePath} 结构校验通过（${(manifest.commands ?? []).length} 个命令，${(manifest.topMenus ?? []).length} 个顶层菜单）`)
}
