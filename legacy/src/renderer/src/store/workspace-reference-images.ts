import type { ProjectReferenceImage } from '@shared/types-document'
import { validateProjectReferenceImage } from '@/core/project-reference-images'
import { activeSession } from './workspace-access'
import { useWorkspace } from './workspace'

export function addProjectReferenceImage(image: ProjectReferenceImage): boolean {
  validateProjectReferenceImage(image, image.pixels.byteLength)
  const state = useWorkspace.getState()
  if (!activeSession(state)) return false
  state.mutateActive(session => {
    session.document.referenceImages = [...(session.document.referenceImages ?? []), image]
  }, 'metadata')
  return true
}

export function removeProjectReferenceImage(id: string): void {
  const state = useWorkspace.getState()
  if (!activeSession(state)?.document.referenceImages?.some(image => image.id === id)) return
  state.mutateActive(session => {
    session.document.referenceImages = session.document.referenceImages?.filter(image => image.id !== id)
  }, 'metadata')
}
