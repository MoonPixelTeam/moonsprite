import { afterEach, describe, expect, it, vi } from 'vitest'

const diagnostic = vi.hoisted(() => vi.fn())
vi.mock('@/core/runtime-diagnostics', () => ({ recordRuntimeDiagnostic: diagnostic }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); diagnostic.mockClear() })

describe('export success audio', () => {
  it('unlocks on a gesture, caches the audio and starts once per completion', async () => {
    let state = 'suspended'
    const resume = vi.fn(async () => { state = 'running' })
    const start = vi.fn()
    const decodeAudioData = vi.fn(async () => ({}))
    const createBufferSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), start, onended: null }))
    vi.stubGlobal('AudioContext', class {
      get state() { return state }
      resume = resume
      decodeAudioData = decodeAudioData
      createBufferSource = createBufferSource
      destination = {}
    })
    const fetchSound = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }))
    vi.stubGlobal('fetch', fetchSound)
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    const { installExportSuccessSound, playExportSuccessSound } = await import('./export-success-sound')
    installExportSuccessSound()
    const unlock = listen.mock.calls.find(([name]) => name === 'pointerdown')![1] as EventListener
    unlock(new Event('pointerdown'))
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledTimes(1))
    expect(resume).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
    playExportSuccessSound()
    playExportSuccessSound()
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2))
    expect(fetchSound).toHaveBeenCalledTimes(1)
    expect(decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable audio without throwing into a successful export', async () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('audio unavailable') } })
    const { playExportSuccessSound } = await import('./export-success-sound')
    expect(() => playExportSuccessSound()).not.toThrow()
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledWith('error', 'audio.export-success', { message: 'audio unavailable' }))
  })
})
