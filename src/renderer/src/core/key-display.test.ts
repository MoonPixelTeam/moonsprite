import { describe, expect, it } from 'vitest'
import { keyDisplayLabel } from './key-display'

describe('key display labels', () => {
  it('uses compact labels for common modifier and navigation keys', () => {
    expect(keyDisplayLabel('Control')).toBe('Ctrl')
    expect(keyDisplayLabel('ArrowLeft')).toBe('←')
    expect(keyDisplayLabel(' ')).toBe('Space')
  })

  it('normalizes printable keys without changing longer names', () => {
    expect(keyDisplayLabel('a')).toBe('A')
    expect(keyDisplayLabel('F12')).toBe('F12')
  })
})
