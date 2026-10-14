export type BrushFolderId = string | null

export const brushFolderParentId = (folderId: BrushFolderId): BrushFolderId => {
  if (!folderId) return null
  const separator = folderId.lastIndexOf('/')
  return separator >= 0 ? folderId.slice(0, separator) : null
}

export const brushFolderContains = (folderId: string, candidateId: string | null | undefined): boolean => (
  candidateId === folderId || candidateId?.startsWith(`${folderId}/`) === true
)

export const remapBrushFolderId = (candidateId: string, sourceId: string, targetId: string): string => {
  if (!brushFolderContains(sourceId, candidateId)) return candidateId
  return `${targetId}${candidateId.slice(sourceId.length)}`
}
