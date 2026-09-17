import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { resolveFloatingDocumentReturnTarget } from '@/components/app/floating-document-return'
import {
  detachDocumentPaneWorkspace,
  documentPaneContains,
  documentPaneLeafIds,
  moveDocumentPane,
  removeDocumentPane,
  replaceDocumentPaneDocument,
  selectDocumentPaneMainView,
  splitDocumentPaneFromTab,
  type DocumentPaneDirection,
  type DocumentPaneNode,
  type DocumentPanePlacement
} from '@/core/document-pane-layout'
import type { FloatingPosition } from '@/core/panel-preferences'
import { useWorkspace } from '@/store/workspace'

interface FloatingDocumentEntry {
  documentId: string
  initialPosition: FloatingPosition
  pinned: boolean
}

const createFloatingDocumentPosition = (documentId: string, anchor: { x: number; y: number }): FloatingPosition => {
  const source =
    [...document.querySelectorAll<HTMLElement>('[data-document-pane-id]')].find((element) => element.dataset.documentPaneId === documentId) ??
    document.querySelector<HTMLElement>('.stage-wrap')
  const sourceBounds = source?.getBoundingClientRect()
  const width = Math.min(Math.max(280, window.innerWidth - 16), Math.max(360, Math.min(720, (sourceBounds?.width ?? 720) * 0.72)))
  const height = Math.min(Math.max(200, window.innerHeight - 16), Math.max(240, Math.min(560, (sourceBounds?.height ?? 560) * 0.72)))
  const maxX = Math.max(4, window.innerWidth - width - 4)
  const maxY = Math.max(4, window.innerHeight - height - 4)
  return {
    x: Math.max(4, Math.min(maxX, anchor.x - 48)),
    y: Math.max(4, Math.min(maxY, anchor.y - 14)),
    width,
    height
  }
}

