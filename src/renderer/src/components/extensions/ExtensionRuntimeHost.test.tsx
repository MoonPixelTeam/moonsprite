import { act, fireEvent, render, waitFor, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { StoredExtension } from '@shared/types-extensions'
import { ExtensionRuntimeHost } from './ExtensionRuntimeHost'
import { isExtensionCommandVisible, extensionMenuItems } from '@/core/extension-command-state'

const mocks = vi.hoisted(() => ({ locale: 'zh-CN', listener: null as null | ((message: unknown) => void), read: vi.fn(async () => '<html></html>'), connect: vi.fn(async () => () => {}) }))
vi.mock('@/core/file-preferences', () => ({ loadEditorPreferences: () => ({ language: mocks.locale }) }))
vi.mock('./ExtensionWindow', () => ({ ExtensionWindow: () => <div data-testid="extension-dialog-content" /> }))
vi.mock('@/components/ModalShell', () => ({ ModalShell: ({ children, ...props }: any) => <section role="dialog" aria-label={props['aria-label']}>{children}</section> }))
vi.mock('@/components/DialogHeader', () => ({ DialogHeader: ({ title, onClose }: any) => <header>{title}<button onClick={onClose}>关闭</button></header> }))
vi.mock('@/store/workspace', () => ({ useWorkspace: { getState: () => ({}) } }))
vi.mock('@/platform/extension-window', () => ({ listenForExtensionRuntimeWindowMessage: async (listener: (message: unknown) => void) => { mocks.listener = listener; return mocks.connect() } }))
afterEach(() => { cleanup(); mocks.locale='zh-CN'; vi.clearAllMocks() })

const extension = { id:'test.pet', name:'Pet', enabled:true, version:'2.0.1', commands:[{id:'pet.1'},{id:'pet.2'}], runtime:{permissions:['windows','commands'],resources:[]} } as unknown as StoredExtension
const props = { extensions:[extension], session:null, homeOpen:true, onRunLuaScript:vi.fn(), onOpenSettings:vi.fn() }

it('exposes the current locale and sends initial and changed locales without restarting the runtime', async () => {
  window.moonSprite = {readExtensionRuntimeEntry:mocks.read,closeExtensionWindows:async()=>{}} as unknown as typeof window.moonSprite
  const owner={...extension,runtime:{permissions:['runtime'] as const,resources:[]}} as unknown as StoredExtension
  const view=render(<ExtensionRuntimeHost {...props} extensions={[owner]} />)
  await waitFor(()=>expect(view.container.querySelector('iframe')).not.toBeNull())
  const frame=view.container.querySelector('iframe')!
  const post=vi.spyOn(frame.contentWindow!,'postMessage')
  fireEvent.load(frame)
  expect(post).toHaveBeenCalledWith({type:'moonsprite-extension-event',event:{type:'locale-changed',locale:'zh-CN'}},'*')
  mocks.locale='ja-JP'
  fireEvent(window,new Event('moonsprite:preferences-changed'))
  expect(post).toHaveBeenCalledWith({type:'moonsprite-extension-event',event:{type:'locale-changed',locale:'ja-JP'}},'*')
  const count=post.mock.calls.length
  fireEvent(window,new Event('moonsprite:preferences-changed'))
  expect(post.mock.calls).toHaveLength(count)
  fireEvent(window,new MessageEvent('message',{source:frame.contentWindow,data:{type:'moonsprite-extension-request',requestId:'locale',method:'runtime.getLocale'}}))
  await waitFor(()=>expect(post).toHaveBeenCalledWith({type:'moonsprite-extension-response',requestId:'locale',ok:true,result:{locale:'ja-JP'}},'*'))
  expect(mocks.read).toHaveBeenCalledTimes(1)
})

it('applies visibility from a companion window to the main menu state', async () => {
  window.moonSprite = { readExtensionRuntimeEntry:mocks.read, closeExtensionWindows:async()=>{} } as unknown as typeof window.moonSprite
  render(<ExtensionRuntimeHost {...props} />)
  await waitFor(() => expect(mocks.listener).toBeTypeOf('function'))
  mocks.listener?.({extensionId:'test.pet',windowId:'companion',message:{type:'command-state',commandId:'pet.2',state:{visible:false}}})
  expect(isExtensionCommandVisible('test.pet','pet.2')).toBe(false)
  mocks.listener?.({extensionId:'other.pet',windowId:'companion',message:{type:'command-state',commandId:'pet.1',state:{visible:false}}})
  expect(isExtensionCommandVisible('test.pet','pet.1')).toBe(true)
})

it('reloads a replaced package even when its id and version are unchanged', async () => {
  window.moonSprite = { readExtensionRuntimeEntry:mocks.read, closeExtensionWindows:async()=>{} } as unknown as typeof window.moonSprite
  const view = render(<ExtensionRuntimeHost {...props} />)
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
  view.rerender(<ExtensionRuntimeHost {...props} extensions={[{...extension}]} />)
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2))
  fireEvent.load(view.container.querySelector('iframe')!)
})

it('opens a host dialog without creating a native management window', async () => {
  const nativeOpen = vi.fn()
  window.moonSprite = { readExtensionRuntimeEntry:mocks.read, closeExtensionWindows:async()=>{}, showExtensionWindow:nativeOpen } as unknown as typeof window.moonSprite
  const view = render(<ExtensionRuntimeHost {...props} extensions={[{...extension,runtime:{...extension.runtime!,resources:['pet-manager']}}]} />)
  await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
  const frame = view.container.querySelector('iframe')!
  fireEvent(window, new MessageEvent('message', {source:frame.contentWindow, data:{type:'moonsprite-extension-request',requestId:'1',method:'windows.open',params:{windowId:'manager',resourceId:'pet-manager',options:{presentation:'dialog',title:'宠物管理'}}}}))
  await waitFor(() => expect(view.getByRole('dialog', {name:'宠物管理'})).toBeTruthy())
  expect(nativeOpen).not.toHaveBeenCalled()
  expect(view.getByTestId('extension-dialog-content')).toBeTruthy()
  fireEvent.click(view.getByText('关闭'))
  expect(view.queryByRole('dialog')).toBeNull()
})


