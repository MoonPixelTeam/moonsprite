import { useRef } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useFloatingWindowStack } from './floating-panel'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Window({ name }: { name: string }) {
  const ref = useRef<HTMLElement>(null)
  const stack = useFloatingWindowStack(ref)
  return <div className="modal-backdrop"><section ref={ref} style={{ zIndex: stack.zIndex }}>
    <button onClick={stack.bringToFront}>{name}</button>
  </section></div>
}

it('does not rewrite layer styles when the front window is activated repeatedly', () => {
  const view = render(<><Window name="first" /><Window name="second" /></>)
  const mutations = new MutationObserver(() => {})
  mutations.observe(view.container, { attributes: true, subtree: true, attributeFilter: ['style'] })
  fireEvent.click(view.getByText('second'))
  fireEvent.click(view.getByText('second'))
  expect(mutations.takeRecords()).toHaveLength(0)
  fireEvent.click(view.getByText('first'))
  expect(Number(view.getByText('first').parentElement!.style.zIndex)).toBeGreaterThan(Number(view.getByText('second').parentElement!.style.zIndex))
  expect(mutations.takeRecords().length).toBeGreaterThan(0)
  fireEvent.click(view.getByText('first'))
  expect(mutations.takeRecords()).toHaveLength(0)
  mutations.disconnect()
})
