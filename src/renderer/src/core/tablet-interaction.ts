import type { ToolId } from '@shared/types-brush'

export type TabletModifier = 'constrain' | 'center' | 'rotate'
export const TABLET_INTERACTION_EVENT = 'moonsprite:tablet-interaction'
export const TABLET_FEEDBACK_EVENT = 'moonsprite:tablet-feedback'
let owner: string | null = null
const held = new Set<TabletModifier>()
let tool: ToolId | null = null
let boxMove = false
let explicitMove = false
let panelMode: 'browse' | 'select' | 'move' = 'browse'
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(TABLET_INTERACTION_EVENT)) }
export function tabletModifier(documentId: string, modifier: TabletModifier): boolean { return owner === documentId && held.has(modifier) }
export function tabletTemporaryTool(documentId: string): ToolId | null { return owner === documentId ? tool : null }
export function tabletBoxMove(documentId: string): boolean { return owner === documentId && boxMove }
export function tabletContentMove(documentId: string): boolean { return owner === documentId && explicitMove && !boxMove }
export function tabletPanelMode() { return panelMode }
export function setTabletPanelMode(mode: typeof panelMode) { panelMode = mode; notify() }
export function setTabletModifier(documentId: string, modifier: TabletModifier, active: boolean) {
  if (owner !== documentId) resetTabletInteraction()
  owner = documentId
  if (active) held.add(modifier); else held.delete(modifier)
  notify()
}
export function setTabletTemporaryTool(documentId: string, next: ToolId | null) { if (owner !== documentId) resetTabletInteraction(); owner = documentId; tool = next; notify() }
export function setTabletBoxMove(documentId: string, active: boolean) { if (owner !== documentId) resetTabletInteraction(); owner = documentId; boxMove = active; explicitMove = true; notify() }
export function resetTabletInteraction() { owner = null; held.clear(); tool = null; boxMove = false; explicitMove = false; panelMode = 'browse'; notify() }
export function tabletFeedback(message: string) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TABLET_FEEDBACK_EVENT, { detail: message })) }
