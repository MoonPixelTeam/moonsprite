import { expect, it } from 'vitest'
import { DEFAULT_TOOL_RAIL, parseToolRail } from './tool-rail-preferences'

it('preserves visibility and order, discards unknown and duplicate tools, and appends missing tools', () => {
  const parsed = parseToolRail(JSON.stringify([{ id: 'shape', enabled: false }, { id: 'shape' }, { id: 'unknown' }, { id: 'pencil' }]))
  expect(parsed.slice(0, 2)).toEqual([{ id: 'shape', enabled: false }, { id: 'pencil', enabled: true }])
  expect(parsed).toHaveLength(DEFAULT_TOOL_RAIL.length)
  expect(parseToolRail('invalid')).toEqual(DEFAULT_TOOL_RAIL)
})
