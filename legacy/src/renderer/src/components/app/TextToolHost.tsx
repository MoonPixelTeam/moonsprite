import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TextCelData } from '@shared/types-text'
import { TextToolDialog } from '@/components/TextToolDialog'
import { publishTextToolPreview, TEXT_TOOL_DIALOG_EVENT, type TextToolDialogDetail } from '@/components/text-tool-events'
import { resolveAnimationCel } from '@/core/animation'
import { cloneTextCelData, normalizeTextCelData, rasterizeText } from '@/core/text-raster'
import { type TextCelPreview, type TextLayerDraftTarget, useWorkspace } from '@/store/workspace'

const textToolValueAtCurrentPlacement = (request: TextToolDialogDetail, value: TextCelData): { value: TextCelData; x: number; y: number } => {
  const fallbackX = value.originX ?? request.x
  const fallbackY = value.originY ?? request.y
  if (!request.layerId || !request.frameId) return { value, x: fallbackX, y: fallbackY }
  const document = useWorkspace.getState().sessions.find((session) => session.document.id === request.documentId)?.document
  const timeline = document?.animation
  const cel = timeline?.cels.find((candidate) => candidate.layerId === request.layerId && candidate.frameId === request.frameId)
  const source = timeline ? resolveAnimationCel(timeline, cel ?? null) ?? cel : cel
  const x = source?.surface?.offsetX ?? source?.text?.originX ?? fallbackX
  const y = source?.surface?.offsetY ?? source?.text?.originY ?? fallbackY
  return { value: { ...value, originX: x, originY: y }, x, y }
}

