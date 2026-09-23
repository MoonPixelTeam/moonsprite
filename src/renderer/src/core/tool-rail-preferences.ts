import type { QuickToolSessionState, QuickToolTarget } from './quick-tools'

export const RAIL_TOOL_TARGETS = {
  pencil: { tool: 'pencil' }, airbrush: { tool: 'airbrush' }, smooth: { tool: 'smooth' },
  eraser: { tool: 'eraser' }, 'magic-eraser': { tool: 'magic-eraser' }, liquify: { tool: 'liquify' },
  'selection.rectangle': { tool: 'selection', selectionKind: 'rectangle' },
  'selection.ellipse': { tool: 'selection', selectionKind: 'ellipse' },
  'selection.lasso': { tool: 'selection', selectionKind: 'lasso' },
  'selection.polygon-lasso': { tool: 'selection', selectionKind: 'polygon-lasso' },
  'selection.magic': { tool: 'selection', selectionKind: 'magic' },
  'selection.brush': { tool: 'selection', selectionKind: 'brush' },
  'shape.rectangle-outline': { tool: 'shape', shapeKind: 'rectangle-outline' },
  'shape.rectangle': { tool: 'shape', shapeKind: 'rectangle' },
  'shape.ellipse-outline': { tool: 'shape', shapeKind: 'ellipse-outline' },
  'shape.ellipse': { tool: 'shape', shapeKind: 'ellipse' },
  'shape.freeform': { tool: 'shape', shapeKind: 'freeform' },
  'shape.polygon': { tool: 'shape', shapeKind: 'polygon' },
  'line.line': { tool: 'line', lineKind: 'line' }, 'line.curve': { tool: 'line', lineKind: 'curve' },
  'fill.bucket': { tool: 'fill', fillKind: 'bucket' }, 'fill.gradient': { tool: 'fill', fillKind: 'gradient' },
  text: { tool: 'text' }, 'move.move': { tool: 'move', moveKind: 'move' },
  'move.slice': { tool: 'move', moveKind: 'slice' }, eyedropper: { tool: 'eyedropper' },
  hand: { tool: 'hand' }, zoom: { tool: 'zoom' }, rotate: { tool: 'rotate' }
} as const satisfies Record<string, QuickToolTarget>
export type RailToolId = keyof typeof RAIL_TOOL_TARGETS
export const RAIL_TOOL_IDS = Object.keys(RAIL_TOOL_TARGETS) as RailToolId[]
export interface RailGroup {
  kind: 'group'; id: string; name: string; tools: RailToolId[]
  behavior: 'first' | 'remember' | 'fixed'; defaultTool: RailToolId
}
export type ToolRailPreference = { kind: 'tool'; id: RailToolId } | RailGroup
export const TOOL_RAIL_PREFERENCE_KEY = 'moonsprite.preference.tool-rail'
export const TOOL_RAIL_MEMORY_KEY = 'moonsprite.tool-rail.group-memory'
const legacyIds = ['pencil', 'eraser', 'liquify', 'selection', 'shape', 'line', 'fill', 'text', 'move', 'eyedropper', 'hand', 'zoom', 'rotate']
export const DEFAULT_TOOL_RAIL: ToolRailPreference[] = legacyIds.map(id => {
  const tools = id === 'pencil' ? ['pencil', 'airbrush', 'smooth'] as RailToolId[]
    : id === 'eraser' ? ['eraser', 'magic-eraser'] as RailToolId[]
      : RAIL_TOOL_IDS.filter(tool => tool.startsWith(`${id}.`))
  return tools.length ? { kind: 'group', id: `group:${id}`, name: '', tools, behavior: 'first', defaultTool: tools[0] }
    : { kind: 'tool', id: id as RailToolId }
})
export const isRailToolId = (id: unknown): id is RailToolId => typeof id === 'string' && Object.hasOwn(RAIL_TOOL_TARGETS, id)
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'

/** A missing tool in a v2 layout is intentionally hidden; only legacy layouts append defaults. */
export function normalizeToolRail(items: unknown): ToolRailPreference[] {
  if (!Array.isArray(items)) return structuredClone(DEFAULT_TOOL_RAIL)
  const seen = new Set<string>()
  const groups = new Set<string>()
  const result: ToolRailPreference[] = []
  const take = (id: unknown): id is RailToolId => {
    if (!isRailToolId(id) || seen.has(id)) return false
    seen.add(id)
    return true
  }
  for (const item of items) {
    if (!record(item)) continue
    if (item.kind === 'tool' && take(item.id)) result.push({ kind: 'tool', id: item.id })
    if (item.kind !== 'group' || typeof item.id !== 'string' || !item.id.startsWith('group:') || groups.has(item.id) || !Array.isArray(item.tools)) continue
    groups.add(item.id)
    const tools = item.tools.filter(take)
    if (!tools.length) continue
    if (tools.length === 1) { result.push({ kind: 'tool', id: tools[0] }); continue }
    result.push({ kind: 'group', id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 80) : '', tools,
      behavior: item.behavior === 'fixed' || item.behavior === 'remember' ? item.behavior : 'first',
      defaultTool: isRailToolId(item.defaultTool) && tools.includes(item.defaultTool) ? item.defaultTool : tools[0] ?? 'pencil' })
  }
  return result
}

