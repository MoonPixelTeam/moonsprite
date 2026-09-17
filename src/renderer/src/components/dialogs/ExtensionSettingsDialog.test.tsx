import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StoredExtension, StoredExtensionSettingsUi } from '@shared/types-extensions'
import { ExtensionSettingsDialog } from './ExtensionSettingsDialog'

const mock = vi.hoisted(() => ({ values: {} as Record<string, unknown>, command: vi.fn(() => true) }))
vi.mock('@/components/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/ModalShell', () => ({ ModalShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/DialogHeader', () => ({ DialogHeader: () => null }))
vi.mock('@/core/extension-runtime', () => ({
  extensionStorage: () => ({ get: () => mock.values, set: (_key: string, value: Record<string, unknown>) => { mock.values = value } }),
  dispatchExtensionRuntimeEvent: vi.fn(), dispatchExtensionRuntimeCommand: mock.command
}))
afterEach(() => { cleanup(); mock.values = {}; vi.clearAllMocks() })

it('evaluates all visibility conditions immediately and preserves hidden values', () => {
  const settings: StoredExtensionSettingsUi = { storageKey: 'preferences', controls: [
    { id: 'master', type: 'checkbox', label: 'Master', description: '', defaultValue: true },
    { id: 'first', type: 'checkbox', label: 'First', description: '', defaultValue: true, visibleWhen: { master: true } },
    { id: 'second', type: 'checkbox', label: 'Second', description: '', defaultValue: true, visibleWhen: { master: true } },
    { id: 'minutes', type: 'number', label: 'Minutes', description: '', defaultValue: 15, visibleWhen: { master: true, first: true } },
    { id: 'duration', type: 'number', label: 'Duration', description: '', defaultValue: 60, visibleWhen: { master: true, second: true } },
    { id: 'manage', type: 'button', label: 'Manage', description: '', commandId: 'manage', variant: 'primary', closeOnRun: false, fullWidth: true }
  ] }
  const extension = { id: 'test.settings', name: 'Settings', settingsUi: settings, commands: [{ id: 'manage', runtimeEvent: 'manage' }] } as StoredExtension
  const view = render(<ExtensionSettingsDialog extension={extension} onClose={() => {}} />)
  fireEvent.change(view.getByLabelText('Minutes'), { target: { value: '37' } })
  fireEvent.click(view.getByLabelText('First'))
  expect(view.queryByLabelText('Minutes')).toBeNull()
  expect(view.getByLabelText('Duration')).toBeTruthy()
  fireEvent.click(view.getByLabelText('Master'))
  for (const label of ['First', 'Second', 'Minutes', 'Duration']) expect(view.queryByLabelText(label)).toBeNull()
  expect(view.getByRole('button', { name: 'Manage' }).parentElement?.classList.contains('extension-settings-command-full')).toBe(true)
  fireEvent.click(view.getByLabelText('Master'))
  expect(view.queryByLabelText('Minutes')).toBeNull()
  fireEvent.click(view.getByLabelText('First'))
  expect((view.getByLabelText('Minutes') as HTMLInputElement).value).toBe('37')
  fireEvent.click(view.getByLabelText('Second'))
  expect(view.queryByLabelText('Duration')).toBeNull()
  expect(view.getByLabelText('Minutes')).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: 'Manage' }))
  expect(mock.command).toHaveBeenCalledWith('test.settings', 'manage', 'manage')
})
