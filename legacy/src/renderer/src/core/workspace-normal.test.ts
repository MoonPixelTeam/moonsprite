import { describe, expect, it } from 'vitest'
import layout from '@shared/workspace-normal.json'
import type { WorkspaceLayout } from '@shared/types-workspace'
import { loadInspectorLayout } from './panel-layout'
import { normalizeWorkspaceLayout, workspacePanelDockPresence } from './workspace-layout-preferences'

describe('standard built-in workspace', () => {
  it('keeps the requested panel order, visible docks and far-right tool rail', () => {
    const normalized = normalizeWorkspaceLayout(layout as WorkspaceLayout, 1440, 800)
    const inspector = loadInspectorLayout(layout.inspectorLayout)
    const panels = (dock: string) => inspector.order.filter(id => normalized.panelVisibility[id] && normalized.panelDocks[id] === dock)
    expect(panels('left')).toEqual(['palette', 'color', 'preview'])
    expect(panels('right')).toEqual(['history', 'layers'])
    expect(workspacePanelDockPresence(normalized.panelDocks, normalized.panelVisibility)).toEqual({ left: true, right: true, bottom: false })
    expect(normalized.toolRailSide).toBe('right')
    expect(layout.timelineHidden).toBe(true)
    expect(layout.colorSquareDock).toBeNull()
    expect(inspector.squarePanels).toEqual(['color', 'preview', 'history'])
    expect(inspector.squarePanels).not.toContain('palette')
    expect(inspector.squarePanels).not.toContain('layers')
  })
  it('loads older workspace sizing without accidentally locking any panels', () => {
    expect(loadInspectorLayout('{"order":["layers","color"]}').squarePanels).toEqual([])
    expect(loadInspectorLayout('bad json').squarePanels).toEqual([])
    expect(loadInspectorLayout('{"squarePanels":["palette","unknown"]}').squarePanels).toEqual(['palette'])
  })
})
