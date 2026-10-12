import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasGpuMovePreview } from './canvas-composite-cache-gpu'
import { CanvasMovePreviewRenderer } from './canvas-composite-cache-move'
import { planGpuMovePreview } from './canvas-composite-cache-gpu-plan'
import { createDocument, createLayer } from '@/core/document-model'
import type { CompositeStackItem } from '@/core/document-composite-plan'
const view={zoom:1,panX:0,panY:0,rotation:0,mirrored:false,mirroredVertical:false,showGrid:false,relativeLuminance:false}
class Canvas {
  static instances: Canvas[]=[]
  context={imageSmoothingEnabled:false,globalAlpha:1,globalCompositeOperation:'source-over',clearRect:vi.fn(),drawImage:vi.fn(),putImageData:vi.fn()}
  constructor(public width:number,public height:number){Canvas.instances.push(this)}
  getContext(){return this.context}
}
afterEach(()=>vi.unstubAllGlobals())
const fixture=()=>{
 const doc=createDocument('gpu plan',256,256,'rgba',false),layer=doc.layers[0]
 layer.width=16;layer.height=16;layer.pixels=new Uint8ClampedArray(1024);layer.offsetX=80;layer.offsetY=96
 const second=createLayer('second',16,16,'rgba');second.offsetX=100;second.offsetY=98;doc.layers.push(second)
 const group={id:'g',name:'g',parentGroupId:null,visible:true,locked:false,opacity:.6,blendMode:'normal' as const}
 const stack:CompositeStackItem[]=[{kind:'group',group,children:doc.layers.map(layer=>({kind:'layer',layer}))}]
 return {doc,layer,stack}
}
describe('GPU movement surface planning and release',()=>{
 it('lets the move renderer use a complete plan that fits below the old two-surface guard',()=>{
  vi.stubGlobal('OffscreenCanvas',Canvas);vi.stubGlobal('ImageData',class {constructor(public data:unknown,public width:number,public height:number){}});Canvas.instances=[]
  const {doc,layer,stack}=fixture(),context={drawImage:vi.fn(),imageSmoothingEnabled:false}
  const core={movePreviewLayersFor:()=>null,renderLayersFor:()=>null,opacityGroupStackFor:()=>stack}
  const renderer=new CanvasMovePreviewRenderer(core as any,300000,{requiresAlignedPixelBlit:()=>false} as any)
  expect(renderer.drawMovePreview(context as any,doc,view,0,0,0,0,256,256,'frame',1,[layer.id])).toBe(true)
  expect(context.drawImage).toHaveBeenCalledTimes(1)
  renderer.clear();expect(Canvas.instances.every(c=>c.width===0&&c.height===0)).toBe(true)
 })
 it('accounts output, sources, local groups and static runs before allocation',()=>{
  const {doc,layer,stack}=fixture(),plan=planGpuMovePreview(stack,new Set([layer.id]),{x:0,y:0,width:256,height:256},1e6)!
  expect(plan.groups.get('g')).toEqual({x:80,y:96,width:64,height:64})
  expect(plan.bytes).toBe(256*256*4+2*16*16*4+64*64*4+16*16*4)
  expect(planGpuMovePreview(stack,new Set([layer.id]),{x:0,y:0,width:256,height:256},plan.bytes-1)).toBeNull()
  expect(plan.sources.size).toBe(doc.layers.length)
 })
 it('rejects a total budget overflow without canvas creation or pixel reads',()=>{
  vi.stubGlobal('OffscreenCanvas',Canvas);Canvas.instances=[]
  const {doc,layer,stack}=fixture(),read=vi.fn(()=>new Uint8ClampedArray(1024))
  Object.defineProperty(layer,'pixels',{get:read})
  const gpu=new CanvasGpuMovePreview(256*256*4)
  expect(gpu.drawGpuStackMovePreview(doc,view,0,0,256,256,'a',stack,[layer.id])).toBeNull()
  expect(Canvas.instances).toHaveLength(0);expect(read).not.toHaveBeenCalled()
 })
 it('keeps static runs on a move, resizes local groups, releases old keys and clear',()=>{
  vi.stubGlobal('OffscreenCanvas',Canvas);vi.stubGlobal('ImageData',class {constructor(public data:unknown,public width:number,public height:number){}});Canvas.instances=[]
  const {doc,layer,stack}=fixture(),gpu=new CanvasGpuMovePreview(1e6)
  expect(gpu.drawGpuStackMovePreview(doc,view,0,0,256,256,'a',stack,[layer.id])).not.toBeNull()
  const sources=Canvas.instances.filter(c=>c.width===16&&c.height===16),firstCount=Canvas.instances.length
  layer.offsetX+=5
  expect(gpu.drawGpuStackMovePreview(doc,view,0,0,256,256,'a',stack,[layer.id])).not.toBeNull()
  expect(Canvas.instances.length).toBe(firstCount)
  expect(sources.every(c=>c.width===16)).toBe(true)
  const old=Canvas.instances.slice()
  gpu.drawGpuStackMovePreview(doc,view,0,0,128,128,'next-frame',stack,[layer.id])
  expect(old.every(c=>c.width===0&&c.height===0)).toBe(true)
  gpu.clear();expect(Canvas.instances.every(c=>c.width===0&&c.height===0)).toBe(true)
  expect(gpu.textureStats().estimatedBytes).toBe(0)
 })
 it('skips offscreen groups and rejects unsupported blending before allocation',()=>{
  const {layer,stack}=fixture()
  for(const item of (stack[0] as Extract<CompositeStackItem,{kind:'group'}>).children)if(item.kind==='layer')item.layer.offsetX=300
  expect(planGpuMovePreview(stack,new Set([layer.id]),{x:0,y:0,width:256,height:256},1e6)!.bytes).toBe(256*256*4)
  layer.offsetX=0;layer.blendMode='divide'
  expect(planGpuMovePreview(stack,new Set([layer.id]),{x:0,y:0,width:256,height:256},1e6)).toBeNull()
 })
})
