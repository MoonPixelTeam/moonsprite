import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RangeField } from './RangeField'

afterEach(cleanup)

it('previews pointer changes inside one interaction and commits once on release outside', () => {
  const calls: string[] = []
  const view = render(<RangeField min={0} max={100} value={100} interaction={{ begin: () => calls.push('begin'), commit: () => calls.push('commit') }} onChange={(value) => calls.push(String(value))} />)
  const slider = view.getByRole('slider')
  fireEvent.pointerDown(slider, { button: 0, pointerId: 7 })
  fireEvent.change(slider, { target: { value: '80' } })
  fireEvent.change(slider, { target: { value: '60' } })
  expect(calls).toEqual(['begin', '80', '60'])
  fireEvent.pointerUp(window, { pointerId: 8 })
  expect(calls).toHaveLength(3)
  fireEvent.pointerUp(window, { pointerId: 7 })
  fireEvent.blur(slider)
  view.unmount()
  expect(calls).toEqual(['begin', '80', '60', 'commit'])
})

it('groups repeated keyboard changes until key release', () => {
  const begin = vi.fn(), commit = vi.fn()
  const view = render(<RangeField min={0} max={100} value={50} onChange={() => undefined} interaction={{ begin, commit }} />)
  const slider = view.getByRole('slider')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  fireEvent.change(slider, { target: { value: '51' } })
  fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true })
  fireEvent.change(slider, { target: { value: '52' } })
  expect(begin).toHaveBeenCalledTimes(1)
  expect(commit).not.toHaveBeenCalled()
  fireEvent.keyUp(slider, { key: 'ArrowRight' })
  expect(commit).toHaveBeenCalledTimes(1)
})

it.each(['cancel', 'blur', 'unmount', 'disable'])('finishes an interrupted interaction on %s', (reason) => {
  const commit = vi.fn()
  const props = { min: 0, max: 100, value: 50, onChange: vi.fn(), interaction: { begin: vi.fn(), commit } }
  const view = render(<RangeField {...props} />)
  fireEvent.pointerDown(view.getByRole('slider'), { button: 0, pointerId: 1 })
  if (reason === 'cancel') fireEvent.pointerCancel(window, { pointerId: 1 })
  if (reason === 'blur') fireEvent.blur(window)
  if (reason === 'unmount') view.unmount()
  if (reason === 'disable') view.rerender(<RangeField {...props} disabled />)
  expect(commit).toHaveBeenCalledTimes(1)
})
