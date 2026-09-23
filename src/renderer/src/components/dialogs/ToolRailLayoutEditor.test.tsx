import { useState } from 'react'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { type ToolRailPreference } from '@/core/tool-rail-preferences'
import { ToolRailLayoutEditor } from './ToolRailLayoutEditor'
import { ToolRailSlots } from '@/components/app/ToolRailSlots'
import { RAIL_TOOL_IDS } from '@/core/tool-rail-preferences'

afterEach(cleanup)
it('keeps every tool in a single row even for a group containing all tools', () => {
  const view = render(<ToolRailSlots layout={[{ kind: 'group', id: 'group:all', name: '', tools: [...RAIL_TOOL_IDS], behavior: 'first', defaultTool: 'pencil' }]} memory={{}} onActivate={() => {}} />)
  fireEvent.click(view.getByRole('button', { name: '铅笔工具' }))
  const flyout = view.getByRole('dialog', { name: '工具集' })
  expect(within(flyout).getAllByRole('button')).toHaveLength(RAIL_TOOL_IDS.length)
  expect(flyout.style.gridTemplateColumns).toBe(`repeat(${RAIL_TOOL_IDS.length}, var(--tool-rail-button-size))`)
  expect(flyout.style.gridTemplateRows).toBe('var(--tool-rail-button-size)')
})
it('shows nested settings and the live toolbar preview without separate action buttons', () => {
  let latest: ToolRailPreference[] = []
  function Harness() {
    const [value, setValue] = useState<ToolRailPreference[]>([{ kind: 'group', id: 'group:test', name: '常用', tools: ['pencil', 'eraser'], behavior: 'remember', defaultTool: 'pencil' }])
    latest = value
    return <ToolRailLayoutEditor value={value} onChange={setValue} />
  }
  const view = render(<Harness />)
  fireEvent.click(view.getByRole('button', { name: '常用' }))
  expect(view.queryByText('点击分组时')).toBeNull()
  fireEvent.click(view.getByRole('button', { name: '分组设置 常用' }))
  expect(within(view.getByRole('dialog', { name: '分组设置' })).getByText('点击分组时')).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: '完成' }))
  expect(view.queryByText('点击分组时')).toBeNull()
  expect(view.queryByRole('button', { name: '上移' })).toBeNull()
  expect(view.queryByRole('button', { name: '下移' })).toBeNull()
  expect(view.container.querySelector('.tool-rail.side-right')).not.toBeNull()
  const preview = within(view.getByRole('region', { name: '预览工具栏' }))
  fireEvent.click(preview.getByRole('button', { name: '铅笔工具' }))
  const flyout = preview.getByRole('dialog', { name: '常用' })
  fireEvent.click(within(flyout).getByRole('button', { name: '橡皮擦工具' }))
  expect(preview.queryByRole('dialog')).toBeNull()
  expect(preview.getByRole('button', { name: '橡皮擦工具' }).classList.contains('selected')).toBe(true)
  expect(latest[0]).toMatchObject({ tools: ['pencil', 'eraser'] })
})
