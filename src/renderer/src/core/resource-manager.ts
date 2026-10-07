/**
 * Unified Resource Manager
 *
 * Centralized tracking and cleanup for all async resources to prevent memory leaks.
 * Use this to track RAF callbacks, timers, event listeners, and other disposable resources.
 *
 * Usage:
 * ```typescript
 * const manager = new ResourceManager()
 *
 * // Track RAF
 * const rafId = requestAnimationFrame(callback)
 * manager.trackRAF(rafId)
 *
 * // Track timer
 * const timerId = setTimeout(callback, 1000)
 * manager.trackTimer(timerId)
 *
 * // Track event listener
 * window.addEventListener('resize', handler)
 * manager.trackEventListener(window, 'resize', handler)
 *
 * // Cleanup all at once
 * manager.dispose()
 * ```
 */

export interface EventListenerRegistration {
  target: EventTarget
  type: string
  listener: EventListenerOrEventListenerObject
  options?: boolean | AddEventListenerOptions
}

export class ResourceManager {
  private rafIds = new Set<number>()
  private timerIds = new Set<number>()
  private intervalIds = new Set<number>()
  private eventListeners = new Map<EventTarget, Array<{
    type: string
    listener: EventListenerOrEventListenerObject
    options?: boolean | AddEventListenerOptions
  }>>()
  private disposables: Array<() => void> = []
  private disposed = false

  /**
   * Track a requestAnimationFrame ID for cleanup
   */
  trackRAF(id: number): void {
    if (this.disposed) {
      console.warn('ResourceManager: Attempting to track RAF after disposal')
      return
    }
    this.rafIds.add(id)
  }

  /**
   * Untrack a RAF ID (e.g., when it completes naturally)
   */
  untrackRAF(id: number): void {
    this.rafIds.delete(id)
  }

  /**
   * Track a setTimeout ID for cleanup
   */
  trackTimer(id: number): void {
    if (this.disposed) {
      console.warn('ResourceManager: Attempting to track timer after disposal')
      return
    }
    this.timerIds.add(id)
  }

  /**
   * Untrack a timer ID (e.g., when it fires naturally)
   */
  untrackTimer(id: number): void {
    this.timerIds.delete(id)
  }

  /**
   * Track a setInterval ID for cleanup
   */
  trackInterval(id: number): void {
    if (this.disposed) {
      console.warn('ResourceManager: Attempting to track interval after disposal')
      return
    }
    this.intervalIds.add(id)
  }

  /**
   * Untrack an interval ID (e.g., when manually cleared)
   */
  untrackInterval(id: number): void {
    this.intervalIds.delete(id)
  }

  /**
   * Track an event listener for cleanup
   */
  trackEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (this.disposed) {
      console.warn('ResourceManager: Attempting to track event listener after disposal')
      return
    }

    let listeners = this.eventListeners.get(target)
    if (!listeners) {
      listeners = []
      this.eventListeners.set(target, listeners)
    }
    listeners.push({ type, listener, options })
  }

  /**
   * Untrack an event listener (e.g., when manually removed)
   */
  untrackEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    const listeners = this.eventListeners.get(target)
    if (!listeners) return

    const index = listeners.findIndex((item) => item.type === type && item.listener === listener)
    if (index >= 0) {
      listeners.splice(index, 1)
      if (listeners.length === 0) {
        this.eventListeners.delete(target)
      }
    }
  }

  /**
   * Track a custom disposable (e.g., unsubscribe function, observer.disconnect)
   */
  trackDisposable(dispose: () => void): void {
    if (this.disposed) {
      console.warn('ResourceManager: Attempting to track disposable after disposal')
      return
    }
    this.disposables.push(dispose)
  }

  /**
   * Dispose all tracked resources
   */
  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true

    // Cancel all RAF callbacks
    for (const rafId of this.rafIds) {
      window.cancelAnimationFrame(rafId)
    }
    this.rafIds.clear()

    // Clear all timers
    for (const timerId of this.timerIds) {
      window.clearTimeout(timerId)
    }
    this.timerIds.clear()

    // Clear all intervals
    for (const intervalId of this.intervalIds) {
      window.clearInterval(intervalId)
    }
    this.intervalIds.clear()

    // Remove all event listeners
    for (const [target, listeners] of this.eventListeners) {
      for (const { type, listener, options } of listeners) {
        try {
          target.removeEventListener(type, listener, options)
        } catch (error) {
          console.warn('ResourceManager: Failed to remove event listener', error)
        }
      }
    }
    this.eventListeners.clear()

    // Call all custom disposables
    for (const dispose of this.disposables) {
      try {
        dispose()
      } catch (error) {
        console.warn('ResourceManager: Error during custom disposable', error)
      }
    }
    this.disposables = []
  }

  /**
   * Check if manager is disposed
   */
  isDisposed(): boolean {
    return this.disposed
  }

  /**
   * Get current resource counts (for debugging)
   */
  getResourceCounts(): {
    rafCallbacks: number
    timers: number
    intervals: number
    eventListeners: number
    disposables: number
  } {
    return {
      rafCallbacks: this.rafIds.size,
      timers: this.timerIds.size,
      intervals: this.intervalIds.size,
      eventListeners: Array.from(this.eventListeners.values()).reduce((sum, listeners) => sum + listeners.length, 0),
      disposables: this.disposables.length
    }
  }
}

/**
 * Helper to use ResourceManager with React useEffect
 *
 * Usage:
 * ```typescript
 * useEffect(() => {
 *   const manager = new ResourceManager()
 *
 *   const rafId = requestAnimationFrame(callback)
 *   manager.trackRAF(rafId)
 *
 *   window.addEventListener('resize', handler)
 *   manager.trackEventListener(window, 'resize', handler)
 *
 *   return () => manager.dispose()
 * }, [deps])
 * ```
 */
export const createManagedEffect = (
  setup: (manager: ResourceManager) => void | (() => void)
): (() => void) => {
  const manager = new ResourceManager()
  const customCleanup = setup(manager)
  return () => {
    customCleanup?.()
    manager.dispose()
  }
}
