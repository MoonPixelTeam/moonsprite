import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { createTrialExample } from '@/core/trial-example'
import { createBrowserApi } from '@/platform/browser-api'
import { useWorkspace } from './workspace'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('downloads again on explicit save, reports browser handoff and retains recovery', async () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'web-trial')
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const api = createBrowserApi()
  Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: api })
  const write = vi.spyOn(api, 'writeBinaryAtomic')
  const remove = vi.spyOn(api, 'deleteRecovery')
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, recoveryRecords: [], message: null })
  useWorkspace.getState().addSession(createTrialExample())
  expect(await useWorkspace.getState().saveActive()).toBe(true)
  expect(useWorkspace.getState().message).toContain('请确认下载完成')
  expect(await useWorkspace.getState().saveActive()).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
  expect(remove).not.toHaveBeenCalled()
})
