import { describe, expect, it } from 'vitest'
import { normalizeDroppedDocumentPaths } from './document-drop'

describe('document drop paths', () => {
  it('accepts PSD files from native drag and drop', () => {
    expect(normalizeDroppedDocumentPaths([
      'D:/art/layers.psd',
      'D:/art/LAYERS.PSD',
      'D:/art/notes.txt'
    ])).toEqual([
      'D:/art/layers.psd'
    ])
  })

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
