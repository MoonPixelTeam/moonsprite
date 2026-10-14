import type { SelectionMask } from '@shared/types-selection'

export interface AdjustmentPreviewController {
  suspend: () => void
  resume: () => void
  prepare?: () => void
  render?: (selection: SelectionMask | null) => void
}

const controllers = new Map<string, AdjustmentPreviewController>()
const editDepths = new Map<string, number>()

export const hasAdjustmentPreviewController = (documentId: string): boolean => controllers.has(documentId)

export const registerAdjustmentPreviewController = (documentId: string, controller: AdjustmentPreviewController): (() => void) => {
  editDepths.delete(documentId)
  controllers.set(documentId, controller)
  return () => {
    if (controllers.get(documentId) === controller) controllers.delete(documentId)
    editDepths.delete(documentId)
  }
}

export const beginAdjustmentPreviewEdit = (documentId: string): void => {
  const depth = editDepths.get(documentId) ?? 0
  if (depth === 0) controllers.get(documentId)?.suspend()
  editDepths.set(documentId, depth + 1)
}

export const endAdjustmentPreviewEdit = (documentId: string): void => {
  const depth = editDepths.get(documentId) ?? 0
  if (depth <= 1) {
    editDepths.delete(documentId)
    controllers.get(documentId)?.resume()
    return
  }
  editDepths.set(documentId, depth - 1)
}

export const prepareAdjustmentPreviewEdit = (documentId: string): void => {
  if ((editDepths.get(documentId) ?? 0) > 0) controllers.get(documentId)?.prepare?.()
}

export const renderAdjustmentPreviewEdit = (documentId: string, selection: SelectionMask | null): void => {
  if ((editDepths.get(documentId) ?? 0) > 0) controllers.get(documentId)?.render?.(selection)
}

export const runWithAdjustmentPreviewSuspended = <T>(documentId: string, edit: () => T): T => {
  beginAdjustmentPreviewEdit(documentId)
  try {
    return edit()
  } finally {
    endAdjustmentPreviewEdit(documentId)
  }
}
