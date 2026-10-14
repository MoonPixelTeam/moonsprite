import { describe, expect, it, vi } from 'vitest'
import { beginAdjustmentPreviewEdit, endAdjustmentPreviewEdit, hasAdjustmentPreviewController, prepareAdjustmentPreviewEdit, registerAdjustmentPreviewController, renderAdjustmentPreviewEdit } from './adjustment-preview-lifecycle'

describe('adjustment preview lifecycle', () => {
  it('suspends and resumes once around nested document edits', () => {
    const suspend = vi.fn()
    const resume = vi.fn()
    const unregister = registerAdjustmentPreviewController('nested-adjustment', { suspend, resume })
    expect(hasAdjustmentPreviewController('nested-adjustment')).toBe(true)

    beginAdjustmentPreviewEdit('nested-adjustment')
    beginAdjustmentPreviewEdit('nested-adjustment')
    expect(suspend).toHaveBeenCalledOnce()

    endAdjustmentPreviewEdit('nested-adjustment')
    expect(resume).not.toHaveBeenCalled()
    endAdjustmentPreviewEdit('nested-adjustment')
    expect(resume).toHaveBeenCalledOnce()

    unregister()
    expect(hasAdjustmentPreviewController('nested-adjustment')).toBe(false)
  })

  it('prepares an unadjusted transient frame and renders the adjusted result while editing', () => {
    const suspend = vi.fn()
    const resume = vi.fn()
    const prepare = vi.fn()
    const render = vi.fn()
    const unregister = registerAdjustmentPreviewController('transient-adjustment', { suspend, resume, prepare, render })
    const selection = { x: 2, y: 3, width: 4, height: 5 }

    beginAdjustmentPreviewEdit('transient-adjustment')
    prepareAdjustmentPreviewEdit('transient-adjustment')
    renderAdjustmentPreviewEdit('transient-adjustment', selection)
    endAdjustmentPreviewEdit('transient-adjustment')

    expect(prepare).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalledWith(selection)
    expect(resume).toHaveBeenCalledOnce()
    unregister()
  })
})
