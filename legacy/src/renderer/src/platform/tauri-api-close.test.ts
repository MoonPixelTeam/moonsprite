import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage: ((event: unknown) => void) | null = null
  }
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))

import { createTauriApi } from './tauri-api'

describe('Tauri close request transport', () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue(undefined)
    mocks.listen.mockReset()
  })

  it('asks the backend to replay a close request after the listener is ready', async () => {
    let closeListener: (() => void) | null = null
    const removeListener = vi.fn()
    mocks.listen.mockImplementation(async (event: string, callback: () => void) => {
      if (event === 'app:request-close') closeListener = callback
      return removeListener
    })

    const api = createTauriApi()
    const onClose = vi.fn()
    const unsubscribe = api.onRequestClose(onClose)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

    expect(mocks.invoke).toHaveBeenCalledWith('close_listener_ready')
    const fireClose = (): void => { (closeListener as (() => void) | null)?.() }
    fireClose()
    expect(onClose).toHaveBeenCalledTimes(1)

    unsubscribe()
    fireClose()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledTimes(1)
  })
})
