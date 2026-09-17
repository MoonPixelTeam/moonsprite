import { describe, expect, it } from 'vitest'
import { documentTabCloseRange } from './document-tab-close-range'

describe('documentTabCloseRange', () => {
  it('returns the visible tabs on the requested side of the current tab', () => {
    const visibleDocumentIds = ['A', 'B', 'C', 'D']

    expect(documentTabCloseRange(visibleDocumentIds, 'C', 'left')).toEqual(['A', 'B'])
    expect(documentTabCloseRange(visibleDocumentIds, 'C', 'right')).toEqual(['D'])
    expect(documentTabCloseRange(visibleDocumentIds, 'C', 'others')).toEqual(['A', 'B', 'D'])
  })

  it('only returns tab-bar documents, leaving merged and floating documents out', () => {
    const visibleDocumentIds = ['A', 'C']

    expect(documentTabCloseRange(visibleDocumentIds, 'C', 'left')).toEqual(['A'])
    expect(documentTabCloseRange(visibleDocumentIds, 'C', 'others')).toEqual(['A'])
  })

  it('handles end tabs and a document that is no longer visible', () => {
    expect(documentTabCloseRange(['A', 'B'], 'A', 'left')).toEqual([])
    expect(documentTabCloseRange(['A', 'B'], 'B', 'right')).toEqual([])
    expect(documentTabCloseRange(['A', 'B'], 'C', 'others')).toEqual([])
  })
})
