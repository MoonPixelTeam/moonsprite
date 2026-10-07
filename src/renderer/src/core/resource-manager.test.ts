import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ResourceManager, createManagedEffect } from './resource-manager'

describe('ResourceManager', () => {
  let manager: ResourceManager

  beforeEach(() => {
    manager = new ResourceManager()
    vi.useFakeTimers()
  })

  afterEach(() => {
    manager.dispose()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('RAF tracking', () => {
    it('should track and cancel RAF callbacks', () => {
      const spy = vi.spyOn(window, 'cancelAnimationFrame')
      const rafId1 = requestAnimationFrame(() => {})
      const rafId2 = requestAnimationFrame(() => {})

      manager.trackRAF(rafId1)
      manager.trackRAF(rafId2)

      expect(manager.getResourceCounts().rafCallbacks).toBe(2)

      manager.dispose()

      expect(spy).toHaveBeenCalledWith(rafId1)
      expect(spy).toHaveBeenCalledWith(rafId2)
      expect(manager.getResourceCounts().rafCallbacks).toBe(0)
    })

    it('should allow untracking RAF before disposal', () => {
      const spy = vi.spyOn(window, 'cancelAnimationFrame')
      const rafId = requestAnimationFrame(() => {})

      manager.trackRAF(rafId)
      manager.untrackRAF(rafId)

      manager.dispose()

      expect(spy).not.toHaveBeenCalledWith(rafId)
    })

    it('should warn when tracking RAF after disposal', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      manager.dispose()

      manager.trackRAF(123)

      expect(consoleSpy).toHaveBeenCalledWith(
        'ResourceManager: Attempting to track RAF after disposal'
      )
    })
  })

  describe('Timer tracking', () => {
    it('should track and clear setTimeout', () => {
      const spy = vi.spyOn(window, 'clearTimeout')
      const callback = vi.fn()

      const timerId = setTimeout(callback, 1000)
      manager.trackTimer(timerId)

      expect(manager.getResourceCounts().timers).toBe(1)

      manager.dispose()

      expect(spy).toHaveBeenCalledWith(timerId)
      expect(callback).not.toHaveBeenCalled()
      expect(manager.getResourceCounts().timers).toBe(0)
    })

    it('should track and clear setInterval', () => {
      const spy = vi.spyOn(window, 'clearInterval')
      const callback = vi.fn()

      const intervalId = setInterval(callback, 100)
      manager.trackInterval(intervalId)

      expect(manager.getResourceCounts().intervals).toBe(1)

      manager.dispose()

      expect(spy).toHaveBeenCalledWith(intervalId)
      expect(manager.getResourceCounts().intervals).toBe(0)
    })
  })

  describe('Event listener tracking', () => {
    it('should track and remove event listeners', () => {
      const target = document.createElement('div')
      const handler = vi.fn()
      const spy = vi.spyOn(target, 'removeEventListener')

      target.addEventListener('click', handler)
      manager.trackEventListener(target, 'click', handler)

      expect(manager.getResourceCounts().eventListeners).toBe(1)

      manager.dispose()

      expect(spy).toHaveBeenCalledWith('click', handler, undefined)
      expect(manager.getResourceCounts().eventListeners).toBe(0)
    })

    it('should track event listeners with options', () => {
      const target = window
      const handler = vi.fn()
      const options = { passive: true, capture: true }
      const spy = vi.spyOn(target, 'removeEventListener')

      target.addEventListener('scroll', handler, options)
      manager.trackEventListener(target, 'scroll', handler, options)

      manager.dispose()

      expect(spy).toHaveBeenCalledWith('scroll', handler, options)
    })

    it('should allow untracking event listeners', () => {
      const target = document.createElement('div')
      const handler = vi.fn()
      const spy = vi.spyOn(target, 'removeEventListener')

      target.addEventListener('click', handler)
      manager.trackEventListener(target, 'click', handler)
      manager.untrackEventListener(target, 'click', handler)

      manager.dispose()

      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('Custom disposables', () => {
    it('should call custom disposables on cleanup', () => {
      const dispose1 = vi.fn()
      const dispose2 = vi.fn()

      manager.trackDisposable(dispose1)
      manager.trackDisposable(dispose2)

      expect(manager.getResourceCounts().disposables).toBe(2)

      manager.dispose()

      expect(dispose1).toHaveBeenCalledTimes(1)
      expect(dispose2).toHaveBeenCalledTimes(1)
      expect(manager.getResourceCounts().disposables).toBe(0)
    })

    it('should continue cleanup even if disposable throws', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = new Error('Disposal failed')
      const dispose1 = vi.fn(() => { throw error })
      const dispose2 = vi.fn()

      manager.trackDisposable(dispose1)
      manager.trackDisposable(dispose2)

      manager.dispose()

      expect(dispose1).toHaveBeenCalled()
      expect(dispose2).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        'ResourceManager: Error during custom disposable',
        error
      )
    })
  })

  describe('Mixed resource tracking', () => {
    it('should cleanup all resource types together', () => {
      const rafSpy = vi.spyOn(window, 'cancelAnimationFrame')
      const timerSpy = vi.spyOn(window, 'clearTimeout')
      const target = document.createElement('div')
      const handler = vi.fn()
      const customDispose = vi.fn()

      const rafId = requestAnimationFrame(() => {})
      const timerId = window.setTimeout(() => {}, 1000)

      manager.trackRAF(rafId)
      manager.trackTimer(timerId)
      target.addEventListener('click', handler)
      manager.trackEventListener(target, 'click', handler)
      manager.trackDisposable(customDispose)

      const counts = manager.getResourceCounts()
      expect(counts.rafCallbacks).toBe(1)
      expect(counts.timers).toBe(1)
      expect(counts.eventListeners).toBe(1)
      expect(counts.disposables).toBe(1)

      manager.dispose()

      expect(rafSpy).toHaveBeenCalledWith(rafId)
      expect(timerSpy).toHaveBeenCalledWith(timerId)
      expect(customDispose).toHaveBeenCalled()

      const finalCounts = manager.getResourceCounts()
      expect(finalCounts.rafCallbacks).toBe(0)
      expect(finalCounts.timers).toBe(0)
      expect(finalCounts.eventListeners).toBe(0)
      expect(finalCounts.disposables).toBe(0)
    })
  })

  describe('createManagedEffect helper', () => {
    it('should create cleanup function that disposes manager', () => {
      const rafSpy = vi.spyOn(window, 'cancelAnimationFrame')
      const customCleanup = vi.fn()

      const cleanup = createManagedEffect((manager) => {
        const rafId = requestAnimationFrame(() => {})
        manager.trackRAF(rafId)
        return customCleanup
      })

      cleanup()

      expect(rafSpy).toHaveBeenCalled()
      expect(customCleanup).toHaveBeenCalled()
    })

    it('should work without custom cleanup', () => {
      const rafSpy = vi.spyOn(window, 'cancelAnimationFrame')

      const cleanup = createManagedEffect((manager) => {
        const rafId = requestAnimationFrame(() => {})
        manager.trackRAF(rafId)
      })

      cleanup()

      expect(rafSpy).toHaveBeenCalled()
    })
  })

  describe('Disposal state', () => {
    it('should mark as disposed after dispose()', () => {
      expect(manager.isDisposed()).toBe(false)
      manager.dispose()
      expect(manager.isDisposed()).toBe(true)
    })

    it('should be idempotent - multiple dispose() calls safe', () => {
      const rafSpy = vi.spyOn(window, 'cancelAnimationFrame')
      const rafId = requestAnimationFrame(() => {})
      manager.trackRAF(rafId)

      manager.dispose()
      manager.dispose()
      manager.dispose()

      expect(rafSpy).toHaveBeenCalledTimes(1)
      expect(rafSpy).toHaveBeenCalledWith(rafId)
    })
  })
})
