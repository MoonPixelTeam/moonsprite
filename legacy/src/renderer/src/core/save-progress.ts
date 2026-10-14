export type SaveProgressKind = 'save' | 'saveAs'
export type SaveProgressPhase = 'hidden' | 'running' | 'complete'

export interface SaveProgressSnapshot {
  kind: SaveProgressKind
  phase: SaveProgressPhase
}

type Listener = () => void
const MINIMUM_SAVE_FEEDBACK_MS = 100

export interface SaveProgressController {
  begin(kind: SaveProgressKind): (succeeded?: boolean) => void
  dismiss(): void
  getSnapshot(): SaveProgressSnapshot
  subscribe(listener: Listener): () => void
}

export function createSaveProgressController(
  scheduleFrame: (callback: FrameRequestCallback) => number = window.requestAnimationFrame.bind(window),
  scheduleDelay: (callback: () => void, delayMs: number) => number = window.setTimeout.bind(window),
  now: () => number = performance.now.bind(performance)
): SaveProgressController {
  const listeners = new Set<Listener>()
  let activeOperations = 0
  let completionGeneration = 0
  let visibleSince = 0
  let snapshot: SaveProgressSnapshot = { kind: 'save', phase: 'hidden' }

  const publish = (phase: SaveProgressPhase, kind = snapshot.kind): void => {
    if (snapshot.phase === phase && snapshot.kind === kind) return
    snapshot = { kind, phase }
    listeners.forEach((listener) => listener())
  }

  return {
    begin(kind) {
      activeOperations += 1
      if (activeOperations === 1) {
        completionGeneration += 1
        visibleSince = now()
        publish('running', kind)
      }
      let finished = false
      return (succeeded = true) => {
        if (finished) return
        finished = true
        activeOperations = Math.max(0, activeOperations - 1)
        if (activeOperations > 0) return
        if (snapshot.phase === 'hidden') return
        if (!succeeded) {
          publish('hidden')
          return
        }
        publish('complete')
        const generation = completionGeneration
        const hide = (): void => {
          if (activeOperations === 0 && completionGeneration === generation) publish('hidden')
        }
        const remaining = MINIMUM_SAVE_FEEDBACK_MS - (now() - visibleSince)
        if (remaining > 0) scheduleDelay(() => scheduleFrame(hide), remaining)
        else scheduleFrame(hide)
      }
    },
    dismiss() {
      completionGeneration += 1
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

export const saveProgress = createSaveProgressController()
