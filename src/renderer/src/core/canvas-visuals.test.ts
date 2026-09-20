import { describe, expect, it } from 'vitest'
import { canvasCursors, canvasToolCursor, resizeCursors, selectionCreationCursor, selectionCursorCornerRects } from './canvas-visuals'

describe('text cursor contrast', () => {
  it('uses the contrasting canvas cursor color for the text tool', () => {
    expect(canvasToolCursor('text', { r: 8, g: 8, b: 8, a: 255 })).toBe(canvasCursors.pencilWhite)
    expect(canvasToolCursor('text', { r: 248, g: 248, b: 248, a: 255 })).toBe(canvasCursors.pencilBlack)
  })
})

describe('selection resize cursors', () => {
  it('keeps the regular marquee corner directions stable', () => {
    expect(resizeCursors.nw).toBe(canvasCursors.nwseResize)
    expect(resizeCursors.se).toBe(canvasCursors.nwseResize)
    expect(resizeCursors.ne).toBe(canvasCursors.neswResize)
    expect(resizeCursors.sw).toBe(canvasCursors.neswResize)
  })
})

describe('selection creation cursor', () => {
  it('uses the native crosshair both before and during selection creation', () => {
    expect(selectionCreationCursor(false, true, false, true)).toBe('crosshair')
    expect(selectionCreationCursor(true, true, true, true)).toBe('crosshair')
    expect(selectionCreationCursor(false, true, true, true)).toBe('none')
    expect(selectionCreationCursor(true, false, true, true)).toBe(canvasCursors.unavailable)
  })

  it('stays visible while a selection is being created', () => {
    expect(selectionCreationCursor(false, true, true)).toBe('none')
    expect(selectionCreationCursor(true, true, true)).toBe(canvasCursors.crosshair)
  })

  it('still follows the crosshair preference while idle', () => {
    expect(selectionCreationCursor(false, true)).toBe('none')
  })

  it('uses two-pixel corner marks', () => {
    const marks = selectionCursorCornerRects({ x: 10, y: 20, width: 24, height: 24 })
    expect(marks[0].width).toBe(6)
    expect(marks[1].height).toBe(6)
    expect(marks[0].height).toBe(2)
    expect(marks[1].width).toBe(2)
    expect(marks[0].x).toBe(4)
    expect(marks[0].y).toBe(18)
    expect(marks[0].x + marks[0].width).toBe(10)
    expect(marks[1].y).toBe(14)
    expect(marks[1].y + marks[1].height).toBe(20)
    expect(marks[7]).toEqual({ x: 34, y: 44, width: 2, height: 6 })
  })

  it('keeps a detached cursor around a one-cell preview', () => {
    const marks = selectionCursorCornerRects({ x: 100, y: 80, width: 1, height: 1 })
    expect(marks[0]).toEqual({ x: 98, y: 78, width: 2, height: 2 })
    expect(marks[1]).toEqual({ x: 98, y: 78, width: 2, height: 2 })
  })
})
