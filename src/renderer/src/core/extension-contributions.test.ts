import { describe, expect, it } from 'vitest'
import { listExtensionToolContributions } from './extension-contributions'
import type { StoredExtension } from '@shared/types-extensions'

const extension = (enabled: boolean): StoredExtension => ({
  id: 'com.example.ai',
  name: 'AI',
  version: '1.0.0',
  description: '',
  author: '',
  commands: [],
  panels: [],
  menuItems: [],
  topMenus: [],
  tools: [{ id: 'remote', name: 'Remote', description: 'desc', kind: 'remote-pixel-brush', placement: 'pencil', icon: 'tool-smooth', modes: [{ id: 'default', name: 'Default', description: '' }], defaultMode: 'default', previewColor: '#2979ff66' }],
  filePath: 'extensions/com.example.ai',
  enabled
})

describe('extension tool contributions', () => {
  it('exposes tools only for enabled extensions', () => {
    expect(listExtensionToolContributions([extension(true)])).toHaveLength(1)
    expect(listExtensionToolContributions([extension(false)])).toHaveLength(0)
  })
})
