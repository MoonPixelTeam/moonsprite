import { describe, expect, it } from 'vitest'
import { documentPaneContains, replaceDocumentPaneDocument, type DocumentPaneNode } from './document-pane-layout'

describe('document pane close replacement', () => {
  it('replaces a closed pane without flattening its embedded siblings', () => {
    const layout: DocumentPaneNode = {
      kind: 'split',
      id: 'root-split',
      orientation: 'horizontal',
      ratio: 0.6,
      first: { kind: 'leaf', id: 'project-a', documentId: 'project-a' },
      second: {
        kind: 'split',
        id: 'embedded-split',
        orientation: 'vertical',
        ratio: 0.4,
        first: { kind: 'leaf', id: 'project-b', documentId: 'project-b' },
        second: { kind: 'leaf', id: 'project-d', documentId: 'project-d' },
      },
    }

    const next = replaceDocumentPaneDocument(layout, 'project-a', 'project-c')

    expect(next).toMatchObject({
      kind: 'split',
      id: 'root-split',
      orientation: 'horizontal',
      ratio: 0.6,
      first: { kind: 'leaf', documentId: 'project-c' },
      second: {
        kind: 'split',
        id: 'embedded-split',
        orientation: 'vertical',
        ratio: 0.4,
        first: { kind: 'leaf', documentId: 'project-b' },
        second: { kind: 'leaf', documentId: 'project-d' },
      },
    })
    expect(documentPaneContains(next, 'project-b')).toBe(true)
    expect(documentPaneContains(next, 'project-c')).toBe(true)
  })
})
