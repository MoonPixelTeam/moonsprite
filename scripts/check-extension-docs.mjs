import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'
import { headingSignature } from './check-doc-pairs.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const matches = (source, pattern) => [...source.matchAll(pattern)]
const unique = values => [...new Set(values)]
export function extensionDocInventory() {
  const runtime = matches(read('src/renderer/src/core/extension-runtime.ts'), /'([\w]+\.[\w]+)': '([^']+)'/g).map(m => ({ name: m[1], permission: m[2] }))
  const mseSource = read('src-tauri/src/platform_scripts/mse_api.rs')
  const modules = matches(mseSource, /name: "(\w+)",\s*read_only: \w+,\s*methods: (\w+)/g)
  const mse = modules.flatMap(([, module, constant]) => {
    const block = mseSource.match(new RegExp(`const ${constant}: [\\s\\S]*?methods!\\[([\\s\\S]*?)\\];`))?.[1]
    if (!block) throw Error(`Cannot extract ${constant}`)
    return matches(block, /\("(\w+)", (true|false)\)/g).map(([, method, readOnly]) => ({ name: `${module}.${method}`, readOnly: readOnly === 'true' }))
  })
  const bridge = path => unique(matches(read(path).match(/const \w*[Bb]ootstrap = `([^`]+)`/)?.[1] ?? '', /call\('([^']+)'/g).map(m => m[1]))
  const window = bridge('src/renderer/src/components/extensions/ExtensionWindow.tsx')
  const settings = bridge('src/renderer/src/components/dialogs/ExtensionSettingsDialog.tsx')
  const events = matches(read('src/renderer/src/core/extension-editor-events.ts').split('] as const')[0], /'([\w.-]+)'/g).map(m => m[1])
  const permissions = matches(read('src/shared/types-extension-runtime.ts').split('] as const')[0], /'([\w.-]+)'/g).map(m => m[1]).filter(name => name !== '1.0.0')
  const manifestFields = unique(matches(read('src-tauri/src/platform_extensions.rs'), /struct Extension\w*Manifest \{([\s\S]*?)\n\}/g).flatMap(([, source]) => matches(source, /^    (\w+):/gm).map(([, field]) => field === 'kind' ? 'type' : field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()))))
  const nodes = matches(read('src/renderer/src/components/extensions/ExtensionDialogForm.tsx'), /case '([^']+)':/g).map(m => m[1])
  const luaSource = read('src-tauri/src/platform_scripts/lua_api.rs')
  const lua = matches(luaSource, /impl UserData for Script(\w+) \{([\s\S]*?)\n\}/g).map(([, name, source]) => ({
    name,
    fields: unique(matches(source, /add_field_method_get\(\s*"([^"]+)"/g).map(m => m[1])),
    writable: unique(matches(source, /add_field_method_set\(\s*"([^"]+)"/g).map(m => m[1])),
    methods: unique([...matches(source, /add_method(?:_mut)?\(\s*"([^"]+)"/g).map(m => m[1]), ...(name === 'Dialog' ? matches(source, /\("(\w+)", "\w+"\)/g).map(m => m[1]) : [])])
  }))
  return { runtime, mse, window, settings, events, nodes, lua, permissions, manifestFields }
}

export function checkExtensionDocs() {
  const inventory = extensionDocInventory(), errors = []
  for (const [name, items] of Object.entries(inventory)) if (!items.length) errors.push(`Empty source inventory: ${name}`)
  const names = ['README', 'manifest', 'runtime-api', 'ui-form', 'quickstart', 'api-index']
  const pairs = [...names.map(name => `docs/extensions/${name}`), 'docs/scripting/compatibility-api']
  for (const base of pairs) {
    const zh = read(base + '.md'), en = read(base + '.en.md')
    if (JSON.stringify(headingSignature(zh)) !== JSON.stringify(headingSignature(en))) errors.push(`${base}: headings differ`)
    for (const suffix of ['', '.en']) {
      const path = base + suffix + '.md', source = read(path)
      for (const [, target] of matches(source, /\[[^\]]*\]\(([^)]+)\)/g)) {
        if (/^[a-z]+:/i.test(target)) continue
        const file = target.split('#')[0]
        if (file && !existsSync(resolve(root, dirname(path), file))) errors.push(`${path}: broken link ${target}`)
      }
    }
  }
  for (const suffix of ['', '.en']) {
    const index = read(`docs/extensions/api-index${suffix}.md`)
    for (const method of [...inventory.runtime, ...inventory.mse]) if (!index.includes('`' + method.name + '`')) errors.push(`API index${suffix}: missing ${method.name}`)
    for (const name of [...inventory.window, ...inventory.settings, 'window.id', 'window.onMessage', ...inventory.events]) if (!index.includes('`' + name + '`')) errors.push(`API index${suffix}: missing ${name}`)
    const form = read(`docs/extensions/ui-form${suffix}.md`)
    for (const name of inventory.nodes) if (!form.includes('| `' + name + '` |')) errors.push(`Form${suffix}: missing ${name}`)
    const runtime = read(`docs/extensions/runtime-api${suffix}.md`)
    for (const name of inventory.permissions) if (!runtime.includes('| `' + name + '` |')) errors.push(`Permissions${suffix}: missing ${name}`)
    const manifest = read(`docs/extensions/manifest${suffix}.md`)
    for (const field of inventory.manifestFields) if (!new RegExp(`\\b${field}\\b`).test(manifest)) errors.push(`Manifest${suffix}: missing ${field}`)
    for (const [, js] of matches(form, /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      try { new Script(js, { filename: `ui-form${suffix}.md` }) } catch (error) { errors.push(String(error)) }
    }
    const compat = read(`docs/scripting/compatibility-api${suffix}.md`)
    for (const object of inventory.lua) for (const member of [...object.fields, ...object.methods]) if (!compat.includes('`' + object.name + '.' + member + '`')) errors.push(`Lua compatibility${suffix}: missing ${object.name}.${member}`)
  }
  const declarations = read('docs/scripting/mse-api.lua')
  for (const method of inventory.mse) {
    const [module, name] = method.name.split('.')
    const type = declarations.match(new RegExp(`---@field ${module} (Mse\\w+Api)`))?.[1]
    const block = type && declarations.match(new RegExp(`---@class ${type}\\b([\\s\\S]*?)(?=---@class|$)`))?.[1]
    if (!block?.includes(`---@field ${name} `)) errors.push(`LuaLS: missing ${method.name}`)
  }
  const sampleRoot = 'docs/extensions/examples/hello-runtime/'
  const manifest = JSON.parse(read(sampleRoot + 'manifest.json'))
  if (manifest.schemaVersion !== 2 || manifest.apiVersion !== '1.0.0') errors.push('Sample: runtime version mismatch')
  const entries = [manifest.runtime.entry, ...Object.values(manifest.runtime.resources)]
  for (const entry of entries) {
    const html = read(sampleRoot + entry)
    for (const [, js] of matches(html, /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      try { new Script(js, { filename: entry }) } catch (error) { errors.push(String(error)) }
    }
  }
  const commandIds = new Set(manifest.commands.map(command => command.id))
  for (const menu of manifest.topMenus) for (const command of menu.commands) if (!commandIds.has(command)) errors.push('Sample: missing command ' + command)
  const result = { runtimeMethods: inventory.runtime.length, mseMethods: inventory.mse.length, windowMethods: inventory.window.length, settingsMethods: inventory.settings.length, editorEvents: inventory.events.length, formNodes: inventory.nodes.length, luaObjectTypes: inventory.lua.length, permissions: inventory.permissions.length, manifestFieldNames: inventory.manifestFields.length, errors }
  console.log(JSON.stringify(result, null, 2))
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (checkExtensionDocs().errors.length) process.exitCode = 1
}
