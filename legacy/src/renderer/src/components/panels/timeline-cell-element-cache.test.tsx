import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { timelineCellElement, type TimelineCellElementCache } from './timeline-cell-element-cache'

afterEach(cleanup)

it('preserves unchanged elements, updates changed cells and removes dropped cells', () => {
  let previous: TimelineCellElementCache = new Map()
  const draw = (value: number, includeLast = true) => {
    const next: TimelineCellElementCache = new Map()
    const elements = (includeLast ? ['a', 'b', 'mask'] : ['a', 'b']).map(key =>
      timelineCellElement(previous, next, key, key === 'mask' ? null : [key === 'a' ? 0 : value],
        () => <button key={key} data-testid={key}>{key === 'a' ? 'stable' : value}</button>))
    previous = next
    return elements
  }
  const first = draw(1)
  const view = render(<>{first}</>)
  const second = draw(2)
  expect(second[0]).toBe(first[0])
  expect(second[1]).not.toBe(first[1])
  expect(second[2]).not.toBe(first[2])
  view.rerender(<>{second}</>)
  expect(view.getByTestId('b')).toHaveTextContent('2')
  view.rerender(<>{draw(3, false)}</>)
  expect(view.queryByTestId('mask')).toBeNull()
  expect(previous.size).toBe(2)
})

it('limits JSX allocation to changed columns during 20 rapid range updates on 2880 cells', () => {
  let previous: TimelineCellElementCache = new Map(), created = 0
  const draw = (end: number) => {
    const next: TimelineCellElementCache = new Map()
    for (let row = 0; row < 24; row++) for (let column = 0; column < 120; column++) {
      const key = `${row}:${column}`, selected = column <= end, active = column === end
      timelineCellElement(previous, next, key, [selected, active], () => {
        created++
        return createElement('button', {key, className: `${selected ? 'selected' : ''} ${active ? 'active' : ''}`})
      })
    }
    previous = next
  }
  draw(9)
  created = 0
  for (let end = 10; end < 30; end++) draw(end)
  expect(created).toBe(24 * 2 * 20)
  expect(previous.size).toBe(2880)
  process.stdout.write(`Timeline JSX allocations / 20 range updates: ${2880 * 20} -> ${created}\n`)
})
