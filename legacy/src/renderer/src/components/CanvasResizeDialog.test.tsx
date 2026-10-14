import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CanvasResizeDialog } from './CanvasResizeDialog'
import { useWorkspace } from '@/store/workspace'
import { decodeDocumentFile } from '@/core/document-files'
import { encodePng } from '@/core/png-encode'

afterEach(cleanup)
it('submits imported image dimensions from the dialog', async () => {
  Object.defineProperty(window, 'moonSprite', { configurable: true, value: { getResourceInfo: vi.fn(async () => ({ totalBytes: 8e9, freeBytes: 4e9 })) } })
  const doc = decodeDocumentFile(encodePng(new Uint8ClampedArray(16), 2, 2, true).bytes, 'image.png')
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
  useWorkspace.getState().addSession(doc)
  const close = vi.fn()
  function Harness() {
    const sessions = useWorkspace(state => state.sessions)
    const session = sessions[0]
    return <CanvasResizeDialog open documentId={doc.id} currentWidth={doc.width} currentHeight={doc.height} onClose={close}
      onResize={useWorkspace.getState().resizeActiveCanvas} onPreview={useWorkspace.getState().setCanvasResizePreview} preview={session.canvasResizePreview} />
  }
  const view = render(<Harness />)
  const width = view.getAllByRole('spinbutton')[0]
  fireEvent.change(width, { target: { value: '4' } })
  fireEvent.blur(width)
  await act(async () => { fireEvent.click(view.container.querySelector('button[type="submit"]')!) })
  expect(close).toHaveBeenCalled()
  expect(doc.width).toBe(4)
  expect(doc.height).toBe(4)
})