it('waits for the runtime message channel and cleans up a late listener', async () => {
  let connect!: (remove: () => void) => void
  mocks.connect.mockImplementationOnce(() => new Promise(resolve => { connect = resolve }))
  window.moonSprite = { readExtensionRuntimeEntry:mocks.read, closeExtensionWindows:async()=>{} } as unknown as typeof window.moonSprite
  const view = render(<ExtensionRuntimeHost {...props} />)
  await waitFor(() => expect(mocks.read).toHaveBeenCalled())
  expect(view.container.querySelector('iframe')).toBeNull()
  const remove = vi.fn()
  await act(async () => connect(remove))
  await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
  view.unmount()
  expect(remove).toHaveBeenCalledOnce()

  mocks.connect.mockImplementationOnce(() => new Promise(resolve => { connect = resolve }))
  const next = render(<ExtensionRuntimeHost {...props} />)
  next.unmount()
  const lateRemove = vi.fn()
  await act(async () => connect(lateRemove))
  expect(lateRemove).toHaveBeenCalledOnce()
})

it('waits for old windows to close before starting a replacement runtime', async () => {
  let finishClose!: () => void
  const close = vi.fn(() => new Promise<void>(resolve => { finishClose = resolve }))
  window.moonSprite = { readExtensionRuntimeEntry:mocks.read, closeExtensionWindows:close } as unknown as typeof window.moonSprite
  const view = render(<ExtensionRuntimeHost {...props} />)
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(1))
  view.rerender(<ExtensionRuntimeHost {...props} extensions={[{...extension}]} />)
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(mocks.read).toHaveBeenCalledTimes(1)
  expect(view.container.querySelector('iframe')).toBeNull()
  await act(async () => finishClose())
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(2))
  close.mockImplementation(async () => {})
})

it('accepts dynamic items only for the owning declared menu and clears them on disable', async () => {
 window.moonSprite = {readExtensionRuntimeEntry:mocks.read,closeExtensionWindows:async()=>{}} as unknown as typeof window.moonSprite
 const owner={...extension,topMenus:[{id:'pet-menu',name:'宠物',description:'',position:'end' as const,commands:[]}],runtime:{permissions:['windows','commands','menus'] as any,resources:[]}}
 const view=render(<ExtensionRuntimeHost {...props} extensions={[owner]} />)
 await waitFor(()=>expect(view.container.querySelector('iframe')).not.toBeNull())
 const frame=view.container.querySelector('iframe')!
 const request=(menuId:string)=>fireEvent(window,new MessageEvent('message',{source:frame.contentWindow,data:{type:'moonsprite-extension-request',requestId:menuId,method:'menus.setItems',params:{menuId,items:[{id:'builtin',name:'奶龙',event:'toggle-pet',checked:true}]}}}))
 request('pet-menu')
 await waitFor(()=>expect(extensionMenuItems('test.pet','pet-menu')).toHaveLength(1))
 request('another-menu')
 expect(extensionMenuItems('test.pet','another-menu')).toEqual([])
 view.unmount()
 expect(extensionMenuItems('test.pet','pet-menu')).toEqual([])
})


it('owns multiple overlays, routes messages locally and closes only the requested surface', async () => {
  const nativeOpen = vi.fn(), nativeMessage = vi.fn(), nativeVisibility = vi.fn()
  window.moonSprite = { readExtensionRuntimeEntry:mocks.read, closeExtensionWindows:async()=>{}, showExtensionWindow:nativeOpen, emitExtensionWindowMessage:nativeMessage, setExtensionWindowVisible:nativeVisibility } as unknown as typeof window.moonSprite
  const item = {...extension, runtime:{...extension.runtime!,resources:['overlay']}}
  const view = render(<ExtensionRuntimeHost {...props} extensions={[item]} />)
  await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
  const frame = view.container.querySelector('iframe')!
  const request = async (method: string, params: unknown) => { await act(async () => fireEvent(window, new MessageEvent('message', {source:frame.contentWindow,data:{type:'moonsprite-extension-request',requestId:'overlay',method,params}}))) }
  await request('windows.open',{windowId:'first',resourceId:'overlay',options:{presentation:'overlay'}})
  await request('windows.open',{windowId:'second',resourceId:'overlay',options:{presentation:'overlay'}})
  expect(document.querySelectorAll('[data-extension-overlay]')).toHaveLength(2)
  const receive = vi.fn()
  window.addEventListener('moonsprite:dialog-message',receive)
  await request('windows.postMessage',{windowId:'second',message:{value:42}})
  expect(receive.mock.calls[0][0].detail).toEqual({extensionId:extension.id,windowId:'second',message:{value:42}})
  window.removeEventListener('moonsprite:dialog-message',receive)
  await request('windows.setVisible',{windowId:'first',visible:false})
  expect((document.querySelector('[data-extension-overlay="first"]')!.parentElement as HTMLElement).style.display).toBe('none')
  await request('windows.close',{windowId:'first'})
  expect(document.querySelectorAll('[data-extension-overlay]')).toHaveLength(1)
  expect(nativeOpen).not.toHaveBeenCalled()
  expect(nativeMessage).not.toHaveBeenCalled()
  expect(nativeVisibility).not.toHaveBeenCalled()
  view.unmount()
  expect(document.querySelectorAll('[data-extension-overlay]')).toHaveLength(0)
})
