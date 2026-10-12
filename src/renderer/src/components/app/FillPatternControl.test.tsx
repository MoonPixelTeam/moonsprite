import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_FILL_PATTERN_SETTINGS } from '@/core/pattern-fill-settings'
import { translate } from '@/core/localization'
import type { FillPatternSettings } from '@shared/types-brush'
import { FillPatternDialog } from './FillPatternControl'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
const t = (key: Parameters<typeof translate>[1]) => translate('en-US', key)
function open(mode: 'random' | 'regular', patch: Partial<FillPatternSettings> = {}) {
  const onChange = vi.fn(), onClose = vi.fn()
  render(<FillPatternDialog mode={mode} settings={{ ...DEFAULT_FILL_PATTERN_SETTINGS, ...patch }} t={t} onChange={onChange} onClose={onClose} />)
  return { onChange, onClose }
}
function enter(label: string, value: string) {
  const input = screen.getByRole('spinbutton', { name: label })
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}
function apply() { fireEvent.submit(screen.getByRole('dialog')) }

it('opens one slider on focus or click, synchronizes values, and dismisses on outside click or Escape', () => {
  const { onClose } = open('regular')
  expect(screen.queryByRole('slider')).toBeNull()
  const scale = screen.getByRole('spinbutton', { name: 'Horizontal gap' })
  fireEvent.focus(scale)
  fireEvent.change(screen.getByRole('slider', { name: 'Horizontal gap' }), { target: { value: '125' } })
  expect((scale as HTMLInputElement).value).toBe('125')
  const angle = screen.getByRole('spinbutton', { name: 'Vertical gap' })
  fireEvent.pointerDown(angle)
  expect(screen.getAllByRole('slider')).toHaveLength(1)
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Escape' })
  expect(screen.queryByRole('slider')).toBeNull()
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.pointerDown(angle)
  fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Limit pattern count' }))
  expect(screen.queryByRole('slider')).toBeNull()
})

function choosePreset(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Fill presets' }))
  fireEvent.click(screen.getByRole('option', { name }))
}
it('loads built-ins, saves and reopens user presets, updates them, and confirms deletion', () => {
  open('regular')
  choosePreset('Wide spaced grid')
  expect(screen.getByRole('spinbutton', { name: 'Horizontal gap' }).getAttribute('aria-valuenow')).toBe('8')
  enter('Horizontal gap', '7')
  fireEvent.change(screen.getByRole('textbox', { name: 'Preset name' }), { target: { value: 'My bricks' } })
  fireEvent.click(screen.getByRole('button', { name: t('app.export.savePreset') }))
  cleanup()
  open('regular')
  choosePreset('My bricks')
  expect(screen.getByRole('spinbutton', { name: 'Horizontal gap' }).getAttribute('aria-valuenow')).toBe('7')
  enter('Horizontal gap', '9')
  fireEvent.click(screen.getByRole('button', { name: t('app.export.savePreset') }))
  cleanup()
  open('regular')
  choosePreset('My bricks')
  expect(screen.getByRole('spinbutton', { name: 'Horizontal gap' }).getAttribute('aria-valuenow')).toBe('9')
  fireEvent.click(screen.getByRole('button', { name: 'Delete this preset' }))
  expect(screen.getByRole('button', { name: 'Confirm deletion' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }))
  fireEvent.click(screen.getByRole('button', { name: 'Fill presets' }))
  expect(screen.queryByRole('option', { name: 'My bricks' })).toBeNull()
})

it('shows a failed preset save without claiming success', () => {
  open('random')
  fireEvent.change(screen.getByRole('textbox', { name: 'Preset name' }), { target: { value: 'Scatter' } })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  fireEvent.click(screen.getByRole('button', { name: t('app.export.savePreset') }))
  expect(screen.getByRole('alert').textContent).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Delete this preset' }) as HTMLButtonElement).disabled).toBe(true)
})

it('switches explicitly between density and target count and preserves the entered count', () => {
  const { onChange } = open('random', { randomCount: 17 })
  expect(screen.queryByRole('spinbutton', { name: 'Density' })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Set target count' }))
  expect(screen.getByRole('spinbutton', { name: 'Density' })).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Set target count' }))
  expect(screen.getByRole('spinbutton', { name: 'Target pattern count' }).getAttribute('aria-valuenow')).toBe('17')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Set target count' }))
  apply()
  expect(onChange.mock.calls[0][0].randomCount).toBe(0)
})

it('resolves legacy random overlap conflicts and saves overlap with zero gap', () => {
  const { onChange } = open('random', { randomOverlap: true, randomSpacing: 12 })
  expect((screen.getByRole('checkbox', { name: 'Allow overlap' }) as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Allow overlap' }))
  expect(screen.queryByRole('spinbutton', { name: 'Minimum edge gap' })).toBeNull()
  apply()
  expect(onChange.mock.calls[0][0]).toMatchObject({ randomOverlap: true, randomSpacing: 0 })
})

it('applies only the supported random fill settings', () => {
  const { onChange } = open('random')
  enter('Density', '37')
  apply()
  expect(onChange.mock.calls[0][0]).toEqual({ randomDensity: 37, randomCount: 0, randomSpacing: 0, randomOverlap: true })
})

it('clears negative regular gaps when overlap is turned off', () => {
  const { onChange } = open('regular', { regularOverlap: true, regularSpacingX: -8, regularSpacingY: -3 })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Allow overlap (negative gap)' }))
  apply()
  expect(onChange.mock.calls[0][0]).toMatchObject({ regularOverlap: false, regularSpacingX: 0, regularSpacingY: 0 })
})

it('resets only the current mode and restores automatic count', () => {
  const { onChange } = open('regular', { regularCount: 8, randomDensity: 37 })
  fireEvent.click(screen.getByRole('button', { name: 'Reset parameters' }))
  apply()
  expect(onChange.mock.calls[0][0]).toMatchObject({ regularCount: 0 })
  expect(onChange.mock.calls[0][0]).not.toHaveProperty('randomDensity')
})

it('discards edits on cancel', () => {
  const { onChange, onClose } = open('random')
  enter('Density', '37')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onChange).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledOnce()
})
