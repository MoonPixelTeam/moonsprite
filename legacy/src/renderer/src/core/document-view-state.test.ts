import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from './document'
import { loadDocumentViewState, saveDocumentViewState } from './document-view-state'

describe('document view state', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips navigation and symmetry state by project path', () => {
    const document = createDocument('view', 8, 8, 'rgba')
    document.filePath = 'D:/projects/view.moonsprite'
    saveDocumentViewState(document, {
      zoom: 23,
      panX: -14,
      panY: 9,
      rotation: 90,
      mirrored: true,
      mirroredVertical: false
    }, { x: 3.5, y: 5 })

    expect(loadDocumentViewState(document)).toEqual({
      zoom: 23,
      panX: -14,
      panY: 9,
      rotation: 90,
      mirrored: true,
      mirroredVertical: false,
      symmetryCenter: { x: 3.5, y: 5 }
    })
  })
})
