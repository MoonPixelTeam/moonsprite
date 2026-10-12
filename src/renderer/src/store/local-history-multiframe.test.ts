import { afterEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, getActiveLayer, readLayerPacked } from '@/core/document-model'
import { activateAnimationFrame, refreshActiveAnimationFrame, syncActiveAnimationLayer } from '@/core/animation'
import { beginPixelEdit, commitPixelEdit, HistoryStack, recordPixel } from '@/core/history'
import { cloneHistoryDocument, captureCommittedHistoryDelta, hydrateLocalHistoryDelta } from '@/core/local-history-delta'
import { materializeLocalHistorySnapshot, encodeHistoryDelta, decodeHistoryDelta } from '@/core/local-history-archive'
import { enforceLocalHistoryBudget, localHistoryRetainedBytes } from '@/core/local-history-budget'
import { DEFAULT_EDITOR_PREFERENCES, saveEditorPreferences } from '@/core/file-preferences'
import { configureLocalHistory, flushLocalHistoryPersist, restoreLocalHistory } from './local-history-service'
import type { DocumentSession } from './workspace-types'
import type { MoonSpriteApi } from '@shared/types-platform'
import type { AnimationCelSurface } from '@shared/types-animation'

afterEach(() => { vi.useRealTimers(); localStorage.clear(); vi.restoreAllMocks() })
export function multiframeFixture(mode: 'rgba' | 'indexed' = 'rgba') {
  const document = createDocument('three independent/linked frames', 64, 64, mode)
  document.layers.push(createLayer('untouched', 64, 64, mode))
  const timeline = document.animation!
  timeline.frames = [1,2,3].map(i=>({id:`frame-${i}`,duration:100}))
  timeline.cels = timeline.frames.flatMap((frame,fi)=>document.layers.map((layer,li)=>({
    id:`${frame.id}-${li}`,frameId:frame.id,layerId:layer.id,linkedCelId:fi===2?`frame-1-${li}`:null,
    surface:{format:layer.format,width:64,height:64,offsetX:fi===1?13:0,offsetY:fi===1?-4:0,storageOriginX:fi===1?3:0,storageOriginY:fi===1?5:0,
      pixels:fi===1?layer.pixels.slice():layer.pixels} as AnimationCelSurface
  })))
  refreshActiveAnimationFrame(document)
  return document
}

it.each(['rgba','indexed'] as const)('journals independent and linked %s cels with offsets, reopen, inactive undo and branches', async mode=>{
  vi.useFakeTimers()
  saveEditorPreferences({...DEFAULT_EDITOR_PREFERENCES,localHistoryEnabled:true})
  const document=multiframeFixture(mode);document.filePath=`D:/history/multiframe-${mode}.moonsprite`
  const source={document,history:new HistoryStack(),localHistory:null,revision:0,contentRevision:0,layersPanelRevision:0} as unknown as DocumentSession
  let archive=new Uint8Array()
  const api={writeLocalHistory:async(_id:string,bytes:Uint8Array)=>{archive=bytes.slice()},readLocalHistory:async()=>archive} as unknown as MoonSpriteApi
  configureLocalHistory(source,api)
  const before=cloneHistoryDocument(document)
  const paint=(value:number)=>{
    const layer=getActiveLayer(document),edit=beginPixelEdit(layer.id)
    recordPixel(document,layer,edit,101,value);syncActiveAnimationLayer(document,layer.id)
    const entry=commitPixelEdit(document,edit,'paint',true)!
    const cloning=vi.spyOn(globalThis,'structuredClone')
    source.history.push(entry);expect(cloning).not.toHaveBeenCalled();cloning.mockRestore()
    expect(source.localHistory!.snapshots.at(-1)).toHaveProperty('base')
  }
  const first=mode==='rgba'?0xff112233:1,second=mode==='rgba'?0xff445566:2
  paint(first);activateAnimationFrame(document,'frame-2');paint(second)
  const delta=captureCommittedHistoryDelta(document,source.history.latestUndoEntry!)!
  expect(delta.celTarget?.frameId).toBe('frame-2')
  const target=cloneHistoryDocument(document);activateAnimationFrame(target,'frame-3')
  const entry=hydrateLocalHistoryDelta(target,decodeHistoryDelta(encodeHistoryDelta(delta)))
  entry.undo();expect(target.animation!.activeFrameId).toBe('frame-3')
  expect(readLayerPacked(target,target.layers[0],101)).toBe(first)
  expect(target.animation!.cels[2].surface!.pixels.every(v=>v===0)).toBe(true)
  entry.redo();expect(readLayerPacked(target,target.layers[0],101)).toBe(first)
  const materialized=materializeLocalHistorySnapshot(source.localHistory!.snapshots.at(-1)!)
  expect(materialized.animation!.activeFrameId).toBe('frame-2')
  expect(readLayerPacked(materialized,materialized.layers[0],101)).toBe(second)
  expect(materialized.layers[1].pixels.every(v=>v===0)).toBe(true)
  activateAnimationFrame(document,'frame-3')
  vi.useRealTimers();await flushLocalHistoryPersist(api,source)
  const reopened={...source,document:cloneHistoryDocument(document),history:new HistoryStack(),localHistory:null} as unknown as DocumentSession
  expect(await restoreLocalHistory(api,reopened)).toBe(true)
  expect(reopened.document.animation!.activeFrameId).toBe('frame-3')
  reopened.history.undo();activateAnimationFrame(reopened.document,'frame-2')
  expect(readLayerPacked(reopened.document,reopened.document.layers[0],101)).toBe(0)
  reopened.history.redo();expect(readLayerPacked(reopened.document,reopened.document.layers[0],101)).toBe(second)
  reopened.history.undo();reopened.history.undo();activateAnimationFrame(reopened.document,'frame-1')
  expect(reopened.document.layers[0].pixels.every((v,i)=>v===before.layers[0].pixels[i])).toBe(true)
  reopened.history.redo();expect(readLayerPacked(reopened.document,reopened.document.layers[0],101)).toBe(first)
  await flushLocalHistoryPersist(api,reopened)
})

