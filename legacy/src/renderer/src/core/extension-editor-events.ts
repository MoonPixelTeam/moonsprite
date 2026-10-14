import { broadcastExtensionRuntimeEvent } from './extension-runtime'
export const EXTENSION_EDITOR_EVENTS = [
  'history.undo', 'history.redo', 'color.sampled', 'drawing.completed', 'fill.completed',
  'document.changed', 'document.saved', 'project.created', 'project.opened', 'project.closed', 'project.activated',
  'tool.changed', 'color.primary-changed', 'color.secondary-changed', 'selection.created', 'selection.cleared',
  'layer.created', 'layer.deleted', 'layer.activated', 'frame.changed', 'animation.started', 'animation.stopped',
  'view.changed'
] as const
export type EditorEventName = typeof EXTENSION_EDITOR_EVENTS[number]
export function publishEditorEvent(name: EditorEventName, projectId?: string, detail: Record<string, string | number | boolean | null> = {}): void {
  broadcastExtensionRuntimeEvent({ type: 'editor-event', name, projectId, detail, timestamp: Date.now() })
}
