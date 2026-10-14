import type { DocumentSession } from './workspace-types'
import type { ExtensionRuntimeEvent } from '@shared/types-extension-runtime'
/** Copy only small scalar state: store sessions are mutable; never retain document references. */
export function editorEventSnapshot(sessions: readonly DocumentSession[], activeId: string | null) {
  return { activeId, projects: sessions.map(session => ({
    id: session.document.id, opened: Boolean(session.document.filePath || session.document.sourceFilePath),
    revision: session.contentRevision, tool: session.tool, layer: session.document.activeLayerId,
    layers: session.document.layers.map(layer => layer.id), frame: session.document.animation?.activeFrameId ?? '',
    playing: session.animationPlaying, selection: session.selection,
    primary: [session.primaryColor.r, session.primaryColor.g, session.primaryColor.b, session.primaryColor.a].join(','),
    secondary: [session.secondaryColor.r, session.secondaryColor.g, session.secondaryColor.b, session.secondaryColor.a].join(','),
    view: JSON.stringify(session.view)
  })) }
}
type Snapshot = ReturnType<typeof editorEventSnapshot>
export function changedEditorEvents(before: Snapshot, after: Snapshot): ExtensionRuntimeEvent[] {
  const events: ExtensionRuntimeEvent[] = []
  const add = (name: string, projectId: string, detail: Record<string, string | number | boolean | null> = {}) => events.push({type:'editor-event',name,projectId,detail,timestamp:Date.now()})
  if (after.activeId && before.activeId !== after.activeId) add('project.activated',after.activeId)
  for (const old of before.projects) if (!after.projects.some(next => next.id === old.id)) add('project.closed',old.id)
  for (const next of after.projects) {
    const old = before.projects.find(item => item.id === next.id)
    if (!old) { add(next.opened ? 'project.opened' : 'project.created',next.id); continue }
    if (old.revision !== next.revision) add('document.changed',next.id,{revision:next.revision})
    if (old.tool !== next.tool) add('tool.changed',next.id,{tool:next.tool,previous:old.tool})
    if (old.layer !== next.layer) add('layer.activated',next.id,{layerId:next.layer})
    for (const id of next.layers) if (!old.layers.includes(id)) add('layer.created',next.id,{layerId:id})
    for (const id of old.layers) if (!next.layers.includes(id)) add('layer.deleted',next.id,{layerId:id})
    if (old.frame !== next.frame) add('frame.changed',next.id,{frameId:next.frame})
    if (old.playing !== next.playing) add(next.playing?'animation.started':'animation.stopped',next.id)
    if (old.selection !== next.selection) add(next.selection?'selection.created':'selection.cleared',next.id)
    if (old.primary !== next.primary) add('color.primary-changed',next.id)
    if (old.secondary !== next.secondary) add('color.secondary-changed',next.id)
    if (old.view !== next.view) add('view.changed',next.id)
  }
  return events
}
