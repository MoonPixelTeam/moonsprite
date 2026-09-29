type RecoveryStatus = { updatedAt: string | null; error: string | null }
let status: RecoveryStatus = { updatedAt: null, error: null }
const listeners = new Set<() => void>()
export const getBrowserRecoveryStatus = () => status
export const subscribeBrowserRecoveryStatus = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function reportBrowserRecovery(updatedAt: string | null, error: string | null = null) {
  status = { updatedAt: updatedAt ?? status.updatedAt, error }
  for (const listener of listeners) listener()
}
