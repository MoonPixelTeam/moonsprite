import type { ProjectCanvasReference } from '@shared/types-document'

export interface ManifestReferenceImage {
  id: string
  width: number
  height: number
  dataFile: string
}

export interface ManifestCanvasReference extends Omit<ProjectCanvasReference, 'src'> {
  dataFile: string
}
