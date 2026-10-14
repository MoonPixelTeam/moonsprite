interface ProjectRollbackProgressSnapshot {
  active: boolean
}

let pendingOperations = 0
let snapshot: ProjectRollbackProgressSnapshot = { active: false }
const listeners = new Set<() => void>()

const publish = (): void => {
  snapshot = { active: pendingOperations > 0 }
  for (const listener of listeners) listener()
}

export const projectRollbackProgress = {
  getSnapshot: (): ProjectRollbackProgressSnapshot => snapshot,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  begin: (): void => {
    pendingOperations += 1
    publish()
  },
  end: (): void => {
    pendingOperations = Math.max(0, pendingOperations - 1)
    publish()
  },
  endAfterPaint: (): void => {
    if (typeof window === 'undefined') {
      projectRollbackProgress.end()
      return
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(projectRollbackProgress.end))
  }
}
