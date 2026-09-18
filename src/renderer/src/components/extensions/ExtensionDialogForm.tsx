import { createPortal } from 'react-dom'
import { Tooltip } from '@/components/Tooltip'
import { ThemedSelect } from '@/components/ThemedSelect'
import { ModalShell } from '@/components/ModalShell'
import { DialogHeader } from '@/components/DialogHeader'
import { useRef, useState, type ReactNode } from 'react'
import { Button, FileButton } from '@/components/Button'
import { TextInput } from '@/components/TextInput'
import { NumberInput } from '@/components/NumberInput'
import { PreferenceToggle } from '@/components/PreferenceToggle'
import { FormField } from '@/components/FormField'
import { saveExtensionFile, type ExtensionExportFile } from '@/platform/extension-file'
import { ExtensionWindow } from './ExtensionWindow'

type Value = string | number | boolean
interface Node { contextAction?: Record<string, unknown>; visibleWhen?: Record<string, Value>; width?: number; height?: number; tooltip?: string; options?: { value: string; label: string; description?: string }[]; id: string; type: string; label?: string; description?: string; value?: Value; action?: Record<string, unknown>; children?: Node[]; disabled?: boolean; primary?: boolean; selected?: boolean; min?: number; max?: number; src?: string; align?: 'center' | 'end'; multiple?: boolean; accept?: string }
interface View { nodes: Node[]; status?: string; result?: { requestId: string; file?: ExtensionExportFile } }
interface Props { extensionId: string; windowId: string; resourceId: string; onClose: () => void }
export function ExtensionDialogForm({extensionId,windowId,resourceId,onClose}:Props) {
 const [view,setView]=useState<View>({nodes:[]}),[values,setValues]=useState<Record<string,Value>>({}),[busy,setBusy]=useState(false)
 const sequence=useRef(0),pending=useRef('')
 const send=(action:Record<string,unknown>,extra:Record<string,unknown>={})=>{const requestId=String(++sequence.current);pending.current=requestId;setBusy(true);window.dispatchEvent(new CustomEvent('moonsprite:dialog-message',{detail:{extensionId,windowId,message:{...action,...extra,values,requestId}}}))}
 const receive=async(message:unknown)=>{const next=message as View;if(!Array.isArray(next.nodes))return;setView(next);if(pending.current&&next.result?.requestId===pending.current){pending.current='';setValues({});try{if(next.result.file){const saved=await saveExtensionFile(next.result.file);setView(current=>({...current,status:saved?'文件已导出':'已取消导出'}))}}catch(error){setView(current=>({...current,status:String(error)}))}finally{setBusy(false)}}}
 const defaults:Record<string,Value>={}
 const collect=(nodes:Node[],depth=0)=>{if(depth>8)return;for(const node of nodes){if(node.value!==undefined)defaults[node.id]=node.value;if(Array.isArray(node.children))collect(node.children,depth+1)}}
 collect(view.nodes)
 const render=(node:Node,depth=0):ReactNode=>{
  if(depth>8||!node||typeof node!=='object'||typeof node.id!=='string'||(node.label!==undefined&&typeof node.label!=='string'))return null
  if(node.visibleWhen&&Object.entries(node.visibleWhen).some(([id,expected])=>(values[id]??defaults[id])!==expected))return null
  const disabled=busy||node.disabled,value=values[node.id]??node.value
  switch(node.type){
   case 'dialog':return createPortal(<div className="modal-backdrop" data-extension-prompt={node.id} onPointerDown={event=>event.stopPropagation()} onFocusCapture={event=>event.stopPropagation()}><ModalShell storageKey={'extension-prompt:'+extensionId+':'+node.id} defaultWidth={440} defaultHeight={440} minWidth={320} minHeight={240} role="dialog" aria-modal="true" aria-label={node.label}><DialogHeader title={node.label||''} closeLabel="取消" onClose={()=>send(node.action||{})}/><div className="extension-dialog-form" style={{flex:1,minHeight:0}}><div className="modal-body">{node.children?.slice(0,100).map(child=>render(child,depth+1))}</div></div></ModalShell></div>,document.body,node.id)
   case 'select':return <FormField key={node.id} label={<Tooltip content={typeof node.tooltip==='string'?node.tooltip:undefined}><span>{node.label}</span></Tooltip>}><ThemedSelect value={String(value??'')} label={node.label||''} disabled={disabled} groups={[{label:'',options:(Array.isArray(node.options)?node.options:[]).filter(option=>option&&typeof option.value==='string'&&typeof option.label==='string'&&(option.description===undefined||typeof option.description==='string')).slice(0,100)}]} onChange={next=>setValues(current=>({...current,[node.id]:next}))}/></FormField>
   case 'split':return <div className="extension-form-split" key={node.id}>{node.children?.slice(0,2).map(child=>render(child,depth+1))}</div>
   case 'sidebar':case 'column':return <section aria-label={node.label} className={'extension-form-'+node.type} key={node.id}>{node.children?.slice(0,100).map(child=>render(child,depth+1))}</section>
   case 'heading':return <h3 key={node.id}>{node.label}</h3>
   case 'choice':return <Button key={node.id} className="extension-form-choice" aria-label={node.label} aria-description={node.description} aria-pressed={node.selected} disabled={disabled} onClick={()=>send(node.action||{})}><span className="extension-form-choice-content"><span>{node.label}</span>{node.description&&<small>{node.description}</small>}</span></Button>
   case 'row':return <div className={'extension-form-row'+(node.align==='end'?' extension-form-row-end':'')} key={node.id}>{Array.isArray(node.children)?node.children.slice(0,100).map(child=>render(child,depth+1)):null}</div>
   case 'slot':return <section className="extension-form-slot" onContextMenu={event=>{if(node.contextAction&&!disabled){event.preventDefault();event.stopPropagation();setValues({});send(node.contextAction)}}} aria-label={node.label} key={node.id}><div><h3><Tooltip content={typeof node.tooltip==='string'?node.tooltip:undefined}><span>{node.label}</span></Tooltip></h3><p>{node.description}</p></div>{node.children?.slice(0,16).map(child=>render(child,depth+1))}</section>
   case 'text':return <p key={node.id}><Tooltip content={typeof node.tooltip==='string'?node.tooltip:undefined}><span>{node.label}</span></Tooltip></p>
   case 'separator':return <hr key={node.id}/>
   case 'image':return typeof node.src==='string'&&node.src.startsWith('data:image/png;base64,')?<img key={node.id} src={node.src} alt={node.label||''} style={{width:typeof node.width==='number'&&Number.isFinite(node.width)?Math.max(16,Math.min(512,node.width)):48,height:typeof node.height==='number'&&Number.isFinite(node.height)?Math.max(16,Math.min(512,node.height)):48,flexShrink:0,objectFit:'contain'}}/>:null
   case 'input':return <FormField key={node.id} label={<Tooltip content={typeof node.tooltip==='string'?node.tooltip:undefined}><span>{node.label}</span></Tooltip>}><TextInput aria-label={node.label} value={String(value??'')} disabled={disabled} maxLength={64} onChange={event=>setValues(current=>({...current,[node.id]:event.target.value}))}/></FormField>
   case 'number':return <FormField key={node.id} label={<Tooltip content={typeof node.tooltip==='string'?node.tooltip:undefined}><span>{node.label}</span></Tooltip>}><NumberInput live aria-label={node.label} value={Number.isFinite(Number(value))?Number(value):1} min={node.min} max={node.max} step={1} disabled={disabled} onValueChange={next=>setValues(current=>({...current,[node.id]:next}))}/></FormField>
   case 'toggle':return <PreferenceToggle key={node.id} label={<Tooltip content={typeof node.tooltip==='string'?node.tooltip:undefined}><span>{node.label}</span></Tooltip>} checked={Boolean(value)} disabled={disabled} onChange={next=>send(node.action||{}, {value:next})}/>
   case 'button':return <Button key={node.id} aria-pressed={node.selected} variant={node.primary?'primary':'quiet'} disabled={disabled} onClick={()=>send(node.action||{})}>{node.label}</Button>
   case 'file':return <FileButton key={node.id} label={node.label||'选择文件'} accept={node.accept||'image/gif,image/png,image/webp'} multiple={node.multiple!==false} disabled={disabled} onFiles={async files=>{
    setBusy(true)
    try{if(node.multiple===false&&files.length!==1)throw new Error('请选择一个动画文件。');if(files.length>16||files.reduce((sum,file)=>sum+file.size,0)>16*1024*1024)throw new Error('最多 16 个文件，合计不超过 16 MiB。');const encoded=await Promise.all(files.map(async file=>({name:file.name,mime:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))})));send(node.action||{},{files:encoded})}catch(error){setView(current=>({...current,status:String(error)}));setBusy(false)}
   }}>{node.label}</FileButton>
   default:return null
  }
 }
 return <div className="extension-dialog-form"><div hidden><ExtensionWindow identity={{extensionId,windowId,resourceId}} onClose={onClose} onUiState={receive}/></div><div className="modal-body">{view.nodes.slice(0,200).map(node=>render(node))}</div><footer><p role="status">{busy?'正在处理…':view.status}</p><Button variant="primary" disabled={busy} onClick={onClose}>完成</Button></footer></div>
}
