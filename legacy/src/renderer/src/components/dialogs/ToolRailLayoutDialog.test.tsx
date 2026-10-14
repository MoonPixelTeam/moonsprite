import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { type ToolRailPreference } from '@/core/tool-rail-preferences'
import { railToolCatalog } from '@/components/app/tool-rail-catalog'
import { ToolRailLayoutDialog } from './ToolRailLayoutDialog'

afterEach(cleanup)
const layout: ToolRailPreference[] = [{ kind: 'tool', id: 'pencil' }]
it('keeps edits in the child dialog until confirmed and shows the live preview', () => {
  const confirm = vi.fn()
  const view = render(<ToolRailLayoutDialog value={layout} onConfirm={confirm} onClose={() => {}} />)
  expect(view.getByRole('dialog', { name: '自定义工具栏' })).toBeTruthy()
  expect(view.queryByRole('button', { name: '上移' })).toBeNull()
  expect(view.getByRole('dialog').querySelector('.tool-rail')).not.toBeNull()
  const name = railToolCatalog('zh-CN').find(tool => tool.id === 'eraser')!.label
  fireEvent.click(view.getByRole('button', { name: `添加 ${name}` }))
  expect(confirm).not.toHaveBeenCalled()
  expect(layout).toHaveLength(1)
  fireEvent.click(view.getByRole('button', { name: '确定' }))
  expect(confirm).toHaveBeenCalledWith([...layout, { kind: 'tool', id: 'eraser' }])
})
it('discards edits on cancel, close button and the child-specific Escape routing event', () => {
  const confirm = vi.fn()
  const close = vi.fn()
  const view = render(<ToolRailLayoutDialog value={layout} onConfirm={confirm} onClose={close} />)
  expect(view.queryByRole('button', { name: '新建分组' })).toBeNull()
  fireEvent.click(view.getByRole('button', { name: `添加 ${railToolCatalog('zh-CN').find(tool => tool.id === 'eraser')!.label}` }))
  fireEvent.click(view.getByRole('button', { name: '取消' }))
  expect(close).toHaveBeenCalledTimes(1)
  fireEvent.click(view.getByRole('button', { name: '关闭' }))
  expect(close).toHaveBeenCalledTimes(2)
  fireEvent(window, new CustomEvent('moonsprite:close-dialog', { detail: { target: 'tool-rail-layout' } }))
  expect(close).toHaveBeenCalledTimes(3)
  expect(confirm).not.toHaveBeenCalled()
  expect(layout).toEqual([{ kind: 'tool', id: 'pencil' }])
})
