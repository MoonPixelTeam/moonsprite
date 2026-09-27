import { afterEach, expect, it } from 'vitest'
import { clearStoredValuesExcept } from './storage'

afterEach(() => localStorage.clear())
it('resets editor settings without deleting extension-owned pet data', () => {
  localStorage.setItem('moonsprite.extension-runtime.v1.pet-companion.preferences', '{"scale":3}')
  localStorage.setItem('moonsprite.extension-runtime.v1.pet-companion.pets', '["custom-pet"]')
  localStorage.setItem('editor-settings', 'custom')
  localStorage.setItem('recent', 'project')
  expect(clearStoredValuesExcept(['recent'], localStorage, ['moonsprite.extension-runtime.v1.'])).toBe(true)
  expect(localStorage.getItem('moonsprite.extension-runtime.v1.pet-companion.pets')).toBe('["custom-pet"]')
  expect(localStorage.getItem('moonsprite.extension-runtime.v1.pet-companion.preferences')).toBe('{"scale":3}')
  expect(localStorage.getItem('editor-settings')).toBeNull()
  expect(localStorage.getItem('recent')).toBe('project')
})
