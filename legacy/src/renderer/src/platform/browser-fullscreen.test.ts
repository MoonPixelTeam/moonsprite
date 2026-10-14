import { afterEach, expect, it, vi } from 'vitest'
import { observeBrowserFullscreen, toggleBrowserFullscreen } from './browser-fullscreen'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function browser() {
  const target = new EventTarget()
  const state = Object.assign(target, {
    fullscreenElement: null as object | null,
    documentElement: { requestFullscreen: vi.fn(async () => { state.fullscreenElement = state.documentElement; state.dispatchEvent(new Event('fullscreenchange')) }) },
    exitFullscreen: vi.fn(async () => { state.fullscreenElement = null; state.dispatchEvent(new Event('fullscreenchange')) })
  })
  vi.stubGlobal('document', state)
  return state
}

it('enters and exits browser fullscreen and observes Escape changes', async () => {
  const state = browser()
  const changed = vi.fn()
  const stop = observeBrowserFullscreen(changed)
  expect(changed).toHaveBeenLastCalledWith(false)
  expect(await toggleBrowserFullscreen()).toBe(true)
  expect(changed).toHaveBeenLastCalledWith(true)
  expect(await toggleBrowserFullscreen()).toBe(false)
  await toggleBrowserFullscreen()
  state.fullscreenElement = null
  state.dispatchEvent(new Event('fullscreenchange'))
  expect(changed).toHaveBeenLastCalledWith(false)
  stop()
  changed.mockClear()
  state.dispatchEvent(new Event('fullscreenchange'))
  expect(changed).not.toHaveBeenCalled()
})

it('coalesces repeated toggles and permits another attempt after rejection', async () => {
  const state = browser()
  state.documentElement.requestFullscreen.mockRejectedValueOnce(new Error('Permission denied'))
  const attempts = [toggleBrowserFullscreen(), toggleBrowserFullscreen()]
  const results = await Promise.allSettled(attempts)
  expect(results.every(result => result.status === 'rejected' && result.reason.message.includes('浏览器未能切换全屏'))).toBe(true)
  expect(state.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
  expect(await toggleBrowserFullscreen()).toBe(true)
})

it('reports an unavailable browser API', async () => {
  browser()
  Object.defineProperty(document.documentElement, 'requestFullscreen', { value: undefined })
  await expect(toggleBrowserFullscreen()).rejects.toThrow('浏览器未能切换全屏')
})
