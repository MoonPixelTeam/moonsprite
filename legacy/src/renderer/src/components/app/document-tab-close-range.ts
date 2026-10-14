export type DocumentTabCloseScope = 'left' | 'right' | 'others'

export const documentTabCloseRange = (
  visibleDocumentIds: readonly string[],
  currentDocumentId: string,
  scope: DocumentTabCloseScope
): string[] => {
  const currentIndex = visibleDocumentIds.indexOf(currentDocumentId)
  if (currentIndex < 0) return []

  switch (scope) {
    case 'left':
      return visibleDocumentIds.slice(0, currentIndex)
    case 'right':
      return visibleDocumentIds.slice(currentIndex + 1)
    case 'others':
      return visibleDocumentIds.filter((documentId) => documentId !== currentDocumentId)
  }
}
