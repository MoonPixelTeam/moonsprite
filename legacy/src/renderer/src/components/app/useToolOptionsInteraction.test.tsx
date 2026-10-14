import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useToolOptionsInteraction } from './useToolOptionsInteraction'

afterEach(cleanup)
function Bar({ tool, context = 'document' }: { tool: string; context?: string }) {
  const interaction = useToolOptionsInteraction(tool, tool === 'move', context)
  return <div data-testid="bar" {...interaction.handlers}><output>{interaction.value}</output><input aria-label="value" /><button>change</button></div>
}

it('keeps the modifier tool after key release and pointer release until the pointer leaves', () => {
  const view = render(<Bar tool="move" />)
  const bar = view.getByTestId('bar')
  fireEvent.pointerEnter(bar)
  fireEvent.pointerDown(view.getByText('change'), { pointerId: 1 })
  view.rerender(<Bar tool="pencil" />)
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(view.getByText('move')).toBeTruthy()
  fireEvent.pointerLeave(bar)
  expect(view.getByText('pencil')).toBeTruthy()
})

it('waits for an outside drag to finish and for text editing to commit', () => {
  const view = render(<Bar tool="move" />)
  const bar = view.getByTestId('bar')
  fireEvent.pointerEnter(bar)
  fireEvent.pointerDown(view.getByText('change'), { pointerId: 1 })
  view.rerender(<Bar tool="pencil" />)
  fireEvent.pointerLeave(bar)
  expect(view.getByText('move')).toBeTruthy()
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(view.getByText('pencil')).toBeTruthy()
  view.rerender(<Bar tool="move" />)
  fireEvent.pointerEnter(bar)
  fireEvent.focus(view.getByLabelText('value'))
  view.rerender(<Bar tool="pencil" />)
  fireEvent.pointerLeave(bar)
  expect(view.getByText('move')).toBeTruthy()
  fireEvent.blur(view.getByLabelText('value'))
  expect(view.getByText('pencil')).toBeTruthy()
})

it('clears ownership on window blur or document change', () => {
  const view = render(<Bar tool="move" />)
  fireEvent.pointerEnter(view.getByTestId('bar'))
  view.rerender(<Bar tool="pencil" />)
  fireEvent.blur(window)
  expect(view.getByText('pencil')).toBeTruthy()
  view.rerender(<Bar tool="move" />)
  fireEvent.pointerEnter(view.getByTestId('bar'))
  view.rerender(<Bar tool="pencil" context="other" />)
  expect(view.getByText('pencil')).toBeTruthy()
})
