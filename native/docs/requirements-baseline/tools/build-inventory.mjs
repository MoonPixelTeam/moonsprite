// Static evidence ledger only: this does not prove behavior or run the Demo.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(base, '../../..')
const legacy = join(repository, 'legacy')
const write = process.argv.includes('--write')
if (!write && !process.argv.includes('--check')) throw new Error('Use --write or --check')
const normalize = value => value.replaceAll('\\', '/')
const hash = value => createHash('sha256').update(value).digest('hex')
const sources = new Map()
function source(path) {
  const text = readFileSync(join(legacy, path), 'utf8')
  sources.set(path, hash(text.replaceAll('\r\n', '\n')))
  return text.split(/\r?\n/)
}
const files = readdirSync(join(base, 'requirements')).filter(file => file.endsWith('.md')).sort()
const requirements = []
for (const file of files) {
  const text = readFileSync(join(base, 'requirements', file), 'utf8').replaceAll('\r\n','\n')
  for (const match of text.matchAll(/^## ([A-Z]{2}-\d{3}) (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
    const [, id, title, body] = match
    if (!body.includes(`AC-${id}`)) throw new Error(`No acceptance: ${id}`)
    requirements.push({ id, title, file: `requirements/${file}`, acceptance: `AC-${id}` })
  }
}
if (!requirements.length || new Set(requirements.map(r => r.id)).size !== requirements.length) throw new Error('Missing or duplicate requirements: ' + requirements.map(r=>r.id).join(','))
const ids = new Set(requirements.map(r => r.id))
const req = id => requirements.find(r => r.id === id)
const link = id => { const r = req(id); if (!r) throw new Error(`Unknown requirement ${id}`); return `[${id}](${r.file}#${id.toLowerCase()})` }
const entries = []
const classify = (value, fallback = 'UI-003') => {
  const rules = [
    [/reference/i,'UI-007'], [/pet/i,'EX-006'], [/gradientMap|adjustmentLayer/i,'LA-006'],
    [/freeTile/i,'TI-004'], [/tilemapMode/i,'TI-002'], [/tileset|tilemap|tileSelection/i,'TI-001'],
    [/timelapse/i,'FS-008'], [/tween|morph/i,'AN-004'], [/animation|frame|cel|onion|loopSection/i,'AN-001'],
    [/layerStyle|Style/i,'LA-004'], [/mask|clipping/i,'LA-003'], [/linkedLayer/i,'LA-002'], [/layer|group/i,'LA-001'],
    [/palette|colorMode|Foreground|Background|ColorPanel/i,'DR-009'], [/symmetry|Iso/i,'DR-008'],
    [/gradient/i,'DR-006'], [/airbrush|magicEraser|liquify|smooth/i,'DR-007'],
    [/curve|shape|lineConnection|constrainLine|Rounded/i,'DR-004'], [/brush|pencil|eraser|Perfect/i,'DR-001'],
    [/fill|contiguous|closure/i,'DR-005'], [/text/i,'LA-005'],
    [/copy|cut|paste/i,'SE-005'], [/slice/i,'SE-006'], [/transform|flip|rotateContent|centerContent/i,'SE-004'],
    [/selection|selectAll|deselect|lasso|magic/i,'SE-001'], [/undo|redo|history/i,'CO-001'],
    [/adjustment|filter|outline|replaceColor|invertColors/i,'DR-010'],
    [/canvasResize|imageResize|cropCanvas|trimCanvas/i,'SE-004'],
    [/recovery|rollback/i,'FS-006'], [/export|SpriteSheet/i,'FS-007'], [/save/i,'FS-003'],
    [/openDocument|openRecent|openFile/i,'FS-002'], [/newDocument|closeDocument/i,'FS-001'],
    [/extension|script/i,'EX-001'], [/shortcut|modifier/i,'UI-003'],
    [/preferences|about|release|help|usage|diagnostic|ProjectInfo/i,'UI-005'],
    [/panel|workspace|toolRail|fullscreen|advanced/i,'UI-002'], [/view|zoom|grid|mirror|rotate|hand|tileRepeat/i,'UI-001'],
    [/home|folder|recent/i,'UI-004'], [/tool\./i,'DR-001']
  ]
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? fallback
}
function add(kind, path, line, key, detail, fallback) {
  entries.push({ id: `E-${kind}-${hash(`${path}:${key}:${line}`).slice(0,12)}`, kind, source: `legacy/${path}`, line, key, detail, requirement: classify(key, fallback), status: '入口已定位；语义与可达性待逐项核对' })
}
const shortcutPath = 'src/renderer/src/core/shortcut-contracts.ts'
let inDefaults = false
source(shortcutPath).forEach((line, i) => {
  if (line.startsWith('export const DEFAULT_SHORTCUTS =')) inDefaults = true
  if (inDefaults && line.startsWith('} as const')) inDefaults = false
  if (!inDefaults) return
  const m = /^  (?:'([^']+)'|(\w+)):\s*(['"])(.*?)\3,?$/.exec(line)
  if (m) add('shortcut', shortcutPath, i+1, m[1] ?? m[2], `默认绑定=${m[4] || '未分配'}`)
})
if (entries.length < 100) throw new Error('Shortcut parser no longer matches source shape')
const enums = []
const runtimeSource = 'src/renderer/src/core/extension-runtime.ts'
source(runtimeSource).forEach((line, i) => {
  const method = /^\s*['"]([a-z]+\.[A-Za-z]+)['"]:\s*['"]([^'"]+)['"]/.exec(line)
  if (method) add('api', runtimeSource, i+1, method[1], `权限=${method[2]}`, 'EX-004')
})
source('src/shared/types-extension-runtime.ts')
for (const path of ['src/shared/types-brush.ts','src/shared/types-raster.ts']) {
  source(path).forEach((line,i) => {
    const m = /^export type (ToolId|ShapeKind|GradientType|GradientDither|ColorMode) = (.+)/.exec(line)
    if (m) enums.push({ name:m[1], values:[...m[2].matchAll(/'([^']+)'/g)].map(v=>v[1]), source:`legacy/${path}`, line:i+1 })
  })
}
const candidates = [
  'src/renderer/src/components/app/AppMenuBar.tsx',
  'src/renderer/src/components/app/EditMenuCommands.tsx',
  'src/renderer/src/components/app/LayerMenuCommands.tsx',
  'src/renderer/src/components/app/quick-command-registry.ts',
  'src/renderer/src/components/AnimationPlaybackMenu.tsx',
  'src/renderer/src/components/panels/useLayerContextActions.tsx',
  'src/renderer/src/components/panels/useTimelineContextActions.tsx',
  'src/renderer/src/components/panels/PalettePanel.tsx',
  'src/renderer/src/components/panels/BrushLibraryPanel.tsx',
  'src/renderer/src/components/panels/TilesetPanel.tsx',
  'src/renderer/src/components/panels/FreeTileInstancesPanel.tsx'
]
for (const path of candidates) {
  source(path).forEach((line,i) => {
    const callbacks = [...line.matchAll(/\b(on[A-Z]\w*)\s*(?:=|:)|\bpublishShortcutCommand\(\s*['"]([^'"]+)['"]|\bshortcutId:\s*['"]([^'"]+)['"]/g)]
    for (const m of callbacks) add('ui',path,i+1,m[1]??m[2]??m[3],line.trim(),path.includes('Timeline')?'AN-001':path.includes('Layer')?'LA-001':'UI-003')
  })
}
const contracts = [
 'docs/product/behavior.md','docs/architecture/state-history.md','docs/architecture/coordinates-rendering.md',
 'docs/interactions/selection-transform.md','docs/interactions/brush-color.md','docs/interactions/pointer-modifiers.md',
 'docs/interactions/workspace-docking.md','docs/file-format.md','docs/extensions/README.md',
 'docs/extensions/api-index.md','docs/extensions/ui-form.md','docs/extensions/pet-companion-package.md',
 'docs/scripting/compatibility-api.md','docs/scripting/mse-api.md','docs/testing/regression-matrix.md'
]
const clauses = []
for (const path of contracts) {
  let heading = ''
  source(path).forEach((line,i) => {
    if (/^#{1,4} /.test(line)) heading=line.replace(/^#+ /,'')
    if (/^- |^\| `/.test(line)) clauses.push({ id:`C-${hash(`${path}:${line}`).slice(0,12)}`,source:`legacy/${path}`,line:i+1,heading,evidence:line,status:'原始文档证据；含实现细节与潜在过时说明，不是直接要求新版复现' })
  })
}
const evidence = {
 schemaVersion:1, baselineCommit:'a5b174a3c0ac8bffaeee035f8af21dfd8c94dd4d',
 declaredSourceVersion:JSON.parse(readFileSync(join(legacy,'package.json'),'utf8')).version,
 buildVersion:'本轮未构建验证', runtimeVersion:'本轮未运行验证',
 limitations:['静态扫描有边界，动态插件/脚本/上下文仍需Demo操作核对','自动归属只是领域候选，不是原子语义覆盖或运行通过','证据行可随源码变化；需求ID不随入口行变化'],
 sources:[...sources].sort(([a],[b])=>a.localeCompare(b)).map(([path,sha256])=>({path:`legacy/${path}`,sha256})),
 enums, entries, clauses
}
const header='# 功能入口台账\n\n中文；返回[需求基线](README.md)。由明确列出的源码入口提取。每行有领域需求归属，**不表示每个回调已具备完备语义或运行验证**。同一命令多入口保留来源；动态名称/条件分支见 GAP-009。\n\n'
const table='| 入口标识 | 种类 | 名称 | 默认值/来源 | 需求候选 |\n| --- | --- | --- | --- | --- |\n'
const entryText=header+`共 ${entries.length} 个静态入口候选，其中 ${entries.filter(e=>e.kind==='shortcut').length} 个默认快捷键注册项。\n\n`+table+entries.map(e=>`| ${e.id} | ${e.kind} | \`${e.key}\` | [${e.source}:${e.line}](../../../${e.source})${e.kind==='shortcut'?'；'+e.detail:''} | ${link(e.requirement)} |`).join('\n')+'\n'
const outputs=[['inventory.json',JSON.stringify(evidence,null,2)+'\n'],['entrypoints.md',entryText]]
for (const [path,content] of outputs) {
  const full=join(base,path)
  if (write) writeFileSync(full,content)
  else if (!existsSync(full)||readFileSync(full,'utf8').replaceAll('\r\n','\n')!==content) throw new Error(`Stale ledger: ${path}; review source changes, then use --write`)
}
const errors=[]
function checkMarkdown(directory) {
  for (const item of readdirSync(directory,{withFileTypes:true})) {
    const path=join(directory,item.name)
    if(item.isDirectory()) { checkMarkdown(path); continue }
    if(!item.name.endsWith('.md'))continue
    const text=readFileSync(path,'utf8')
    for(const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target=match[1]
      if(/^(https?:|mailto:|#)/.test(target))continue
      const [file,anchor]=target.split('#')
      const full=resolve(dirname(path),file)
      if(!existsSync(full))errors.push(`${normalize(relative(base,path))}: missing ${target}`)
      else if(anchor && /^[a-z]{2}-\d{3}$/.test(anchor) && !readFileSync(full,'utf8').includes(`id="${anchor}"`)) errors.push(`Missing anchor ${target}`)
    }
  }
}
checkMarkdown(base)
const cases=readFileSync(join(base,'cases.md'),'utf8')
const coverage=readFileSync(join(base,'coverage.md'),'utf8')
for(const r of requirements) {
  if(!cases.includes(r.acceptance))errors.push(`Missing case ${r.acceptance}`)
  if(!coverage.includes(r.id))errors.push(`Missing coverage ${r.id}`)
}
for(const e of entries)if(!ids.has(e.requirement))errors.push(`Unknown entry requirement ${e.id}`)
if(errors.length)throw new Error(errors.join('\n'))
console.log(`需求静态检查通过：${requirements.length}条需求，${entries.length}个入口候选，${clauses.length}条原始证据，${sources.size}个来源。未运行产品验收。`)
