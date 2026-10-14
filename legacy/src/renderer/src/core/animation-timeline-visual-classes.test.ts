import { describe, expect, it } from 'vitest'
import { timelineCellVisualClasses, timelineRowVisualClasses } from './animation-timeline-visual-classes'

describe('timeline visual class mapping', () => {
  it('keeps mask row activity typed and independent', () => {
    const flags = timelineRowVisualClasses({ row: { id: 'm', ownerId: 'l', ownerKind: 'layer', kind: 'mask' }, active: true, selected: false, selectedByCell: false, selectedByFrame: true }, true)
    expect(flags.active).toBe(true)
    expect(flags.selectedByFrame).toBe(true)
  })

  it('maps empty mask slots through DTO state without materializing content', () => {
    const flags = timelineCellVisualClasses({ cell: null, key: 'x', kind: 'mask', ownerId: 'l', ownerKind: 'layer', frameId: 'f', valid: false, activeLayer: false, activeFrame: true, current: false, explicitSelected: false, selectedVisible: false, selectedByFrame: true, selectedByLayer: false, selectedByFrameAndLayer: false, presentationHidden: false, link: { linked: false, role: 'none', groupId: null, directSelected: false, directSelectedVisible: false, selectedByFrame: false, selectedByFrameVisible: false, structural: false, structuralVisible: false }, priority: 'default' }, { frame: { id: 'f' }, active: true, selected: true, outlineVisible: true }, true)
    expect(flags.selectedByFrame).toBe(true)
    expect(flags.current).toBe(false)
  })

  it('keeps frame selection when presentation guides are hidden', () => {
    const flags = timelineCellVisualClasses(undefined, { frame: { id: 'f' }, active: false, selected: true, outlineVisible: false }, false)
    expect(flags.frameSelected).toBe(true)
    expect(flags.outlineVisible).toBe(false)
  })
})
