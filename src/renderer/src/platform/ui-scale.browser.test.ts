import { afterEach, expect, it, vi } from 'vitest'
import { applyUiScale, applyBodyFontScale, applyToolIconScale } from './ui-scale'

afterEach(() => { vi.unstubAllEnvs(); document.documentElement.removeAttribute('style'); delete document.documentElement.dataset.uiScale })

it('applies and resets browser interface scale without transforming canvas coordinates', async () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'web-trial')
  const resized = vi.fn()
  window.addEventListener('resize', resized)
  try {
    await applyUiScale(1.25)
    applyBodyFontScale(1)
    applyToolIconScale(1)
    expect(document.documentElement.style.getPropertyValue('--browser-ui-scale')).toBe('1.25')
    expect(document.documentElement.style.getPropertyValue('--ui-body-font-scale')).toBe('1')
    expect(document.documentElement.style.getPropertyValue('--tool-rail-icon-size')).toContain('--browser-ui-scale')
    expect(document.documentElement.style.zoom).toBe('')
    expect(document.documentElement.style.transform).toBe('')
    await applyUiScale(1)
    expect(document.documentElement.style.getPropertyValue('--browser-ui-scale')).toBe('1')
    expect(resized).toHaveBeenCalledTimes(2)
  } finally { window.removeEventListener('resize', resized) }
})

it('does not apply browser scaling to a desktop preview target', async () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'windows-full')
  await applyUiScale(1.25)
  expect(document.documentElement.style.getPropertyValue('--browser-ui-scale')).toBe('')
})
