import { createDocument, createLayer } from '@/core/document-model'
import { assignRasterStorage, installRuntimeRaster } from '@/core/runtime-raster'
import { sessionFromDocument } from '../workspace-session'
import type { AnimationCelSurface } from '@shared/types-animation'

/** Real sparse rasters keep the 120-frame fixture resident without allocating
 * 120 dense images. Every source has a nonempty 64px tile with varied alpha. */
export const luaBudgetSession = (size: number, frames: number, linked: boolean) => {
  const doc = createDocument('P13 4K / 100 layers', 1, 1, 'rgba')
  doc.width = doc.height = 4096
  doc.layers = Array.from({length:100},(_,i)=>{
    const layer=createLayer(`L${i}`,1,1,'rgba');layer.id=`l${i}`
    layer.width=layer.height=i===0?size:64;return layer
  })
  doc.activeLayerId='l0';doc.timelapse!.enabled=false
  const timeline=doc.animation!;timeline.activeFrameId='f0'
  timeline.frames=Array.from({length:frames},(_,i)=>({id:`f${i}`,duration:100+i}))
  const makeSurface=(size:number,seed:number):AnimationCelSurface=>{
    const surface:AnimationCelSurface={format:'rgba',width:size,height:size,offsetX:17,offsetY:29,pixels:new Uint8ClampedArray(0)}
    const data=new Uint8Array(64*64*4)
    for(let i=0;i<data.length;i+=4){data[i]=(i/4+seed)%251;data[i+1]=73;data[i+2]=125;data[i+3]=i%16===0?180:255}
    const offsets=new Int32Array(Math.ceil(size/64)**2);offsets[0]=1
    installRuntimeRaster(surface,{kind:'sparse-tiles-v1',format:'rgba',width:size,height:size,tileSize:64,data,tileOffsets:offsets})
    return surface
  }
  const first=doc.layers.map((l,i)=>makeSurface(l.width,i))
  timeline.cels=timeline.frames.flatMap((f,fi)=>doc.layers.map((l,li)=>({
    id:`c${fi}-${li}`,layerId:l.id,frameId:f.id,
    surface:linked||fi===0?first[li]:makeSurface(l.width,li+fi),
    ...(linked&&fi>0?{linkedCelId:`c0-${li}`}:{})
  })))
  for(let i=0;i<doc.layers.length;i++)assignRasterStorage(doc.layers[i],first[i])
  return sessionFromDocument(doc)
}
