import { fireEvent } from '@testing-library/react'
import { ShortcutDialog } from './ShortcutDialog'
import { DEFAULT_SHORTCUT_BINDINGS } from '@/core/shortcuts'
import { shortcutGroupLabels } from '@/locales/shortcut-labels'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import { PREFERENCE_SEARCH_KEYS } from './PreferencesDialog'
import { PreferenceSearchContext, searchText } from '../PreferenceSearchContext'
import { FormField } from '../FormField'
import { PreferenceToggle } from '../PreferenceToggle'

afterEach(cleanup)

it('indexes every directly translated preference in its owning navigation section', () => {
  const source = readFileSync('src/renderer/src/components/dialogs/PreferencesDialog.tsx', 'utf8')
  const sections = [...source.matchAll(/\{section === '([^']+)' &&/g)]
  for (const [index, section] of sections.entries()) {
    const end = sections[index + 1]?.index ?? source.indexOf('</main>', section.index)
    const body = source.slice(section.index, end)
    const keys = [...body.matchAll(/\bt\('((?:preferences|canvas|app\.menu\.file)\.[^']+)'/g)].map(match => match[1])
    const indexed = PREFERENCE_SEARCH_KEYS[section[1] as keyof typeof PREFERENCE_SEARCH_KEYS]
    for (const key of keys) {
      if (['preferences.apply', 'preferences.cancel', 'preferences.confirm'].includes(key)) continue
      expect(indexed, `${section[1]} is missing ${key}`).toContain(key)
    }
  }
})

it('keeps fields and toggles bright when their option or explanatory text matches', () => {
  const Options = (_props: { groups: Array<{ label: string; options: Array<{ label: string }> }> }) => null
  const options = <Options groups={[{ label: '缩放方式', options: [{ label: '硬边缘' }] }]} />
  const view = render(<PreferenceSearchContext.Provider value={{ query: '硬边缘', matches: value => searchText(value).includes('硬边缘') }}>
    <FormField label="参考图">{options}</FormField>
    <PreferenceToggle label="测试" tooltip="使用硬边缘" checked onChange={() => {}} />
  </PreferenceSearchContext.Provider>)
  expect(view.container.querySelectorAll('.search-unmatched')).toHaveLength(0)
})

it('matches shortcut groups and rows using the same group name and raw binding text', () => {
  const view = render(<ShortcutDialog shortcuts={DEFAULT_SHORTCUT_BINDINGS} onSave={() => {}} onClose={() => {}} />)
  const input = view.container.querySelector('.shortcut-search')!
  fireEvent.change(input, { target: { value: shortcutGroupLabels('zh-CN').tools } })
  expect(view.container.querySelector('.settings-navigation .selected')).not.toHaveClass('muted')
  expect(view.container.querySelectorAll('.shortcut-command-row.search-unmatched')).toHaveLength(0)
  fireEvent.change(input, { target: { value: 'Ctrl+V' } })
  expect(view.container.querySelectorAll('.settings-navigation button:not(.muted)').length).toBeGreaterThan(0)
})
