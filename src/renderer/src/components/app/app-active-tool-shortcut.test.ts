import { describe, expect, it } from 'vitest'
import { shouldExitPatternBrushOnEscape } from './app-active-tool-shortcut'

const session = (overrides: Partial<Parameters<typeof shouldExitPatternBrushOnEscape>[0]> = {}) => ({
  temporaryBrushCapture: undefined,
  brushImage: null,
  tool: 'pencil' as const,
  fillKind: 'bucket' as const,
  ...overrides
})

describe('pattern brush escape handling', () => {
  it('exits a regular pencil pattern brush', () => {
    expect(shouldExitPatternBrushOnEscape(session({ brushImage: {} as never }))).toBe(true)
  })

  it('exits a pattern brush selected for bucket fill', () => {
    expect(shouldExitPatternBrushOnEscape(session({ tool: 'fill', fillKind: 'bucket', brushImage: {} as never }))).toBe(true)
  })

  it('does not exit a pattern brush for gradient fill', () => {
    expect(shouldExitPatternBrushOnEscape(session({ tool: 'fill', fillKind: 'gradient', brushImage: {} as never }))).toBe(false)
  })

  it('does not exit bucket fill without a pattern brush', () => {
    expect(shouldExitPatternBrushOnEscape(session({ tool: 'fill', fillKind: 'bucket' }))).toBe(false)
  })

  it('exits while a temporary pattern capture is active', () => {
    expect(shouldExitPatternBrushOnEscape(session({ temporaryBrushCapture: { selectionKind: 'rectangle', selectionMode: 'replace', selectionRounded: false, selectionAspectRatio: null } }))).toBe(true)
  })
})
