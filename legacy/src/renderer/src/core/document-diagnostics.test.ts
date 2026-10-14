import { describe, expect, it, vi } from 'vitest'
import { createDocument } from './document'
import { createDefaultLayerStyles } from './layer-styles'
import { documentDiagnosticDetail } from './document-diagnostics'

describe('document diagnostic metadata', () => {
  it('identifies the layer, effects and recording without touching pixel storage', () => {
    const document = createDocument('private project name', 4200, 2400, 'rgba', true)
    const layer = document.layers[0]
    const pixels = vi.fn(() => { throw new Error('Pixel materialization is forbidden') })
    Object.defineProperty(layer, 'pixels', { get: pixels })
    layer.layerStyles = createDefaultLayerStyles()
    layer.layerStyles.enabled = true
    layer.layerStyles.shadow.enabled = true
    const detail = documentDiagnosticDetail(document)
    expect(detail).toMatchObject({ documentId: document.id, layerId: layer.id, layerSize: '4200x2400', timelapseEnabled: true, timelapseFrames: 0 })
    expect(detail.layerEffects).toContain('shadow')
    expect(pixels).not.toHaveBeenCalled()
    expect(JSON.stringify(detail)).not.toContain(document.name)
    expect(Object.values(detail).every((value) => value === null || ['string', 'number', 'boolean'].includes(typeof value))).toBe(true)
  })
})
