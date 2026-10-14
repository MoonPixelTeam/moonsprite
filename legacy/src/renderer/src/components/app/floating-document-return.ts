interface FloatingDocumentReturnTargetOptions {
  returnedDocumentId: string
  workspaceDocumentId: string | null
  preserveWorkspace: boolean
  openDocumentIds: readonly string[]
  remainingFloatingDocumentIds: readonly string[]
}

export function resolveFloatingDocumentReturnTarget({
  returnedDocumentId,
  workspaceDocumentId,
  preserveWorkspace,
  openDocumentIds,
  remainingFloatingDocumentIds
}: FloatingDocumentReturnTargetOptions): string {
  if (!preserveWorkspace || !workspaceDocumentId || workspaceDocumentId === returnedDocumentId) return returnedDocumentId
  if (!openDocumentIds.includes(workspaceDocumentId) || remainingFloatingDocumentIds.includes(workspaceDocumentId)) return returnedDocumentId
  return workspaceDocumentId
}
