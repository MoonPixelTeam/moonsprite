import { describe, expect, it } from 'vitest'
import { floodFillSymmetric } from './tools-fill'
import { floodFillSymmetric as referenceFill } from './__fixtures__/p12-fill-map-reference'
import { createDocument, createLayerMask, markLayerContentChanged } from './document-model'
import { commitPixelEdit, revertPixelEdit, HistoryStack, pixelEditHasChanges } from './history'
import type { SpriteDocument } from '@shared/types-document'
import type { RasterLayer } from '@shared/types-layer'
import type { BrushTexture, ImageBrush } from '@shared/types-brush'
import type { SymmetryAxes } from './symmetry'

const fixture = (format: 'rgba' | 'indexed' | 'grayscale' = 'rgba', mask = false) => {
  const doc = createDocument('fill oracle', 512, 512, format), layer = mask ? createLayerMask('m', 512, 512) : doc.layers[0]
  if (format === 'indexed') {
    doc.palette = [{ id: 1, name: 'base', color: {r:30,g:40,b:50,a:255} }, { id: 2, name: 'fill', color: {r:220,g:90,b:45,a:255} }]
    doc.nextColorId = 3
  }
  if (mask) { doc.animation!.layerMasks = [{ layerId: doc.layers[0].id, frameId: doc.animation!.activeFrameId, mask: layer as ReturnType<typeof createLayerMask> }] }
  if (layer.format === 'rgba') for (let i=0;i<layer.pixels.length;i+=4) layer.pixels.set(mask?[90,90,90,255]:[30+(i/4%3),40,50,180],i)
  else layer.pixels.fill(1)
  markLayerContentChanged(layer)
  return {doc, layer}
}
const color = {r:220,g:90,b:45,a:160}
const samePixels = (a: Uint8ClampedArray | Uint32Array, b: Uint8ClampedArray | Uint32Array) => {
  expect(a.length).toBe(b.length); expect(a.findIndex((v,i)=>v!==b[i])).toBe(-1)
}
function run(fill: typeof floodFillSymmetric, doc: SpriteDocument, layer: RasterLayer, spec: { contiguous?: boolean; texture?: BrushTexture; tolerance?: number; gap?: number; connectivity?: 4|8; selection?: boolean; reference?: boolean; axes?: SymmetryAxes; image?: ImageBrush|null; opaque?: boolean } = {}) {
  const mask = new Uint8Array(512*512);for(let i=0;i<mask.length;i++)mask[i]=i%7?1:0;mask[513]=1
  return fill(doc,layer,1,1,spec.opaque?{...color,a:255}:color,spec.selection?{x:0,y:0,width:512,height:512,mask}:undefined,spec.contiguous??false,spec.image??null,16,undefined,spec.texture??'grain',1,0,'paint',spec.axes,undefined,spec.tolerance??8,spec.gap??0,undefined,{connectivity:spec.connectivity??4,sourceColorAt:spec.reference?()=>({r:50,g:60,b:70,a:255}):undefined})
}
describe('complex fill compact history against frozen production baseline', () => {
  it.each([
    {contiguous:false}, {contiguous:true,connectivity:8 as const}, {selection:true},
    {reference:true,contiguous:true}, {opaque:true}, {texture:'solid' as const,tolerance:8},
    {axes:{horizontal:true,vertical:true,diagonalUp:false,diagonalDown:false}},
    {image:{id:'pattern',name:'pattern',width:2,height:2,coverage:new Uint8Array([255,0,128,200]),intrinsicSize:true} as ImageBrush}
  ])('preserves pixels, dirty bounds and one history entry: %j', spec => {
    const {doc,layer}=fixture(), original=structuredClone(doc), oldLayer=original.layers[0]
    const before=layer.pixels.slice(), reference=run(referenceFill,original,oldLayer,spec), edit=run(floodFillSymmetric,doc,layer,spec)
    samePixels(layer.pixels,oldLayer.pixels);expect(edit?.dirtyRect).toEqual(reference?.dirtyRect)
    expect(pixelEditHasChanges(edit)).toBe(pixelEditHasChanges(reference));expect(edit).not.toBeNull()
    const painted=layer.pixels.slice(), entry=commitPixelEdit(doc,edit!,'fill',true)!, history=new HistoryStack()
    history.push(entry);expect(history.canUndo).toBe(true);history.undo();expect(history.canUndo).toBe(false);samePixels(layer.pixels,before);history.redo();samePixels(layer.pixels,painted)
    if(!spec.axes){expect(edit!.before.size).toBe(0);expect(edit!.points?.count).toBeGreaterThan(0)}
  })
  it.each(['indexed','grayscale'] as const)('normalizes %s output and preserves undo/redo', format => {
    const {doc,layer}=fixture(format), old=structuredClone(doc), before=layer.pixels.slice()
    const reference=run(referenceFill,old,old.layers[0],{opaque:format==='indexed'}),edit=run(floodFillSymmetric,doc,layer,{opaque:format==='indexed'})
    samePixels(layer.pixels,old.layers[0].pixels);expect(edit?.dirtyRect).toEqual(reference?.dirtyRect)
    const after=layer.pixels.slice(),entry=commitPixelEdit(doc,edit!,'fill')!;entry.undo();samePixels(layer.pixels,before);entry.redo();samePixels(layer.pixels,after)
  })
  it('keeps mask coverage normalized and supports reverting a live compact fill', () => {
    const {doc,layer}=fixture('rgba',true), old=structuredClone(doc), oldLayer=old.animation!.layerMasks![0].mask, before=layer.pixels.slice()
    const reference=run(referenceFill,old,oldLayer),edit=run(floodFillSymmetric,doc,layer)
    samePixels(layer.pixels,oldLayer.pixels);expect(edit?.dirtyRect).toEqual(reference?.dirtyRect)
    revertPixelEdit(doc,edit!);samePixels(layer.pixels,before)
  })
  it('retains no-op/null behavior without allocating point arrays', () => {
    const {doc,layer}=fixture();layer.pixels.fill(0)
    expect(floodFillSymmetric(doc,layer,0,0,{r:0,g:0,b:0,a:0},null,false,null,1,undefined,'grain',1,0,'paint')).toBeNull()
  })
  it('reports compact fill counts to the operation profiler', () => {
    const {doc,layer}=fixture(), stages: Array<{stage:string;points:number}> = []
    const edit=floodFillSymmetric(doc,layer,0,0,color,null,false,null,1,undefined,'grain',1,0,'paint',undefined,undefined,8,0,{record:(stage,_ms,meta)=>stages.push({stage,points:Number(meta?.points)})})
    expect(edit?.points?.count).toBeGreaterThan(0)
    expect(stages.find(s=>s.stage==='bucket.flood-fill')?.points).toBe(edit!.points!.count)
    expect(stages.find(s=>s.stage==='bucket.pixel-edit-merge')?.points).toBe(edit!.points!.count)
  })
})
