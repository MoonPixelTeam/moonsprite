import { describe, expect, it } from 'vitest'
import { normalizeDroppedDocumentPaths } from './document-drop'

describe('document drop paths', () => {
  it('accepts MoonSprite backups but rejects unrelated bak files', () => {
    expect(normalizeDroppedDocumentPaths([
      'D:/gallery/sprite.moonsprite.bak',
      'D:/gallery/notes.bak',
      'D:/gallery/SNAPSHOT.MOONSPRITE.BAK'
    ])).toEqual([
      'D:/gallery/sprite.moonsprite.bak',
      'D:/gallery/SNAPSHOT.MOONSPRITE.BAK'
    ])
  })
})
