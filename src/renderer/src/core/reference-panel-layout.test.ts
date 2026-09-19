import { expect, it } from 'vitest'
import type { WorkspaceLayout } from '@shared/types-workspace'
import { loadInspectorLayout } from './panel-layout'
import { DEFAULT_PANEL_DOCKS, DEFAULT_PANEL_VISIBILITY, normalizeWorkspaceLayout } from './workspace-layout-preferences'

it('adds reference image defaults when loading an existing workspace', () => {
  const layout = loadInspectorLayout(JSON.stringify({ order: ['preview', 'layers'], verticalWeights: { preview: 225 } }))
  expect(layout.order.filter((id) => id === 'reference')).toHaveLength(1)
  expect(layout.verticalWeights.preview).toBe(225)
  expect(layout.verticalWeights.reference).toBe(180)
  expect(DEFAULT_PANEL_DOCKS.reference).toBe('right')
  expect(DEFAULT_PANEL_VISIBILITY.reference).toBe(false)
  const workspace = normalizeWorkspaceLayout({ panelDocks: { reference: 'floating' }, panelVisibility: { reference: true } } as WorkspaceLayout, 1200)
  expect(workspace.panelDocks.reference).toBe('floating')
  expect(workspace.panelVisibility?.reference).toBe(true)
})
