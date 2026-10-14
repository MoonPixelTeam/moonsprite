import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createDocument } from '@/core/document-model'
import { documentPaneLeafIds, resizeDocumentPane, type DocumentPaneNode } from '@/core/document-pane-layout'
import { useWorkspace } from '@/store/workspace'
import { useAppDocumentPanes } from './useAppDocumentPanes'

afterEach(() => { cleanup(); useWorkspace.setState({ sessions: [], activeId: null }) })

const setup = () => {
  const documents = ['A', 'B', 'C', 'D'].map(name => createDocument(name, 8, 8, 'rgba', false))
  for (const document of documents) useWorkspace.getState().addSession(document)
  const [a, b, c, d] = documents.map(document => document.id)
  useWorkspace.getState().setActive(a)
  const hook = renderHook(() => useAppDocumentPanes({ setHomeOpen() {} }))
  act(() => hook.result.current.splitDocumentFromTab({ documentId: b, targetPaneId: a, direction: 'right' }))
  return { ...hook, a, b, c, d }
}
const leaf = (layout: DocumentPaneNode | null, documentId: string): DocumentPaneNode | undefined => {
  if (!layout) return undefined
  return layout.kind === 'leaf' ? (layout.documentId === documentId ? layout : undefined) : leaf(layout.first, documentId) ?? leaf(layout.second, documentId)
}

it('switches A to C in the same panel and preserves nested B/D panels and resized splitters', () => {
  const { result, a, b, c, d } = setup()
  act(() => result.current.splitDocumentFromTab({ documentId: d, targetPaneId: b, direction: 'bottom' }))
  const initial = result.current.visibleDocumentPaneLayout!
  act(() => result.current.updateDocumentPaneLayout(resizeDocumentPane(initial, initial.id, 0.42)))
  const before = result.current.visibleDocumentPaneLayout!
  act(() => result.current.activateDocumentTab(c))
  const after = result.current.visibleDocumentPaneLayout!
  expect(after).toMatchObject({ id: before.id, ratio: 0.42 })
  expect(leaf(after, c)?.id).toBe(leaf(before, a)?.id)
  expect(leaf(after, b)).toBe(leaf(before, b))
  expect(leaf(after, d)).toBe(leaf(before, d))
  expect(result.current.hiddenDocumentIds).toEqual([b, d])
  act(() => result.current.contextActivateDocumentTab(a))
  expect(result.current.visibleDocumentPaneLayout).toEqual(before)
})

it('switches tabs through the store and opens new projects without replacing side panels', () => {
  const { result, b, c } = setup()
  const side = leaf(result.current.visibleDocumentPaneLayout, b)
  act(() => useWorkspace.getState().setActive(c))
  expect(documentPaneLeafIds(result.current.visibleDocumentPaneLayout!)).toEqual([c, b])
  act(() => useWorkspace.getState().setActive(b))
  expect(result.current.workspaceDocumentId).toBe(c)
  const added = createDocument('new', 8, 8, 'rgba', false)
  act(() => useWorkspace.getState().addSession(added))
  expect(documentPaneLeafIds(result.current.visibleDocumentPaneLayout!)).toEqual([added.id, b])
  expect(leaf(result.current.visibleDocumentPaneLayout, b)).toBe(side)
})

it('can dock an old main document and move panes after switching their contents', () => {
  const { result, a, b, c } = setup()
  act(() => result.current.activateDocumentTab(c))
  act(() => result.current.splitDocumentFromTab({ documentId: a, targetPaneId: c, direction: 'bottom' }))
  const layout = result.current.visibleDocumentPaneLayout!
  expect(new Set([a, b, c].map(id => leaf(layout, id)!.id)).size).toBe(3)
  act(() => result.current.moveDocumentPaneView(b, c, 'left'))
  expect(documentPaneLeafIds(result.current.visibleDocumentPaneLayout!).sort()).toEqual([a, b, c].sort())
  expect(result.current.workspaceDocumentId).toBe(c)
})

it('closes a secondary panel without importing an unrelated main tab', async () => {
  const { result, a, b, d } = setup()
  act(() => result.current.splitDocumentFromTab({ documentId: d, targetPaneId: b, direction: 'bottom' }))
  await act(async () => { await useWorkspace.getState().closeDocument(b) })
  expect(documentPaneLeafIds(result.current.visibleDocumentPaneLayout!)).toEqual([a, d])
  expect(result.current.paneOnlyDocumentIds).toEqual([d])
})

it('replaces a closed main view while preserving its secondary panel', async () => {
  const { result, a, b, c } = setup()
  act(() => result.current.activateDocumentTab(c))
  const side = leaf(result.current.visibleDocumentPaneLayout, b)
  await act(async () => { await useWorkspace.getState().closeDocument(c) })
  expect(result.current.workspaceDocumentId).toBe(a)
  expect(leaf(result.current.visibleDocumentPaneLayout, b)).toBe(side)
})

it('keeps the main panel when a floating project is returned to the tab bar', () => {
  const { result, b, c } = setup()
  act(() => result.current.activateDocumentTab(c))
  act(() => result.current.floatDocument(b, { x: 100, y: 100 }))
  expect(result.current.workspaceDocumentId).toBe(c)
  expect(result.current.visibleDocumentPaneLayout).toBeNull()
  act(() => result.current.returnFloatingDocumentToTabs(b, 0))
  expect(result.current.workspaceDocumentId).toBe(c)
  expect(useWorkspace.getState().activeId).toBe(c)
})
