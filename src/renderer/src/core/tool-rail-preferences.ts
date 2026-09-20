import type { ToolId } from '@shared/types-brush'

export const TOOL_RAIL_IDS = ['pencil', 'eraser', 'liquify', 'selection', 'shape', 'line', 'fill', 'text', 'move', 'eyedropper', 'hand', 'zoom', 'rotate'] as const satisfies readonly ToolId[]
export interface ToolRailPreference { id: typeof TOOL_RAIL_IDS[number]; enabled: boolean }
export const DEFAULT_TOOL_RAIL: ToolRailPreference[] = TOOL_RAIL_IDS.map(id => ({ id, enabled: true }))
export const TOOL_RAIL_PREFERENCE_KEY = 'moonsprite.preference.tool-rail'

export function parseToolRail(value: string | null): ToolRailPreference[] {
  let parsed: unknown
  try { parsed = value ? JSON.parse(value) : [] } catch { parsed = [] }
  const result: ToolRailPreference[] = []
  if (Array.isArray(parsed)) for (const item of parsed) {
    if (!item || !TOOL_RAIL_IDS.includes(item.id) || result.some(entry => entry.id === item.id)) continue
    result.push({ id: item.id, enabled: item.enabled !== false })
  }
  for (const id of TOOL_RAIL_IDS) if (!result.some(item => item.id === id)) result.push({ id, enabled: true })
  return result
}
