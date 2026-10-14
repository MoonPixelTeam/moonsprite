import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExtensionDialogForm } from './ExtensionDialogForm'

const mock=vi.hoisted(()=>({receive:(_value:unknown)=>{},save:vi.fn()}))
vi.mock('./ExtensionWindow',()=>({ExtensionWindow:({onUiState}:{onUiState:(value:unknown)=>void})=>{mock.receive=onUiState;return null}}))
vi.mock('@/platform/extension-file',()=>({saveExtensionFile:mock.save}))
afterEach(()=>{cleanup();mock.save.mockReset();vi.useRealTimers()})
it('shows a retry action when initialization stalls and accepts a recovered form', async () => {
 vi.useFakeTimers()
 const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
 act(()=>vi.advanceTimersByTime(15000))
 expect(view.getByRole('alert')).toBeTruthy()
 fireEvent.click(view.getByRole('alert').querySelector('button')!)
 expect(view.queryByRole('alert')).toBeNull()
 await act(async()=>mock.receive({nodes:[{id:'loaded',type:'button',label:'Recovered',action:{}}]}))
 expect(view.getByText('Recovered')).toBeTruthy()
 act(()=>vi.advanceTimersByTime(15000))
 expect(view.queryByRole('alert')).toBeNull()
})
it('uploads one file to its named slot and returns the slot identity',async()=>{
 const messages:any[]=[]
 const listener=(event:Event)=>messages.push((event as CustomEvent).detail.message)
 window.addEventListener('moonsprite:dialog-message',listener)
 try{
  const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
  const nodes=[{id:'slot',type:'slot',label:'SHOW · 出场',description:'未上传',children:[{id:'upload',type:'file',label:'上传 SHOW',multiple:false,action:{type:'upload',petId:'cat',animation:'SHOW'}}]}]
  await act(async()=>mock.receive({nodes}))
  expect(view.getByRole('region',{name:'SHOW · 出场'})).toBeTruthy()
  const input=view.getByLabelText('上传 SHOW',{selector:'input'}) as HTMLInputElement
  expect(input.multiple).toBe(false)
  const upload=view.getByRole('button',{name:'上传 SHOW'})
  const click=vi.spyOn(input,'click')
  fireEvent.click(upload)
  expect(click).toHaveBeenCalledOnce()
  expect(upload.classList.contains('quiet-button')).toBe(true)
  const file={name:'different-name.gif',type:'image/gif',size:2,arrayBuffer:async()=>new Uint8Array([1,2]).buffer}
  fireEvent.change(input,{target:{files:[file]}})
  await waitFor(()=>expect(messages).toHaveLength(1))
  expect(messages[0]).toMatchObject({type:'upload',petId:'cat',animation:'SHOW',files:[{name:'different-name.gif',bytes:[1,2]}]})
  expect(input.disabled).toBe(true)
  await act(async()=>mock.receive({nodes,result:{requestId:messages[0].requestId}}))
  expect((view.getByLabelText('上传 SHOW',{selector:'input'}) as HTMLInputElement).disabled).toBe(false)
 }finally{window.removeEventListener('moonsprite:dialog-message',listener)}
})
it('renders extension-defined controls and returns values with a matching request id',async()=>{
 const messages: any[]=[]
 const listener=(event:Event)=>messages.push((event as CustomEvent).detail.message)
 window.addEventListener('moonsprite:dialog-message',listener)
 const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
 const nodes=[{id:'name',type:'input',label:'名称',value:''},{id:'save',type:'button',label:'保存',action:{type:'custom-save'}},{id:'visible',type:'toggle',label:'显示',value:false,action:{type:'custom-toggle'}}]
 await act(async()=>mock.receive({nodes}))
 fireEvent.change(view.getByLabelText('名称'),{target:{value:'Test'}})
 fireEvent.click(view.getByText('保存'))
 expect(messages[0]).toMatchObject({type:'custom-save',values:{name:'Test'}})
 await act(async()=>mock.receive({nodes}))
 expect((view.getByRole('button',{name:'保存'}) as HTMLButtonElement).disabled).toBe(true)
 await act(async()=>mock.receive({nodes,result:{requestId:messages[0].requestId}}))
 fireEvent.click(view.getByLabelText('显示'))
 expect(messages[1]).toMatchObject({type:'custom-toggle',value:true})
 window.removeEventListener('moonsprite:dialog-message',listener)
})

it('sends an edited scale and accepts the saved value',async()=>{
 const messages:any[]=[]
 const listener=(event:Event)=>messages.push((event as CustomEvent).detail.message)
 window.addEventListener('moonsprite:dialog-message',listener)
 const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
 const nodes=[{id:'scale',type:'number',label:'缩放倍率',value:2,min:1,max:4},{id:'apply',type:'button',label:'应用缩放',action:{type:'set-scale'}}]
 await act(async()=>mock.receive({nodes}))
 fireEvent.change(view.getByLabelText('缩放倍率'),{target:{value:'4'}})
 fireEvent.click(view.getByText('应用缩放'))
 expect(messages[0].values.scale).toBe(4)
 await act(async()=>mock.receive({nodes:[{...nodes[0],value:4},nodes[1]],result:{requestId:messages[0].requestId}}))
 expect((view.getByLabelText('缩放倍率') as HTMLInputElement).value).toBe('4')
 window.removeEventListener('moonsprite:dialog-message',listener)
})