export function useAppDocumentPanes({ setHomeOpen }: { setHomeOpen: (open: boolean) => void }) {
  useWorkspace(useShallow(state => [state.activeId, ...state.sessions.map(session => session.document.id)]))
  const workspace = useWorkspace.getState()
  const [storedDocumentPaneLayout, setDocumentPaneLayout] = useState<DocumentPaneNode | null>(null)

  const [paneOnlyDocumentIds, setPaneOnlyDocumentIds] = useState<string[]>([])

  const [workspaceDocumentId, setWorkspaceDocumentId] = useState<string | null>(() => useWorkspace.getState().activeId)

  const [floatingDocuments, setFloatingDocuments] = useState<FloatingDocumentEntry[]>([])

  const previousDocumentIdsRef = useRef<Set<string> | null>(null)

  const preferredWorkspaceDocumentIdRef = useRef<string | null>(null)

  const floatingDocumentIds = useMemo(() => floatingDocuments.map((item) => item.documentId), [floatingDocuments])

  const hiddenDocumentIds = useMemo(() => [...new Set([...paneOnlyDocumentIds, ...floatingDocumentIds])], [floatingDocumentIds, paneOnlyDocumentIds])

  // Reconcile before committing children, so switching tabs never renders a
  // temporary unsplit workspace or unmounts the other panels' canvases.
  const documentPaneLayout = workspaceDocumentId && !hiddenDocumentIds.includes(workspaceDocumentId)
    && workspace.sessions.some(session => session.document.id === workspaceDocumentId)
    ? selectDocumentPaneMainView(storedDocumentPaneLayout, workspaceDocumentId, paneOnlyDocumentIds)
    : storedDocumentPaneLayout
  if (documentPaneLayout !== storedDocumentPaneLayout) setDocumentPaneLayout(documentPaneLayout)

  const visibleDocumentPaneLayout = useMemo(() => {
    if (!workspaceDocumentId) return null
    return documentPaneLayout?.kind === 'split' && documentPaneContains(documentPaneLayout, workspaceDocumentId) ? documentPaneLayout : null
  }, [documentPaneLayout, workspaceDocumentId])

  useEffect(() => {
    const openDocumentIds = workspace.sessions.map((item) => item.document.id)
    const openIds = new Set(openDocumentIds)
    const previousIds = previousDocumentIdsRef.current
    previousDocumentIdsRef.current = openIds
    const closedIds = previousIds ? [...previousIds].filter((id) => !openIds.has(id)) : []
    const unavailableIds = new Set([...paneOnlyDocumentIds, ...floatingDocumentIds])
    const replacementCandidates = openDocumentIds.filter((id) => !unavailableIds.has(id) && !closedIds.includes(id))
    const closedMainDocumentId = closedIds.find(
      (id) => documentPaneLayout?.kind === 'split' && documentPaneContains(documentPaneLayout, id) && !paneOnlyDocumentIds.includes(id)
    )
    const remainingMainPane = closedMainDocumentId && documentPaneLayout ? removeDocumentPane(documentPaneLayout, closedMainDocumentId) : null
    const promotedEmbeddedDocumentId = remainingMainPane ? (documentPaneLeafIds(remainingMainPane).find((id) => openIds.has(id)) ?? null) : null

    setDocumentPaneLayout((current) => {
      if (!current) return null
      let next: DocumentPaneNode | null = current
      for (const documentId of closedIds) {
        if (!next || !documentPaneContains(next, documentId)) continue
        const replacementId = documentId === closedMainDocumentId
          ? replacementCandidates.find((candidate) => !documentPaneContains(next!, candidate))
          : undefined
        next = replacementId ? replaceDocumentPaneDocument(next, documentId, replacementId) : (removeDocumentPane(next, documentId) ?? null)
      }
      return next?.kind === 'split' ? next : null
    })
    if (closedMainDocumentId) {
      const replacementId = replacementCandidates[0] ?? promotedEmbeddedDocumentId
      if (replacementId) {
        preferredWorkspaceDocumentIdRef.current = replacementId
        setWorkspaceDocumentId(replacementId)
        if (!replacementCandidates[0]) setPaneOnlyDocumentIds((current) => current.filter((id) => id !== replacementId))
        if (useWorkspace.getState().activeId !== replacementId) useWorkspace.getState().setActive(replacementId)
      }
    }
  }, [documentPaneLayout, floatingDocumentIds, paneOnlyDocumentIds, workspace.sessions])

  useEffect(() => {
    const openIds = new Set(workspace.sessions.map((item) => item.document.id))
    setPaneOnlyDocumentIds((current) =>
      documentPaneLayout?.kind === 'split'
        ? current.filter((documentId) => openIds.has(documentId) && documentPaneContains(documentPaneLayout, documentId))
        : []
    )
  }, [documentPaneLayout, workspace.sessions])

  useEffect(() => {
    const openIds = new Set(workspace.sessions.map((item) => item.document.id))
    setFloatingDocuments((current) => {
      const next = current.filter((item) => openIds.has(item.documentId))
      return next.length === current.length ? current : next
    })
  }, [workspace.sessions])

  useEffect(() => {
    const unavailable = new Set([...paneOnlyDocumentIds, ...floatingDocumentIds])
    const openIds = new Set(workspace.sessions.map((item) => item.document.id))
    const availableIds = workspace.sessions.map((item) => item.document.id).filter((id) => !unavailable.has(id))
    setWorkspaceDocumentId((current) => {
      const preferred = preferredWorkspaceDocumentIdRef.current
      preferredWorkspaceDocumentIdRef.current = null
      if (preferred && openIds.has(preferred) && !unavailable.has(preferred)) return preferred
      if (workspace.activeId && openIds.has(workspace.activeId) && !unavailable.has(workspace.activeId)) return workspace.activeId
      if (current && openIds.has(current) && !unavailable.has(current)) return current
      return availableIds.at(-1) ?? null
    })
  }, [floatingDocumentIds, paneOnlyDocumentIds, workspace.activeId, workspace.sessions])

  const activateDocumentTab = useCallback((documentId: string): void => {
    startTransition(() => {
      setHomeOpen(false)
      setWorkspaceDocumentId(documentId)
      useWorkspace.getState().setActive(documentId)
    })
  }, [])

  const splitDocumentFromTab = useCallback(
    (placement: DocumentPanePlacement): void => {
      const workspace = useWorkspace.getState()
      const baseDocumentId = workspaceDocumentId
      if (!baseDocumentId || placement.documentId === placement.targetPaneId) return
      setDocumentPaneLayout((current) => splitDocumentPaneFromTab(current, baseDocumentId, placement))
      setPaneOnlyDocumentIds((current) => {
        const next = current.includes(placement.documentId) ? [...current] : [...current, placement.documentId]
        return baseDocumentId === placement.documentId ? next.filter((id) => id !== placement.targetPaneId) : next
      })
      if (baseDocumentId === placement.documentId) {
        setWorkspaceDocumentId(placement.targetPaneId)
        if (workspace.activeId === placement.documentId) workspace.setActive(placement.targetPaneId)
      }
    },
    [workspaceDocumentId]
  )

  const updateDocumentPaneLayout = useCallback((layout: DocumentPaneNode | null): void => setDocumentPaneLayout(layout), [])

  const moveDocumentPaneView = useCallback((documentId: string, targetPaneId: string, direction: DocumentPaneDirection): void => {
    setDocumentPaneLayout((current) => (current ? moveDocumentPane(current, documentId, targetPaneId, direction) : current))
  }, [])

  const floatDocument = useCallback(
    (documentId: string, anchor: { x: number; y: number }): void => {
      const state = useWorkspace.getState()
      if (!state.sessions.some((item) => item.document.id === documentId) || floatingDocumentIds.includes(documentId)) return
      const initialPosition = createFloatingDocumentPosition(documentId, anchor)
      const nextFloatingIds = new Set([...floatingDocumentIds, documentId])
      const availableDocumentIds = state.sessions
        .map((item) => item.document.id)
        .filter((id) => !nextFloatingIds.has(id))
        .reverse()
      const detached = detachDocumentPaneWorkspace(documentPaneLayout, documentId, workspaceDocumentId, paneOnlyDocumentIds, availableDocumentIds)
      setFloatingDocuments((current) =>
        current.some((item) => item.documentId === documentId) ? current : [...current, { documentId, initialPosition, pinned: false }]
      )
      setDocumentPaneLayout(detached.layout)
      setPaneOnlyDocumentIds(detached.paneOnlyDocumentIds)
      setWorkspaceDocumentId(detached.workspaceDocumentId)
      setHomeOpen(false)
      state.setActive(documentId)
    },
    [documentPaneLayout, floatingDocumentIds, paneOnlyDocumentIds, workspaceDocumentId]
  )

  const activateFloatingDocument = useCallback((documentId: string): void => {
    setHomeOpen(false)
    setFloatingDocuments((current) => {
      const target = current.find((item) => item.documentId === documentId)
      return target && current.at(-1)?.documentId !== documentId ? [...current.filter((item) => item.documentId !== documentId), target] : current
    })
    useWorkspace.getState().setActive(documentId)
  }, [])

  const setFloatingDocumentPinned = useCallback((documentId: string, pinned: boolean): void => {
    setFloatingDocuments((current) => {
      const target = current.find((item) => item.documentId === documentId)
      if (!target || target.pinned === pinned) return current
      return [...current.filter((item) => item.documentId !== documentId), { ...target, pinned }]
    })
  }, [])

  const returnFloatingDocumentToTabs = useCallback(
    (documentId: string, visibleIndex?: number): void => {
      const state = useWorkspace.getState()
      if (!state.sessions.some((item) => item.document.id === documentId)) return
      const nextFloatingIds = floatingDocumentIds.filter((id) => id !== documentId)
      if (visibleIndex !== undefined) {
        const hiddenIds = new Set([...paneOnlyDocumentIds, ...nextFloatingIds])
        const returned = state.sessions.find((item) => item.document.id === documentId)
        const visible = state.sessions.filter((item) => item.document.id !== documentId && !hiddenIds.has(item.document.id))
        if (returned) visible.splice(Math.max(0, Math.min(visible.length, visibleIndex)), 0, returned)
        const hidden = state.sessions.filter((item) => hiddenIds.has(item.document.id))
        state.reorderSessions([...visible, ...hidden].map((item) => item.document.id))
      }
      const targetDocumentId = resolveFloatingDocumentReturnTarget({
        returnedDocumentId: documentId,
        workspaceDocumentId,
        preserveWorkspace: visibleIndex !== undefined,
        openDocumentIds: state.sessions.map((item) => item.document.id),
        remainingFloatingDocumentIds: nextFloatingIds
      })
      setFloatingDocuments((current) => current.filter((item) => item.documentId !== documentId))
      setPaneOnlyDocumentIds((current) => current.filter((id) => id !== documentId))
      setWorkspaceDocumentId(targetDocumentId)
      setHomeOpen(false)
      state.setActive(targetDocumentId)
    },
    [floatingDocumentIds, paneOnlyDocumentIds, workspaceDocumentId]
  )

  const closeFloatingDocument = useCallback((documentId: string): void => {
    void useWorkspace
      .getState()
      .closeDocument(documentId)
      .then(() => {
        if (!useWorkspace.getState().sessions.some((item) => item.document.id === documentId)) {
          setFloatingDocuments((current) => current.filter((item) => item.documentId !== documentId))
        }
      })
  }, [])

  const returnDocumentPaneToTabs = useCallback(
    (documentId: string, visibleIndex: number): void => {
      if (!documentPaneLayout) return
      const sessions = useWorkspace.getState().sessions
      const availableDocumentIds = sessions.map((item) => item.document.id).filter((id) => id !== documentId && !floatingDocumentIds.includes(id))
      const detached = detachDocumentPaneWorkspace(documentPaneLayout, documentId, workspaceDocumentId, paneOnlyDocumentIds, availableDocumentIds)
      const nextPaneOnlyIds = detached.paneOnlyDocumentIds
      const returned = sessions.find((item) => item.document.id === documentId)
      const hiddenIds = new Set([...nextPaneOnlyIds, ...floatingDocumentIds])
      const visible = sessions.filter((item) => item.document.id !== documentId && !hiddenIds.has(item.document.id))
      if (returned) visible.splice(Math.max(0, Math.min(visible.length, visibleIndex)), 0, returned)
      const hidden = sessions.filter((item) => hiddenIds.has(item.document.id))
      useWorkspace.getState().reorderSessions([...visible, ...hidden].map((item) => item.document.id))
      setPaneOnlyDocumentIds(nextPaneOnlyIds)
      setDocumentPaneLayout(detached.layout)
      const targetDocumentId = detached.workspaceDocumentId ?? documentId
      setWorkspaceDocumentId(targetDocumentId)
      useWorkspace.getState().setActive(targetDocumentId)
    },
    [documentPaneLayout, floatingDocumentIds, paneOnlyDocumentIds, workspaceDocumentId]
  )
  return {
    paneOnlyDocumentIds,
    workspaceDocumentId,
    setWorkspaceDocumentId,
    floatingDocuments,
    hiddenDocumentIds,
    visibleDocumentPaneLayout,
    activateDocumentTab,
    contextActivateDocumentTab: activateDocumentTab,
    splitDocumentFromTab,
    updateDocumentPaneLayout,
    moveDocumentPaneView,
    floatDocument,
    activateFloatingDocument,
    setFloatingDocumentPinned,
    returnFloatingDocumentToTabs,
    closeFloatingDocument,
    returnDocumentPaneToTabs
  }
}
