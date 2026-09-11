export type OpenProgressPhase = 'hidden' | 'running'

export interface OpenProgressSnapshot {
  phase: OpenProgressPhase
}

type Listener = () => void

export interface OpenProgressController {
  begin(): (succeeded?: boolean) => void
  dismiss(): void
  getSnapshot(): OpenProgressSnapshot
  subscribe(listener: Listener): () => void
}

export function createOpenProgressController(
  scheduleFrame: (callback: FrameRequestCallback) => number = window.requestAnimationFrame.bind(window)
): OpenProgressController {
  const listeners = new Set<Listener>()
  let activeOperations = 0
  let displayGeneration = 0
  let snapshot: OpenProgressSnapshot = { phase: 'hidden' }

  const publish = (phase: OpenProgressPhase): void => {
    if (snapshot.phase === phase) return
    snapshot = { phase }
    listeners.forEach((listener) => listener())
  }

  return {
    begin() {
      activeOperations += 1
      if (activeOperations === 1) {
        const generation = ++displayGeneration
        if (snapshot.phase === 'hidden') {
          scheduleFrame(() => {
            if (activeOperations > 0 && displayGeneration === generation) publish('running')
          })
        } else publish('running')
      }
      let finished = false
      return (_succeeded = true) => {
        if (finished) return
        finished = true
        activeOperations = Math.max(0, activeOperations - 1)
        if (activeOperations > 0) return
        displayGeneration += 1
        publish('hidden')
      }
    },
    dismiss() {
      // Dismissal is an explicit cancellation of the visible open task. Keep
      // the controller reusable: leaving the operation count alive would make
      // the matching completion decrement only a stale count, causing all
      // subsequent opens to inherit a permanently running overlay.
      activeOperations = 0
      displayGeneration += 1
      publish('hidden')
    },
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export const openProgress = createOpenProgressController()
