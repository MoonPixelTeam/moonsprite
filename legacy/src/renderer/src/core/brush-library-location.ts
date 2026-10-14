type Listener = () => void

let currentFolderId: string | null = null
const listeners = new Set<Listener>()

export const brushLibraryLocation = {
  getSnapshot(): string | null {
    return currentFolderId
  },
  set(folderId: string | null): void {
    const next = folderId || null
    if (next === currentFolderId) return
    currentFolderId = next
    listeners.forEach((listener) => listener())
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
}