/** Owns text dialog requests, raster previews and draft cancellation/commit. */
export const TextToolHost = memo(function TextToolHost() {
  const [textToolRequest, setTextToolRequest] = useState<TextToolDialogDetail | null>(null)
  const textPreviewSurfaceRef = useRef<TextCelPreview | null>(null)
  const textLayerDraftRef = useRef<(TextLayerDraftTarget & { documentId: string }) | null>(null)
  const coordinatorRenderKey = useWorkspace(state => state.sessions.find(item => item.document.id === textToolRequest?.documentId)?.revision ?? 0)
  const workspace = useWorkspace.getState()
  useEffect(() => {
    const openTextDialog = (event: Event): void => {
      const detail = (event as CustomEvent<TextToolDialogDetail>).detail
      if (!detail?.documentId) return
      setTextToolRequest((current) => {
        const switchingTarget = current?.documentId !== detail.documentId
          || current?.layerId !== detail.layerId
          || current?.frameId !== detail.frameId
        // A live preview belongs to its original cel. Restore it before the
        // next target is opened so its temporary surface cannot overwrite the
        // text we are switching to.
        if (switchingTarget && current?.layerId && current.frameId && textPreviewSurfaceRef.current) {
          const state = useWorkspace.getState()
          state.setActive(current.documentId)
          state.restoreTextCelPreview(current.layerId, current.frameId, textPreviewSurfaceRef.current)
          textPreviewSurfaceRef.current = null
          publishTextToolPreview({ documentId: current.documentId, surface: null, box: null })
        }
        return detail
      })
    }
    window.addEventListener(TEXT_TOOL_DIALOG_EVENT, openTextDialog)
    return () => window.removeEventListener(TEXT_TOOL_DIALOG_EVENT, openTextDialog)
  }, [])

  const textToolInitial = useMemo<Partial<TextCelData> | undefined>(() => {
    if (!textToolRequest) return undefined
    const target = workspace.sessions.find((item) => item.document.id === textToolRequest.documentId)
    if (!target) return undefined
    if (!textToolRequest.layerId || !textToolRequest.frameId) return {
      color: { ...target.primaryColor },
      ...(textToolRequest.width ? { boxWidth: textToolRequest.width } : {}),
      ...(textToolRequest.height ? { boxHeight: textToolRequest.height } : {})
    }
    const cel = target?.document.animation?.cels.find((candidate) => candidate.layerId === textToolRequest.layerId && candidate.frameId === textToolRequest.frameId)
    // The dialog's origin is the cel placement captured by the caller, not a
    // possibly older text-data origin. This keeps an Alt-dragged text duplicate
    // at its copied position when it is subsequently edited.
    return cel?.text
      ? { ...cloneTextCelData(cel.text), originX: textToolRequest.x, originY: textToolRequest.y }
      : { color: { ...target.primaryColor } }
  }, [coordinatorRenderKey, textToolRequest, workspace.sessions])

  const textToolBox = textToolRequest && textToolInitial?.layoutMode === 'box' && textToolInitial.boxWidth && textToolInitial.boxHeight ? {
    x: textToolInitial.originX ?? textToolRequest.x,
    y: textToolInitial.originY ?? textToolRequest.y,
    width: textToolInitial.boxWidth,
    height: textToolInitial.boxHeight
  } : null

  const clearTextToolPreview = useCallback((): void => {
    const request = textToolRequest
    if (!request) return
    if (request.layerId && request.frameId && textPreviewSurfaceRef.current) {
      useWorkspace.getState().setActive(request.documentId)
      useWorkspace.getState().restoreTextCelPreview(request.layerId, request.frameId, textPreviewSurfaceRef.current)
    }
    textPreviewSurfaceRef.current = null
    publishTextToolPreview({ documentId: request.documentId, surface: null, box: null })
  }, [textToolRequest])

  const changeTextTool = useCallback((value: TextCelData): void => {
    const request = textToolRequest
    if (!request) return
    const state = useWorkspace.getState()
    state.setActive(request.documentId)
    const draft = textLayerDraftRef.current
    const current = textToolValueAtCurrentPlacement(request, value)
    const box = current.value.layoutMode === 'box' && current.value.boxWidth && current.value.boxHeight ? { x: current.x, y: current.y, width: current.value.boxWidth, height: current.value.boxHeight } : null
    if (draft?.documentId === request.documentId) {
      state.updateTextLayerDraft(draft.layerId, draft.frameId, current.value, current.x, current.y)
      publishTextToolPreview({ documentId: request.documentId, surface: null, box })
      return
    }
    if (request.layerId || !current.value.text.length) return
    const target = state.beginTextLayerDraft(current.value, current.x, current.y)
    if (!target) return
    textLayerDraftRef.current = { ...target, documentId: request.documentId }
    setTextToolRequest((current) => current?.documentId === request.documentId ? { ...current, ...target } : current)
    publishTextToolPreview({ documentId: request.documentId, surface: null, box })
  }, [textToolRequest])

  const previewTextTool = useCallback((value: TextCelData | null): void => {
    const request = textToolRequest
    if (!request) return
    const state = useWorkspace.getState()
    state.setActive(request.documentId)
    const draft = textLayerDraftRef.current
    const current = value ? textToolValueAtCurrentPlacement(request, value) : null
    const previewValue = current?.value ?? value
    const x = current?.x ?? request.x
    const y = current?.y ?? request.y
    const boxWidth = previewValue?.layoutMode === 'box' ? previewValue.boxWidth ?? request.width : undefined
    const boxHeight = previewValue?.layoutMode === 'box' ? previewValue.boxHeight ?? request.height : undefined
    const box = boxWidth && boxHeight ? { x, y, width: boxWidth, height: boxHeight } : null
    if (draft?.documentId === request.documentId) {
      publishTextToolPreview({ documentId: request.documentId, surface: null, box })
      return
    }
    if (request.layerId && request.frameId) {
      if (textPreviewSurfaceRef.current) state.restoreTextCelPreview(request.layerId, request.frameId, textPreviewSurfaceRef.current)
      textPreviewSurfaceRef.current = previewValue ? state.previewTextCel(request.layerId, request.frameId, previewValue, x, y) : null
      return
    }
    const target = state.sessions.find((item) => item.document.id === request.documentId)
    const preview = value && target
      ? rasterizeText(normalizeTextCelData({ ...previewValue, originX: x, originY: y }, target.primaryColor), x, y).rgba
      : null
    publishTextToolPreview({ documentId: request.documentId, surface: preview, box })
  }, [textToolRequest])
  return <>    {textToolRequest && <TextToolDialog key={`${textToolRequest.documentId}\0${textToolRequest.layerId ?? 'new'}\0${textToolRequest.frameId ?? 'new'}\0${textToolRequest.x}\0${textToolRequest.y}`} editing={Boolean(textToolRequest.layerId && !textLayerDraftRef.current)} initial={textToolInitial} box={textToolBox} onChange={changeTextTool} onPreview={previewTextTool} onClose={() => {
      const draft = textLayerDraftRef.current
      clearTextToolPreview()
      if (draft) {
        useWorkspace.getState().setActive(draft.documentId)
        useWorkspace.getState().cancelTextLayerDraft(draft.layerId)
        textLayerDraftRef.current = null
      }
      setTextToolRequest(null)
    }} onSubmit={(value) => {
      const request = textToolRequest
      // Preview cleanup restores the pre-dialog surface. Capture the latest
      // live placement first so an intervening move is not written back to the
      // position where this dialog was opened.
      const current = textToolValueAtCurrentPlacement(request, value)
      clearTextToolPreview()
      useWorkspace.getState().setActive(request.documentId)
      const draft = textLayerDraftRef.current
      if (draft?.documentId === request.documentId) {
        workspace.updateTextLayerDraft(draft.layerId, draft.frameId, current.value, current.x, current.y)
        workspace.commitTextLayerDraft(draft.layerId)
        textLayerDraftRef.current = null
      } else if (request.layerId && request.frameId) workspace.setTextCel(request.layerId, request.frameId, current.value, current.x, current.y)
      else workspace.createTextLayer(current.value, current.x, current.y)
      setTextToolRequest(null)
    }} />}
  </>
})
