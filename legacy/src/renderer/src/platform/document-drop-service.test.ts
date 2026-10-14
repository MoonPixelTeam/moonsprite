import { fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Event } from '@tauri-apps/api/event'
import type { DragDropEvent } from '@tauri-apps/api/window'
import { startDocumentDropService } from './document-drop-service'

const dropEvent = (paths: string[]): Event<DragDropEvent> => ({
  event: 'tauri://drag-drop',
  id: 1,
  payload: { type: 'drop', paths, position: { x: 0, y: 0 } } as DragDropEvent
})

afterEach(() => vi.restoreAllMocks())

describe('document drop service', () => {
  it('deduplicates the same file reported by native and Rust channels', async () => {
    let nativeHandler!: (event: Event<DragDropEvent>) => void
    let rustHandler!: (paths: string[]) => void
    const nativeCleanup = vi.fn()
    const rustCleanup = vi.fn()
    const openPath = vi.fn(async () => true)
    const onOpened = vi.fn()
    const stop = startDocumentDropService({
      openPath,
      onOpened,
      pathForFile: () => '',
      desktop: true,
      nativeSources: [{ onDragDropEvent: vi.fn(async (handler) => { nativeHandler = handler; return nativeCleanup }) }],
      rustSubscriber: vi.fn(async (handler) => { rustHandler = handler; return rustCleanup }),
      warn: vi.fn()
    })

    await waitFor(() => expect(nativeHandler).toBeTypeOf('function'))
    nativeHandler(dropEvent(['D:\\Art\\sprite.moonsprite']))
    rustHandler(['d:\\art\\SPRITE.MOONSPRITE'])

    await waitFor(() => expect(openPath).toHaveBeenCalledOnce())
    expect(openPath).toHaveBeenCalledWith('D:\\Art\\sprite.moonsprite')
    expect(onOpened).toHaveBeenCalledOnce()
    stop()
    expect(nativeCleanup).toHaveBeenCalledOnce()
    expect(rustCleanup).toHaveBeenCalledOnce()
  })

  it('keeps working when one native source fails and retries failed channels on focus', async () => {
    let recoveredHandler!: (event: Event<DragDropEvent>) => void
    const recoveredCleanup = vi.fn()
    const source = {
      onDragDropEvent: vi.fn(async (handler: (event: Event<DragDropEvent>) => void) => {
        if (source.onDragDropEvent.mock.calls.length === 1) throw new Error('temporary failure')
        recoveredHandler = handler
        return recoveredCleanup
      })
    }
    const openPath = vi.fn(async () => true)
    const stop = startDocumentDropService({
      openPath,
      pathForFile: () => '',
      desktop: true,
      nativeSources: [source],
      rustSubscriber: async () => { throw new Error('rust unavailable') },
      warn: vi.fn()
    })

    await waitFor(() => expect(source.onDragDropEvent).toHaveBeenCalledOnce())
    fireEvent.focus(window)
    await waitFor(() => expect(source.onDragDropEvent).toHaveBeenCalledTimes(2))
    recoveredHandler(dropEvent(['D:\\Art\\sprite.aseprite']))
    await waitFor(() => expect(openPath).toHaveBeenCalledWith('D:\\Art\\sprite.aseprite'))

    stop()
    expect(recoveredCleanup).toHaveBeenCalledOnce()
  })



  it('lets a positioned drop target claim files before document opening', async () => {
    let nativeHandler!: (event: Event<DragDropEvent>) => void
    const openPath = vi.fn(async () => true)
    const claimPaths = vi.fn(() => true)
    const stop = startDocumentDropService({
      openPath,
      claimPaths,
      pathForFile: () => '',
      desktop: true,
      devicePixelRatio: 2,
      nativeSources: [{ onDragDropEvent: vi.fn(async (handler) => { nativeHandler = handler; return vi.fn() }) }],
      rustSubscriber: async () => () => undefined,
      warn: vi.fn()
    })

    await waitFor(() => expect(nativeHandler).toBeTypeOf('function'))
    nativeHandler({ ...dropEvent(['D:\\Art\\brush.png']), payload: { type: 'drop', paths: ['D:\\Art\\brush.png'], position: { x: 80, y: 40 } } as DragDropEvent })

    await waitFor(() => expect(claimPaths).toHaveBeenCalledWith(['D:\\Art\\brush.png'], { x: 40, y: 20 }))
    expect(openPath).not.toHaveBeenCalled()
    stop()
  })
})