export function parseToolRail(value: string | null): ToolRailPreference[] {
  let parsed: unknown
  try { parsed = value ? JSON.parse(value) : null } catch { return structuredClone(DEFAULT_TOOL_RAIL) }
  if (record(parsed) && parsed.version === 3) return normalizeToolRail(parsed.items)
  // v2 defaulted every group to memory. Adopt the new first-tool default, retaining explicit fixed choices.
  if (record(parsed) && parsed.version === 2) return normalizeToolRail(parsed.items).map(item =>
    item.kind === 'group' && item.behavior === 'remember' ? { ...item, behavior: 'first' } : item)
  if (!Array.isArray(parsed)) return structuredClone(DEFAULT_TOOL_RAIL)
  if (!parsed.length || parsed.some(item => record(item) && 'kind' in item)) return normalizeToolRail(parsed)
  const ordered: ToolRailPreference[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (!record(item) || typeof item.id !== 'string' || seen.has(item.id) || !legacyIds.includes(item.id)) continue
    seen.add(item.id)
    if (item.enabled !== false) ordered.push(structuredClone(DEFAULT_TOOL_RAIL[legacyIds.indexOf(item.id)]))
  }
  legacyIds.forEach((id, i) => { if (!seen.has(id)) ordered.push(structuredClone(DEFAULT_TOOL_RAIL[i])) })
  return ordered
}

export const serializeToolRail = (items: ToolRailPreference[]): string => JSON.stringify({ version: 3, items: normalizeToolRail(items) })
export const railEntryTools = (item: ToolRailPreference): RailToolId[] => item.kind === 'group' ? item.tools : [item.id]
export const activeRailTool = (session: QuickToolSessionState): RailToolId | undefined => RAIL_TOOL_IDS.find(id =>
  Object.entries(RAIL_TOOL_TARGETS[id]).every(([key, value]) => session[key as keyof QuickToolSessionState] === value))
export function groupPrimaryTool(group: RailGroup, memory: Record<string, string>): RailToolId | undefined {
  if (group.behavior === 'first') return group.tools[0]
  const remembered = memory[group.id]
  return group.behavior === 'remember' && isRailToolId(remembered) && group.tools.includes(remembered)
    ? remembered : group.tools.includes(group.defaultTool) ? group.defaultTool : group.tools[0]
}

/** Index is a gap in the destination before removal, so same-list moves don't drift. */
export function moveRailEntry(layout: ToolRailPreference[], id: string, destination: string | null, index = Infinity): ToolRailPreference[] {
  const source = layout.find(item => item.id === id)
  if (id === destination) return layout
  const target = layout.find(item => item.kind === 'tool' && item.id === destination)
  if (target?.kind === 'tool' && isRailToolId(id)) {
    let groupId = `group:${target.id}:${id}`
    while (layout.some(item => item.id === groupId)) groupId += ':new'
    const grouped = layout.map(item => item === target ? { kind: 'group' as const, id: groupId, name: '', tools: [target.id], behavior: 'first' as const, defaultTool: target.id } : item)
    return moveRailEntry(grouped, id, groupId)
  }
  if (source?.kind === 'group' && destination !== null && destination !== 'hidden') return layout
  if (!source && !isRailToolId(id)) return layout
  if (destination !== null && destination !== 'hidden' && !layout.some(item => item.kind === 'group' && item.id === destination)) return layout
  const oldIndex = destination === null ? layout.findIndex(item => item.id === id)
    : layout.flatMap(item => item.kind === 'group' && item.id === destination ? item.tools : []).indexOf(id as RailToolId)
  const next = layout.filter(item => item.id !== id).map(item => item.kind === 'group' ? { ...item, tools: item.tools.filter(tool => tool !== id) } : item)
  if (destination !== 'hidden') {
    const at = oldIndex >= 0 && oldIndex < index ? index - 1 : index
    if (destination === null) next.splice(Math.min(at, next.length), 0, source ?? { kind: 'tool', id: id as RailToolId })
    else for (const item of next) if (item.kind === 'group' && item.id === destination) item.tools.splice(Math.min(at, item.tools.length), 0, id as RailToolId)
  }
  return normalizeToolRail(next)
}

export function restoreRailGroup(layout: ToolRailPreference[], id: string): ToolRailPreference[] {
  const defaults = DEFAULT_TOOL_RAIL.find(item => item.id === id)
  if (defaults?.kind !== 'group') return layout
  const next: ToolRailPreference[] = layout.filter(item => item.kind !== 'tool' || !defaults.tools.includes(item.id)).map(item =>
    item.id === id ? structuredClone(defaults) : item.kind === 'group' ? { ...item, tools: item.tools.filter(tool => !defaults.tools.includes(tool)) } : item)
  if (!next.some(item => item.id === id)) next.push(structuredClone(defaults))
  return normalizeToolRail(next)
}
