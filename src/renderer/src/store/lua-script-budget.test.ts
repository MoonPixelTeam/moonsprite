import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as model from '@/core/document-model'
import { runtimeRasterForSurface } from '@/core/runtime-raster'
import { luaBudgetSession } from './__fixtures__/p13-lua-budget-document'
import { runLuaScriptForActiveDocument } from './lua-script-service'
import { useWorkspace } from './workspace'
beforeEach(()=>{localStorage.clear();useWorkspace.setState({sessions:[],activeId:null})})
describe('Lua context budget before copying pixels',()=>{
  it.each([1024,2048].flatMap(size=>[12,120].flatMap(frames=>[false,true].map(linked=>({size,frames,linked})))))(
    'preflights the existing per-frame wire budget %j',async({size,frames,linked})=>{
      const session=luaBudgetSession(size,frames,linked)
      useWorkspace.setState({sessions:[session],activeId:session.document.id})
      const read=vi.spyOn(model,'readLayerPacked'),api=vi.fn(async()=>{throw new Error('context reached API')})
      try {
        if(size===1024&&frames===12){
          await expect(runLuaScriptForActiveDocument({runLuaScript:api},'budget.lua')).rejects.toThrow('context reached API')
          expect(api).toHaveBeenCalledOnce();expect(read).toHaveBeenCalled()
        }else{
          await expect(runLuaScriptForActiveDocument({runLuaScript:api},'budget.lua')).rejects.toThrow()
          expect(api).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled()
        }
        expect(session.history.canUndo).toBe(false)
        expect(session.revision).toBe(0)
        expect(runtimeRasterForSurface(session.document.layers[0])).not.toBeNull()
      }finally{read.mockRestore()}
    },30000)
  it('permits the exact aggregate boundary and serializes distinct linked frame arrays',async()=>{
    const session=luaBudgetSession(2048,3,true)
    useWorkspace.setState({sessions:[session],activeId:session.document.id})
    await expect(runLuaScriptForActiveDocument({runLuaScript:async(_id,context)=>{
      expect(context.activeLayerCels).toHaveLength(3)
      expect(context.activeLayerCels.reduce((n,c)=>n+c.surface.pixels.length,0)).toBe(12_582_912)
      const [a,b]=context.activeLayerCels
      expect(a.surface.pixels).not.toBe(b.surface.pixels)
      expect(a.surface.pixels[0]).toBe(b.surface.pixels[0])
      expect(context.pixels).not.toBe(a.surface.pixels)
      throw new Error('boundary accepted')
    }},'boundary.lua')).rejects.toThrow('boundary accepted')
  },30000)
  it('rejects invalid resolved frame geometry without reading pixels',async()=>{
    const session=luaBudgetSession(64,2,false)
    session.document.animation!.cels[100].surface!.width=Infinity
    useWorkspace.setState({sessions:[session],activeId:session.document.id})
    const read=vi.spyOn(model,'readLayerPacked'),api=vi.fn()
    try{await expect(runLuaScriptForActiveDocument({runLuaScript:api},'invalid.lua')).rejects.toThrow();expect(read).not.toHaveBeenCalled();expect(api).not.toHaveBeenCalled()}
    finally{read.mockRestore()}
  })
})
