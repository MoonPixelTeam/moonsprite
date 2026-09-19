import { afterEach, expect, it } from 'vitest'
import { translate } from '@/core/localization'
import { HISTORY_DISPLAY_KEY, historyDisplayOptions, historyDisplayType, readHiddenHistoryTypes } from './history-display-options'

afterEach(() => localStorage.clear())
it('offers known operations before they occur and maps translated labels to stable switches', () => {
  const zh = translate('zh-CN', 'workspace.history.renameLayer')
  const en = translate('en-US', 'workspace.history.renameLayer')
  expect(historyDisplayType(zh)).toBe(historyDisplayType(en))
  expect(historyDisplayOptions('zh-CN', [], [])).toContainEqual({ id: historyDisplayType(zh), label: zh })
})
it('keeps custom operation switches available after closing their document', () => {
  const id = historyDisplayType('Custom plugin operation')
  localStorage.setItem(HISTORY_DISPLAY_KEY, JSON.stringify([id]))
  expect(readHiddenHistoryTypes()).toEqual([id])
  expect(historyDisplayOptions('en-US', [], readHiddenHistoryTypes())).toContainEqual({ id, label: 'Custom plugin operation' })
})
it('filters display only, preserving real history positions and future entries', () => {
  const paint = translate('zh-CN', 'canvas.history.smooth')
  const entries = [{ position: 1, label: paint }, { position: 2, label: 'Move' }, { position: 3, label: paint }, { position: 4, label: 'Future' }]
  const hidden = [historyDisplayType(paint)]
  expect(entries.filter((entry) => !hidden.includes(historyDisplayType(entry.label))).map((entry) => entry.position)).toEqual([2, 4])
  expect(entries).toHaveLength(4)
})
