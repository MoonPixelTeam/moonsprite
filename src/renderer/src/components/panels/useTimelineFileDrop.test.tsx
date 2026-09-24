import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { addBlankAnimationFrame } from '@/core/animation'
import { createDocument } from '@/core/document'
import { decodeDocumentFileAsync } from '@/core/document-files'
import { useWorkspace } from '@/store/workspace'
import { useTimelineFileDrop } from './useTimelineFileDrop'

vi.mock('@/core/document-files', () => ({ decodeDocumentFileAsync: vi.fn() }))
const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren()
  if (originalElementFromPoint) Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint)
  else Reflect.deleteProperty(document, 'elementFromPoint')
})

it.each([['cell', 0], ['blank', 0], ['leading', 0], ['trailing', 3]] as const)(
  'uses the same insertion index for the preview and actual %s drop', async (kind, expected) => {
    const project = createDocument('target', 2, 2, 'rgba')
    addBlankAnimationFrame(project)
    addBlankAnimationFrame(project)
    useWorkspace.setState({ sessions: [], activeId: null })
    useWorkspace.getState().addSession(project)
    const session = useWorkspace.getState().sessions[0]
    const source = createDocument('GIF', 1, 1, 'rgba')
    vi.mocked(decodeDocumentFileAsync).mockResolvedValue(source)
    vi.stubGlobal('moonSprite', { readBinary: vi.fn().mockResolvedValue(new Uint8Array()) })
    const importGif = vi.spyOn(useWorkspace.getState(), 'importGifAnimationLayer').mockReturnValue(true)
    const grid = document.createElement('div')
    grid.className = 'layer-animation-grid'
    const cell = document.createElement('div')
    cell.dataset.frameIndex = '0'
    grid.append(cell)
    document.body.append(grid)
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 60 } as DOMRect)
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 20 } as DOMRect)
    const target = kind === 'cell' ? cell : grid
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn().mockReturnValue(target) })
    const x = kind === 'leading' ? 100 : kind === 'trailing' ? 180 : 110
    const { result, unmount } = renderHook(() => useTimelineFileDrop({ session, timeline: project.animation! }))
    act(() => window.dispatchEvent(new CustomEvent('moonsprite:document-drag-over', {
      detail: { documentId: project.id, paths: ['walk.gif'], x, y: 10 }
    })))
    expect(result.current.gifDropTargetIndex).toBe(expected)
    act(() => window.dispatchEvent(new CustomEvent('moonsprite:animation-gif-drop', {
      detail: { documentId: project.id, path: 'walk.gif', x, y: 10 }
    })))
    await waitFor(() => expect(importGif).toHaveBeenCalledWith(source, expected))
    unmount()
  }
)
