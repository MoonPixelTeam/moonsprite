/** Hidden tabs stay mounted to retain their caches. Split panes have no tab
 * wrapper and remain drawable even when another document owns keyboard focus.
 * Read Store identity rather than CSS: activation listeners can run before
 * the host updates its classes. closest() does not force layout measurement. */
export function canvasStageIsVisible(canvas: HTMLCanvasElement | null, activeDocumentId: string | null): boolean {
  if (!canvas) return false
  if (canvas.closest('[data-canvas-resize-frozen="true"]')) return false
  const tab = canvas.closest<HTMLElement>('.document-tab-stage')
  return !tab || tab.dataset.documentId === activeDocumentId
}
