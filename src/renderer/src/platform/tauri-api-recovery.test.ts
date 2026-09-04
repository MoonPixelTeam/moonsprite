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

describe('Tauri recovery transport', () => {
  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue(undefined)
    mocks.listen.mockReset().mockResolvedValue(() => undefined)
  })

  it('sends recovery archives as raw bytes instead of expanding them into number arrays', async () => {
    const data = new Uint8Array([1, 2, 3, 4])
    await createTauriApi().writeRecovery('draft-1', '草稿 恢复', data)

    expect(mocks.invoke).toHaveBeenCalledWith('write_recovery', data, {
      headers: {
        'x-moonsprite-recovery-id': 'draft-1',
        'x-moonsprite-recovery-name': '%E8%8D%89%E7%A8%BF%20%E6%81%A2%E5%A4%8D'
      }
    })
  })
})
