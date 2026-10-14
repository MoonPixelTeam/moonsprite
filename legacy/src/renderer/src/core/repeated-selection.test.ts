import { describe, expect, it } from 'vitest'
import { createDocument } from './document'
import { repeatedLassoSelection } from './repeated-selection'
import { selectionContains } from './selection'
import { collectSmoothBrushArea } from './smooth-brush'

describe('selection gestures in repeated document space', () => {
  it.each(['x', 'y', 'both'] as const)('keeps a lasso identical in distant %s copies', mode => {
    const document = createDocument('repeat', 16, 16, 'rgba')
    const path = [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }]
    const translated = path.map(p => ({ x: p.x + (mode !== 'y' ? 48 : 0), y: p.y - (mode !== 'x' ? 32 : 0) }))
    expect(repeatedLassoSelection(document, translated, mode)).toEqual(repeatedLassoSelection(document, path, 'off'))
  })

  it('wraps a lasso crossing a seam without selecting the intervening canvas', () => {
    const document = createDocument('repeat', 16, 16, 'rgba')
    const selection = repeatedLassoSelection(document, [{ x: 14, y: 2 }, { x: 18, y: 2 }, { x: 18, y: 5 }, { x: 14, y: 5 }], 'x')
    expect(selectionContains(selection, 15, 3)).toBe(true)
    expect(selectionContains(selection, 0, 3)).toBe(true)
    expect(selectionContains(selection, 8, 3)).toBe(false)
  })

  it.each(['x', 'y', 'both'] as const)('wraps selection brush strokes across %s seams', mode => {
    const document = createDocument('repeat', 16, 16, 'rgba')
    const stroke = { visited: new Set<number>() }
    const from = mode === 'y' ? { x: 3, y: 15 } : { x: 15, y: 3 }
    const to = mode === 'y' ? { x: 3, y: 17 } : { x: 17, y: 3 }
    collectSmoothBrushArea(document, stroke, from, to, 1, null, 'round', 0, true, mode)
    const expected = mode === 'y' ? [15 * 16 + 3, 3, 16 + 3] : [3 * 16 + 15, 3 * 16, 3 * 16 + 1]
    expect([...stroke.visited].sort((a,b) => a-b)).toEqual(expected.sort((a,b) => a-b))
  })

  it('wraps the whole brush stamp while clipping the nonrepeated axis', () => {
    const document = createDocument('repeat', 16, 16, 'rgba')
    const stroke = { visited: new Set<number>() }
    collectSmoothBrushArea(document, stroke, { x: 0, y: 0 }, { x: 0, y: 0 }, 3, null, 'square', 0, true, 'x')
    expect(stroke.visited.has(15)).toBe(true)
    expect(stroke.visited.has(15 * 16)).toBe(false)
    expect(stroke.visited.size).toBe(6)
  })
})
