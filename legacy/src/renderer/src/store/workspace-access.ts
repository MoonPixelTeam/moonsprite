import type { DocumentSession } from './workspace-types'

export function activeSession(state: { sessions: readonly DocumentSession[]; activeId: string | null }): DocumentSession | null {
  return state.sessions.find((session) => session.document.id === state.activeId) ?? null
}
