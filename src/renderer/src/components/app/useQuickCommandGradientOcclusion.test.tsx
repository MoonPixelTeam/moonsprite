import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { pendingGradientFor, setPendingGradient, type PendingGradient } from '@/core/canvas-gradient-confirmation'
import { CANVAS_VIEWPORT_EVENT } from '../canvas-viewport-events'
import { GradientConfirmationBar } from '../GradientConfirmationBar'
import { useQuickCommandGradientOcclusion } from './useQuickCommandGradientOcclusion'

function Bar({ id, documentId }: { id: string; documentId: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useQuickCommandGradientOcclusion(ref, documentId)
  return <div ref={ref} data-testid={id} className="quick-command-bar expanded" style={{ '--quick-command-position': '50%' } as React.CSSProperties} />
}
function Pane({ documentId }: { documentId: string }) {
  return <div className="document-tab-stage"><Bar id={`${documentId}-top`} documentId={documentId} /><Bar id={`${documentId}-bottom`} documentId={documentId} /><Bar id={`${documentId}-side`} documentId={documentId} /><GradientConfirmationBar documentId={documentId} /></div>
}
afterEach(() => { cleanup(); setPendingGradient('a', null); setPendingGradient('b', null); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it.each(['apply', 'cancel'] as const)('hides only intersecting bars in the same pane, restoring them after %s', action => {
  let noticeHeight = 40
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this.classList.contains('gradient-confirm-bar')) return new DOMRect(8, 8, 280, noticeHeight)
    if (this.dataset.testid?.endsWith('top')) return new DOMRect(30, 10, 140, 28)
    if (this.dataset.testid?.endsWith('side')) return new DOMRect(8, 100, 28, 130)
    return new DOMRect(30, 250, 140, 28)
  })
  const view = render(<><Pane documentId="a" /><Pane documentId="b" /></>)
  act(() => setPendingGradient('a', { drag: {}, targetLayer: {}, apply: () => setPendingGradient('a', null), cancel: () => setPendingGradient('a', null) } as unknown as PendingGradient))
  expect(view.getByTestId('a-top')).toHaveAttribute('data-gradient-occluded')
  for (const id of ['a-bottom', 'a-side', 'b-top', 'b-bottom', 'b-side']) expect(view.getByTestId(id)).not.toHaveAttribute('data-gradient-occluded')
  noticeHeight = 150
  act(() => window.dispatchEvent(new Event(CANVAS_VIEWPORT_EVENT)))
  expect(view.getByTestId('a-side')).toHaveAttribute('data-gradient-occluded')
  noticeHeight = 40
  act(() => window.dispatchEvent(new Event(CANVAS_VIEWPORT_EVENT)))
  expect(view.getByTestId('a-side')).not.toHaveAttribute('data-gradient-occluded')
  act(() => { pendingGradientFor('a')![action]() })
  expect(view.getByTestId('a-top')).not.toHaveAttribute('data-gradient-occluded')
  expect(view.getByTestId('a-top')).toHaveClass('expanded')
  expect(view.getByTestId('a-top').style.getPropertyValue('--quick-command-position')).toBe('50%')
})
