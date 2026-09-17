import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExtensionWindow } from './ExtensionWindow'

const mocks = vi.hoisted(() => ({ connect: vi.fn<() => Promise<() => void>>(), receive: null as null | ((message: unknown) => void), hostGeometry: null as null | (() => void) }))
vi.mock('@/core/file-preferences', () => ({ loadEditorPreferences: () => ({theme:'dark',useLocalCursors:true,cursorScale:1}) }))
vi.mock('@/core/theme', () => ({ applyThemeToDocument: () => {} }))
vi.mock('./extension-window-theme', () => ({ extensionWindowTheme: async () => '' }))
vi.mock('@/platform/extension-window', () => ({
 listenForExtensionWindowMessage: (receive: (message: unknown) => void) => { mocks.receive = receive; return mocks.connect() },
 listenForExtensionWindowMove: async () => () => {},
 listenForExtensionWindowFocus: async () => () => {},
 listenForExtensionHostGeometry: async (receive: () => void) => { mocks.hostGeometry = receive; return () => {} },
 setExtensionWindowCursorPolicy: async () => {}
}))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('mounts the pet document only after its incoming configuration channel is ready', async () => {
 let ready!: (remove: () => void) => void
 mocks.connect.mockImplementationOnce(() => new Promise(resolve => { ready = resolve }))
 const read = vi.fn(async () => new TextEncoder().encode('<html><body>pet</body></html>'))
 window.moonSprite = {readExtensionRuntimeResource:read} as unknown as typeof window.moonSprite
 const view = render(<ExtensionWindow />)
 await waitFor(() => expect(read).toHaveBeenCalledOnce())
 expect(view.container.querySelector('iframe')).toBeNull()
 const remove=vi.fn()
 await act(async () => ready(remove))
 await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
 const post = vi.spyOn(view.container.querySelector('iframe')!.contentWindow!, 'postMessage')
 mocks.receive?.({type:'configure',preferences:{scale:3}})
 expect(post).toHaveBeenCalledWith({type:'moonsprite-extension-window-message',message:{type:'configure',preferences:{scale:3}}},'*')
 mocks.hostGeometry?.()
 expect(post).toHaveBeenCalledWith({type:'moonsprite-extension-window-event',event:{kind:'host-geometry'}},'*')
 view.unmount()
 expect(remove).toHaveBeenCalledOnce()
})
it('unsubscribes even when the channel connects after the window is gone', async () => {
 let ready!: (remove: () => void) => void
 mocks.connect.mockImplementationOnce(() => new Promise(resolve => { ready=resolve }))
 window.moonSprite = {readExtensionRuntimeResource:async()=>new TextEncoder().encode('<html></html>')} as unknown as typeof window.moonSprite
 const view = render(<ExtensionWindow />)
 view.unmount()
 const remove=vi.fn()
 await act(async () => ready(remove))
 expect(remove).toHaveBeenCalledOnce()
})
