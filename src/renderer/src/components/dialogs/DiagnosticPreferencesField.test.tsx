import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DIAGNOSTIC_MODE_CHANGED, DIAGNOSTIC_MODE_KEY, loadDiagnosticMode } from '@/core/diagnostic-preferences'
import { DiagnosticPreferencesField } from './DiagnosticPreferencesField'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('offers three modes, persists the selection immediately and restores it on remount', () => {
  const changed = vi.fn()
  window.addEventListener(DIAGNOSTIC_MODE_CHANGED, changed)
  const hook = render(<DiagnosticPreferencesField />)
  const choose = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: '诊断日志' }))
    fireEvent.click(screen.getByRole('option', { name }))
  }
  expect(loadDiagnosticMode()).toBe('full')
  choose('仅采集（不写盘）')
  expect(loadDiagnosticMode()).toBe('memory')
  choose('关闭（不采集）')
  expect(loadDiagnosticMode()).toBe('off')
  expect(changed).toHaveBeenCalledTimes(2)
  hook.unmount()
  render(<DiagnosticPreferencesField />)
  expect(screen.getByRole('button', { name: '诊断日志' })).toHaveTextContent('关闭（不采集）')
  choose('完整记录（采集并写盘）')
  expect(loadDiagnosticMode()).toBe('full')
  window.removeEventListener(DIAGNOSTIC_MODE_CHANGED, changed)
})

it('shows a save error and keeps the previous mode if storage rejects the setting', () => {
  localStorage.setItem(DIAGNOSTIC_MODE_KEY, 'full')
  render(<DiagnosticPreferencesField />)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
  fireEvent.click(screen.getByRole('button', { name: '诊断日志' }))
  fireEvent.click(screen.getByRole('option', { name: '关闭（不采集）' }))
  expect(screen.getByRole('alert')).toHaveTextContent('无法保存诊断设置')
  expect(loadDiagnosticMode()).toBe('full')
})
