import { describe, expect, it, vi } from 'vitest'
import { flushViewPreview, notifyViewPreview, registerViewPreviewFlusher, registerViewPreviewListener } from './view-preview-lifecycle'

describe('view preview lifecycle', () => {
  it('flushes the active document preview synchronously and unregisters cleanly', () => {
    const flush = vi.fn()
    const unregister = registerViewPreviewFlusher('document-1', flush)

    flushViewPreview('document-1')
    expect(flush).toHaveBeenCalledTimes(1)

    unregister()
    flushViewPreview('document-1')
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('publishes live canvas view updates without committing document state', () => {
    const listener = vi.fn()
    const unregister = registerViewPreviewListener('document-1', listener)
    const view = { zoom: 16, panX: 24, panY: -12, rotation: 0, mirrored: false, mirroredVertical: false, showGrid: false, relativeLuminance: false }
    notifyViewPreview('document-1', view)
    expect(listener).toHaveBeenCalledWith(view)
    unregister()
    notifyViewPreview('document-1', { ...view, panX: 48 })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
