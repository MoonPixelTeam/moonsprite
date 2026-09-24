import { useI18n } from '@/components/I18nProvider'
import { createPortal } from 'react-dom'
import { Tooltip } from '@/components/Tooltip'
import { ThemedSelect } from '@/components/ThemedSelect'
import { ModalShell } from '@/components/ModalShell'
import { DialogHeader } from '@/components/DialogHeader'
import { useEffect, useRef, useState, type ReactNode } from 'react'
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
const labelHint=(node:Node)=>node.tooltip?`${node.label ?? ''} — ${node.tooltip}`:node.label
function FormCopy({text,description}:{text?:string;description?:string}) {
 return <Tooltip className="extension-form-copy" content={description?`${text ?? ''} — ${description}`:text}><span className="extension-form-copy-text">{text}</span></Tooltip>
}
interface Props { extensionId: string; windowId: string; resourceId: string; onClose: () => void }
export function ExtensionDialogForm({extensionId,windowId,resourceId,onClose}:Props) {
  const { t } = useI18n()
 const [view,setView]=useState<View>({nodes:[]}),[values,setValues]=useState<Record<string,Value>>({}),[busy,setBusy]=useState(false)
 const [generation,setGeneration]=useState(0),[loadError,setLoadError]=useState<string|null>(null),[loaded,setLoaded]=useState(false)
 useEffect(()=>{if(loaded)return;const timer=window.setTimeout(()=>setLoadError('Extension form did not respond.'),15000);return()=>window.clearTimeout(timer)},[generation,loaded])
 const retry=()=>{setLoadError(null);setLoaded(false);setBusy(false);setValues({});pending.current='';setGeneration(value=>value+1)}
 const sequence=useRef(0),pending=useRef('')
 const send=(action:Record<string,unknown>,extra:Record<string,unknown>={})=>{const requestId=String(++sequence.current);pending.current=requestId;setBusy(true);window.dispatchEvent(new CustomEvent('moonsprite:dialog-message',{detail:{extensionId,windowId,message:{...action,...extra,values,requestId}}}))}
 const receive=async(message:unknown)=>{const next=message as View;if(!Array.isArray(next.nodes))return;setLoaded(true);setLoadError(null);setView(next);if(pending.current&&next.result?.requestId===pending.current){pending.current='';setValues({});try{if(next.result.file){const saved=await saveExtensionFile(next.result.file);setView(current=>({...current,status:saved?t('extension.fileExported'):t('extension.exportCancelled')}))}}catch(error){setView(current=>({...current,status:String(error)}))}finally{setBusy(false)}}}
 const defaults:Record<string,Value>={}
 const collect=(nodes:Node[],depth=0)=>{if(depth>8)return;for(const node of nodes){if(node.value!==undefined)defaults[node.id]=node.value;if(Array.isArray(node.children))collect(node.children,depth+1)}}
 collect(view.nodes)
 const render=(node:Node,depth=0):ReactNode=>{
  if(depth>8||!node||typeof node!=='object'||typeof node.id!=='string'||(node.label!==undefined&&typeof node.label!=='string'))return null
  if(node.visibleWhen&&Object.entries(node.visibleWhen).some(([id,expected])=>(values[id]??defaults[id])!==expected))return null
  const disabled=busy||node.disabled,value=values[node.id]??node.value
  switch(node.type){
   case 'dialog':return createPortal(<div className="modal-backdrop" data-extension-prompt={node.id} onPointerDown={event=>event.stopPropagation()} onFocusCapture={event=>event.stopPropagation()}><ModalShell storageKey={'extension-prompt:'+extensionId+':'+node.id} defaultWidth={440} defaultHeight={440} minWidth={320} minHeight={240} role="dialog" aria-modal="true" aria-label={node.label}><DialogHeader title={node.label||''} closeLabel={t('common.cancel')} onClose={()=>send(node.action||{})}/><div className="extension-dialog-form" style={{flex:1,minHeight:0}}><div className="modal-body">{node.children?.slice(0,100).map(child=>render(child,depth+1))}</div></div></ModalShell></div>,document.body,node.id)
   case 'select':return <FormField key={node.id} label={<FormCopy text={node.label} description={node.tooltip}/>}><ThemedSelect popoverClassName="extension-form-select-popover" value={String(value??'')} label={node.label||''} disabled={disabled} groups={[{label:'',options:(Array.isArray(node.options)?node.options:[]).filter(option=>option&&typeof option.value==='string'&&typeof option.label==='string'&&(option.description===undefined||typeof option.description==='string')).slice(0,100)}]} onChange={next=>setValues(current=>({...current,[node.id]:next}))}/></FormField>
   case 'split':return <div className="extension-form-split" key={node.id}>{node.children?.slice(0,2).map(child=>render(child,depth+1))}</div>
   case 'sidebar':case 'column':return <section aria-label={node.label} className={'extension-form-'+node.type} key={node.id}>{node.children?.slice(0,100).map(child=>render(child,depth+1))}</section>
   case 'heading':return <h3 key={node.id}><FormCopy text={node.label}/></h3>
   case 'choice':return <Button key={node.id} className="extension-form-choice" aria-label={node.label} aria-description={node.description} aria-pressed={node.selected} disabled={disabled} onClick={()=>send(node.action||{})}><span className="extension-form-choice-content"><FormCopy text={node.label}/>{node.description&&<small><FormCopy text={node.description}/></small>}</span></Button>
   case 'row':return <div className={'extension-form-row'+(node.align==='end'?' extension-form-row-end':'')} key={node.id}>{Array.isArray(node.children)?node.children.slice(0,100).map(child=>render(child,depth+1)):null}</div>
   case 'slot':return <section className="extension-form-slot" onContextMenu={event=>{if(node.contextAction&&!disabled){event.preventDefault();event.stopPropagation();setValues({});send(node.contextAction)}}} aria-label={node.label} key={node.id}><div><h3><FormCopy text={node.label} description={node.tooltip}/></h3><p><FormCopy text={node.description}/></p></div>{node.children?.slice(0,16).map(child=>render(child,depth+1))}</section>
   case 'text':return <p key={node.id}><FormCopy text={node.label} description={node.tooltip}/></p>
   case 'separator':return <hr key={node.id}/>
   case 'image':return typeof node.src==='string'&&node.src.startsWith('data:image/png;base64,')?<img key={node.id} src={node.src} alt={node.label||''} style={{width:typeof node.width==='number'&&Number.isFinite(node.width)?Math.max(16,Math.min(512,node.width)):48,height:typeof node.height==='number'&&Number.isFinite(node.height)?Math.max(16,Math.min(512,node.height)):48,flexShrink:0,objectFit:'contain'}}/>:null
   case 'input':return <FormField key={node.id} label={<FormCopy text={node.label} description={node.tooltip}/>}><TextInput aria-label={node.label} value={String(value??'')} disabled={disabled} maxLength={64} onChange={event=>setValues(current=>({...current,[node.id]:event.target.value}))}/></FormField>
   case 'number':return <FormField key={node.id} label={<FormCopy text={node.label} description={node.tooltip}/>}><NumberInput live aria-label={node.label} value={Number.isFinite(Number(value))?Number(value):1} min={node.min} max={node.max} step={1} disabled={disabled} onValueChange={next=>setValues(current=>({...current,[node.id]:next}))}/></FormField>
   case 'toggle':return <PreferenceToggle key={node.id} label={<FormCopy text={node.label} description={node.tooltip}/>} checked={Boolean(value)} disabled={disabled} onChange={next=>send(node.action||{}, {value:next})}/>
   case 'button':return <Button key={node.id} title={labelHint(node)} aria-pressed={node.selected} variant={node.primary?'primary':'quiet'} disabled={disabled} onClick={()=>send(node.action||{})}>{node.label}</Button>
   case 'file':return <FileButton key={node.id} label={node.label||t('common.chooseFile')} accept={node.accept||'image/gif,image/png,image/webp'} multiple={node.multiple!==false} disabled={disabled} onFiles={async files=>{
    setBusy(true)
    try{if(node.multiple===false&&files.length!==1)throw new Error(t('extension.oneAnimationFile'));if(files.length>16||files.reduce((sum,file)=>sum+file.size,0)>16*1024*1024)throw new Error(t('extension.fileLimit'));const encoded=await Promise.all(files.map(async file=>({name:file.name,mime:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))})));send(node.action||{},{files:encoded})}catch(error){setView(current=>({...current,status:String(error)}));setBusy(false)}
   }}><FormCopy text={node.label} description={node.tooltip}/></FileButton>
   default:return null
  }
 }
 return <div className="extension-dialog-form"><div hidden><ExtensionWindow key={generation} onLoadError={setLoadError} identity={{extensionId,windowId,resourceId}} onClose={onClose} onUiState={receive}/></div><div className="modal-body">{!loaded&&!loadError&&<p role="status">{t('common.processingEllipsis')}</p>}{loadError&&<div role="alert"><p>{loadError}</p><Button onClick={retry}>{t('home.retry')}</Button></div>}{view.nodes.slice(0,200).map(node=>render(node))}</div><footer><p role="status"><FormCopy text={busy?t('common.processingEllipsis'):view.status}/></p><Button variant="primary" disabled={busy} onClick={onClose}>{t('componentLibrary.done')}</Button></footer></div>
}
