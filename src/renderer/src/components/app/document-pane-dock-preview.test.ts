import { describe, expect, it } from 'vitest'
import { documentPaneDockPreviewBand, documentPaneDockPreviewGeometry } from './document-pane-dock-preview'

const rect = { left: 334, top: 147, width: 1861, height: 949 }

describe('documentPaneDockPreviewBand', () => {
  it('clamps the preview band between 18px and 56px', () => {
    expect(documentPaneDockPreviewBand(0)).toBe(18)
    expect(documentPaneDockPreviewBand(100)).toBe(18)
    expect(documentPaneDockPreviewBand(400)).toBe(20)
    expect(documentPaneDockPreviewBand(1000)).toBe(50)
    expect(documentPaneDockPreviewBand(4000)).toBe(56)
    expect(documentPaneDockPreviewBand(Number.NaN)).toBe(18)
  })
})

describe('documentPaneDockPreviewGeometry', () => {
  it('keeps every band inside the docked pane so it is never clipped by the work area', () => {
    for (const direction of ['left', 'right', 'top', 'bottom'] as const) {
      const band = documentPaneDockPreviewGeometry(rect, direction)
      expect(band.left).toBeGreaterThanOrEqual(rect.left)
      expect(band.top).toBeGreaterThanOrEqual(rect.top)
      expect(band.left + band.width).toBeLessThanOrEqual(rect.left + rect.width)
      expect(band.top + band.height).toBeLessThanOrEqual(rect.top + rect.height)
    }
  })

  it('anchors a side band to the matching pane edge and spans the full height', () => {
    const left = documentPaneDockPreviewGeometry(rect, 'left')
    expect(left.left).toBe(334)
    expect(left.width).toBe(56)
    expect(left.top).toBe(147)
    expect(left.height).toBe(949)
    const right = documentPaneDockPreviewGeometry(rect, 'right')
    expect(right.left + right.width).toBe(334 + 1861)
    expect(right.width).toBe(56)
  })

  it('anchors a stacked band to the matching pane edge and spans the full width', () => {
    const top = documentPaneDockPreviewGeometry(rect, 'top')
    expect(top.top).toBe(147)
    expect(top.height).toBe(47.45)
    expect(top.left).toBe(334)
    expect(top.width).toBe(1861)
    const bottom = documentPaneDockPreviewGeometry(rect, 'bottom')
    expect(bottom.top + bottom.height).toBe(147 + 949)
  })
})
