export interface CanvasKeyboardSubscription {
  isActive: () => boolean
  keyDown?: (event: KeyboardEvent) => void
  keyUp?: (event: KeyboardEvent) => void
  /** Keep inactive modifier state current without executing tools or diagnostics. */
  inactiveModifiers?: (event: KeyboardEvent) => void
}

/** One native listener per phase, regardless of the number of resident canvases. */
export function createCanvasKeyboardRouter(target: Window) {
  const subscriptions = new Set<CanvasKeyboardSubscription>()
  const participants = new Set<CanvasKeyboardSubscription>()
  const heldKeys = new Set<string>()
  const keyDown = (event: KeyboardEvent): void => {
    heldKeys.add(event.code || event.key)
    let stopped = false
    const descriptor = Object.getOwnPropertyDescriptor(event, 'stopImmediatePropagation')
    const stopImmediate = event.stopImmediatePropagation
    Object.defineProperty(event, 'stopImmediatePropagation', { configurable: true, value: () => {
      stopped = true
      stopImmediate.call(event)
    } })
    try {
      for (const subscription of [...subscriptions]) {
        if (!subscriptions.has(subscription)) continue
        if (subscription.isActive()) {
          participants.add(subscription)
          subscription.keyDown?.(event)
          if (stopped) break
        } else subscription.inactiveModifiers?.(event)
      }
    } finally {
      if (descriptor) Object.defineProperty(event, 'stopImmediatePropagation', descriptor)
      else Reflect.deleteProperty(event, 'stopImmediatePropagation')
    }
  }
  const keyUp = (event: KeyboardEvent): void => {
    heldKeys.delete(event.code || event.key)
    for (const subscription of [...subscriptions]) {
      if (!subscriptions.has(subscription)) continue
      // A document switched away while holding a shortcut still receives release.
      if (subscription.isActive() || participants.has(subscription)) subscription.keyUp?.(event)
      else subscription.inactiveModifiers?.(event)
    }
    if (heldKeys.size === 0) participants.clear()
  }
  const blur = (): void => { heldKeys.clear(); participants.clear() }
  return {
    register(subscription: CanvasKeyboardSubscription): () => void {
      if (subscriptions.size === 0) {
        target.addEventListener('keydown', keyDown, true)
        target.addEventListener('keyup', keyUp, true)
        target.addEventListener('blur', blur)
      }
      subscriptions.add(subscription)
      return () => {
        subscriptions.delete(subscription)
        participants.delete(subscription)
        if (subscriptions.size > 0) return
        target.removeEventListener('keydown', keyDown, true)
        target.removeEventListener('keyup', keyUp, true)
        target.removeEventListener('blur', blur)
        blur()
      }
    }
  }
}

let router: ReturnType<typeof createCanvasKeyboardRouter> | undefined
export const registerCanvasKeyboard = (subscription: CanvasKeyboardSubscription): (() => void) => {
  router ??= createCanvasKeyboardRouter(window)
  return router.register(subscription)
}
