import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { closeLuaScriptClientSession, runLuaScriptForActiveDocument, type LuaScriptClientSession, type LuaScriptRunOutcome } from '@/store/lua-script-service'
import { useAppScriptRuntime } from './useAppScriptRuntime'

vi.mock('@/store/lua-script-service', () => ({
  closeLuaScriptClientSession: vi.fn().mockResolvedValue(undefined),
  runLuaScriptForActiveDocument: vi.fn(),
  dispatchLuaScriptDialogForActiveDocument: vi.fn(),
  luaScriptTargetIsActive: vi.fn().mockReturnValue(true)
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('excludes duplicate starts and closes a persistent session arriving after unmount', async () => {
  let complete!: (outcome: LuaScriptRunOutcome) => void
  vi.mocked(runLuaScriptForActiveDocument).mockReturnValue(new Promise(resolve => { complete = resolve }))
  const { result, unmount } = renderHook(useAppScriptRuntime, { wrapper: I18nProvider })
  let running!: Promise<void>
  act(() => { running = result.current.run('example.lua'); void result.current.run('example.lua') })
  expect(runLuaScriptForActiveDocument).toHaveBeenCalledTimes(1)
  unmount()
  const session: LuaScriptClientSession = {
    sessionId: 'late', fileName: 'example.lua', filePath: 'example.lua', dialogs: [],
    target: {} as LuaScriptClientSession['target']
  }
  await act(async () => {
    complete({ session, summary: { fileName: 'example.lua', filePath: 'example.lua', output: [], transactionCount: 0, changedPixelCount: 0, elapsedMs: 1 } })
    await running
  })
  expect(closeLuaScriptClientSession).toHaveBeenCalledWith(window.moonSprite, session)
})
