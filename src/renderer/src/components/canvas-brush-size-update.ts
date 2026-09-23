import type { CanvasInputState } from '@/core/canvas-input'
import { useWorkspace, type DocumentSession } from '@/store/workspace'

interface PendingSize {
  size: number
  documentId: string
  canvasDocumentId: string
  tool: DocumentSession['tool']
  previewOnly: boolean
  valid: () => boolean
  schedule: () => void
  flush: () => void
}
const pendingSizes = new WeakMap<CanvasInputState, PendingSize>()
const previews = new Map<string, PendingSize>()
const listeners = new Set<() => void>()
const notify = (): void => { for (const listener of listeners) listener() }
export const subscribeCanvasBrushSizePreview = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const canvasBrushSizePreview = (documentId: string, tool: DocumentSession['tool']): number | null => {
  const preview = previews.get(documentId)
  return preview?.tool === tool && preview.valid() ? preview.size : null
}
export const canvasBrushSizePreviewSession = (input: CanvasInputState, session: DocumentSession): DocumentSession => {
  const preview = pendingSizes.get(input)
  if (!preview?.previewOnly || preview.canvasDocumentId !== session.document.id || preview.tool !== session.tool || !preview.valid()) return session
  return { ...session, [session.tool === 'liquify' ? 'liquifyRadius' : session.tool === 'airbrush' ? 'airbrushScatterRadius' : 'brushSize']: preview.size }
}

export const flushCanvasBrushSize = (input: CanvasInputState): void => pendingSizes.get(input)?.flush()

/** Overlay sizing stays local to the gesture; commit before the next command/stroke. */
export function queueCanvasBrushSize(input: CanvasInputState, session: DocumentSession, size: number, canvas: HTMLCanvasElement, previewOnly = false): void {
  if (!Number.isFinite(size)) return
  size = Math.max(1, Math.min(session.tool === 'airbrush' ? 64 : 128, Math.round(size)))
  const pending = pendingSizes.get(input)
  if (pending) {
    if (pending.previewOnly !== previewOnly || !pending.valid()) pending.flush()
    else { if (pending.size !== size) { pending.size = size; pending.schedule() }; return }
  }
  const documentId = useWorkspace.getState().activeId ?? session.document.id, canvasDocumentId = session.document.id, tool = session.tool
  const gesture = input.modifierBrushSize ?? input.drag
  let frame: number | null = null
  let unsubscribe: (() => void) | undefined
  const entry: PendingSize = { size, documentId, canvasDocumentId, tool, previewOnly, valid: () => {
    const state = useWorkspace.getState()
    return canvas.isConnected && state.activeId === documentId
      && state.sessions.some(item => item.document.id === canvasDocumentId)
      && state.sessions.find(item => item.document.id === documentId)?.tool === tool
      && (input.modifierBrushSize ?? input.drag) === gesture
  }, schedule: () => {
    if (frame !== null) return
    frame = window.requestAnimationFrame(() => {
      frame = null
      if (!entry.previewOnly || !entry.valid()) entry.flush()
      else notify()
    })
  }, flush: () => {
    if (frame !== null) window.cancelAnimationFrame(frame)
    pendingSizes.delete(input)
    if (previews.get(documentId) === entry) previews.delete(documentId)
    unsubscribe?.()
    for (const event of ['pointerleave', 'pointercancel']) canvas.removeEventListener(event, entry.flush, true)
    for (const event of ['keyup', 'keydown', 'pointerdown', 'pointerup', 'blur']) window.removeEventListener(event, entry.flush, true)
    const state = useWorkspace.getState()
    // A delayed frame must not change the tool in a different/closed tab.
    if (entry.valid()) {
      if (tool === 'airbrush') state.setAirbrushScatterRadius(entry.size)
      else if (tool === 'liquify') state.setLiquifyRadius(entry.size)
      else state.setBrushSize(entry.size)
    }
    if (previewOnly) notify()
  } }
  pendingSizes.set(input, entry)
  if (previewOnly) {
    previews.set(documentId, entry)
    unsubscribe = useWorkspace.subscribe(() => { if (!entry.valid()) entry.flush() })
  }
  // Flush before input handlers clear the gesture or start the next stroke.
  for (const event of ['keyup', 'keydown', 'pointerdown', 'pointerup', 'blur']) window.addEventListener(event, entry.flush, true)
  for (const event of ['pointerleave', 'pointercancel']) canvas.addEventListener(event, entry.flush, true)
  entry.schedule()
}
