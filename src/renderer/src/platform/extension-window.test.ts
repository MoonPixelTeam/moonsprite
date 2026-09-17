import { expect, it, vi } from 'vitest'
import { extensionPointerPosition, listenForExtensionHostGeometry, listenForExtensionWindowMessage, listenForExtensionRuntimeWindowMessage } from './extension-window'
const pointerMock=vi.hoisted(()=>({point:{x:400,y:300},main:true}))
const mock=vi.hoisted(()=>({label:'pet-first',failEvent:'',listeners:[] as {event:string;target:string | {kind:string;label:string};callback:(event:{payload:unknown})=>void;remove:ReturnType<typeof vi.fn>}[]}))
vi.mock('@tauri-apps/api/event',()=>({listen:async(event:string,callback:(event:{payload:unknown})=>void,options?:{target:string | {kind:string;label:string}})=>{if(mock.failEvent===event)throw Error('Listener failed');const remove=vi.fn();mock.listeners.push({event,target:options?.target??'*',callback,remove});return remove},emitTo:vi.fn()}))
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({label:mock.label}),cursorPosition:async()=>pointerMock.point,Window:{getByLabel:async()=>pointerMock.main?{outerPosition:async()=>({x:100,y:100}),innerPosition:async()=>({x:110,y:140}),innerSize:async()=>({width:800,height:600}),scaleFactor:async()=>2}:null}}))

it('returns host-relative logical pointer coordinates and hides outside-client positions',async()=>{
 pointerMock.point={x:400,y:300}
 expect(await extensionPointerPosition()).toEqual({x:150,y:100})
 pointerMock.point={x:109,y:300};expect(await extensionPointerPosition()).toBeNull()
 pointerMock.point={x:910,y:300};expect(await extensionPointerPosition()).toBeNull()
 pointerMock.main=false;expect(await extensionPointerPosition()).toBeNull()
 pointerMock.main=true
})
it('keeps two window configuration channels separate and targets runtime events at main',async()=>{
 const first=vi.fn(),second=vi.fn(),main=vi.fn()
 await listenForExtensionWindowMessage(first)
 mock.label='pet-second';await listenForExtensionWindowMessage(second)
 await listenForExtensionRuntimeWindowMessage(main)
 for(const item of mock.listeners)if(item.target==='pet-second'||item.target==='*')item.callback({payload:{petId:'second'}})
 expect(first).not.toHaveBeenCalled();expect(main).not.toHaveBeenCalled()
 expect(second).toHaveBeenCalledWith({petId:'second'})
 expect(mock.listeners.map(item=>item.target)).toEqual(['pet-first','pet-second','main'])
})

it('reports host resize, move and DPI changes and cleans up every subscription',async()=>{
 mock.listeners.length=0
 const changed=vi.fn(),remove=await listenForExtensionHostGeometry(changed)
 expect(mock.listeners.map(item=>item.event)).toEqual(['tauri://resize','tauri://move','tauri://scale-change'])
 for(const item of mock.listeners){expect(item.target).toEqual({kind:'Window',label:'main'});if(typeof item.target==='object'&&item.target.kind==='Window'&&item.target.label==='main')item.callback({payload:{}})}
 expect(changed).toHaveBeenCalledTimes(3)
 remove();for(const item of mock.listeners)expect(item.remove).toHaveBeenCalledOnce()
})

it('cleans up successful host subscriptions when another registration fails',async()=>{
 mock.listeners.length=0;mock.failEvent='tauri://move'
 try{
  await expect(listenForExtensionHostGeometry(vi.fn())).rejects.toThrow('Listener failed')
  expect(mock.listeners).toHaveLength(2)
  for(const item of mock.listeners)expect(item.remove).toHaveBeenCalledOnce()
 }finally{mock.failEvent=''}
})