it('renders separate navigation and detail regions and dispatches the selected item',async()=>{
 const messages:any[]=[]
 const listener=(event:Event)=>messages.push((event as CustomEvent).detail.message)
 window.addEventListener('moonsprite:dialog-message',listener)
 const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
 await act(async()=>mock.receive({nodes:[{id:'layout',type:'split',children:[{id:'nav',type:'sidebar',label:'宠物列表',children:[{id:'one',type:'choice',label:'奶龙',description:'显示中',selected:true,action:{type:'edit',petId:'one'}},{id:'two',type:'choice',label:'第二只',description:'已隐藏',selected:false,action:{type:'edit',petId:'two'}}]},{id:'detail',type:'column',label:'当前宠物设置',children:[{id:'title',type:'heading',label:'奶龙'},{id:'scale',type:'number',label:'缩放倍率',value:2}]}]}]}))
 expect(view.getByRole('region',{name:'宠物列表'})).toBeTruthy()
 expect(view.getByRole('region',{name:'当前宠物设置'})).toBeTruthy()
 expect(view.getByRole('button',{name:'奶龙'}).getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(view.getByRole('button',{name:'第二只'}))
 expect(messages[0]).toMatchObject({type:'edit',petId:'two'})
 window.removeEventListener('moonsprite:dialog-message',listener)
})


it('saves an export only for the matching user action and does not replay it',async()=>{
 const messages:any[]=[];const listener=(event:Event)=>messages.push((event as CustomEvent).detail.message);
 window.addEventListener('moonsprite:dialog-message',listener);
 try{
  const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />);
  const nodes=[{id:'export',type:'button',label:'导出宠物包',action:{type:'ui-export-pet',petId:'cat'}},{id:'import',type:'file',label:'导入宠物包',accept:'.mspet',multiple:false,action:{type:'ui-import-pet'}}];
  const file={name:'cat.mspet',bytes:[1,2]};
  await act(async()=>mock.receive({nodes,result:{requestId:'unknown',file}}));expect(mock.save).not.toHaveBeenCalled();
  expect((view.getByLabelText('导入宠物包',{selector:'input'}) as HTMLInputElement).accept).toBe('.mspet');
  fireEvent.click(view.getByRole('button',{name:'导出宠物包'}));
  const response={nodes,result:{requestId:messages[0].requestId,file}};
  mock.save.mockResolvedValue(false);await act(async()=>mock.receive(response));
  expect(mock.save).toHaveBeenCalledExactlyOnceWith(file);expect(view.getByRole('status').textContent).toBe('已取消导出');
  await act(async()=>mock.receive(response));expect(mock.save).toHaveBeenCalledTimes(1);
  fireEvent.click(view.getByRole('button',{name:'导出宠物包'}));mock.save.mockRejectedValue(new Error('disk full'));
  await act(async()=>mock.receive({nodes,result:{requestId:messages[1].requestId,file}}));
  expect(view.getByRole('status').textContent).toContain('disk full');expect((view.getByRole('button',{name:'导出宠物包'}) as HTMLButtonElement).disabled).toBe(false);
 }finally{window.removeEventListener('moonsprite:dialog-message',listener)}
});

it('renders a generic condition dialog with component-library select and submits selected values', async () => {
 const messages:any[]=[];const listener=(event:Event)=>messages.push((event as CustomEvent).detail.message)
 window.addEventListener('moonsprite:dialog-message',listener)
 try {
  const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
  await act(async()=>mock.receive({nodes:[{id:'prompt',type:'dialog',label:'选择条件',action:{type:'cancel'},children:[{id:'event',type:'select',label:'触发条件',tooltip:'条件说明',value:'undo',options:[{value:'undo',label:'撤销',description:'完成撤销后播放'},{value:'redo',label:'重做',description:'完成重做后播放'}]},{id:'submit',type:'button',label:'确定',action:{type:'confirm'}}]}]}))
  const prompt=view.getByRole('dialog',{name:'选择条件'})
  expect(prompt.closest('[data-extension-prompt]')?.parentElement).toBe(document.body)
  expect(view.container.contains(prompt)).toBe(false)
  fireEvent.click(view.getByRole('button',{name:'确定'}))
  expect(messages[0].type).toBe('confirm')
 } finally { window.removeEventListener('moonsprite:dialog-message',listener) }
})

it('hides irrelevant dependent fields and preserves zero numeric defaults', async()=>{
 const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
 const nodes=(event:string)=>[{id:'event',type:'select',label:'条件',value:event,options:[{value:'idle',label:'空闲'},{value:'tool',label:'工具'}]},{id:'idle',type:'number',label:'空闲秒数',value:60,visibleWhen:{event:'idle'}},{id:'tool',type:'text',label:'目标工具',visibleWhen:{event:'tool'}},{id:'cooldown',type:'number',label:'冷却',min:0,value:0}]
 await act(async()=>mock.receive({nodes:nodes('idle')}))
 expect(view.queryByText('目标工具')).toBeNull()
 expect(view.getByLabelText('空闲秒数')).toBeTruthy()
 expect((view.getByLabelText('冷却') as HTMLInputElement).value).toBe('0')
 await act(async()=>mock.receive({nodes:nodes('tool')}))
 expect(view.queryByLabelText('空闲秒数')).toBeNull()
 expect(view.getByText('目标工具')).toBeTruthy()
})

it('reveals the complete translated label when its visible copy overflows',async()=>{
 const view=render(<ExtensionDialogForm extensionId="test" windowId="manager" resourceId="ui" onClose={()=>{}} />)
 const text='Animation während des Gedrückthaltens wiederholen'
 await act(async()=>mock.receive({nodes:[{id:'long',type:'heading',label:text}]}))
 const copy=view.getByText(text)
 Object.defineProperties(copy,{clientWidth:{value:120},clientHeight:{value:20},scrollWidth:{value:420},scrollHeight:{value:20}})
 fireEvent.pointerEnter(copy.parentElement!)
 expect(view.getByRole('tooltip').textContent).toBe(text)
 fireEvent.pointerLeave(copy.parentElement!)
 expect(view.queryByRole('tooltip')).toBeNull()
})
