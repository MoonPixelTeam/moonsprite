import { expect, it } from 'vitest'
import { DEFAULT_TOOL_RAIL, groupPrimaryTool, moveRailEntry, normalizeToolRail, parseToolRail, railEntryTools, restoreRailGroup, serializeToolRail, type RailGroup, type ToolRailPreference } from './tool-rail-preferences'

it('migrates legacy order and hidden groups without losing their concrete subtools', () => {
  const parsed = parseToolRail(JSON.stringify([{ id: 'shape', enabled: false }, { id: 'shape' }, { id: 'unknown' }, { id: 'pencil' }]))
  expect(parsed[0]).toEqual(DEFAULT_TOOL_RAIL[0])
  expect(parsed.some(item => item.id === 'group:shape')).toBe(false)
  expect(parsed).toHaveLength(DEFAULT_TOOL_RAIL.length - 1)
  expect(parseToolRail('invalid')).toEqual(DEFAULT_TOOL_RAIL)
})

const mixed: RailGroup = { kind: 'group', id: 'group:custom', name: '常用', tools: ['pencil', 'selection.lasso', 'line.curve'], behavior: 'remember', defaultTool: 'selection.lasso' }
it('uses the first tool by default and follows reordering instead of stale memory', () => {
  const group: RailGroup = { ...mixed, behavior: 'first' }
  expect(groupPrimaryTool(group, { [group.id]: 'line.curve' })).toBe('pencil')
  const moved = moveRailEntry([group], 'line.curve', group.id, 0)[0] as RailGroup
  expect(groupPrimaryTool(parseToolRail(serializeToolRail([moved]))[0] as RailGroup, {})).toBe('line.curve')
  expect(groupPrimaryTool({ ...group, tools: [] }, {})).toBeUndefined()
  expect(DEFAULT_TOOL_RAIL.filter(item => item.kind === 'group').every(item => item.behavior === 'first')).toBe(true)
})
it('migrates the previous default to first-tool display while v3 retains explicit memory', () => {
  expect(parseToolRail(JSON.stringify({ version: 2, items: [mixed] }))[0]).toMatchObject({ behavior: 'first', tools: mixed.tools })
  expect(parseToolRail(serializeToolRail([mixed]))[0]).toEqual(mixed)
})
it('round trips custom layout, order, hidden tools, fixed default and an intentionally empty rail', () => {
  const layout: ToolRailPreference[] = [{ ...mixed, behavior: 'fixed' }, { kind: 'tool', id: 'eraser' }]
  expect(parseToolRail(serializeToolRail(layout))).toEqual(layout)
  expect(parseToolRail(serializeToolRail([]))).toEqual([])
})
it('deduplicates globally and rejects invalid tools, nested groups and invalid defaults', () => {
  const result = normalizeToolRail([{ ...mixed, defaultTool: 'missing', tools: ['pencil', 'pencil', 'bad', { ...mixed }] }, { kind: 'tool', id: 'pencil' }, { ...mixed }])
  expect(result).toEqual([{ kind: 'tool', id: 'pencil' }])
})
it('moves tools between groups and root, reorders within a group, and hides them without duplication', () => {
  const layout: ToolRailPreference[] = [mixed, { kind: 'tool', id: 'eraser' }]
  const nested = moveRailEntry(layout, 'eraser', mixed.id, 1)
  expect((nested[0] as RailGroup).tools).toEqual(['pencil', 'eraser', 'selection.lasso', 'line.curve'])
  const reordered = moveRailEntry(nested, 'pencil', mixed.id, 4)
  expect((reordered[0] as RailGroup).tools).toEqual(['eraser', 'selection.lasso', 'line.curve', 'pencil'])
  const root = moveRailEntry(reordered, 'selection.lasso', null, 0)
  expect(root[0]).toEqual({ kind: 'tool', id: 'selection.lasso' })
  expect(moveRailEntry(root, 'selection.lasso', 'hidden').flatMap(railEntryTools)).not.toContain('selection.lasso')
  expect(mixed.tools).toEqual(['pencil', 'selection.lasso', 'line.curve'])
})
it('reorders whole groups but prevents nesting them', () => {
  const layout: ToolRailPreference[] = [mixed, { kind: 'tool', id: 'eraser' }]
  expect(moveRailEntry(layout, mixed.id, null, 2)[1]).toEqual(mixed)
  expect(moveRailEntry(layout, mixed.id, mixed.id)).toBe(layout)
})
it('resolves remembered and fixed tools and repairs the default when a tool leaves', () => {
  expect(groupPrimaryTool(mixed, { [mixed.id]: 'line.curve' })).toBe('line.curve')
  expect(groupPrimaryTool({ ...mixed, behavior: 'fixed' }, { [mixed.id]: 'line.curve' })).toBe('selection.lasso')
  expect(groupPrimaryTool(mixed, { [mixed.id]: 'eraser' })).toBe('selection.lasso')
  const result = moveRailEntry([mixed], 'selection.lasso', 'hidden')[0] as RailGroup
  expect(result.defaultTool).toBe('pencil')
})
it('restores a default group by moving its tools back from custom locations', () => {
  const changed = moveRailEntry(DEFAULT_TOOL_RAIL, 'smooth', null, 0)
  const restored = restoreRailGroup(changed, 'group:pencil')
  expect(restored).toEqual(DEFAULT_TOOL_RAIL)
  expect(new Set(restored.flatMap(railEntryTools)).size).toBe(restored.flatMap(railEntryTools).length)
})
it('groups a tool dropped onto another tool and dissolves singleton groups', () => {
  const layout: ToolRailPreference[] = [{ kind: 'tool', id: 'pencil' }, { kind: 'tool', id: 'eraser' }]
  const grouped = moveRailEntry(layout, 'eraser', 'pencil')
  expect(grouped).toHaveLength(1)
  expect(grouped[0]).toMatchObject({ kind: 'group', tools: ['pencil', 'eraser'] })
  expect(moveRailEntry(grouped, 'eraser', 'hidden')).toEqual([{ kind: 'tool', id: 'pencil' }])
  expect(moveRailEntry(layout, 'pencil', 'pencil')).toBe(layout)
})