it('rebases trimmed prefixes under the independent byte budget without changing visible steps that fit',()=>{
  const document=multiframeFixture(),baseline=cloneHistoryDocument(document)
  const state={snapshots:[baseline] as import('@/core/local-history-archive').LocalHistorySnapshot[],labels:[] as string[],position:0}
  for(let i=1;i<=120;i++) {
    const layer=document.layers[0],edit=beginPixelEdit(layer.id)
    recordPixel(document,layer,edit,101,0xff000000+i)
    const entry=commitPixelEdit(document,edit,'paint',true)!,delta=captureCommittedHistoryDelta(document,entry)!
    state.snapshots.push({base:state.snapshots.at(-1)!,delta});state.labels.push(`paint-${i}`);state.position++
  }
  state.snapshots.splice(0,117);state.labels.splice(0,117);state.position-=117
  const before=localHistoryRetainedBytes(state.snapshots),labels=[...state.labels],position=state.position
  const budget=before-1
  enforceLocalHistoryBudget(state,budget)
  expect(state.labels).toEqual(labels);expect(state.position).toBe(position)
  expect(state.snapshots[0]).not.toHaveProperty('base')
  expect(localHistoryRetainedBytes(state.snapshots)).toBeLessThan(before)
  const checkpoint=materializeLocalHistorySnapshot(state.snapshots[0])
  expect(readLayerPacked(checkpoint,checkpoint.layers[0],101)).toBe(0xff000075)
  const final=materializeLocalHistorySnapshot(state.snapshots.at(-1)!)
  expect(readLayerPacked(final,final.layers[0],101)).toBe(0xff000078)
})

it('roundtrips non-linked cels sharing pixels with different placement, including separated archive buffers', async()=>{
  saveEditorPreferences({...DEFAULT_EDITOR_PREFERENCES,localHistoryEnabled:true})
  const document=multiframeFixture();document.filePath='D:/history/placed-alias.moonsprite'
  const timeline=document.animation!,first=timeline.cels[0].surface!,other=timeline.cels[2].surface!
  other.pixels=first.pixels;other.storageOriginX=0;other.storageOriginY=0
  const source={document,history:new HistoryStack(),localHistory:null,revision:0,contentRevision:0,layersPanelRevision:0} as unknown as DocumentSession
  let archive=new Uint8Array()
  const api={writeLocalHistory:async(_id:string,bytes:Uint8Array)=>{archive=bytes.slice()},readLocalHistory:async()=>archive} as unknown as MoonSpriteApi
  configureLocalHistory(source,api)
  const edit=beginPixelEdit(document.layers[0].id)
  recordPixel(document,document.layers[0],edit,101,0xff112233)
  syncActiveAnimationLayer(document,document.layers[0].id)
  const entry=commitPixelEdit(document,edit,'shared paint',true)!
  source.history.push(entry)
  const delta=captureCommittedHistoryDelta(document,entry)!
  expect(delta.patches[0].aliases).toHaveLength(3)
  const split=cloneHistoryDocument(document)
  split.animation!.cels[2].surface!.pixels=other.pixels.slice()
  const restoredEntry=hydrateLocalHistoryDelta(split,decodeHistoryDelta(encodeHistoryDelta(delta)))
  restoredEntry.undo();expect(split.animation!.cels[2].surface!.pixels[404]).toBe(0)
  restoredEntry.redo();expect(split.animation!.cels[2].surface!.pixels[404]).toBe(0x33)
  await flushLocalHistoryPersist(api,source)
  const reopened={...source,document:cloneHistoryDocument(document),history:new HistoryStack(),localHistory:null} as unknown as DocumentSession
  expect(await restoreLocalHistory(api,reopened)).toBe(true)
  reopened.history.undo();expect(reopened.document.animation!.cels[2].surface!.pixels[404]).toBe(0)
  reopened.history.redo();expect(reopened.document.animation!.cels[2].surface!.pixels[404]).toBe(0x33)
  expect(reopened.document.animation!.cels[2].surface!.offsetX).toBe(13)
  await flushLocalHistoryPersist(api,reopened)
})

it('falls back to a checkpoint for unequal views of shared storage',()=>{
  const document=multiframeFixture(),surface=document.animation!.cels[0].surface!
  document.animation!.cels[2].surface!.pixels=new Uint8ClampedArray(surface.pixels.buffer,4,surface.pixels.byteLength-4)
  const edit=beginPixelEdit(document.layers[0].id)
  recordPixel(document,document.layers[0],edit,101,0xff112233)
  expect(captureCommittedHistoryDelta(document,commitPixelEdit(document,edit,'overlap',true)!)).toBeNull()
})
