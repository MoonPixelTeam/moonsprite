import { useLayoutEffect, useState, type SetStateAction } from 'react'

export interface PreviewPanelView {
  documentId: string
  zoom: number | null
  pan: { x: number; y: number }
  followViewport: boolean
  initialPreviewViewport: { width: number; height: number } | null
}

export interface PreviewPanelViewRef { current: PreviewPanelView | null }

const initialView = (documentId: string, retained?: PreviewPanelViewRef): PreviewPanelView =>
  retained?.current?.documentId === documentId ? retained.current : {
    documentId, zoom: null, pan: { x: 0, y: 0 }, followViewport: false, initialPreviewViewport: null
  }

/** The inspector owns the retained view, so moving between React roots keeps it. */
export function usePreviewPanelView(documentId: string, retained?: PreviewPanelViewRef) {
  const [storedView, setView] = useState(() => initialView(documentId, retained))
  const view = storedView.documentId === documentId ? storedView : initialView(documentId, retained)
  useLayoutEffect(() => {
    if (storedView.documentId !== documentId) setView(view)
    if (retained) retained.current = view
  }, [documentId, retained, storedView.documentId, view])
  const update = <K extends keyof PreviewPanelView>(key: K, action: SetStateAction<PreviewPanelView[K]>): void => {
    setView(current => ({
      ...current,
      [key]: typeof action === 'function'
        ? (action as (value: PreviewPanelView[K]) => PreviewPanelView[K])(current[key]) : action
    }))
  }
  return {
    ...view,
    setZoom: (value: SetStateAction<PreviewPanelView['zoom']>) => update('zoom', value),
    setPan: (value: SetStateAction<PreviewPanelView['pan']>) => update('pan', value),
    setFollowViewport: (value: SetStateAction<PreviewPanelView['followViewport']>) => update('followViewport', value),
    setInitialPreviewViewport: (value: SetStateAction<PreviewPanelView['initialPreviewViewport']>) => update('initialPreviewViewport', value)
  }
}
